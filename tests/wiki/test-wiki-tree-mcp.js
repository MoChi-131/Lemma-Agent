// Verifies the stdio MCP server exposes the Wiki crawler alongside document reading.
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { spawn, execFile } = require("node:child_process");
const { promisify } = require("node:util");
const { once } = require("node:events");
const net = require("node:net");
const path = require("node:path");
const { Client } = require("@modelcontextprotocol/sdk/client/index.js");
const { StreamableHTTPClientTransport } = require("@modelcontextprotocol/sdk/client/streamableHttp.js");
const { StdioClientTransport } = require("@modelcontextprotocol/sdk/client/stdio.js");
const url = "https://example.larksuite.com/wiki/root";
const preload = path.join(__dirname, "../fixtures/lark-fetch.js");
const cwd = path.resolve(__dirname, "../..");

async function checkKnowledge(client) {
  const metadata = await client.callTool({ name: 'get_knowledge_metadata', arguments: {} });
  assert.ok(!metadata.isError);
  assert.equal(metadata.structuredContent.record_count, 3);
  const docs = Object.fromEntries(metadata.structuredContent.documents.map(doc => [doc.record_id, doc]));
  assert.equal(docs.approved.retrieval_eligible, true);
  assert.equal(docs.pending.retrieval_eligible, false);
  assert.equal(docs.workspace.retrieval_eligible, false);
  const denied = await client.callTool({ name: 'retrieve_knowledge_document',
    arguments: { url: 'https://example.larksuite.com/wiki/pending' } });
  assert.equal(denied.isError, true);
  assert.equal(JSON.parse(denied.content[0].text).error_code, 'RETRIEVAL_NOT_ELIGIBLE');
  const whitelist = await client.callTool({ name: 'get_approved_web_domains', arguments: {} });
  assert.ok(!whitelist.isError);
  assert.equal(whitelist.structuredContent.approved_domain_count, 1);
  const checked = await client.callTool({ name: 'check_external_urls',
    arguments: { urls: ['https://example.com/page', 'https://pending.test/page'] } });
  assert.ok(!checked.isError);
  assert.equal(checked.structuredContent.approved_count, 1);
  assert.equal(checked.structuredContent.blocked_count, 1);
}

async function checkCrawl(client) {
  const r = await client.callTool({ name: "crawl_lark_wiki_tree", arguments: { url } });
  assert.ok(!r.isError);
  assert.equal(r.structuredContent.node_count, 4);
  assert.equal(r.structuredContent.truncated, false);
  assert.deepEqual(JSON.parse(r.content[0].text), r.structuredContent);
  const invalid = await client.callTool({ name: "crawl_lark_wiki_tree", arguments: { url: "https://evil.test/wiki/root" } });
  assert.equal(invalid.isError, true);
}

async function checkSubtree(client) {
  const r = await client.callTool({ name: "read_lark_wiki_subtree", arguments: { url } });
  assert.ok(!r.isError);
  const result = r.structuredContent;
  assert.equal(result.document_count, 4);
  assert.equal(result.attempted_document_count, 4);
  assert.equal(result.truncated, false);
  assert.equal(result.documents[0].node_token, "root");
  assert.equal(result.documents[0].content, "Fixture document body");
  assert.deepEqual(JSON.parse(r.content[0].text), result);
  const capped = await client.callTool({ name: "read_lark_wiki_subtree", arguments: { url, max_documents: 1 } });
  assert.equal(capped.structuredContent.document_count, 1);
  assert.deepEqual(capped.structuredContent.truncation_reasons, ["max_documents"]);
  const invalid = await client.callTool({ name: "read_lark_wiki_subtree", arguments: { url, max_documents: 0 } });
  assert.equal(invalid.isError, true);
  const partial = await client.callTool({ name: "read_lark_wiki_subtree",
    arguments: { url: "https://example.larksuite.com/wiki/partial" } });
  assert.ok(!partial.isError);
  assert.equal(partial.structuredContent.document_count, 2);
  assert.equal(partial.structuredContent.attempted_document_count, 3);
  assert.equal(partial.structuredContent.errors[0].node_token, "denied");
  assert.equal(partial.structuredContent.truncated, true);
  assert.equal(JSON.stringify(partial).includes("PRIVATE"), false);
}

