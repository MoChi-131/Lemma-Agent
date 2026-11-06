const { crawlWikiTree } = require("../../../integrations/lark/wiki/wiki-tree");

/**
 * Expose the bounded read-only Wiki tree crawl through the public MCP tool.
 * @param {object} input Wiki URL and optional traversal limits.
 * @param {object} api optional Wiki adapter for tests.
 * @returns {Promise<object>} crawl result with node inventory and limit diagnostics.
 */
async function crawlLarkWikiTreeTool(input, api) {
  return {
    success: true,
    source: "lark",
    action: "crawl_wiki_tree",
    ...await crawlWikiTree(input, api),
  };
}

module.exports = { crawlLarkWikiTreeTool };
