require("dotenv").config({ quiet: true });
const assert = require("node:assert/strict");
const { Client } = require("@modelcontextprotocol/sdk/client/index.js");
const { StreamableHTTPClientTransport } = require("@modelcontextprotocol/sdk/client/streamableHttp.js");

async function main() {
  const [endpoint, url, count = "2"] = process.argv.slice(2);
  if (!endpoint || !url) {
    throw new Error("Usage: npm run test:wiki-search:remote -- <MCP endpoint> <Wiki root URL> [max_documents=2] [query=驗樓]");
  }
  const max_documents = Number(count);
  assert.ok(Number.isInteger(max_documents) && max_documents >= 1 && max_documents <= 50,
    "max_documents must be 1–50");
  const target = new URL(endpoint);
  assert.ok(!target.username && !target.password, "Do not place credentials in the endpoint URL");
  assert.ok(target.protocol === "https:" ||
    (target.protocol === "http:" && ["localhost", "127.0.0.1"].includes(target.hostname)),
    "Use HTTPS for remote endpoints");
  const client = new Client({ name: "wiki-search-acceptance", version: "0.3.4" });
  const transport = new StreamableHTTPClientTransport(target, {
    requestInit: process.env.MCP_ACCESS_TOKEN
      ? { headers: { Authorization: "Bearer " + process.env.MCP_ACCESS_TOKEN } } : undefined,
  });
  try {
    await client.connect(transport);
    const session = transport.sessionId;
    assert.ok(session, "Expected a stateful HTTP session");
    const names = (await client.listTools()).tools.map(tool => tool.name);
    for (const name of ["read_lark_document", "list_lark_wiki_children", "crawl_lark_wiki_tree", "read_lark_wiki_subtree"]) {
      assert.ok(names.includes(name), "Missing tool: " + name);
    }
    const meta = await client.callTool({ name: "get_lark_wiki_metadata", arguments: { url } }, undefined, { timeout: 60000 });
    assert.ok(!meta.isError, "Metadata call failed");
    assert.equal(meta.structuredContent.nodes[0].depth, 0);
    const response = await client.callTool({ name: "search_lark_wiki",
      arguments: { url, query: process.argv[5] || "驗樓", max_documents, max_results: 10 }
    }, undefined, { timeout: 60000 });
    assert.ok(!response.isError, "Search call failed");
    const r = response.structuredContent;
    assert.equal(r.result_count, r.results.length);
    assert.ok(r.attempted_document_count <= max_documents);
    for (const hit of r.results) {
      assert.ok(hit.url && hit.path.length === hit.depth + 1);
      assert.ok(hit.matched_fields.length > 0);
      assert.equal(typeof hit.snippet, "string");
      assert.equal(hit.content, undefined);
    }
    await client.listTools();
    assert.equal(transport.sessionId, session);
    const expected = ["max_depth", "max_nodes", "max_documents", "max_results", "max_document_chars", "max_total_chars"];
    const failed = r.errors.length > 0 || r.truncation_reasons.some(reason => !expected.includes(reason));
    console.log(JSON.stringify({ status: failed ? "FAIL" : r.truncated ? "PARTIAL" : "PASS",
      metadata_node_count: meta.structuredContent.node_count, result_count: r.result_count,
      matched_node_count: r.matched_node_count, scanned_document_count: r.scanned_document_count,
      search_complete: r.search_complete, truncation_reasons: r.truncation_reasons,
      error_count: r.errors.length, session_reused: true }, null, 2));
    if (failed) process.exitCode = 1;
  } finally {
    if (transport.sessionId) await transport.terminateSession().catch(() => {});
    await client.close();
  }
}

main().catch(error => {
  console.error(error instanceof assert.AssertionError ? error.message :
    "Search acceptance failed. Check endpoint, input, authentication and server connectivity.");
  process.exitCode = 1;
});
