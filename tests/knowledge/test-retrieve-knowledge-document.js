const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
  retrieveKnowledgeDocumentTool,
} = require('../../tools/lark/knowledge/retrieve-knowledge-document');

const url = 'https://example.larksuite.com/wiki/document';

test('returns content for a registered retrieval-eligible document', async () => {
  let bodyRead = false;
  const result = await retrieveKnowledgeDocumentTool({ url }, {
    getKnowledgeMetadata: async () => ({
      found: true,
      documents: [{ source_url: url, retrieval_eligible: true, title: 'Product guide' }],
    }),
    readLarkDocument: async () => {
      bodyRead = true;
      return {
        content: 'Panasonic 420mm product information',
        tables: [{ rows: [['Model', 'Size'], ['Panasonic', '420mm']] }],
        images: [{ block_id: 'image-1', success: true, mime_type: 'image/png', data: 'aW1hZ2U=' }],
      };
    },
  });

  assert.equal(result.success, true);
  assert.equal(result.content, 'Panasonic 420mm product information');
  assert.deepEqual(result.tables[0].rows[1], ['Panasonic', '420mm']);
  assert.equal(result.metadata.title, 'Product guide');
  assert.equal(result.images[0].mime_type, 'image/png');
  assert.equal(bodyRead, true);
});

test('does not read content when retrieval eligibility is false', async () => {
  let bodyRead = false;
  const result = await retrieveKnowledgeDocumentTool({ url }, {
    getKnowledgeMetadata: async () => ({
      found: true,
      documents: [{ source_url: url, retrieval_eligible: false }],
    }),
    readLarkDocument: async () => {
      bodyRead = true;
      return { content: 'must not be returned' };
    },
  });

  assert.equal(result.success, false);
  assert.equal(result.error_code, 'RETRIEVAL_NOT_ELIGIBLE');
  assert.equal(bodyRead, false);
  assert.equal('content' in result, false);
});

test('reports an exact URL that is absent from the registry', async () => {
  const result = await retrieveKnowledgeDocumentTool({ url }, {
    getKnowledgeMetadata: async () => ({ found: false, documents: [] }),
  });

  assert.equal(result.success, false);
  assert.equal(result.error_code, 'NOT_REGISTERED');
});
