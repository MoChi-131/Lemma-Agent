const { z } = require('zod');
const {
  listLarkWikiChildrenTool,
} = require('../../tools/lark/wiki/list-lark-wiki-children');

function registerWikiChildrenTool(server) {
  server.registerTool('list_lark_wiki_children', {
    title: 'List Lark Wiki Children',
    description: 'List direct child nodes under a known Supermama Lark Wiki parent node.',
    inputSchema: {
      space_id: z.string(),
      parent_node_token: z.string(),
      page_size: z.number().int().min(1).max(50).optional(),
      page_token: z.string().optional(),
    },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    },
  }, async input => {
    try {
      const result = await listLarkWikiChildrenTool(input);
      return {
        content: [{ type: 'text', text: JSON.stringify(result) }],
        structuredContent: result,
      };
    } catch (error) {
      return {
        isError: true,
        content: [{ type: 'text', text: error instanceof Error ? error.message : String(error) }],
      };
    }
  });
}

module.exports = { registerWikiChildrenTool };
