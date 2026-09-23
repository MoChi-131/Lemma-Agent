const { getTenantAccessToken } = require("./auth");
const pdfParse = require("pdf-parse");

const DOCX_API = "https://open.larksuite.com/open-apis/docx/v1/documents";
const BLOCK_PAGE_SIZE = 500;
const MAX_BLOCK_PAGES = 100;
const MAX_ATTACHMENT_BYTES = 20 * 1024 * 1024;
const MAX_EXTRACTED_TEXT_CHARS = 500000;

async function readDocument(documentId, { signal } = {}) {
  const accessToken = await getTenantAccessToken({ signal });

  return readRawContent(documentId, accessToken, { signal });
}

/** Read text and structured tables with one authentication request. */
async function readDocumentData(documentId, { signal } = {}, deps = {}) {
  const getToken = deps.getToken || getTenantAccessToken;
  const fetchImpl = deps.fetch || fetch;
  const accessToken = await getToken({ signal });
  const [content, blocks] = await Promise.all([
    readRawContent(documentId, accessToken, { signal, fetchImpl }),
    readDocumentBlocks(documentId, accessToken, { signal, fetchImpl }),
  ]);

  const [embeddedSheets, attachments] = await Promise.all([
    readEmbeddedSheets(blocks, accessToken, { signal, fetchImpl }),
    readFileAttachments(blocks, accessToken, { signal, fetchImpl }, deps),
  ]);

  return {
    content,
    tables: extractTables(blocks),
    embedded_sheets: embeddedSheets,
    attachments,
  };
}

async function readRawContent(documentId, accessToken, { signal, fetchImpl = fetch } = {}) {
  const response = await fetchImpl(
    `${DOCX_API}/${encodeURIComponent(documentId)}/raw_content`,
    requestOptions(accessToken, signal),
  );
  const data = await response.json();

  assertLarkResponse(response, data, "Read document");
  if (typeof data.data?.content !== "string") {
    throw new Error("Invalid Lark document content response.");
  }
  return data.data.content;
}

async function readDocumentBlocks(documentId, accessToken, { signal, fetchImpl = fetch } = {}) {
  const blocks = [];
  let pageToken;

  for (let page = 0; page < MAX_BLOCK_PAGES; page++) {
    const params = new URLSearchParams({
      document_revision_id: "-1",
      page_size: String(BLOCK_PAGE_SIZE),
    });
    if (pageToken) params.set("page_token", pageToken);

    const response = await fetchImpl(
      `${DOCX_API}/${encodeURIComponent(documentId)}/blocks?${params}`,
      requestOptions(accessToken, signal),
    );
    const data = await response.json();
    assertLarkResponse(response, data, "Read document blocks");

    blocks.push(...(data.data?.items || []));
    if (!data.data?.has_more) return blocks;
    if (!data.data.page_token || data.data.page_token === pageToken) {
      throw new Error("Read document blocks failed: invalid pagination cursor.");
    }
    pageToken = data.data.page_token;
  }

  throw new Error("Read document blocks failed: page limit exceeded.");
}

function requestOptions(accessToken, signal) {
  return {
    signal,
    headers: { Authorization: `Bearer ${accessToken}` },
  };
}

function assertLarkResponse(response, data, operation) {
  if (!response.ok || data.code !== 0) {
    throw new Error(`${operation} failed: ${JSON.stringify(data)}`);
  }
}

/** Convert Lark table and table-cell blocks into row-major string arrays. */
function extractTables(blocks) {
  const byId = new Map(blocks.map(block => [block.block_id, block]));
  return blocks.filter(block => block.table?.cells?.length).map(block => {
    const rowCount = block.table.property?.row_size || 0;
    const columnCount = block.table.property?.column_size || 0;
    const cells = block.table.cells.map(cellId => extractCellText(cellId, byId));
    const rows = [];

    for (let row = 0; row < rowCount; row++) {
      rows.push(cells.slice(row * columnCount, (row + 1) * columnCount));
    }

    return {
      block_id: block.block_id,
      row_count: rowCount,
      column_count: columnCount,
      rows,
    };
  });
}

function extractCellText(cellId, byId) {
  const cell = byId.get(cellId);
  if (!cell) return "";
  const visited = new Set();

  function walk(block) {
    if (!block || visited.has(block.block_id)) return [];
    visited.add(block.block_id);
    const ownText = extractBlockText(block);
    const childText = (block.children || []).flatMap(childId => walk(byId.get(childId)));
    return [...ownText, ...childText];
  }

  return walk(cell).filter(Boolean).join("\n").trim();
}

function extractBlockText(block) {
  for (const value of Object.values(block)) {
    if (!value || typeof value !== "object" || !Array.isArray(value.elements)) continue;
    return value.elements.map(element => (
      element.text_run?.content ||
      element.equation?.content ||
      element.mention_doc?.title ||
      element.mention_user?.name ||
      ""
    )).filter(Boolean);
  }
  return [];
}