test("stdio discovers and calls crawl while preserving read tool", { timeout: 15000 }, async () => {
  const client = new Client({ name: "wiki-tree-test", version: "1.0.0" });
  const transport = new StdioClientTransport({
    command: process.execPath, args: ["--require", preload, "runtime/servers/lark-mcp-server.js"], cwd, stderr: "pipe",
  });
  try {
    await client.connect(transport);
    assert.deepEqual((await client.listTools()).tools.map(t => t.name).sort(), ["check_external_urls", "crawl_lark_wiki_tree", "get_approved_web_domains", "get_knowledge_metadata", "get_lark_wiki_metadata", "inspect_document_publication", "inspect_lark_file_access", "publish_approved_document", "read_lark_document", "read_lark_wiki_subtree", "retrieve_knowledge_document", "search_knowledge_registry", "search_lark_wiki"]);
    await checkCrawl(client);
    await checkSubtree(client);
    await checkKnowledge(client);
    const metadata = await client.callTool({ name: "get_lark_wiki_metadata", arguments: { url } });
    assert.equal(metadata.structuredContent.nodes.length, 4);
    assert.equal(metadata.structuredContent.nodes[0].depth, 0);
    const search = await client.callTool({ name: "search_lark_wiki", arguments: { url, query: "Fixture", max_results: 2 } });
    assert.equal(search.structuredContent.result_count, 2);
    assert.equal(search.structuredContent.matched_node_count, 4);
    assert.equal(search.structuredContent.search_complete, true);
    assert.equal(search.structuredContent.results_truncated, true);
    assert.ok(search.structuredContent.results[0].snippet.includes("Fixture"));
    const r = await client.callTool({ name: "read_lark_document", arguments: { url } });
    assert.ok(!r.isError);
    assert.match(r.content[0].text, /Fixture document body/);
  } finally { await client.close(); }
});

