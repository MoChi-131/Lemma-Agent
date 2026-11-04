const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { StdioClientTransport } = require('@modelcontextprotocol/sdk/client/stdio.js');
const { createOfficialMcpClient, TOOLS } = require('../integrations/lark/official-mcp/client');
const { installHttpLifecycle } = require('../integrations/lark/official-mcp/http-lifecycle');

test('worker HTTP deadline aborts an unresponsive request even without caller cancellation', async () => {
  const axios = require('axios');
  let configSeen;
  const http = axios.create({ adapter: config => {
    configSeen = config;
    return new Promise((_resolve, reject) => config.signal.addEventListener('abort',
      () => reject(new axios.CanceledError()), { once: true }));
  } });
  class TestServer { tool(_name, callback) { this.callback = callback; } }
  installHttpLifecycle({ McpServer: TestServer, httpInstances: [http], timeoutMs: 20 });
  const server = new TestServer();
  server.tool('read', async () => http.get('https://fixture.invalid'));
  const keepAlive = setTimeout(() => {}, 1000);
  try {
    await assert.rejects(server.callback({}, {}), error => axios.isCancel(error));
    assert.equal(configSeen.timeout, 20);
    assert.equal(configSeen.signal.aborted, true);
  } finally { clearTimeout(keepAlive); }
});

test('real official worker aborts HTTP on MCP cancellation without cancelling another read', { timeout: 15000 }, async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lemma-cancel-'));
  const report = path.join(dir, 'report.json');
  const adapter = createOfficialMcpClient({
    env: { LARK_APP_ID: 'fixture-app', LARK_APP_SECRET: 'fixture-secret' },
    log: Object.fromEntries(['info', 'success', 'warn', 'error'].map(key => [key, () => {}])),
    makeTransport: options => new StdioClientTransport({ ...options,
      args: ['--require', path.join(__dirname, 'fixtures/cancellable-lark-http.js'), ...options.args],
      env: { ...options.env, LEMMA_CANCELLATION_REPORT: report },
    }),
  });
  try {
    await adapter.call(TOOLS.rawContent, { path: { document_id: 'warm' } });
    const controller = new AbortController();
    const pending = adapter.call(TOOLS.rawContent, { path: { document_id: 'slow' } }, { signal: controller.signal });
    const rejected = assert.rejects(pending);
    const until = Date.now() + 3000;
    while (!fs.existsSync(report) && Date.now() < until) await new Promise(resolve => setTimeout(resolve, 10));
    assert.ok(fs.existsSync(report), 'Slow HTTP request started');
    const concurrent = adapter.call(TOOLS.rawContent, { path: { document_id: 'other' } });
    controller.abort();
    await rejected;
    assert.deepEqual(await concurrent, { content: 'fixture' });
    let state;
    do {
      state = JSON.parse(fs.readFileSync(report, 'utf8'));
      if (state.aborted) break;
      await new Promise(resolve => setTimeout(resolve, 10));
    } while (Date.now() < until);
    assert.equal(state.signal_present, true);
    assert.equal(state.timeout, 30000);
    assert.equal(state.aborted, true);
    assert.equal(state.completed, false);
  } finally { await adapter.close(); }
});
