const path = require("path");
const { partialResultInfo } = require('../../runtime/core/result-status');

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

  const serverPath = path.resolve(__dirname, "../../runtime/servers/lark-mcp-server.js");

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
    }, undefined, { timeout: 120000 });

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
    console.log('Tables:', payload.tables?.length || 0);
    if (payload.omitted_image_count) {
      console.log(`Inline image output: ${payload.inline_image_count} included, ${payload.omitted_image_count} omitted by response size limit`);
    }
    for (const [index, table] of (payload.tables || []).entries()) {
      console.log(`  Table ${index + 1}: ${table.row_count} rows x ${table.column_count} columns`);
    }
    let failures = 0;
    for (const [label, resources] of [
      ['Embedded Sheets', payload.embedded_sheets],
      ['Images', payload.images],
      ['Attachments', payload.attachments],
      ['Whiteboards', payload.whiteboards],
    ]) {
      const items = Array.isArray(resources) ? resources : [];
      const succeeded = items.filter(item => item.success === true).length;
      const failed = items.filter(item => item.success === false).length;
      failures += failed;
      console.log(`${label}: ${items.length} result entries; ${succeeded} succeeded, ${failed} failed`);
      for (const item of items.filter(item => item.success === false)) {
        // Print only controlled error categories, never resource contents or raw errors.
        const code = /^[A-Z_]+$/.test(item.error_code || '') ? item.error_code : 'RESOURCE_READ_FAILED';
        console.log(`  ${code}`);
      }
    }
    const partial = partialResultInfo(payload);
    const incomplete = failures || partial.truncated || partial.errors || partial.resource_issues;
    console.log('Embedded resource check:', incomplete ? 'PARTIAL - review failed or truncated resources' : 'PASS');
    if (incomplete) process.exitCode = 1;
  } finally {
    await client.close();
  }
}

main().catch((error) => {
  console.error("MCP client test failed:", error.message);
  process.exit(1);
});
