const { resolveDocumentConflictTool } = require('./resolve-document-conflict');
const {
  RELATIONSHIPS,
  CONFLICT_TYPES,
} = require('../../../integrations/lark/conflicts/document-comparison');

const relationshipValues = new Set(Object.values(RELATIONSHIPS));
const conflictTypeValues = new Set(CONFLICT_TYPES);

/**
 * Combine an MCP agent's concise semantic assessment with fresh deterministic
 * evidence. The result is only a Pending proposal; this function never writes
 * data or approves a governance decision.
 */
async function submitConflictAssessmentTool(input, deps = {}) {
  validateAssessment(input);

  const resolve = deps.resolveConflict || resolveDocumentConflictTool;
  const deterministic = await resolve({
    document_a_url: input.document_a_url,
    document_b_url: input.document_b_url,
  }, deps.resolveDeps);

  if (!deterministic.success) {
    return {
      ...deterministic,
      assessment_accepted: false,
      semantic_assessment: null,
    };
  }

  if (deterministic.decision_reused) {
    return {
      ...deterministic,
      assessment_accepted: false,
      semantic_assessment: null,
      reason: 'A current human-approved decision already exists for these document hashes.',
    };
  }

  const semanticAssessment = {
    relationship: input.relationship,
    conflict_types: input.conflict_types || [],
    explanation: input.explanation.trim(),
    submitted_by: 'mcp_agent',
    requires_human_confirmation: true,
  };
  const [documentA, documentB] = deterministic.documents;

  return {
    success: true,
    source: 'agent_semantic_assessment',
    assessment_accepted: true,
    pair_key: deterministic.pair_key,
    deterministic_candidate: {
      relationship: deterministic.relationship,
      conflict_types: deterministic.conflict_types,
      similarity_score: deterministic.similarity_score,
      evidence: deterministic.evidence,
      semantic_review_reasons: deterministic.semantic_review_reasons,
      review_priority: deterministic.review_priority,
      semantic_review_packet: deterministic.semantic_review_packet,
    },
    semantic_assessment: semanticAssessment,
    proposed_review_record: {
      pair_key: deterministic.pair_key,
      document_a_url: documentA.url,
      document_b_url: documentB.url,
      document_a_hash: documentA.normalized_sha256,
      document_b_hash: documentB.normalized_sha256,
      deterministic_relationship: deterministic.relationship,
      agent_relationship: semanticAssessment.relationship,
      conflict_types: semanticAssessment.conflict_types,
      deterministic_evidence: deterministic.evidence,
      semantic_review_reasons: deterministic.semantic_review_reasons,
      review_priority: deterministic.review_priority,
      agent_explanation: semanticAssessment.explanation,
      review_status: 'Pending',
      decision: null,
      decision_reason: null,
      reviewed_by: null,
      reviewed_date: null,
    },
  };
}

function validateAssessment(input) {
  if (!input?.document_a_url || !input?.document_b_url) {
    throw new Error('document_a_url and document_b_url are required.');
  }
  if (!relationshipValues.has(input.relationship)) {
    throw new Error('A supported semantic relationship is required.');
  }
  if (!Array.isArray(input.conflict_types) ||
      input.conflict_types.some(type => !conflictTypeValues.has(type))) {
    throw new Error('conflict_types must be an array.');
  }
  if (input.relationship === 'Possible Conflict' && input.conflict_types.length === 0) {
    throw new Error('Possible Conflict requires at least one conflict type.');
  }
  if (input.relationship !== 'Possible Conflict' && input.conflict_types.length > 0) {
    throw new Error('Only Possible Conflict may include conflict types.');
  }
  if (typeof input.explanation !== 'string' || !input.explanation.trim()) {
    throw new Error('A concise semantic explanation is required.');
  }
}

module.exports = { submitConflictAssessmentTool, validateAssessment };
