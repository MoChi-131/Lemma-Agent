const { crawlLarkWikiTreeTool } = require("./crawl-lark-wiki-tree");
const { flattenWikiMetadata } = require("../../../integrations/lark/wiki/wiki-metadata");
const { validateCrawlInput } = require("../../../integrations/lark/wiki/wiki-tree");
async function getLarkWikiMetadataTool(input = {}, { crawl = crawlLarkWikiTreeTool } = {}) {
  validateCrawlInput(input);
  const inventory = await crawl(input);
  const nodes = flattenWikiMetadata(inventory);
  return { success: true, source: "lark", action: "get_wiki_metadata",
    root: nodes[0], nodes, node_count: nodes.length,
    truncated: inventory.truncated, truncation_reasons: inventory.truncation_reasons,
    errors: inventory.errors };
}
module.exports = { getLarkWikiMetadataTool };
