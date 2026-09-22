const { test } = require('node:test');
const assert = require('node:assert/strict');
const { calculateDocumentHash } = require('../../integrations/lark/conflicts/document-comparison');
const {
  compareWithDecisionRegistry,
  createPairKey,
} = require('../../integrations/lark/conflicts/conflict-decision-registry');

const documentA = {
  title: '價格 v1',
  url: 'https://example.com/price-a',
  content: '驗樓服務價格為 HK$2,000。',
};
const documentB = {
  title: '價格 v2',
  url: 'https://example.com/price-b',
  content: '驗樓服務價格為 HK$2,500。',
};

function approvedDecision(overrides = {}) {
  return {
    pair_key: createPairKey(documentA.url, documentB.url),
    document_a_url: documentA.url,
    document_b_url: documentB.url,
    document_a_hash: calculateDocumentHash(documentA.content),
    document_b_hash: calculateDocumentHash(documentB.content),
    review_status: 'Approved',
    decision: 'Use B',
    decision_reason: 'B is the approved current price.',
    reviewed_by: 'Penny',
    reviewed_date: '2026-09-18',
    ...overrides,
  };
}

test('reuses an approved decision when both document hashes still match', () => {
  const result = compareWithDecisionRegistry(documentA, documentB, [approvedDecision()]);

  assert.equal(result.comparison_performed, false);
  assert.equal(result.decision_reused, true);
  assert.equal(result.decision.decision, 'Use B');
});

test('marks an approved decision stale and compares again after content changes', () => {
  const changedB = { ...documentB, content: '驗樓服務價格為 HK$2,800。' };
  const result = compareWithDecisionRegistry(documentA, changedB, [approvedDecision()]);

  assert.equal(result.comparison_performed, true);
  assert.equal(result.decision_reused, false);
  assert.equal(result.stale_decision.decision, 'Use B');
  assert.equal(result.proposed_review_record.review_status, 'Pending');
  assert.deepEqual(result.conflict_types, ['Price']);
});

test('creates a pending review record when no decision exists', () => {
  const result = compareWithDecisionRegistry(documentA, documentB, []);

  assert.equal(result.comparison_performed, true);
  assert.equal(result.relationship, 'Possible Conflict');
  assert.equal(result.proposed_review_record.review_status, 'Pending');
  assert.equal(result.proposed_review_record.decision, null);
});

test('pair key is stable when URL order is reversed', () => {
  assert.equal(
    createPairKey(documentA.url, documentB.url),
    createPairKey(documentB.url, documentA.url),
  );
});

test('does not create a review record for a conclusive non-conflict result', () => {
  const result = compareWithDecisionRegistry(
    { url: 'https://example.com/aircon-faq', content: '冷氣機安裝需要預留空間。' },
    { url: 'https://example.com/aircon-guide', content: '冷氣機需要定期清洗濾網。' },
    [],
  );

  assert.equal(result.relationship, 'Complementary');
  assert.equal(result.requires_human_review, false);
  assert.equal(result.proposed_review_record, null);
});
