const {
  readLarkDocumentData,
} = require("../../../integrations/lark/core/client");

/**
 * Read a Lark document and return its text plus supported embedded resources.
 * @param {{url: string}} input document URL supplied by the MCP caller.
 * @returns {Promise<object>} normalized document content and extracted resources.
 * @throws {Error} when no URL is supplied or the Lark read fails.
 */
async function readLarkDocumentTool(input) {
  if (!input?.url) {
    throw new Error("url is required");
  }

  const { content, tables, embedded_sheets: embeddedSheets, attachments, images, whiteboards } = await readLarkDocumentData(input.url);

  return {
    success: true,
    source: "lark",
    action: "read_document",
    url: input.url,
    content,
    tables,
    embedded_sheets: embeddedSheets,
    attachments,
    images,
    whiteboards,
  };
}

module.exports = {
  readLarkDocumentTool,
};
