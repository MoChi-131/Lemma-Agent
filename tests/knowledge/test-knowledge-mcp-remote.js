require('dotenv').config({ quiet: true });
const assert = require('node:assert/strict');
const { Client } = require('@modelcontextprotocol/sdk/client/index.js');
const { StreamableHTTPClientTransport } = require('@modelcontextprotocol/sdk/client/streamableHttp.js');

function parseToolResult(response) {
  if (response.structuredContent) return response.structuredContent;
  const text = response.content?.find(item => item.type === 'text')?.text;
  return text ? JSON.parse(text) : null;
}

async function callTool(client, name, args = {}) {
  const response = await client.callTool(
    { name, arguments: args },
    undefined,
    { timeout: 120000 },
  );
  assert.ok(!response.isError, `${name} returned an MCP error`);
  return { response, result: parseToolResult(response) };
}

async function main() {
  const [endpoint = 'http://localhost:3000/mcp', expectedCountText = '13'] = process.argv.slice(2);
  const expectedCount = Number(expectedCountText);
  assert.ok(Number.isInteger(expectedCount) && expectedCount >= 1, 'Expected record count must be a positive integer');

  const target = new URL(endpoint);
  const isLocalHttp = target.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(target.hostname);
  assert.ok(target.protocol === 'https:' || isLocalHttp, 'Use HTTPS unless testing localhost');
  assert.ok(!target.username && !target.password, 'Do not put credentials in the endpoint URL');

  const client = new Client({ name: 'knowledge-metadata-acceptance', version: '1.0.0' });
  const transport = new StreamableHTTPClientTransport(target, {
    requestInit: process.env.MCP_ACCESS_TOKEN
      ? { headers: { Authorization: `Bearer ${process.env.MCP_ACCESS_TOKEN}` } }
      : undefined,
  });

  try {
    await client.connect(transport);
    const session = transport.sessionId;
    assert.ok(session, 'Expected a stateful HTTP MCP session');

    const toolNames = (await client.listTools()).tools.map(tool => tool.name);
    for (const name of ['get_knowledge_metadata', 'search_knowledge_registry', 'retrieve_knowledge_document', 'get_approved_web_domains', 'check_external_urls']) {
      assert.ok(toolNames.includes(name), `Missing tool: ${name}`);
    }
    const { result: all } = await callTool(client, 'get_knowledge_metadata');
    assert.equal(all.success, true);
    assert.equal(all.record_count, expectedCount);
    assert.equal(all.documents.length, expectedCount);
    for (const doc of all.documents) {
      assert.equal(Object.hasOwn(doc, 'metadata'), false, 'Frozen output must not contain a metadata wrapper');
      for (const key of ['title', 'source_url', 'scope', 'metadata_complete', 'missing_fields', 'whitelist_valid', 'retrieval_eligible']) {
        assert.ok(Object.hasOwn(doc, key), `Flat document output is missing ${key}`);
      }
    }

    const valid = all.documents.find(doc => doc.metadata_complete && doc.source_url);
    const invalid = all.documents.find(doc => !doc.metadata_complete);
    const approvedExternal = all.documents.find(doc =>
      doc.scope === 'External Reference' && doc.retrieval_eligible === true);
    const blockedExternal = all.documents.find(doc =>
      doc.scope === 'External Reference' && doc.retrieval_eligible === false);

    assert.ok(valid, 'Expected at least one valid record with a URL');
    assert.ok(invalid, 'Expected at least one intentional invalid record');
    assert.ok(approvedExternal, 'Expected an approved External Reference');
    assert.ok(blockedExternal, 'Expected a blocked External Reference negative case');

    const { result: found } = await callTool(client, 'get_knowledge_metadata', { url: valid.source_url });
    assert.equal(found.found, true);
    assert.ok(found.documents.some(doc => doc.record_id === valid.record_id));

    const { result: absent } = await callTool(client, 'get_knowledge_metadata', {
      url: 'https://example.invalid/not-in-knowledge-registry',
    });
    assert.equal(absent.found, false);
    assert.equal(absent.record_count, 0);

    await client.listTools();
    assert.equal(transport.sessionId, session, 'MCP session changed unexpectedly');

    console.log(JSON.stringify({
      status: 'PASS',
      record_count: all.record_count,
      standard_output_contract: 'PASS',
      metadata_complete_count: all.documents.filter(doc => doc.metadata_complete).length,
      metadata_incomplete_count: all.documents.filter(doc => !doc.metadata_complete).length,
      exact_url_lookup: 'PASS',
      missing_url_lookup: 'PASS',
      approved_external_retrieval: 'PASS',
      blocked_external_retrieval: 'PASS',
      session_reused: true,
    }, null, 2));
  } finally {
    if (transport.sessionId) await transport.terminateSession().catch(() => {});
    await client.close();
  }
}

main().catch(error => {
  console.error(error instanceof assert.AssertionError
    ? `Knowledge MCP acceptance failed: ${error.message}`
    : 'Knowledge MCP acceptance failed. Check endpoint, credentials, permissions, Base access and server logs.');
  process.exitCode = 1;
});
