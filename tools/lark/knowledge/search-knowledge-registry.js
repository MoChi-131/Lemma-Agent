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

/** Search normalized Registry metadata before falling back to Wiki content search. */
async function searchKnowledgeRegistryTool(input, deps = {}) {
  const readMetadata = deps.getKnowledgeMetadata || getKnowledgeMetadata;
  const retrievalEligibleOnly = input.retrieval_eligible_only ?? true;
  const maxResults = input.max_results ?? 10;
  const terms = queryTerms(input.query);
  const metadata = await readMetadata({
    registryUrl: input.registryUrl,
    whitelistUrl: input.whitelistUrl,
  });

  const matches = metadata.documents
    .filter(document => !retrievalEligibleOnly || document.retrieval_eligible === true)
    .map(document => {
      const { score, matchedFields } = scoreDocument(document, terms);
      return { document, score, matchedFields };
    })
    .filter(match => match.score > 0)
    .sort((left, right) => right.score - left.score)
    .slice(0, maxResults);

  return {
    success: true,
    source: 'lark_base',
    action: 'search_knowledge_registry',
    query: input.query,
    terms,
    retrieval_eligible_only: retrievalEligibleOnly,
    result_count: matches.length,
    results: matches.map(({ document, score, matchedFields }) => ({
      ...document,
      match_score: score,
      matched_fields: matchedFields,
    })),
  };
}

module.exports = {
  queryTerms,
  scoreDocument,
  searchKnowledgeRegistryTool,
};
