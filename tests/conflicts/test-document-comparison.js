const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
  compareDocuments,
  RELATIONSHIPS,
} = require('../../integrations/lark/conflicts/document-comparison');

test('classifies a near-identical version pair as Same but recommends semantic review', () => {
  const result = compareDocuments(
    { title: '驗樓價格', content: '驗樓服務價格：HK$2,000。' },
    { title: '驗樓價格副本', content: '驗樓服務價格: HK$2,000.' },
  );

  assert.equal(result.relationship, RELATIONSHIPS.SAME);
  assert.deepEqual(result.conflict_types, []);
  assert.equal(result.semantic_review_recommended, true);
  assert.equal(result.review_priority, 'high');
  assert.ok(result.semantic_review_reasons.includes('possible_document_version_pair'));
});

test('skips semantic review when normalized SHA-256 hashes match', () => {
  const result = compareDocuments(
    { title: 'Document A', content: 'Exactly the same content.' },
    { title: 'Document B', content: 'Exactly the same content.' },
  );

  assert.equal(result.relationship, RELATIONSHIPS.SAME);
  assert.equal(result.semantic_review_recommended, false);
  assert.equal(result.review_priority, 'low');
  assert.equal(result.semantic_review_packet, null);
});

test('detects a price conflict and returns evidence', () => {
  const result = compareDocuments(
    { title: '驗樓服務價格', content: '標準驗樓服務價格：HK$2,000。包括基本報告。' },
    { title: '驗樓服務收費', content: '標準驗樓服務價格：HK$2,500。包括基本報告。' },
  );

  assert.equal(result.relationship, RELATIONSHIPS.CONFLICT);
  assert.deepEqual(result.conflict_types, ['Price']);
  assert.equal(result.requires_human_review, true);
  assert.equal(result.evidence[0].document_a[0], 'hk$2000');
  assert.equal(result.evidence[0].document_b[0], 'hk$2500');
  assert.equal(result.semantic_review_recommended, true);
  assert.equal(result.review_priority, 'high');
  assert.ok(result.semantic_review_reasons.includes('structured_conflict_detected'));
  assert.match(result.semantic_review_packet.notice, /untrusted/);
});

test('detects a date conflict', () => {
  const result = compareDocuments(
    { title: '報名期限', content: '活動報名期限為 2026-09-20。' },
    { title: '報名期限更新', content: '活動報名期限為 2026-09-25。' },
  );

  assert.equal(result.relationship, RELATIONSHIPS.CONFLICT);
  assert.deepEqual(result.conflict_types, ['Date']);
});

test('classifies related compatible information as Complementary', () => {
  const result = compareDocuments(
    { title: '冷氣機安裝 FAQ', content: '冷氣機安裝前需要預留足夠空間。' },
    { title: '冷氣機保養指南', content: '冷氣機需要定期清洗濾網及檢查去水管。' },
  );

  assert.equal(result.relationship, RELATIONSHIPS.COMPLEMENTARY);
  assert.equal(result.semantic_review_recommended, true);
  assert.ok(result.semantic_review_reasons.includes('related_nonidentical_documents'));
});

test('classifies unrelated documents as Different Topic', () => {
  const result = compareDocuments(
    { title: '驗樓流程', content: '驗樓完成後會提供檢查報告。' },
    { title: '活動安排', content: '實體課堂於星期六下午開始。' },
  );

  assert.equal(result.relationship, RELATIONSHIPS.DIFFERENT_TOPIC);
  assert.equal(result.semantic_review_recommended, false);
});

test('rejects an empty document independently', () => {
  assert.throws(
    () => compareDocuments({ content: '' }, { content: '有效內容' }),
    /document_a\.content must be a non-empty string/,
  );
});
