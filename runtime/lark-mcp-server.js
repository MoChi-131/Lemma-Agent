const { registerWikiSearchTools } = require("./register-wiki-search-tools");
const { registerKnowledgeTools } = require("./register-knowledge-tools");
const { McpServer } = require(
  "@modelcontextprotocol/sdk/server/mcp.js"
);
const { StdioServerTransport } = require(
  "@modelcontextprotocol/sdk/server/stdio.js"
);
const { z } = require("zod");
const { registerWikiTreeTool } = require("./register-wiki-tree-tool");
const { registerWikiSubtreeTool } = require("./register-wiki-subtree-tool");

const {
  readLarkDocumentTool,
} = require("../tools/lark/read-lark-document");

const server = new McpServer({
  name: "supermama-lark",
  version: "0.3.4",
});

server.registerTool(
  "read_lark_document",
  {
    title: "Read Lark Document",
    description:
      "Read the content of a Lark Wiki document from its URL.",
    inputSchema: {
      url: z.string().url().describe("Lark Wiki document URL"),
    },
  },
  async ({ url }) => {
    try {
      const result = await readLarkDocumentTool({ url });

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(result),
          },
        ],
      };
    } catch (error) {
      return {
        isError: true,
        content: [
          {
            type: "text",
            text:
              error instanceof Error
                ? error.message
                : String(error),
          },
        ],
      };
    }
  }
);

async function main() {
  registerWikiTreeTool(server);
  registerWikiSubtreeTool(server);
  registerWikiSearchTools(server);
  registerKnowledgeTools(server);
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Supermama Lark MCP Server v0.3.4 started");
}

main().catch((error) => {
  console.error("MCP Server failed:", error);
  process.exit(1);
});
