require('dotenv').config({ quiet: true });
const { logger, errorSummary, activityId } = require('../core/logger');
const { notifyError } = require('../core/error-notifier');
require('../core/official-mcp-shutdown').installOfficialMcpShutdown();
logger.info('MCP server starting', { transport: 'http' });

const { randomUUID } = require('node:crypto');
const express = require('express');
const {
  StreamableHTTPServerTransport,
} = require('@modelcontextprotocol/sdk/server/streamableHttp.js');
const { isInitializeRequest } = require('@modelcontextprotocol/sdk/types.js');
const {
  createLarkMcpServer,
  SERVER_INFO,
} = require('../core/create-lark-mcp-server');

const app = express();
const sessions = new Map();
const port = process.env.PORT || 6688;

// Log routing and timing only; never log headers, tokens or document contents.
app.use((req, res, next) => {
  const started = Date.now();
  const path = req.path === '/mcp' || req.path === '/health' ? req.path : 'other';
  const fields = { request: activityId(), method: req.method, path };
  logger.info('HTTP request started', fields);
  res.on('finish', () => {
    const log = res.statusCode >= 400 ? logger.error : logger.success;
    log('HTTP request finished', { ...fields, status: res.statusCode, ms: Date.now() - started });
  });
  res.on('close', () => {
    if (!res.writableFinished) logger.warn('HTTP connection closed before completion', { ...fields, ms: Date.now() - started });
  });
  next();
});
app.use(express.json());

/** Return a protocol-shaped JSON-RPC error without reflecting request data. */
function sendJsonRpcError(res, status, code, message) {
  res.status(status).json({
    jsonrpc: '2.0',
    error: { code, message },
    id: null,
  });
}

/** Resolve an existing streamable-HTTP session from the MCP session header. */
function getSession(req) {
  const sessionId = req.headers['mcp-session-id'];
  return {
    sessionId,
    transport: sessionId ? sessions.get(sessionId) : undefined,
  };
}

/**
 * Create and connect a fresh MCP server/transport pair for an initialize request.
 * Session cleanup happens through the transport close callback.
 */
async function createSession(req, res) {
  let transport;
  transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: () => randomUUID(),
    onsessioninitialized: sessionId => {
      sessions.set(sessionId, transport);
      logger.success('MCP session opened', { active: sessions.size });
    },
  });

  transport.onclose = () => {
    if (transport.sessionId) sessions.delete(transport.sessionId);
    logger.info('MCP session closed', { active: sessions.size });
  };

  const server = createLarkMcpServer({ includeWikiChildren: true });
  await server.connect(transport);
  await transport.handleRequest(req, res, req.body);
}

// Liveness confirms the HTTP process is serving requests; it intentionally avoids Lark calls.
app.get('/health', (_req, res) => {
  res.json({
    status: 'ok',
    service: 'supermama-lark-mcp',
    version: SERVER_INFO.version,
    sessions: sessions.size,
  });
});

// Readiness is configuration-only: it never makes a network call during a load-balancer probe.
app.get('/ready', (_req, res) => {
  const ready = Boolean(process.env.LARK_APP_ID?.trim() && process.env.LARK_APP_SECRET?.trim());
  res.status(ready ? 200 : 503).json({ status: ready ? 'ready' : 'not_ready', service: 'supermama-lark-mcp', version: SERVER_INFO.version });
});

// POST initializes a session or carries an existing session RPC message.
app.post('/mcp', async (req, res) => {
  try {
    const { sessionId, transport } = getSession(req);

    if (transport) {
      await transport.handleRequest(req, res, req.body);
      return;
    }

    if (!sessionId && isInitializeRequest(req.body)) {
      await createSession(req, res);
      return;
    }

    if (sessionId) {
      sendJsonRpcError(res, 404, -32001, 'Session not found');
      return;
    }

    sendJsonRpcError(res, 400, -32000, 'Bad Request: initialization required');
  } catch (error) {
    logger.error('MCP request failed', { reason: errorSummary(error) });
    void notifyError({ source: 'http:mcp', error });
    if (!res.headersSent) {
      sendJsonRpcError(res, 500, -32603, 'Internal server error');
    }
  }
});

// GET supports server-to-client stream handling only for an already initialized session.
app.get('/mcp', async (req, res) => {
  const { transport } = getSession(req);
  if (!transport) {
    sendJsonRpcError(res, 400, -32000, 'Valid MCP session required');
    return;
  }
  await transport.handleRequest(req, res);
});

// DELETE delegates session termination to the transport after validating the session exists.
app.delete('/mcp', async (req, res) => {
  const { transport } = getSession(req);
  if (!transport) {
    sendJsonRpcError(res, 404, -32001, 'Session not found');
    return;
  }
  await transport.handleRequest(req, res);
});

// Express also forwards JSON parsing errors and rejected GET/DELETE handlers here.
app.use((error, _req, res, _next) => {
  const status = error.status >= 400 && error.status < 600 ? error.status : 500;
  logger.error('HTTP request failed', { status, reason: error.type === 'entity.parse.failed' ? 'Invalid JSON request body' : errorSummary(error) });
  if (status >= 500) void notifyError({ source: 'http:request', error });
  if (!res.headersSent) sendJsonRpcError(res, status, -32603, 'Request failed');
  else res.end();
});

const listener = app.listen(port, () => {
  logger.success('MCP server ready', { transport: 'http', version: SERVER_INFO.version, port, health: '/health', mcp: '/mcp' });
});
listener.on('error', error => {
  logger.error('HTTP listen failed', { port, code: error.code || 'UNKNOWN', reason: errorSummary(error) });
  void notifyError({ source: 'http:listen', error });
  process.exitCode = 1;
});
listener.on('close', () => logger.info('HTTP server closed'));
