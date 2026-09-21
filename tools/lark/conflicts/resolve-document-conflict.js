const fs = require('node:fs/promises');
const path = require('node:path');
const { readLarkDocumentTool } = require('../documents/read-lark-document');
const {
  compareWithDecisionRegistry,
} = require('../../../integrations/lark/conflicts/conflict-decision-registry');
const { reviewConflictWithAi } = require('../../../integrations/lark/conflicts/ai-conflict-review');

const DEFAULT_DECISIONS_FILE = path.join(__dirname, '../../data/conflict-decisions.json');

/** MCP-facing orchestration: read two Lark documents, then resolve or compare. */
async function resolveDocumentConflictTool(input, deps = {}) {
  validateInput(input);

  const load = deps.loadDocument || loadLarkDocument;
  const readDecisions = deps.readDecisions || loadConflictDecisions;
  const settled = await Promise.allSettled([
    load(input.document_a_url, 'document_a'),
    load(input.document_b_url, 'document_b'),
  ]);
  const errors = settled.flatMap((result, index) => result.status === 'rejected' ? [{
    document: index === 0 ? 'document_a' : 'document_b',
    url: index === 0 ? input.document_a_url : input.document_b_url,
    error: result.reason instanceof Error ? result.reason.message : String(result.reason),
  }] : []);

  if (errors.length) {
    return {
      success: false,
      relationship: null,
      decision_reused: false,
      requires_human_review: true,
      errors,
    };
  }

  const decisions = await readDecisions();
  const result = compareWithDecisionRegistry(
    settled[0].value,
    settled[1].value,
    decisions,
  );

  const review = input.use_ai === false || result.decision_reused
    ? { status: 'skipped', reason: 'AI review was disabled or an approved decision was reused.' }
    : await safelyReviewConflict(result, deps.reviewConflict);
  const reviewedResult = applyAiReview(result, review);

  return {
    ...reviewedResult,
    ai_review: review,
    agent_observation: {
      suspected_conflict_type: input.suspected_conflict_type || null,
      reason: input.reason || null,
    },
  };
}

async function safelyReviewConflict(result, reviewer = reviewConflictWithAi) {
  try {
    return await reviewer(result);
  } catch (error) {
    return {
      status: 'unavailable',
      reason: error instanceof Error ? error.message : 'AI conflict review failed.',
    };
  }
}

function applyAiReview(result, review) {
  if (review.status !== 'completed') return result;

  const requiresHumanReview = review.requires_human_review ||
    ['confirmed_conflict', 'uncertain'].includes(review.verdict);
  const proposed = requiresHumanReview
    ? { ...(result.proposed_review_record || {}), ai_review: review, review_status: 'Pending' }
    : null;

  return {
    ...result,
    deterministic_candidate: {
      relationship: result.relationship,
      conflict_types: result.conflict_types,
      explanation: result.explanation,
    },
    relationship: review.relationship,
    conflict_types: review.conflict_types,
    explanation: review.explanation,
    requires_human_review: requiresHumanReview,
    proposed_review_record: proposed,
  };
}

async function loadLarkDocument(url, id) {
  validateLarkWikiUrl(url);

  // Reuse the established tool path so Wiki resolution and document reading
  // remain in one place instead of being duplicated by this feature.
  const result = await readLarkDocumentTool({ url });
  return { id, title: null, url: result.url, content: result.content };
}

function validateLarkWikiUrl(value) {
  const url = new URL(value);
  if (url.protocol !== 'https:' || !url.hostname.endsWith('.larksuite.com') || !url.pathname.startsWith('/wiki/')) {
    throw new Error('A valid HTTPS Lark Wiki URL is required.');
  }
}

async function loadConflictDecisions() {
  const parsed = JSON.parse(await fs.readFile(DEFAULT_DECISIONS_FILE, 'utf8'));
  if (!Array.isArray(parsed)) throw new Error('Conflict decision registry must contain a JSON array.');
  return parsed;
}

function validateInput(input) {
  if (!input?.document_a_url || !input?.document_b_url) {
    throw new Error('document_a_url and document_b_url are required.');
  }

  if (input.document_a_url === input.document_b_url) {
    throw new Error('Provide two distinct document URLs.');
  }
}

module.exports = {
  resolveDocumentConflictTool,
  loadLarkDocument,
};
