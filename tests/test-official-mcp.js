// Covers the official Lark MCP adapter's connection, allow-list, and safe-failure contract.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createOfficialMcpClient, parseResult, TOOLS } = require('../integrations/lark/official-mcp/client');
const { readDocumentData } = require('../integrations/lark/core/documents');
const { getWikiNode, listWikiChildren } = require('../integrations/lark/wiki/wiki');

const silent = Object.fromEntries(['info', 'success', 'warn', 'error'].map(key => [key, () => {}]));

test('official Wiki children adapter preserves paging arguments, cancellation and empty advancing pages', async () => {
  const signal = new AbortController().signal;
  const mcp = { call: async (name, args, options) => {
    assert.equal(name, TOOLS.wikiChildren);
    assert.deepEqual(args, {
      path: { space_id: '123' },
      params: { parent_node_token: 'root', page_size: 10, page_token: 'next' },
    });
    assert.equal(options.signal, signal);
    return { items: [], has_more: true, page_token: 'next-2' };
  } };
  assert.deepEqual(await listWikiChildren({ spaceId: '123', parentNodeToken: 'root', pageSize: 10, pageToken: 'next', signal }, { mcp }),
    { items: [], hasMore: true, pageToken: 'next-2' });
  const last = { call: async (_name, args) => {
    assert.equal(args.params.page_token, undefined);
    assert.equal(args.params.page_size, 50);
    return { has_more: false };
  } };
  assert.deepEqual(await listWikiChildren({ spaceId: '123', parentNodeToken: 'root' }, { mcp: last }),
    { items: [], hasMore: false, pageToken: null });
});

test('official Wiki children rejects malformed pages and non-advancing cursors', async () => {
  for (const data of [
    { items: [], has_more: true },
    { items: [], has_more: true, page_token: 'same' },
    { items: {}, has_more: false },
    { items: [], has_more: 'false' },
    { items: [] },
  ]) {
    await assert.rejects(listWikiChildren({ spaceId: '123', parentNodeToken: 'root', pageToken: 'same' },
      { mcp: { call: async () => data } }), /invalid Wiki/);
  }
});
function harness(overrides = {}) {
  const created = [];
  const transports = [];
  const adapter = createOfficialMcpClient({
    env: { LARK_APP_ID: 'fixture-app', LARK_APP_SECRET: 'PRIVATE-secret', NODE_OPTIONS: 'PRIVATE-option' },
    log: silent,
    makeTransport: options => {
      transports.push(options);
      return { close: async () => {} };
    },
    makeClient: () => {
      const client = {
        connect: async () => {},
        listTools: async () => ({ tools: Object.values(TOOLS).map(name => ({ name })) }),
        callTool: async () => ({ content: [{ type: 'text', text: '{"content":"body"}' }] }),
        close: async () => client.onclose?.(),
        ...overrides,
      };
      created.push(client);
      return client;
    },
  });
  return { adapter, created, transports };
}

test('official client shares one startup, passes credentials only in env and reconnects after disconnect', async () => {
  const { adapter, created, transports } = harness();
  try {
    const args = { path: { document_id: 'doc' } };
    const results = await Promise.all([
      adapter.call(TOOLS.rawContent, args), adapter.call(TOOLS.rawContent, args),
    ]);
    assert.equal(created.length, 1);
    assert.deepEqual(results, [{ content: 'body' }, { content: 'body' }]);
    assert.equal(transports[0].command, process.execPath);
    assert.deepEqual(transports[0].env, { APP_ID: 'fixture-app', APP_SECRET: 'PRIVATE-secret' });
    assert.doesNotMatch(JSON.stringify(transports[0].args), /PRIVATE/);
    assert.equal(transports[0].stderr, 'pipe');
    created[0].onclose();
    await adapter.call(TOOLS.rawContent, args);
    assert.equal(created.length, 2);
    await assert.rejects(adapter.call('im.v1.message.create', {}), /not allowed/);
  } finally { await adapter.close(); }
});

