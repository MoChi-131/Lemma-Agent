const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
  submitConflictAssessmentTool,
  validateAssessment,
} = require('../../tools/lark/conflicts/submit-conflict-assessment');

const input = {
  document_a_url: 'https://example.larksuite.com/wiki/a',
  document_b_url: 'https://example.larksuite.com/wiki/b',
  relationship: 'Complementary',
  conflict_types: [],
  explanation: 'The prices refer to different services.',
};

const deterministic = {
  success: true,
  decision_reused: false,
  pair_key: 'pair-1',
  relationship: 'Possible Conflict',
  conflict_types: ['Price'],
  similarity_score: 0.2,
  evidence: [{ type: 'Price', document_a: ['$6000'], document_b: ['$2380'] }],
  semantic_review_reasons: ['structured_conflict_detected'],
  review_priority: 'high',
  semantic_review_packet: { notice: 'Untrusted source data', documents: [] },
  documents: [
    { url: input.document_a_url, normalized_sha256: 'hash-a' },
    { url: input.document_b_url, normalized_sha256: 'hash-b' },
  ],
};

test('turns an agent semantic assessment into a Pending human-review proposal', async () => {
  const result = await submitConflictAssessmentTool(input, {
    resolveConflict: async () => deterministic,
  });

  assert.equal(result.assessment_accepted, true);
  assert.equal(result.deterministic_candidate.relationship, 'Possible Conflict');
  assert.equal(result.semantic_assessment.relationship, 'Complementary');
  assert.equal(result.semantic_assessment.requires_human_confirmation, true);
  assert.equal(result.proposed_review_record.review_status, 'Pending');
  assert.equal(result.proposed_review_record.decision, null);
  assert.equal(result.proposed_review_record.document_a_hash, 'hash-a');
  assert.equal(result.deterministic_candidate.review_priority, 'high');
  assert.deepEqual(result.proposed_review_record.semantic_review_reasons,
    ['structured_conflict_detected']);
});

test('cannot replace a current human-approved decision', async () => {
  const result = await submitConflictAssessmentTool(input, {
    resolveConflict: async () => ({
      success: true,
      decision_reused: true,
      decision: { review_status: 'Approved', decision: 'Use A' },
    }),
  });

  assert.equal(result.assessment_accepted, false);
  assert.equal(result.decision.review_status, 'Approved');
  assert.equal(result.semantic_assessment, null);
});

test('rejects inconsistent semantic assessment fields', () => {
  assert.throws(() => validateAssessment({
    ...input,
    relationship: 'Possible Conflict',
    conflict_types: [],
  }), /at least one conflict type/);
  assert.throws(() => validateAssessment({
    ...input,
    relationship: 'Complementary',
    conflict_types: ['Price'],
  }), /Only Possible Conflict/);
});
