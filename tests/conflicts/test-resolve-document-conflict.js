const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
  resolveDocumentConflictTool,
} = require('../../tools/lark/conflicts/resolve-document-conflict');

const input = {
  document_a_url: 'https://example.com/a',
  document_b_url: 'https://example.com/b',
  suspected_conflict_type: 'Price',
  reason: 'The retrieved prices differ.',
};

test('agent observation triggers comparison but cannot approve the result', async () => {
  const result = await resolveDocumentConflictTool(input, {
    loadDocument: async (url, id) => ({
      id,
      url,
      title: id,
      content: id === 'document_a' ? '服務價格 HK$2,000。' : '服務價格 HK$2,500。',
    }),
    readDecisions: async () => [],
  });

  assert.equal(result.relationship, 'Possible Conflict');
  assert.equal(result.proposed_review_record.review_status, 'Pending');
  assert.equal(result.proposed_review_record.decision, null);
  assert.equal(result.agent_observation.suspected_conflict_type, 'Price');
  assert.equal('ai_review' in result, false);
});

test('reports each failed document read without inventing a classification', async () => {
  const result = await resolveDocumentConflictTool(input, {
    loadDocument: async (url, id) => {
      if (id === 'document_a') throw new Error('Access denied');
      return { id, url, title: id, content: 'Readable content' };
    },
    readDecisions: async () => [],
  });

  assert.equal(result.success, false);
  assert.equal(result.relationship, null);
  assert.equal(result.errors[0].document, 'document_a');
});

test('loads the project decision registry from its default location', async () => {
  const result = await resolveDocumentConflictTool(input, {
    loadDocument: async (url, id) => ({ id, url, title: id, content: 'Shared document body' }),
  });

  assert.equal(result.success, true);
  assert.equal(result.relationship, 'Same');
});

test('rejects an HTTP Wiki URL before calling Lark', async () => {
  const { loadLarkDocument } = require('../../tools/lark/conflicts/resolve-document-conflict');
  await assert.rejects(
    loadLarkDocument('http://example.sg.larksuite.com/wiki/token', 'document_b'),
    /valid HTTPS Lark Wiki URL/,
  );
});

test('registerConflictTools exposes resolve_document_conflict', () => {
  const names = [];
  const definitions = new Map();
  const server = { registerTool: (name, definition) => {
    names.push(name);
    definitions.set(name, definition);
  } };
  const { registerConflictTools } = require('../../runtime/registrations/register-conflict-tools');
  registerConflictTools(server);
  assert.ok(names.includes('resolve_document_conflict'));
  assert.equal('use_ai' in definitions.get('resolve_document_conflict').inputSchema, false);
});
