const {
  readWikiSubtreeDocuments,
} = require('../../../integrations/lark/wiki/wiki-subtree-documents');
const {
  validateCrawlInput,
} = require('../../../integrations/lark/wiki/wiki-tree');
const { getLarkWikiMetadataTool } = require('./get-lark-wiki-metadata');

const SEARCH_TARGETS = ['title', 'content', 'both'];
const fold = text => text.toLowerCase();

function buildExcerpt(text, foldedQuery) {
  const characters = Array.from(text);
  const foldedCharacters = [];
  const sourceOffsets = [];

  characters.forEach((character, sourceIndex) => {
    for (const foldedCharacter of Array.from(fold(character))) {
      foldedCharacters.push(foldedCharacter);
      sourceOffsets.push(sourceIndex);
    }
  });

  const foldedText = foldedCharacters.join('');
  const position = foldedText.indexOf(foldedQuery);
  // String indexes use UTF-16 offsets, so convert to a code-point offset before
  // mapping the match back to the original source characters.
  const codePointPosition = Array.from(foldedText.slice(0, position)).length;
  const start = Math.max(0, (sourceOffsets[codePointPosition] || 0) - 60);
  const end = start + 240;

  return {
    text: characters.slice(start, end).join(''),
    truncated: start > 0 || end < characters.length,
  };
}

function validateSearchInput({ query, search_in, max_results, max_documents }) {
  if (typeof query !== 'string' || !query.trim() || query.length > 200) {
    throw new Error('query must contain 1–200 characters');
  }
  if (!SEARCH_TARGETS.includes(search_in)) throw new Error('Invalid search_in');
  if (!Number.isInteger(max_results) || max_results < 1 || max_results > 50) {
    throw new Error('max_results must be between 1 and 50');
  }
  if (!Number.isInteger(max_documents) || max_documents < 1 || max_documents > 50) {
    throw new Error('max_documents must be between 1 and 50');
  }
}

function createMatch(node, document, needle, searchIn) {
  const titleMatch = searchIn !== 'content' && fold(node.title).includes(needle);
  const contentMatch = searchIn !== 'title' && document && fold(document.content).includes(needle);
  if (!titleMatch && !contentMatch) return null;

  const snippetSource = contentMatch ? 'content' : 'title';
  const snippet = buildExcerpt(contentMatch ? document.content : node.title, needle);

  return {
    ...node,
    matched_fields: [titleMatch && 'title', contentMatch && 'content'].filter(Boolean),
    snippet: snippet.text,
    snippet_source: snippetSource,
    snippet_truncated: snippet.truncated,
    content_read: Boolean(document),
    content_truncated: document?.content_truncated ?? null,
    content_truncation_reasons: document?.content_truncation_reasons ?? [],
    score: (titleMatch ? 2 : 0) + (contentMatch ? 1 : 0),
  };
}

async function searchLarkWikiTool(
  input = {},
  { metadata = getLarkWikiMetadataTool, read, signal } = {},
) {
  validateCrawlInput(input);

  const {
    query,
    search_in: searchIn = 'both',
    max_results: maxResults = 10,
    max_documents: maxDocuments = 10,
  } = input;
  validateSearchInput({ query, search_in: searchIn, max_results: maxResults, max_documents: maxDocuments });

  const inventory = await metadata({
    url: input.url,
    max_depth: input.max_depth,
    max_nodes: input.max_nodes,
  });
  const bodies = searchIn === 'title'
    ? null
    : await readWikiSubtreeDocuments(inventory.nodes, maxDocuments, { read, signal });
  const documentsByToken = new Map(
    (bodies?.documents || []).map(document => [document.obj_token, document]),
  );
  const needle = fold(query.trim());
  const matches = inventory.nodes
    .map(node => createMatch(node, documentsByToken.get(node.obj_token), needle, searchIn))
    .filter(Boolean)
    .sort((left, right) => right.score - left.score);

  const truncationReasons = [...new Set([
    ...inventory.truncation_reasons,
    ...(bodies?.truncation_reasons || []),
  ])];
  const resultsTruncated = matches.length > maxResults;
  if (resultsTruncated) truncationReasons.push('max_results');

  return {
    success: true,
    source: 'lark',
    action: 'search_wiki',
    query: query.trim(),
    search_in: searchIn,
    matching: 'case_insensitive_literal_phrase',
    root: inventory.root,
    results: matches.slice(0, maxResults),
    result_count: Math.min(matches.length, maxResults),
    matched_node_count: matches.length,
    scanned_node_count: inventory.node_count,
    scanned_document_count: bodies?.document_count || 0,
    attempted_document_count: bodies?.attempted_document_count || 0,
    eligible_document_count: bodies?.eligible_document_count ?? null,
    search_complete: !inventory.truncated && !(bodies?.truncated),
    results_truncated: resultsTruncated,
    truncated: truncationReasons.length > 0,
    truncation_reasons: truncationReasons,
    skipped: bodies?.skipped || [],
    errors: [...inventory.errors, ...(bodies?.errors || [])],
    coverage: 'Only discovered titles and successfully retrieved docx text within supplied limits; unsupported bodies are excluded.',
  };
}

module.exports = { searchLarkWikiTool };
