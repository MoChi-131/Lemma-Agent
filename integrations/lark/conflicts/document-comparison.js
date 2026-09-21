const crypto = require('node:crypto');

const RELATIONSHIPS = Object.freeze({
  SAME: 'Same',
  DUPLICATE: 'Possible Duplicate',
  CONFLICT: 'Possible Conflict',
  COMPLEMENTARY: 'Complementary',
  DIFFERENT_TOPIC: 'Different Topic',
});

const DEFAULT_THRESHOLDS = Object.freeze({
  same: 0.95,
  duplicate: 0.75,
  related: 0.3,
});

/**
 * Compare two already-read documents without calling Lark or changing data.
 * This prototype is deterministic and intended for taxonomy/dataset testing.
 *
 * @example
 * compareDocuments({ title: 'Price A', content: 'Price: HK$2,000' },
 *   { title: 'Price B', content: 'Price: HK$2,500' });
 */
function compareDocuments(documentA, documentB, options = {}) {
  const thresholds = { ...DEFAULT_THRESHOLDS, ...options.thresholds };
  const left = prepareDocument(documentA, 'document_a');
  const right = prepareDocument(documentB, 'document_b');
  const similarity = calculateSimilarity(left.tokens, right.tokens);
  const conflicts = findFactConflicts(left, right);
  const sharedTopics = intersect(left.topicTokens, right.topicTokens);
  const classification = classify({ left, right, similarity, conflicts, sharedTopics, thresholds });

  return {
    success: true,
    relationship: classification.relationship,
    conflict_types: [...new Set(conflicts.map(conflict => conflict.type))],
    similarity_score: round(similarity),
    requires_human_review: classification.requiresHumanReview,
    explanation: classification.explanation,
    evidence: conflicts.slice(0, 5),
    documents: [summarizeDocument(left), summarizeDocument(right)],
  };
}

function prepareDocument(document, label) {
  if (!document || typeof document !== 'object') {
    throw new TypeError(`${label} must be an object.`);
  }

  const content = typeof document.content === 'string' ? document.content.trim() : '';
  if (!content) throw new TypeError(`${label}.content must be a non-empty string.`);

  const normalized = normalizeText(content);
  const title = typeof document.title === 'string' ? document.title.trim() : null;

  return {
    id: document.id || label,
    title,
    url: document.url || null,
    normalized,
    hash: crypto.createHash('sha256').update(normalized).digest('hex'),
    tokens: tokenize(normalized),
    topicTokens: new Set(tokenize(`${title || ''} ${normalized}`).filter(token => !STOP_WORDS.has(token))),
    facts: extractFacts(content),
  };
}

function normalizeText(value) {
  return value
    .normalize('NFKC')
    .toLocaleLowerCase('zh-Hant')
    .replace(/\r\n?/g, '\n')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[，、]/g, ',')
    .replace(/[。]/g, '.')
    .trim();
}

/** Stable content fingerprint used to invalidate stored human decisions. */
function calculateDocumentHash(content) {
  if (typeof content !== 'string' || !content.trim()) {
    throw new TypeError('content must be a non-empty string.');
  }

  return crypto.createHash('sha256').update(normalizeText(content)).digest('hex');
}

function tokenize(value) {
  if (typeof Intl.Segmenter === 'function') {
    const segmenter = new Intl.Segmenter(['zh-Hant', 'en'], { granularity: 'word' });
    return [...segmenter.segment(value)]
      .filter(part => part.isWordLike)
      .map(part => part.segment.toLowerCase());
  }

  return value.match(/[\p{L}\p{N}]+/gu) || [];
}

// Sørensen-Dice over token counts preserves repeated important terms.
function calculateSimilarity(leftTokens, rightTokens) {
  if (!leftTokens.length || !rightTokens.length) return 0;
  const leftCounts = countValues(leftTokens);
  const rightCounts = countValues(rightTokens);
  let shared = 0;

  for (const [token, count] of leftCounts) {
    shared += Math.min(count, rightCounts.get(token) || 0);
  }

  return (2 * shared) / (leftTokens.length + rightTokens.length);
}

function extractFacts(content) {
  return {
    Price: uniqueMatches(content, /(?:HK\$|HKD|港幣|港元|\$)\s*\d[\d,]*(?:\.\d+)?/giu, normalizeFact),
    Date: uniqueMatches(
      content,
      /\b(?:20\d{2}[-/.年]\d{1,2}[-/.月]\d{1,2}日?|\d{1,2}[-/.]\d{1,2}[-/.]20\d{2})\b/gu,
      normalizeDateFact,
    ),
    'Contact Info': uniqueMatches(
      content,
      /(?:[\w.+-]+@[\w.-]+\.[a-z]{2,}|(?:\+?852[-\s]?)?[2-9]\d{3}[-\s]?\d{4})/giu,
      normalizeFact,
    ),
    Process: extractRequiredSteps(content),
  };
}

