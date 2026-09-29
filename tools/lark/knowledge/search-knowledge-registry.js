const {
  getKnowledgeMetadata,
} = require('../../../integrations/lark/knowledge/knowledge-registry');

const SEARCH_FIELDS = {
  title: 5,
  tags: 4,
  primary_domain: 3,
  document_type: 3,
  scope: 2,
  project_name: 2,
  workstream: 2,
  owner_person: 1,
};

function normalizeText(value) {
  const items = Array.isArray(value) ? value : [value];
  return items.filter(Boolean).join(' ').toLocaleLowerCase();
}

function queryTerms(query) {
  return [...new Set(query.toLocaleLowerCase().split(/[\s,;，；]+/u).filter(Boolean))];
}

function scoreDocument(document, terms) {
  const matchedFields = [];
  let score = 0;

  for (const [field, weight] of Object.entries(SEARCH_FIELDS)) {
    const value = normalizeText(document[field]);
    const matches = terms.filter(term => value.includes(term));
    if (!matches.length) continue;
    matchedFields.push(field);
    score += weight * matches.length;
  }

  return { score, matchedFields };
}

const AUTHORITY_ORDER = Object.freeze({
  business: Object.freeze({ 'Internal Official': 3, Reference: 2 }),
  // Government questions still search internal Registry knowledge first. If an
  // external source is needed, the agent uses the separate web whitelist flow.
  government: Object.freeze({ 'Internal Official': 3, Reference: 2 }),
});

function authorityRank(authorityLevel, rankingContext = 'business') {
  return AUTHORITY_ORDER[rankingContext]?.[authorityLevel] || 0;
}

function scopeRank(scope) {
  return scope === 'Knowledge Base' ? 2 : 1;
}

function exactMatchRank(document, query, terms) {
  const normalizedQuery = normalizeText(query).trim();
  const title = normalizeText(document.title).trim();
  const tags = Array.isArray(document.tags) ? document.tags.map(tag => normalizeText(tag).trim()) : [];
  if (normalizedQuery && title === normalizedQuery) return 3;
  if (normalizedQuery && tags.includes(normalizedQuery)) return 2;
  return terms.some(term => tags.includes(term) || title.split(/\s+/).includes(term)) ? 1 : 0;
}

function versionRank(version) {
  const numbers = String(version || '').match(/\d+/g);
  if (!numbers) return 0;
  return numbers.slice(0, 3).reduce((score, value, index) => score + Number(value) / (1000 ** index), 0);
}

/** Apply the frozen policy without reading document bodies during discovery. */
function rankDocument(document, query, terms, rankingContext) {
  const { score, matchedFields } = scoreDocument(document, terms);
  return {
    document, score, matchedFields,
    eligibilityRank: document.retrieval_eligible === true ? 1 : 0,
    exactMatchRank: exactMatchRank(document, query, terms),
    authorityRank: authorityRank(document.authority_level, rankingContext),
    scopeRank: scopeRank(document.scope, rankingContext),
    versionRank: versionRank(document.version),
  };
}

function compareRankedDocuments(left, right) {
  return right.eligibilityRank - left.eligibilityRank ||
    right.exactMatchRank - left.exactMatchRank ||
    right.authorityRank - left.authorityRank ||
    right.scopeRank - left.scopeRank ||
    right.versionRank - left.versionRank ||
    right.score - left.score ||
    String(left.document.title || '').localeCompare(String(right.document.title || ''), 'zh-Hant');
}

/** Search normalized Registry metadata before falling back to Wiki content search. */
async function searchKnowledgeRegistryTool(input, deps = {}) {
  const readMetadata = deps.getKnowledgeMetadata || getKnowledgeMetadata;
  const retrievalEligibleOnly = input.retrieval_eligible_only ?? true;
  const maxResults = input.max_results ?? 10;
  const rankingContext = input.ranking_context || 'business';
  if (!Object.hasOwn(AUTHORITY_ORDER, rankingContext)) {
    throw new Error('ranking_context must be business or government.');
  }
  const terms = queryTerms(input.query);
  const metadata = await readMetadata({
    registryUrl: input.registryUrl,
  });

  const matches = metadata.documents
    .filter(document => !retrievalEligibleOnly || document.retrieval_eligible === true)
    .map(document => rankDocument(document, input.query, terms, rankingContext))
    .filter(match => match.score > 0)
    .sort(compareRankedDocuments)
    .slice(0, maxResults);

  return {
    success: true,
    source: 'lark_base',
    action: 'search_knowledge_registry',
    query: input.query,
    terms,
    retrieval_eligible_only: retrievalEligibleOnly,
    ranking_context: rankingContext,
    result_count: matches.length,
    results: matches.map(({
      document, score, matchedFields, exactMatchRank: exactMatch, authorityRank: authority,
      scopeRank: scope, versionRank: version,
    }) => ({
      ...document,
      match_score: score,
      matched_fields: matchedFields,
      ranking: {
        exact_match_rank: exactMatch,
        authority_rank: authority,
        scope_rank: scope,
        version_rank: version,
      },
    })),
  };
}

module.exports = {
  queryTerms,
  scoreDocument,
  authorityRank,
  rankDocument,
  compareRankedDocuments,
  searchKnowledgeRegistryTool,
};
