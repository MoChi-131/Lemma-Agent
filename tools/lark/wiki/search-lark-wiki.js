const { getLarkWikiMetadataTool } = require("./get-lark-wiki-metadata");
const { readWikiSubtreeDocuments } = require("../../../integrations/lark/wiki/wiki-subtree-documents");
const { validateCrawlInput } = require("../../../integrations/lark/wiki/wiki-tree");
// Literal phrase matching, Unicode-aware lowercase; no regex or semantic inference.
const fold = text => text.toLowerCase();
function excerpt(text, query) {
  const points = Array.from(text);
  // Locate on lowercase code points but return original source text.
  const folded = [];
  const offsets = [];
  points.forEach((point, index) => {
    for (const char of Array.from(fold(point))) { folded.push(char); offsets.push(index); }
  });
  const position = folded.join("").indexOf(query);
  const before = position < 0 ? 0 : Array.from(folded.join("").slice(0, position)).length;
  const start = Math.max(0, (offsets[before] || 0) - 60);
  return { text: points.slice(start, start + 240).join(""),
    truncated: start > 0 || start + 240 < points.length };
}
async function searchLarkWikiTool(input = {}, { metadata = getLarkWikiMetadataTool, read, signal } = {}) {
  validateCrawlInput(input);
  const { query, search_in = "both", max_results = 10, max_documents = 10 } = input;
  if (typeof query !== "string" || !query.trim() || query.length > 200) throw Error("query must contain 1–200 characters");
  if (!["title", "content", "both"].includes(search_in)) throw Error("Invalid search_in");
  if (!Number.isInteger(max_results) || max_results < 1 || max_results > 50) throw Error("Invalid max_results");
  if (!Number.isInteger(max_documents) || max_documents < 1 || max_documents > 50) throw Error("Invalid max_documents");
  const inventory = await metadata({ url: input.url, max_depth: input.max_depth, max_nodes: input.max_nodes });
  const bodies = search_in === "title" ? null :
    await readWikiSubtreeDocuments(inventory.nodes, max_documents, { read, signal });
  const byToken = new Map((bodies?.documents || []).map(doc => [doc.obj_token, doc]));
  const needle = fold(query.trim());
  const matches = [];
  for (const node of inventory.nodes) {
    const document = byToken.get(node.obj_token);
    const titleMatch = search_in !== "content" && fold(node.title).includes(needle);
    const contentMatch = search_in !== "title" && document && fold(document.content).includes(needle);
    if (!titleMatch && !contentMatch) continue;
    const snippet = excerpt(contentMatch ? document.content : node.title, needle);
    matches.push({ ...node, matched_fields: [titleMatch && "title", contentMatch && "content"].filter(Boolean),
      snippet: snippet.text, snippet_source: contentMatch ? "content" : "title", snippet_truncated: snippet.truncated,
      content_read: Boolean(document), content_truncated: document?.content_truncated ?? null,
      content_truncation_reasons: document?.content_truncation_reasons ?? [],
      score: (titleMatch ? 2 : 0) + (contentMatch ? 1 : 0) });
  }
  // Stable sort keeps breadth-first order within equal scores. Aliases retain distinct Wiki paths.
  matches.sort((a, b) => b.score - a.score);
  const searchReasons = [...new Set([...inventory.truncation_reasons, ...(bodies?.truncation_reasons || [])])];
  const resultsTruncated = matches.length > max_results;
  return { success: true, source: "lark", action: "search_wiki", query: query.trim(),
    search_in, matching: "case_insensitive_literal_phrase", root: inventory.root,
    results: matches.slice(0, max_results), result_count: Math.min(matches.length, max_results),
    matched_node_count: matches.length, scanned_node_count: inventory.node_count,
    scanned_document_count: bodies?.document_count || 0,
    attempted_document_count: bodies?.attempted_document_count || 0,
    eligible_document_count: bodies?.eligible_document_count ?? null,
    search_complete: !inventory.truncated && !(bodies?.truncated),
    results_truncated: resultsTruncated,
    truncated: searchReasons.length > 0 || resultsTruncated,
    truncation_reasons: [...searchReasons, ...(resultsTruncated ? ["max_results"] : [])],
    skipped: bodies?.skipped || [], errors: [...inventory.errors, ...(bodies?.errors || [])],
    coverage: "Only discovered titles and successfully retrieved docx text within supplied limits; unsupported bodies are excluded." };
}
module.exports = { searchLarkWikiTool };