function uniqueMatches(content, pattern, normalizer) {
  return [...new Set([...content.matchAll(pattern)].map(match => normalizer(match[0])))];
}

function normalizeFact(value) {
  return value.toLowerCase().replace(/[\s,]/g, '');
}

function normalizeDateFact(value) {
  return value.replace(/[年月/.]/g, '-').replace(/日$/, '').replace(/-+/g, '-');
}

function extractRequiredSteps(content) {
  return content
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(line => /^(?:\d+[.)、]|[-*])\s*.+/.test(line) && /(?:必須|需要|應|must|required|shall)/i.test(line))
    .map(line => normalizeText(line.replace(/^(?:\d+[.)、]|[-*])\s*/, '')));
}

function findFactConflicts(left, right) {
  const conflicts = [];

  for (const type of Object.keys(left.facts)) {
    const leftValues = left.facts[type];
    const rightValues = right.facts[type];
    if (!leftValues.length || !rightValues.length || sameSet(leftValues, rightValues)) continue;

    conflicts.push({
      type,
      document_a: leftValues,
      document_b: rightValues,
      document_a_contexts: extractContexts(left.normalized, leftValues),
      document_b_contexts: extractContexts(right.normalized, rightValues),
      reason: `兩份文件包含不同的${type}資料。`,
    });
  }

  return conflicts;
}

function extractContexts(content, values, radius = 100) {
  return values.map(value => {
    const index = findFactIndex(content, value);
    if (index < 0) return { value, context: null };
    return {
      value,
      context: content.slice(Math.max(0, index - radius), index + value.length + radius).trim(),
    };
  });
}

function findFactIndex(content, value) {
  const exact = content.indexOf(value);
  if (exact >= 0) return exact;

  const digits = value.match(/\d+(?:\.\d+)?/)?.[0];
  if (!digits) return -1;
  const flexibleNumber = digits.split('').map(escapeRegExp).join('[,\\s]*');
  return content.search(new RegExp(flexibleNumber, 'u'));
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function classify({ left, right, similarity, conflicts, sharedTopics, thresholds }) {
  if (left.hash === right.hash) {
    return decision(RELATIONSHIPS.SAME, false, '正規化後的正文雜湊完全相同。');
  }

  if (conflicts.length > 0 && (similarity >= thresholds.related || sharedTopics.length > 0)) {
    return decision(
      RELATIONSHIPS.CONFLICT,
      true,
      `相同主題中發現不兼容的${[...new Set(conflicts.map(item => item.type))].join('、')}資料。`,
    );
  }

  if (similarity >= thresholds.same) {
    return decision(RELATIONSHIPS.SAME, false, '重要內容高度一致，差異主要來自文字或格式。');
  }

  if (similarity >= thresholds.duplicate) {
    return decision(RELATIONSHIPS.DUPLICATE, true, '兩份文件的正文高度重疊，需要人工確認是否重複。');
  }

  if (similarity < thresholds.related && sharedTopics.length === 0) {
    return decision(RELATIONSHIPS.DIFFERENT_TOPIC, false, '沒有足夠的共同主題或內容。');
  }

  return decision(RELATIONSHIPS.COMPLEMENTARY, false, '文件主題相關，但沒有發現互不相容的事實。');
}

function decision(relationship, requiresHumanReview, explanation) {
  return { relationship, requiresHumanReview, explanation };
}

function summarizeDocument(document) {
  return {
    id: document.id,
    title: document.title,
    url: document.url,
    normalized_sha256: document.hash,
  };
}

function countValues(values) {
  const counts = new Map();
  for (const value of values) counts.set(value, (counts.get(value) || 0) + 1);
  return counts;
}

function sameSet(left, right) {
  return left.length === right.length && left.every(value => right.includes(value));
}

function intersect(left, right) {
  return [...left].filter(value => right.has(value));
}

function round(value) {
  return Number(value.toFixed(4));
}

const STOP_WORDS = new Set([
  'the', 'a', 'an', 'and', 'or', 'of', 'to', 'for', 'is', 'are',
  '的', '和', '及', '與', '是', '為', '在', '需', '需要',
]);

module.exports = {
  compareDocuments,
  normalizeText,
  calculateDocumentHash,
  calculateSimilarity,
  extractFacts,
  RELATIONSHIPS,
  DEFAULT_THRESHOLDS,
};
