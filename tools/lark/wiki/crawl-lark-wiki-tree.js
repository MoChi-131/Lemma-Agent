const { crawlWikiTree } = require("../../../integrations/lark/wiki/wiki-tree");

async function crawlLarkWikiTreeTool(input, api) {
  return {
    success: true,
    source: "lark",
    action: "crawl_wiki_tree",
    ...await crawlWikiTree(input, api),
  };
}

module.exports = { crawlLarkWikiTreeTool };
