const { flattenWikiMetadata } = require("../../../integrations/lark/wiki/wiki-metadata");
const { crawlLarkWikiTreeTool } = require("./crawl-lark-wiki-tree");
const { validateCrawlInput } = require("../../../integrations/lark/wiki/wiki-tree");
const { readWikiSubtreeDocuments, SUBTREE_LIMITS } = require("../../../integrations/lark/wiki/wiki-subtree-documents");

async function readLarkWikiSubtreeTool(input = {}, {
  crawl = crawlLarkWikiTreeTool,
  read,
  signal,
} = {}) {
  validateCrawlInput(input);
  const { url, max_depth = 4, max_nodes = 100,
    max_documents = SUBTREE_LIMITS.defaultDocuments } = input;
  if (!Number.isInteger(max_documents) || max_documents < 1 ||
      max_documents > SUBTREE_LIMITS.maxDocuments) {
    throw new Error("max_documents must be an integer from 1 to 50.");
  }
  const inventory = await crawl({ url, max_depth, max_nodes });
  // Root first, then breadth-first order, preserving the crawler's sibling order.
  const nodes = flattenWikiMetadata(inventory);
  const result = await readWikiSubtreeDocuments(nodes, max_documents, { read, signal });
  return {
    success: true, source: "lark", action: "read_wiki_subtree",
    root: inventory.root, node_count: inventory.node_count,
    ...result,
    crawl_truncated: inventory.truncated,
    truncated: inventory.truncated || result.truncated,
    truncation_reasons: [...new Set([...inventory.truncation_reasons, ...result.truncation_reasons])],
    errors: [
      ...inventory.errors.map(error => ({ ...error, stage: "crawl" })),
      ...result.errors,
    ],
  };
}

module.exports = { readLarkWikiSubtreeTool };
