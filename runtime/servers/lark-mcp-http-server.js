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
const port = process.env.PORT || 3000;

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
    onsessioninitialized: sessionId => sessions.set(sessionId, transport),
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
    console.error('MCP request failed:', error);
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

app.listen(port, () => {
  console.log(`Supermama Lark MCP HTTP Server v${SERVER_INFO.version} running on port ${port}`);
});
