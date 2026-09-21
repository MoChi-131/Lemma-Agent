const { z } = require("zod");
const { crawlLarkWikiTreeTool } = require("../../tools/lark/wiki/crawl-lark-wiki-tree");
const { LIMITS } = require("../../integrations/lark/wiki/wiki-tree");

function registerWikiTreeTool(server) {
  server.registerTool("crawl_lark_wiki_tree", {
    title: "Crawl Lark Wiki Tree",
    description: "Build a Wiki directory tree from an HTTPS Lark Wiki root URL. Does not read document bodies. Root has depth 0 and counts toward max_nodes. Check truncated, truncation_reasons and errors before claiming a complete inventory.",
    inputSchema: {
      url: z.string().url().describe("HTTPS *.larksuite.com/wiki/<token> root URL"),
      max_depth: z.number().int().min(0).max(LIMITS.maxDepth).default(LIMITS.defaultDepth),
      max_nodes: z.number().int().min(1).max(LIMITS.maxNodes).default(LIMITS.defaultNodes),
    },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
  }, async input => {
    try {
      const result = await crawlLarkWikiTreeTool(input);
      return { content: [{ type: "text", text: JSON.stringify(result) }], structuredContent: result };
    } catch (error) {
      return { isError: true, content: [{ type: "text", text: error.message }] };
    }
  });
}

module.exports = { registerWikiTreeTool };
