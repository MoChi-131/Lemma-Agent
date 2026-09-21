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
    reviewConflict: async () => ({ status: 'unavailable', reason: 'Test fallback' }),
  });

  assert.equal(result.relationship, 'Possible Conflict');
  assert.equal(result.proposed_review_record.review_status, 'Pending');
  assert.equal(result.proposed_review_record.decision, null);
  assert.equal(result.agent_observation.suspected_conflict_type, 'Price');
});

test('applies AI contextual review while preserving the deterministic candidate', async () => {
  const result = await resolveDocumentConflictTool(input, {
    loadDocument: async (url, id) => ({
      id, url, title: id,
      content: id === 'document_a' ? '驗樓價格 HK$2,000。' : '裝修套餐價格 HK$12,000。',
    }),
    readDecisions: async () => [],
    reviewConflict: async () => ({
      status: 'completed',
      verdict: 'no_conflict',
      relationship: 'Complementary',
      conflict_types: [],
      explanation: 'The prices describe different services.',
      requires_human_review: false,
    }),
  });

  assert.equal(result.deterministic_candidate.relationship, 'Possible Conflict');
  assert.equal(result.relationship, 'Complementary');
  assert.equal(result.proposed_review_record, null);
  assert.equal(result.ai_review.verdict, 'no_conflict');
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

test('rejects an HTTP Wiki URL before calling Lark', async () => {
  const { loadLarkDocument } = require('../../tools/lark/conflicts/resolve-document-conflict');
  await assert.rejects(
    loadLarkDocument('http://example.sg.larksuite.com/wiki/token', 'document_b'),
    /valid HTTPS Lark Wiki URL/,
  );
});

test('registerKnowledgeTools exposes resolve_document_conflict', () => {
  const names = [];
  const server = { registerTool: name => names.push(name) };
  const { registerKnowledgeTools } = require('../../runtime/registrations/register-knowledge-tools');
  registerKnowledgeTools(server);
  assert.ok(names.includes('resolve_document_conflict'));
});
