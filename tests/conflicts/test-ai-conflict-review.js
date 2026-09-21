const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
  reviewConflictWithAi,
  validateAssessment,
} = require('../../integrations/lark/conflicts/ai-conflict-review');

const candidate = {
  relationship: 'Possible Conflict',
  similarity_score: 0.8,
  evidence: [{
    type: 'Price',
    document_a: ['hk$2000'],
    document_b: ['hk$2500'],
    document_a_contexts: [{ value: 'hk$2000', context: '標準驗樓價格 hk$2,000' }],
    document_b_contexts: [{ value: 'hk$2500', context: '裝修套餐價格 hk$2,500' }],
  }],
};

test('uses structured targeted evidence for AI review', async () => {
  let request;
  const result = await reviewConflictWithAi(candidate, {
    createResponse: async value => {
      request = value;
      return { output_text: JSON.stringify({
        verdict: 'no_conflict',
        relationship: 'Complementary',
        conflict_types: [],
        explanation: 'The prices apply to different services.',
        requires_human_review: false,
      }) };
    },
  });

  assert.equal(result.status, 'completed');
  assert.equal(result.verdict, 'no_conflict');
  assert.match(request.input, /標準驗樓價格/);
  assert.equal(request.text.format.type, 'json_schema');
});

test('rejects invalid AI classifications', () => {
  assert.throws(() => validateAssessment({ verdict: 'guess' }), /invalid classification/);
});

test('skips AI when there is no rule-based conflict candidate', async () => {
  const result = await reviewConflictWithAi({ relationship: 'Complementary', evidence: [] });
  assert.equal(result.status, 'skipped');
});
