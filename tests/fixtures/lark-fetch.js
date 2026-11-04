// Only preload this in tests. No request is sent to Lark or any other host.
process.env.LARK_APP_ID = 'fixture-app';
process.env.LARK_APP_SECRET = 'fixture-secret';
const knowledge = require('./knowledge-records');
process.env.LARK_VALIDATED_METADATA_URL = knowledge.validatedUrl;
process.env.LARK_VALIDATION_JOURNAL_URL = knowledge.journalUrl;
process.env.LARK_WHITELIST_URL = knowledge.whitelistUrl;
const node = (token, has_child = false) => ({
  node_token: token, space_id: "123", title: token,
  obj_token: token + "doc", obj_type: "docx", has_child,
});
global.fetch = async (input, options = {}) => {
  const url = new URL(input);
  if (url.origin !== "https://open.larksuite.com") throw Error("Unexpected outbound host");
  let data;
  if (url.pathname.endsWith("/tenant_access_token/internal")) {
    data = { code: 0, tenant_access_token: "fixture-token" };
  } else if (url.pathname.includes('/bitable/v1/apps/fixtureBase/tables/') && url.pathname.endsWith('/records')) {
    if (options.method && options.method !== 'GET') throw Error('Unexpected Base mutation');
    if (url.searchParams.has('view_id') || url.searchParams.has('filter')) throw Error('Unexpected Base filtering');
    const tableId = url.pathname.split('/').at(-2);
    const rows = knowledge.tables[tableId];
    if (!rows) throw Error('Unexpected Base table');
    const next = url.searchParams.get('page_token');
    const split = rows.length > 1;
    data = { code: 0, data: { items: split ? (next ? rows.slice(1) : rows.slice(0, 1)) : rows,
      has_more: split && !next, ...(split && !next ? { page_token: 'records-next' } : {}) } };
  } else if (url.pathname.endsWith("/get_node")) {
    const token = url.searchParams.get("token");
    if (!["root", "partial"].includes(token)) throw Error("Unexpected root");
    data = { code: 0, data: { node: node(token, true) } };
  } else if (url.pathname.endsWith("/nodes")) {
    if (options.method && options.method !== "GET") throw Error("Unexpected mutation");
    const parent = url.searchParams.get("parent_node_token");
    const next = url.searchParams.get("page_token");
    const items = parent === "partial" ? [node("denied"), node("c")] :
      parent === "root" ? [node(next ? "b" : "a", !next)] : [node("c")];
    data = { code: 0, data: { items, has_more: parent === "root" && !next, page_token: next ? null : "next" } };
  } else if (url.pathname.endsWith("/raw_content")) {
    data = url.pathname.includes("/denieddoc/")
      ? { code: 999, msg: "PRIVATE upstream detail" }
      : { code: 0, data: { content: "Fixture document body" } };
  } else if (url.pathname.endsWith("/blocks")) {
    const next = url.searchParams.get('page_token');
    data = url.pathname.includes('/rootdoc/')
      ? { code: 0, data: { items: next
        ? [{ block_id: 'text', text: { elements: [{ text_run: { content: 'Fixture table cell' } }] } }]
        : [{ block_id: 'table', table: { property: { row_size: 1, column_size: 1 }, cells: ['cell'] } },
          { block_id: 'cell', children: ['text'] }],
        has_more: !next, ...(next ? {} : { page_token: 'blocks-next' }) } }
      : { code: 0, data: { items: [], has_more: false } };
  } else {
    throw Error("Unexpected API path");
  }
  return new Response(JSON.stringify(data), { headers: { "Content-Type": "application/json" } });
};

// Exercise the real official MCP worker in the HTTP/stdio integration tests.
if (!process.env.LEMMA_OFFICIAL_HTTP_FIXTURE) {
  const path = require('node:path');
  const { StdioClientTransport } = require('@modelcontextprotocol/sdk/client/stdio.js');
  const { officialMcp, createOfficialMcpClient } = require('../../integrations/lark/official-mcp/client');
  const fixtureClient = createOfficialMcpClient({ makeTransport: options => new StdioClientTransport({
    ...options,
    args: ['--require', path.join(__dirname, 'official-lark-http.js'), ...options.args],
  }) });
  officialMcp.call = fixtureClient.call;
  officialMcp.close = fixtureClient.close;
}
