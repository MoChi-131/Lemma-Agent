const crypto = require('node:crypto');
const {
  compareDocuments,
  calculateDocumentHash,
} = require('./document-comparison');

const DECISIONS = Object.freeze(['Use A', 'Use B', 'Use Both', 'Escalate']);

/**
 * Compare only when no current approved human decision exists.
 * `decisions` may later come from Lark Base without changing this interface.
 */
function compareWithDecisionRegistry(documentA, documentB, decisions = []) {
  const pairKey = createPairKey(documentA.url, documentB.url);
  const hashes = {
    document_a: calculateDocumentHash(documentA.content),
    document_b: calculateDocumentHash(documentB.content),
  };
  const stored = findLatestDecision(decisions, pairKey);

  if (stored && isReusableDecision(stored, documentA, documentB, hashes)) {
    return {
      success: true,
      source: 'approved_conflict_decision',
      comparison_performed: false,
      pair_key: pairKey,
      decision_reused: true,
      decision: presentDecision(stored),
    };
  }

  const comparison = compareDocuments(documentA, documentB);
  const staleDecision = stored?.review_status === 'Approved' ? presentDecision(stored) : null;

  return {
    ...comparison,
    source: 'document_comparison',
    comparison_performed: true,
    pair_key: pairKey,
    decision_reused: false,
    stale_decision: staleDecision,
    proposed_review_record: comparison.requires_human_review
      ? createPendingReviewRecord({ pairKey, documentA, documentB, hashes, comparison })
      : null,
  };
}

/** URL order does not affect the identity of a document pair. */
function createPairKey(urlA, urlB) {
  const urls = [normalizeUrl(urlA), normalizeUrl(urlB)].sort();
  if (urls[0] === urls[1]) throw new Error('Comparison requires two distinct document URLs.');
  return crypto.createHash('sha256').update(urls.join('\n')).digest('hex');
}

function normalizeUrl(value) {
  const url = new URL(value);
  if (url.protocol !== 'https:') throw new Error('Conflict decisions require HTTPS document URLs.');
  url.hash = '';
  return url.toString();
}

function findLatestDecision(decisions, pairKey) {
  return decisions
    .filter(decision => decision.pair_key === pairKey)
    .sort((left, right) => String(right.reviewed_date || '').localeCompare(String(left.reviewed_date || '')))[0] || null;
}

function isReusableDecision(decision, documentA, documentB, hashes) {
  if (decision.review_status !== 'Approved' || !DECISIONS.includes(decision.decision)) return false;

  const currentByUrl = new Map([
    [normalizeUrl(documentA.url), hashes.document_a],
    [normalizeUrl(documentB.url), hashes.document_b],
  ]);

  return currentByUrl.get(normalizeUrl(decision.document_a_url)) === decision.document_a_hash &&
    currentByUrl.get(normalizeUrl(decision.document_b_url)) === decision.document_b_hash;
}

function createPendingReviewRecord({ pairKey, documentA, documentB, hashes, comparison }) {
  return {
    pair_key: pairKey,
    document_a_url: normalizeUrl(documentA.url),
    document_b_url: normalizeUrl(documentB.url),
    document_a_hash: hashes.document_a,
    document_b_hash: hashes.document_b,
    deterministic_relationship: comparison.relationship,
    conflict_types: comparison.conflict_types,
    similarity_score: comparison.similarity_score,
    evidence: comparison.evidence,
    semantic_review_recommended: comparison.semantic_review_recommended,
    semantic_review_reasons: comparison.semantic_review_reasons,
    review_priority: comparison.review_priority,
    review_status: 'Pending',
    decision: null,
    decision_reason: null,
    reviewed_by: null,
    reviewed_date: null,
  };
}

function presentDecision(decision) {
  return {
    review_status: decision.review_status,
    decision: decision.decision,
    decision_reason: decision.decision_reason || null,
    reviewed_by: decision.reviewed_by || null,
    reviewed_date: decision.reviewed_date || null,
  };
}

module.exports = {
  compareWithDecisionRegistry,
  createPairKey,
  DECISIONS,
};
