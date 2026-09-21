require("dotenv").config({ quiet: true });
const assert = require("node:assert/strict");
const { Client } = require("@modelcontextprotocol/sdk/client/index.js");
const { StreamableHTTPClientTransport } = require("@modelcontextprotocol/sdk/client/streamableHttp.js");

async function main() {
  const [endpoint, url] = process.argv.slice(2);
  if (!endpoint || !url) throw Error("Usage: npm run test:wiki-tree:remote -- <MCP endpoint> <Lark Wiki root URL>");
  const target = new URL(endpoint);
  if (target.protocol !== "https:" && !(target.protocol === "http:" && ["localhost", "127.0.0.1"].includes(target.hostname))) {
    throw Error("Remote MCP endpoints must use HTTPS.");
  }
  const client = new Client({ name: "wiki-tree-acceptance", version: "0.3.2" });
  const transport = new StreamableHTTPClientTransport(target, {
    requestInit: process.env.MCP_ACCESS_TOKEN
      ? { headers: { Authorization: "Bearer " + process.env.MCP_ACCESS_TOKEN } } : undefined,
  });
  try {
    await client.connect(transport);
    const session = transport.sessionId;
    assert.ok(session, "Expected a stateful MCP session");
    const names = (await client.listTools()).tools.map(t => t.name);
    for (const name of ["read_lark_document", "list_lark_wiki_children", "crawl_lark_wiki_tree"]) {
      assert.ok(names.includes(name), "Missing tool: " + name);
    }
    const response = await client.callTool({
      name: "crawl_lark_wiki_tree", arguments: { url, max_depth: 4, max_nodes: 100 },
    });
    assert.ok(!response.isError, "Crawl failed. Check Lark credentials and root access.");
    const result = response.structuredContent || JSON.parse(response.content[0].text);
    assert.ok(result.root?.node_token);
    assert.ok(Array.isArray(result.tree));
    assert.ok(result.node_count >= 1 && result.node_count <= 100);
    assert.equal(typeof result.truncated, "boolean");
    const count = nodes => nodes.reduce((sum, n) => sum + 1 + count(n.children), 0);
    assert.equal(result.node_count, 1 + count(result.tree));
    const children = await client.callTool({
      name: "list_lark_wiki_children",
      arguments: { space_id: result.root.space_id, parent_node_token: result.root.node_token, page_size: 50 },
    });
    assert.ok(!children.isError, "Existing list tool failed");
    await client.listTools();
    assert.equal(transport.sessionId, session, "Session changed unexpectedly");
    console.log(JSON.stringify({
      status: result.truncated ? "PARTIAL" : "PASS",
      node_count: result.node_count, truncated: result.truncated,
      truncation_reasons: result.truncation_reasons, errors: result.errors,
      session_reused: true, tools: names,
    }, null, 2));
    if (result.errors?.length || result.truncation_reasons?.some(reason =>
      !["max_depth", "max_nodes"].includes(reason))) process.exitCode = 1;
  } finally {
    if (transport.sessionId) await transport.terminateSession().catch(() => {});
    await client.close();
  }
}

main().catch(error => {
  console.error("MCP acceptance failed.");

  console.error("Actual error:");
  console.error(error);

  if (error?.cause) {
    console.error("Cause:");
    console.error(error.cause);
  }

  process.exitCode = 1;
});
