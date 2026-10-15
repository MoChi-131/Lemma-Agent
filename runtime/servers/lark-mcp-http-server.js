console.error(`[${new Date().toISOString()}] Starting Lemma MCP HTTP server`);
require('dotenv').config({ quiet: true });

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
  console.error(`[${new Date().toISOString()}] request started ${req.method} ${path}`);
  res.on('finish', () => {
    console.error(`[${new Date().toISOString()}] request finished ${req.method} ${path} status=${res.statusCode} duration_ms=${Date.now() - started}`);
  });
  next();
});
app.use(express.json());

function sendJsonRpcError(res, status, code, message) {
  res.status(status).json({
    jsonrpc: '2.0',
    error: { code, message },
    id: null,
  });
}

function getSession(req) {
  const sessionId = req.headers['mcp-session-id'];
  return {
    sessionId,
    transport: sessionId ? sessions.get(sessionId) : undefined,
  };
}

async function createSession(req, res) {
  let transport;
  transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: () => randomUUID(),
    onsessioninitialized: sessionId => {
      sessions.set(sessionId, transport);
      console.error(`MCP session initialized; active_sessions=${sessions.size}`);
    },
  });

  transport.onclose = () => {
    if (transport.sessionId) sessions.delete(transport.sessionId);
  };

  const server = createLarkMcpServer({ includeWikiChildren: true });
  await server.connect(transport);
  await transport.handleRequest(req, res, req.body);
}

app.get('/health', (_req, res) => {
  res.json({
    status: 'ok',
    service: 'supermama-lark-mcp',
    version: SERVER_INFO.version,
    sessions: sessions.size,
  });
});

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
    console.error('MCP request failed; error_type=', error?.name || 'Error');
    if (!res.headersSent) {
      sendJsonRpcError(res, 500, -32603, 'Internal server error');
    }
  }
});

app.get('/mcp', async (req, res) => {
  const { transport } = getSession(req);
  if (!transport) {
    sendJsonRpcError(res, 400, -32000, 'Valid MCP session required');
    return;
  }
  await transport.handleRequest(req, res);
});

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
  console.error(`HTTP request failed; status=${status} error_type=${error?.name || 'Error'}`);
  if (!res.headersSent) sendJsonRpcError(res, status, -32603, 'Request failed');
  else res.end();
});

const listener = app.listen(port, () => {
  console.log(`Supermama Lark MCP HTTP Server v${SERVER_INFO.version} running on port ${port}`);
  console.log(`Health: http://localhost:${port}/health`);
  console.log(`MCP: http://localhost:${port}/mcp`);
});
listener.on('error', error => {
  console.error(`HTTP server failed to listen on port ${port}; code=${error.code || 'UNKNOWN'}`);
  process.exitCode = 1;
});