test("HTTP session survives discovery, crawl and existing tools; DELETE removes it", { timeout: 20000 }, async () => {
  const probe = net.createServer();
  await new Promise(resolve => probe.listen(0, "127.0.0.1", resolve));
  const port = probe.address().port;
  await new Promise(resolve => probe.close(resolve));
  const child = spawn(process.execPath, ["--require", preload, "runtime/servers/lark-mcp-http-server.js"], {
    cwd, env: { ...process.env, PORT: String(port) }, stdio: ["ignore", "pipe", "pipe"],
  });
  const base = "http://127.0.0.1:" + port;
  let activityLog = '';
  child.stderr.on('data', data => { activityLog += String(data); });
  const client = new Client({ name: "wiki-tree-test", version: "1.0.0" });
  const transport = new StreamableHTTPClientTransport(new URL(base + "/mcp"));
  try {
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(Error("Server startup timed out")), 5000);
      child.stderr.on("data", () => {
        if (activityLog.includes("MCP server ready")) { clearTimeout(timer); resolve(); }
      });
      child.once("error", error => { clearTimeout(timer); reject(error); });
      child.once("exit", code => { clearTimeout(timer); reject(Error("Server exited: " + code)); });
    });
    await client.connect(transport);
    const session = transport.sessionId;
    assert.ok(session);
    assert.deepEqual((await client.listTools()).tools.map(t => t.name).sort(),
      ["check_external_urls", "crawl_lark_wiki_tree", "get_approved_web_domains", "get_lark_wiki_metadata", "get_knowledge_metadata", "inspect_document_publication", "inspect_lark_file_access", "list_lark_wiki_children", "publish_approved_document", "read_lark_document", "read_lark_wiki_subtree", "retrieve_knowledge_document", "search_knowledge_registry", "search_lark_wiki"].sort());
    await checkCrawl(client);
    await checkSubtree(client);
    const metadata = await client.callTool({ name: "get_lark_wiki_metadata", arguments: { url } });
    assert.equal(metadata.structuredContent.nodes.length, 4);
    assert.equal(metadata.structuredContent.nodes[0].depth, 0);
    const search = await client.callTool({ name: "search_lark_wiki", arguments: { url, query: "Fixture", max_results: 2 } });
    assert.equal(search.structuredContent.result_count, 2);
    assert.equal(search.structuredContent.matched_node_count, 4);
    assert.equal(search.structuredContent.search_complete, true);
    assert.equal(search.structuredContent.results_truncated, true);
    assert.ok(search.structuredContent.results[0].snippet.includes("Fixture"));
    for (const request of [
      { name: "read_lark_document", arguments: { url } },
      { name: "list_lark_wiki_children", arguments: { space_id: "123", parent_node_token: "root" } },
    ]) assert.ok(!(await client.callTool(request)).isError);
    const document = await client.callTool({ name: 'read_lark_document', arguments: { url } });
    assert.equal(document.structuredContent.content, 'Fixture document body');
    assert.deepEqual(document.structuredContent.tables[0].rows, [['Fixture table cell']]);
    await checkKnowledge(client);
    assert.equal(transport.sessionId, session);
    const acceptance = await promisify(execFile)(process.execPath,
      ["tests/wiki/test-wiki-tree-remote.js", base + "/mcp", url],
      { cwd, env: { ...process.env, MCP_ACCESS_TOKEN: "" }, timeout: 10000 });
    assert.equal(JSON.parse(acceptance.stdout).status, "PASS");
    const subtreeAcceptance = await promisify(execFile)(process.execPath,
      ["tests/wiki/test-wiki-subtree-remote.js", base + "/mcp", url, "4"],
      { cwd, env: { ...process.env, MCP_ACCESS_TOKEN: "" }, timeout: 10000 });
    assert.equal(JSON.parse(subtreeAcceptance.stdout).status, "PASS");
    assert.equal(subtreeAcceptance.stdout.includes("Fixture document body"), false);
    const searchAcceptance = await promisify(execFile)(process.execPath,
      ["tests/wiki/test-wiki-search-remote.js", base + "/mcp", url, "4", "Fixture"],
      { cwd, env: { ...process.env, MCP_ACCESS_TOKEN: "" }, timeout: 10000 });
    assert.equal(JSON.parse(searchAcceptance.stdout).status, "PASS");
    assert.equal(JSON.parse(searchAcceptance.stdout).result_count, 4);
    assert.equal((await (await fetch(base + "/health")).json()).sessions, 1);
    await transport.terminateSession();
    assert.equal((await (await fetch(base + "/health")).json()).sessions, 0);
    const stale = await fetch(base + "/mcp", {
      method: "POST", headers: { "Content-Type": "application/json", "mcp-session-id": session },
      body: JSON.stringify({ jsonrpc: "2.0", id: 10, method: "tools/list" }),
    });
    assert.equal(stale.status, 404);
    // Wait for the local stderr pipe to drain before inspecting activity output.
    await new Promise(resolve => setTimeout(resolve, 30));
    assert.match(activityLog, /Tool started/);
    assert.match(activityLog, /Tool completed/);
    assert.match(activityLog, /Tool failed/);
    assert.match(activityLog, /MCP session closed/);
    assert.match(activityLog, /Official Lark MCP ready/);
    // This flow does not contain an embedded whiteboard, so it only invokes the
    // five read tools needed by this document/tree scenario.
    for (const name of ['wiki.v2.space.getNode', 'wiki.v2.spaceNode.list', 'bitable.v1.appTableRecord.list', 'docx.v1.document.rawContent', 'docx.v1.documentBlock.list']) {
      assert.ok(activityLog.includes(name));
    }
    assert.doesNotMatch(activityLog, /Fixture document body|Fixture table cell|PRIVATE|example\.larksuite\.com/);
  } finally {
    await client.close();
    if (child.exitCode === null) { child.kill(); await once(child, "exit"); }
  }
});
