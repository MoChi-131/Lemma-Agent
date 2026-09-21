const path = require("path");

const {
  Client,
} = require("@modelcontextprotocol/sdk/client/index.js");

const {
  StdioClientTransport,
} = require("@modelcontextprotocol/sdk/client/stdio.js");

async function main() {
  const url = process.argv[2];

  if (!url) {
    throw new Error(
      "Usage: node tests/mcp/test-mcp-client.js <LARK_WIKI_URL>"
    );
  }

  const serverPath = path.join(
    __dirname,
    "lark-mcp-server.js"
  );

  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [serverPath],
    stderr: "inherit",
  });

  const client = new Client({
    name: "supermama-lark-test-client",
    version: "0.1.0",
  });

  try {
    await client.connect(transport);

    const toolList = await client.listTools();
    const toolNames = toolList.tools.map((tool) => tool.name);

    console.log("Connected to MCP server.");
    console.log("Available tools:", toolNames);

    if (!toolNames.includes("read_lark_document")) {
      throw new Error(
        "read_lark_document is not registered"
      );
    }

    const result = await client.callTool({
      name: "read_lark_document",
      arguments: { url },
    });

    const textBlock = result.content.find(
      (item) => item.type === "text"
    );

    if (result.isError) {
      throw new Error(
        textBlock?.text || "Unknown MCP tool error"
      );
    }

    const payload = JSON.parse(textBlock.text);

    console.log("MCP tool call: SUCCESS");
    console.log(
      "Document content length:",
      payload.content.length
    );
  } finally {
    await client.close();
  }
}

main().catch((error) => {
  console.error("MCP client test failed:", error.message);
  process.exit(1);
});
