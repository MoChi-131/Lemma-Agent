const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
  extractTables,
  findEmbeddedSheets,
  findFileAttachments,
  findEmbeddedImages,
  findEmbeddedWhiteboards,
  readDocumentData,
} = require('../../integrations/lark/core/documents');
const { documentResult } = require('../../runtime/core/document-output');

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

test('detects embedded image blocks', () => {
  assert.deepEqual(findEmbeddedImages([{
    block_id: 'image-block', image: { token: 'imageToken', width: 800, height: 600 },
  }]), [{
    block_id: 'image-block', token: 'imageToken', name: null, source_type: 'image_block', width: 800, height: 600,
  }]);
});

test('recognizes image file blocks that Lark exposes as image.png attachments', () => {
  assert.deepEqual(findEmbeddedImages([{
    block_id: 'file-image', file: { token: 'fileImageToken', name: 'image.png' },
  }]), [{
    block_id: 'file-image',
    token: 'fileImageToken',
    name: 'image.png',
    source_type: 'file_block',
    width: null,
    height: null,
  }]);
});

test('recognizes Lark whiteboard blocks and their board token', () => {
  assert.deepEqual(findEmbeddedWhiteboards([{
    block_id: 'board-block', block_type: 43, board: { token: 'whiteboardToken' },
  }]), [{
    block_id: 'board-block',
    token: 'whiteboardToken',
    name: 'whiteboard',
    source_type: 'whiteboard',
    width: null,
    height: null,
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
  assert.deepEqual(result.images, []);
});

test('downloads embedded images for MCP visual inspection', async () => {
  const bytes = Buffer.from('image bytes');
  const result = await readDocumentData('document-id', {}, {
    getToken: async () => 'token',
    fetch: async url => {
      const value = String(url);
      if (value.endsWith('/raw_content')) return jsonResponse({ code: 0, data: { content: 'image.png' } });
      if (value.includes('/blocks?')) return jsonResponse({ code: 0, data: { items: [
        { block_id: 'image-block', image: { token: 'imageToken', width: 800, height: 600 } },
      ], has_more: false } });
      if (value.includes('/medias/imageToken/download')) return binaryResponse(bytes, 'image/png');
      throw new Error(`Unexpected URL: ${value}`);
    },
  });

  assert.equal(result.images[0].success, true);
  assert.equal(result.images[0].mime_type, 'image/png');
  assert.equal(result.images[0].data, bytes.toString('base64'));
});

test('downloads image.png file blocks as images instead of unsupported attachments', async () => {
  const bytes = Buffer.from('png bytes');
  const result = await readDocumentData('document-id', {}, {
    getToken: async () => 'token',
    fetch: async url => {
      const value = String(url);
      if (value.endsWith('/raw_content')) return jsonResponse({ code: 0, data: { content: 'image.png' } });
      if (value.includes('/blocks?')) return jsonResponse({ code: 0, data: { items: [
        { block_id: 'file-image', file: { token: 'fileImageToken', name: 'image.png' } },
      ], has_more: false } });
      if (value.includes('/medias/fileImageToken/download')) return binaryResponse(bytes, 'image/png');
      throw new Error(`Unexpected URL: ${value}`);
    },
  });

  assert.equal(result.images[0].success, true);
  assert.equal(result.images[0].name, 'image.png');
  assert.equal(result.images[0].source_type, 'file_block');
  assert.equal(result.attachments[0].handled_as, 'embedded_image');
});

test('renders embedded Lark whiteboards as MCP-readable images', async () => {
  const bytes = Buffer.from('whiteboard png');
  const result = await readDocumentData('document-id', {}, {
    getToken: async () => 'token',
    fetch: async url => {
      const value = String(url);
      if (value.endsWith('/raw_content')) return jsonResponse({ code: 0, data: { content: 'whiteboard' } });
      if (value.includes('/blocks?')) return jsonResponse({ code: 0, data: { items: [
        { block_id: 'board-block', block_type: 43, board: { token: 'whiteboardToken' } },
      ], has_more: false } });
      if (value.includes('/whiteboards/whiteboardToken/download_as_image')) {
        return binaryResponse(bytes, 'image/png');
      }
      throw new Error(`Unexpected URL: ${value}`);
    },
  });

  assert.equal(result.images[0].success, true);
  assert.equal(result.images[0].source_type, 'whiteboard');
  assert.equal(result.images[0].mime_type, 'image/png');
  assert.equal(result.images[0].data, bytes.toString('base64'));
});

test('emits image bytes as MCP image content without duplicating them in JSON', () => {
  const result = documentResult({
    success: true,
    content: 'body',
    images: [{
      block_id: 'image-block', success: true, mime_type: 'image/png', data: 'aW1hZ2U=',
    }],
  });

  assert.equal(result.content[1].type, 'image');
  assert.equal(result.content[1].mimeType, 'image/png');
  assert.equal(result.content[1].data, 'aW1hZ2U=');
  assert.equal(result.structuredContent.images[0].data, undefined);
  assert.equal(result.content[0].text.includes('aW1hZ2U='), false);
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

function binaryResponse(bytes, contentType = 'application/pdf') {
  return {
    ok: true,
    status: 200,
    headers: { get: name => name === 'content-type' ? contentType : String(bytes.length) },
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