test('missing credentials and unexpected tool exposure fail closed', async () => {
  const missing = createOfficialMcpClient({ env: {}, log: silent });
  await assert.rejects(missing.call(TOOLS.rawContent, {}), /Configure LARK_APP_ID/);
  const { adapter } = harness({ listTools: async () => ({ tools: [{ name: 'im.v1.message.create' }] }) });
  await assert.rejects(adapter.call(TOOLS.rawContent, {}), /could not start/);
  await adapter.close();
});

test('already-aborted reads never start a worker; in-flight reads propagate cancellation', async () => {
  let received;
  const { adapter, created } = harness({
    callTool: async (_params, _schema, { signal }) => {
      received = signal;
      return new Promise((_resolve, reject) => signal.addEventListener('abort', () => reject(signal.reason), { once: true }));
    },
  });
  try {
    const aborted = AbortSignal.abort(new Error('cancelled'));
    await assert.rejects(adapter.call(TOOLS.rawContent, {}, { signal: aborted }), /cancelled/);
    assert.equal(created.length, 0);
    const controller = new AbortController();
    const pending = adapter.call(TOOLS.rawContent, {}, { signal: controller.signal });
    while (!received) await new Promise(resolve => setImmediate(resolve));
    controller.abort(new Error('cancelled'));
    await assert.rejects(pending, /cancelled/);
    assert.equal(received.aborted, true);
  } finally { await adapter.close(); }
});

test('raw upstream failures and malformed MCP results never leak payloads', async () => {
  for (const result of [
    { isError: true, content: [{ type: 'text', text: 'PRIVATE upstream payload' }] },
    { content: [{ type: 'text', text: 'PRIVATE invalid JSON' }] },
    { content: [{ type: 'text', text: '{"code":999,"msg":"PRIVATE payload"}' }] },
    { structuredContent: 'PRIVATE' },
    { content: [{ type: 'text', text: '[]' }] },
  ]) {
    assert.throws(() => parseResult(result), error => !error.message.includes('PRIVATE'));
  }
  assert.deepEqual(parseResult({ content: [{ type: 'text', text: '{"code":0,"data":{"content":"body"}}' }] }), { content: 'body' });
  const { adapter } = harness({ callTool: async () => { throw Error('PRIVATE response contents'); } });
  await assert.rejects(adapter.call(TOOLS.rawContent, {}), error => !error.message.includes('PRIVATE'));
  await adapter.close();
});

test('cancelled initialization does not block the caller or poison a shared connection', async () => {
  let ready;
  const { adapter } = harness({ connect: () => new Promise(resolve => { ready = resolve; }) });
  const controller = new AbortController();
  const pending = adapter.call(TOOLS.rawContent, {}, { signal: controller.signal });
  controller.abort(new Error('cancel startup'));
  await assert.rejects(pending, /cancel startup/);
  ready();
  assert.deepEqual(await adapter.call(TOOLS.rawContent, {}), { content: 'body' });
  await adapter.close();
});

test('Wiki adapter validates the node; document adapter rejects malformed or cycling block pages', async () => {
  const signal = new AbortController().signal;
  const mcp = { call: async (name, args, options) => {
    assert.equal(name, TOOLS.wikiNode);
    assert.deepEqual(args, { params: { token: 'root' } });
    assert.equal(options.signal, signal);
    return { node: { obj_token: 'doc', obj_type: 'docx' } };
  } };
  assert.equal((await getWikiNode('root', { signal }, { mcp })).obj_token, 'doc');
  await assert.rejects(getWikiNode('root', {}, { mcp: { call: async () => ({ node: {} }) } }), /invalid Wiki node/);
  for (const mode of ['malformed', 'cycle', 'missing-cursor', 'page-limit']) {
    let pages = 0;
    const reader = { call: async name => name === TOOLS.rawContent ? { content: 'body' } :
      mode === 'malformed' ? { items: [] } :
      { items: [], has_more: true, page_token: mode === 'missing-cursor' ? '' : mode === 'page-limit' ? String(++pages) : (++pages % 2 ? 'A' : 'B') } };
    await assert.rejects(readDocumentData('doc', {}, { mcp: reader }), /blocks response|pagination cursor|page limit/);
  }
});