function findEmbeddedSheets(blocks) {
  return blocks.filter(block => block.sheet?.token).map(block => {
    const token = block.sheet.token;
    const separator = token.lastIndexOf("_");
    return {
      block_id: block.block_id,
      spreadsheet_token: separator > 0 ? token.slice(0, separator) : token,
      sheet_id: separator > 0 ? token.slice(separator + 1) : null,
    };
  });
}

async function readEmbeddedSheets(blocks, accessToken, { signal, fetchImpl }) {
  return Promise.all(findEmbeddedSheets(blocks).map(async sheet => {
    try {
      const sheetIds = sheet.sheet_id
        ? [sheet.sheet_id]
        : await listSheetIds(sheet.spreadsheet_token, accessToken, { signal, fetchImpl });
      const worksheets = await Promise.all(sheetIds.map(sheetId => (
        readSheetValues(sheet.spreadsheet_token, sheetId, accessToken, { signal, fetchImpl })
      )));
      return { block_id: sheet.block_id, success: true, worksheets };
    } catch (error) {
      return contentReadFailure(sheet.block_id, "SHEET_READ_FAILED", error);
    }
  }));
}

async function listSheetIds(spreadsheetToken, accessToken, { signal, fetchImpl }) {
  const response = await fetchImpl(
    `https://open.larksuite.com/open-apis/sheets/v3/spreadsheets/${encodeURIComponent(spreadsheetToken)}/sheets/query`,
    requestOptions(accessToken, signal),
  );
  const data = await response.json();
  assertLarkResponse(response, data, "List embedded worksheets");
  return (data.data?.sheets || []).map(sheet => sheet.sheet_id).filter(Boolean);
}

async function readSheetValues(spreadsheetToken, sheetId, accessToken, { signal, fetchImpl }) {
  const response = await fetchImpl(
    `https://open.larksuite.com/open-apis/sheets/v2/spreadsheets/${encodeURIComponent(spreadsheetToken)}/values/${encodeURIComponent(sheetId)}`,
    requestOptions(accessToken, signal),
  );
  const data = await response.json();
  assertLarkResponse(response, data, "Read embedded worksheet");
  const valueRange = data.data?.valueRange || {};
  return {
    sheet_id: sheetId,
    range: valueRange.range || null,
    rows: Array.isArray(valueRange.values) ? valueRange.values : [],
  };
}

function findFileAttachments(blocks) {
  return blocks.filter(block => block.file?.token).map(block => ({
    block_id: block.block_id,
    name: block.file.name || "unnamed-file",
    token: block.file.token,
  }));
}

async function readFileAttachments(blocks, accessToken, { signal, fetchImpl }, deps) {
  const parsePdf = deps.parsePdf || pdfParse;
  return Promise.all(findFileAttachments(blocks).map(async file => {
    if (!file.name.toLowerCase().endsWith(".pdf")) {
      return {
        block_id: file.block_id,
        name: file.name,
        success: false,
        error_code: "UNSUPPORTED_ATTACHMENT_TYPE",
        message: "Only PDF attachments are currently extracted.",
      };
    }

    try {
      const response = await fetchImpl(
        `https://open.larksuite.com/open-apis/drive/v1/medias/${encodeURIComponent(file.token)}/download`,
        requestOptions(accessToken, signal),
      );
      if (!response.ok) throw new Error(`Attachment download returned HTTP ${response.status}.`);
      const declaredSize = Number(response.headers.get("content-length"));
      if (declaredSize > MAX_ATTACHMENT_BYTES) throw new Error("Attachment exceeds the 20 MB extraction limit.");
      const bytes = Buffer.from(await response.arrayBuffer());
      if (bytes.length > MAX_ATTACHMENT_BYTES) throw new Error("Attachment exceeds the 20 MB extraction limit.");
      const parsed = await parsePdf(bytes);

      return {
        block_id: file.block_id,
        name: file.name,
        success: true,
        page_count: Number.isInteger(parsed.numpages) ? parsed.numpages : null,
        text: String(parsed.text || "").slice(0, MAX_EXTRACTED_TEXT_CHARS),
        text_truncated: String(parsed.text || "").length > MAX_EXTRACTED_TEXT_CHARS,
      };
    } catch (error) {
      return {
        ...contentReadFailure(file.block_id, "ATTACHMENT_READ_FAILED", error),
        name: file.name,
      };
    }
  }));
}

function contentReadFailure(blockId, errorCode, error) {
  const sizeError = error instanceof Error && error.message.includes("20 MB extraction limit");
  return {
    block_id: blockId,
    success: false,
    error_code: errorCode,
    message: sizeError
      ? error.message
      : errorCode === "SHEET_READ_FAILED"
        ? "Embedded Sheet could not be read. Check Lark Sheet or Drive read permissions."
        : "Attachment could not be read. Check Lark Drive download permission and file access.",
  };
}

module.exports = {
  readDocument,
  readDocumentData,
  extractTables,
  findEmbeddedSheets,
  findFileAttachments,
};
