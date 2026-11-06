// Owns the single private stdio connection to the pinned official Lark MCP package.
require('dotenv').config({ quiet: true });
const path = require('node:path');
const { Client } = require('@modelcontextprotocol/sdk/client/index.js');
const { StdioClientTransport } = require('@modelcontextprotocol/sdk/client/stdio.js');
const { logger, activityId } = require('../../../runtime/core/logger');
const { TOOLS } = require('./constants');

const TIMEOUT_MS = 30000;

/** Create a sanitized internal error without retaining upstream payloads. */
function failure(message, code = 'LARK_MCP_FAILED') {
  return Object.assign(new Error(message), { code });
}

/** Preserve only a numeric Lark code that is safe to include in operational logs. */
function upstreamFailure(message, data) {
  const error = failure(message);
  if (Number.isInteger(data?.code)) error.larkCode = data.code;
  return error;
}

/** Normalize official MCP result shapes and reject malformed/error envelopes. */
function parseResult(result) {
  if (result?.isError) {
    let detail;
    try { detail = JSON.parse(result.content?.find(item => item.type === 'text')?.text); } catch {}
    throw upstreamFailure('Official Lark MCP request failed. Check Lark credentials, permissions and resource access.', detail);
  }
  let data = result?.structuredContent;
  if (!data) {
    try { data = JSON.parse(result?.content?.find(item => item.type === 'text')?.text); }
    catch { throw failure('Official Lark MCP returned an unreadable response.'); }
  }
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    throw failure('Official Lark MCP returned an invalid response.');
  }
  // Official handlers normally return response.data, but failed APIs may return the envelope.
  if ('code' in data) {
    if (data.code !== 0) throw upstreamFailure('Lark API request failed. Check permissions and resource access.', data);
    data = data.data;
  }
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw failure('Official Lark MCP returned invalid data.');
  return data;
}

/** Let a caller cancel its wait without cancelling the shared connection startup. */
function waitWithSignal(promise, signal) {
  signal?.throwIfAborted();
  if (!signal) return promise;
  return new Promise((resolve, reject) => {
    const abort = () => reject(signal.reason);
    signal.addEventListener('abort', abort, { once: true });
    promise.then(resolve, reject).finally(() => signal.removeEventListener('abort', abort));
  });
}

/** Create a lazy, shared official-MCP client with fixed tools and bounded requests. */
function createOfficialMcpClient({
  env = process.env,
  makeClient = () => new Client({ name: 'lemma-lark-reader', version: '1.1.0' }),
  makeTransport = options => new StdioClientTransport(options),
  log = logger,
  timeoutMs = TIMEOUT_MS,
} = {}) {
  let connection;
  let connecting;
  let closing;

  /** Start the child process once and verify its discovered tools match the allowlist. */
  async function connect() {
    if (closing) await closing;
    if (connection) return connection;
    if (connecting) return connecting;
    connecting = (async () => {
      const appId = env.LARK_APP_ID?.trim();
      const appSecret = env.LARK_APP_SECRET?.trim();
      if (!appId || !appSecret) throw failure('Configure LARK_APP_ID and LARK_APP_SECRET before reading documents.');
      const client = makeClient();
      const transport = makeTransport({
        command: process.execPath,
        args: [path.join(__dirname, 'worker.js')],
        // No shell, credentials in argv, inherited NODE_OPTIONS or arbitrary upstream URL.
        // The CLI dotenv loader runs in its package directory, away from Lemma's .env.
        cwd: path.dirname(require.resolve('@larksuiteoapi/lark-mcp/package.json')),
        env: { APP_ID: appId, APP_SECRET: appSecret,
          ...(env.LEMMA_LARK_USER_OAUTH === 'true' ? { LEMMA_LARK_USER_OAUTH: 'true' } : {}) },
        stderr: 'pipe',
      });
      // Drain raw package diagnostics without forwarding payloads or stacks to logs.
      transport.stderr?.resume();
      const current = { client, transport };
      client.onclose = () => {
        if (connection === current) {
          connection = undefined;
          log.info('Official Lark MCP disconnected');
        }
      };
      client.onerror = () => log.error('Official Lark MCP transport error');
      log.info('Official Lark MCP connecting');
      try {
        const startupSignal = AbortSignal.timeout(timeoutMs);
        await client.connect(transport, { timeout: timeoutMs, signal: startupSignal });
        const listed = await client.listTools({}, { timeout: timeoutMs, signal: startupSignal });
        const names = listed.tools.map(tool => tool.name);
        if (names.length !== Object.values(TOOLS).length || Object.values(TOOLS).some(name => !names.includes(name))) {
          throw failure('Official Lark MCP tool list does not match the approved read tools.');
        }
        connection = current;
        log.success('Official Lark MCP ready', { tools: names.length });
        return current;
      } catch {
        await client.close().catch(() => {});
        await transport.close().catch(() => {});
        throw failure('Official Lark MCP could not start. Check the installed package and application credentials.');
      }
    })();
    try { return await connecting; }
    finally { connecting = undefined; }
  }

  /** Call one allowlisted official tool with caller cancellation and a hard deadline. */
  async function call(name, args, { signal } = {}) {
    if (!Object.values(TOOLS).includes(name)) throw failure('This official Lark MCP tool is not allowed.');
    const deadline = AbortSignal.timeout(timeoutMs);
    const requestSignal = signal ? AbortSignal.any([signal, deadline]) : deadline;
    requestSignal.throwIfAborted();
    const fields = { tool: name, call: activityId() };
    const started = Date.now();
    log.info('Official Lark read started', fields);
    try {
      const { client } = await waitWithSignal(connect(), requestSignal);
      requestSignal.throwIfAborted();
      const result = await client.callTool({ name, arguments: args }, undefined,
        { signal: requestSignal, timeout: timeoutMs });
      requestSignal.throwIfAborted();
      const data = parseResult(result);
      log.success('Official Lark read completed', { ...fields, ms: Date.now() - started });
      return data;
    } catch (error) {
      const reason = requestSignal.aborted ? 'Read cancelled or timed out' : 'Read failed; check Lark access or MCP availability';
      log.error('Official Lark read failed', {
        ...fields,
        ms: Date.now() - started,
        reason,
        ...(Number.isInteger(error?.larkCode) ? { lark_code: error.larkCode } : {}),
      });
      if (requestSignal.aborted) throw requestSignal.reason;
      if (error?.code === 'LARK_MCP_FAILED') throw error;
      throw failure(reason);
    }
  }

  /** Close the shared child process during server shutdown. */
  async function close() {
    if (closing) return closing;
    closing = (async () => {
      const current = connection || await connecting?.catch(() => undefined);
      connection = undefined;
      if (current) {
        await current.client.close().catch(() => {});
        await current.transport.close().catch(() => {});
        log.info('Official Lark MCP closed');
      }
    })();
    try { await closing; } finally { closing = undefined; }
  }

  return { call, close };
}

const officialMcp = createOfficialMcpClient();
module.exports = { officialMcp, createOfficialMcpClient, parseResult, TOOLS };
