require("dotenv").config({ quiet: true });
const assert = require("node:assert/strict");
const { Client } = require("@modelcontextprotocol/sdk/client/index.js");
const { StreamableHTTPClientTransport } = require("@modelcontextprotocol/sdk/client/streamableHttp.js");

async function main() {
  const [endpoint, url, count = "2"] = process.argv.slice(2);
  if (!endpoint || !url) {
    throw new Error("Usage: npm run test:wiki-subtree:remote -- <MCP endpoint> <Wiki root URL> [max_documents=2]");
  }
  const max_documents = Number(count);
  assert.ok(Number.isInteger(max_documents) && max_documents >= 1 && max_documents <= 50,
    "max_documents must be 1–50");
  const target = new URL(endpoint);
  assert.ok(!target.username && !target.password, "Do not place credentials in the endpoint URL");
  assert.ok(target.protocol === "https:" ||
    (target.protocol === "http:" && ["localhost", "127.0.0.1"].includes(target.hostname)),
    "Use HTTPS for remote endpoints");
  const client = new Client({ name: "wiki-subtree-acceptance", version: "0.3.3" });
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
    const response = await client.callTool({
      name: "read_lark_wiki_subtree", arguments: { url, max_depth: 4, max_nodes: 100, max_documents },
    }, undefined, { timeout: 60000 });
    assert.ok(!response.isError, "Subtree call failed; check root URL, Lark credentials and permissions");
    const r = response.structuredContent || JSON.parse(response.content[0].text);
    assert.ok(r.root?.node_token);
    assert.equal(r.document_count, r.documents.length);
    assert.ok(r.attempted_document_count <= max_documents);
    assert.ok(r.document_count <= r.attempted_document_count);
    assert.equal(r.unattempted_document_count, r.eligible_document_count - r.attempted_document_count);
    assert.equal(r.total_content_chars, r.documents.reduce((sum, doc) => sum + doc.content.length, 0));
    for (const doc of r.documents) {
      assert.equal(doc.obj_type, "docx");
      assert.equal(typeof doc.content, "string");
      assert.ok(doc.url);
    }
    await client.listTools();
    assert.equal(transport.sessionId, session);
    const expectedLimits = ["max_depth", "max_nodes", "max_documents", "max_document_chars", "max_total_chars"];
    const failed = r.errors.length > 0 || r.truncation_reasons.some(reason => !expectedLimits.includes(reason));
    const status = failed ? "FAIL" : r.document_count === 0 ? "NO_DOCUMENTS" : r.truncated ? "PARTIAL" : "PASS";
    // Never print document bodies or upstream authentication errors.
    console.log(JSON.stringify({
      status, node_count: r.node_count,
      document_count: r.document_count, attempted_document_count: r.attempted_document_count,
      eligible_document_count: r.eligible_document_count, total_content_chars: r.total_content_chars,
      truncated: r.truncated, truncation_reasons: r.truncation_reasons,
      errors: r.errors, session_reused: true, tools: names,
    }, null, 2));
    if (failed || !r.document_count) process.exitCode = 1;
  } finally {
    if (transport.sessionId) await transport.terminateSession().catch(() => {});
    await client.close();
  }
}

main().catch(error => {
  console.error(error instanceof assert.AssertionError ? error.message :
    "Subtree acceptance failed. Check endpoint, input, authentication and server connectivity.");
  process.exitCode = 1;
});
