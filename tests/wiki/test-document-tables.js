const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
  extractTables,
  findEmbeddedSheets,
  findFileAttachments,
  readDocumentData,
} = require('../../integrations/lark/core/documents');

const tableBlocks = [
  {
    block_id: 'table-1',
    table: {
      property: { row_size: 2, column_size: 2 },
      cells: ['cell-1', 'cell-2', 'cell-3', 'cell-4'],
    },
  },
  { block_id: 'cell-1', children: ['text-1'] },
  { block_id: 'cell-2', children: ['text-2'] },
  { block_id: 'cell-3', children: ['text-3', 'text-3b'] },
  { block_id: 'cell-4', children: [] },
  { block_id: 'text-1', text: { elements: [{ text_run: { content: '型號' } }] } },
  { block_id: 'text-2', text: { elements: [{ text_run: { content: '尺寸' } }] } },
  { block_id: 'text-3', text: { elements: [{ text_run: { content: 'Panasonic' } }] } },
  { block_id: 'text-3b', text: { elements: [{ text_run: { content: '一拖二' } }] } },
];

test('extracts Lark table cells in row-major order', () => {
  assert.deepEqual(extractTables(tableBlocks), [{
    block_id: 'table-1',
    row_count: 2,
    column_count: 2,
    rows: [
      ['型號', '尺寸'],
      ['Panasonic\n一拖二', ''],
    ],
  }]);
});

test('detects embedded Sheet and file blocks', () => {
  const blocks = [
    { block_id: 'sheet-block', sheet: { token: 'spreadsheetToken_sheetId' } },
    { block_id: 'file-block', file: { token: 'fileToken', name: 'product.pdf' } },
  ];
  assert.deepEqual(findEmbeddedSheets(blocks), [{
    block_id: 'sheet-block', spreadsheet_token: 'spreadsheetToken', sheet_id: 'sheetId',
  }]);
  assert.deepEqual(findFileAttachments(blocks), [{
    block_id: 'file-block', token: 'fileToken', name: 'product.pdf',
  }]);
});

test('reads raw content and paginated blocks with one access token', async () => {
  let tokenCalls = 0;
  const requestedUrls = [];
  const responses = [
    { code: 0, data: { content: 'Document body' } },
    { code: 0, data: { items: tableBlocks.slice(0, 5), has_more: true, page_token: 'next' } },
    { code: 0, data: { items: tableBlocks.slice(5), has_more: false } },
  ];
  const result = await readDocumentData('document-id', {}, {
    getToken: async () => {
      tokenCalls++;
      return 'token';
    },
    fetch: async url => {
      requestedUrls.push(String(url));
      const body = responses.shift();
      return { ok: true, json: async () => body };
    },
  });

  assert.equal(tokenCalls, 1);
  assert.equal(result.content, 'Document body');
  assert.deepEqual(result.tables[0].rows[1], ['Panasonic\n一拖二', '']);
  assert.equal(requestedUrls.length, 3);
  assert.match(requestedUrls[2], /page_token=next/);
  assert.deepEqual(result.embedded_sheets, []);
  assert.deepEqual(result.attachments, []);
});

test('reads embedded Sheet rows and extracts PDF attachment text', async () => {
  const blocks = [
    { block_id: 'sheet-block', sheet: { token: 'spreadsheetToken_sheetId' } },
    { block_id: 'file-block', file: { token: 'fileToken', name: 'product.pdf' } },
  ];
  const result = await readDocumentData('document-id', {}, {
    getToken: async () => 'token',
    fetch: async url => {
      const value = String(url);
      if (value.endsWith('/raw_content')) return jsonResponse({ code: 0, data: { content: 'body' } });
      if (value.includes('/blocks?')) return jsonResponse({ code: 0, data: { items: blocks, has_more: false } });
      if (value.includes('/values/sheetId')) return jsonResponse({
        code: 0,
        data: { valueRange: { range: 'sheetId!A1:B2', values: [['Model', 'Size'], ['Panasonic', '420mm']] } },
      });
      if (value.includes('/medias/fileToken/download')) return binaryResponse(Buffer.from('pdf'));
      throw new Error(`Unexpected URL: ${value}`);
    },
    parsePdf: async () => ({ numpages: 2, text: 'Panasonic 420mm PDF content' }),
  });

  assert.deepEqual(result.embedded_sheets[0].worksheets[0].rows[1], ['Panasonic', '420mm']);
  assert.equal(result.attachments[0].success, true);
  assert.equal(result.attachments[0].page_count, 2);
  assert.equal(result.attachments[0].text, 'Panasonic 420mm PDF content');
});

test('keeps document text when Sheet and attachment permissions fail', async () => {
  const result = await readDocumentData('document-id', {}, {
    getToken: async () => 'token',
    fetch: async url => {
      const value = String(url);
      if (value.endsWith('/raw_content')) return jsonResponse({ code: 0, data: { content: 'body remains available' } });
      if (value.includes('/blocks?')) return jsonResponse({ code: 0, data: { items: [
        { block_id: 'sheet-block', sheet: { token: 'spreadsheetToken_sheetId' } },
        { block_id: 'file-block', file: { token: 'fileToken', name: 'product.pdf' } },
      ], has_more: false } });
      return jsonResponse({ code: 99991672, msg: 'PRIVATE upstream detail' }, 400);
    },
  });

  assert.equal(result.content, 'body remains available');
  assert.equal(result.embedded_sheets[0].error_code, 'SHEET_READ_FAILED');
  assert.equal(result.attachments[0].error_code, 'ATTACHMENT_READ_FAILED');
  assert.equal(JSON.stringify(result).includes('PRIVATE'), false);
});

function jsonResponse(body, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: () => null },
    json: async () => body,
  };
}

function binaryResponse(bytes) {
  return {
    ok: true,
    status: 200,
    headers: { get: () => String(bytes.length) },
    arrayBuffer: async () => bytes,
  };
}

test('rejects repeated block pagination cursors', async () => {
  await assert.rejects(readDocumentData('document-id', {}, {
    getToken: async () => 'token',
    fetch: async url => ({
      ok: true,
      json: async () => String(url).includes('raw_content')
        ? { code: 0, data: { content: 'body' } }
        : { code: 0, data: { items: [], has_more: true, page_token: 'same' } },
    }),
  }), /invalid pagination cursor/);
});
