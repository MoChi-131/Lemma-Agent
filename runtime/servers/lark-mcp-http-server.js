const { registerWikiSearchTools } = require("../registrations/register-wiki-search-tools");
const { registerKnowledgeTools } = require("../registrations/register-knowledge-tools");
require("dotenv").config();
const { registerWikiTreeTool } = require("../registrations/register-wiki-tree-tool");
const { registerWikiSubtreeTool } = require("../registrations/register-wiki-subtree-tool");

const express = require("express");
const { randomUUID } = require("crypto");

const {
  McpServer,
} = require("@modelcontextprotocol/sdk/server/mcp.js");

const {
  StreamableHTTPServerTransport,
} = require("@modelcontextprotocol/sdk/server/streamableHttp.js");

const {
  isInitializeRequest,
} = require("@modelcontextprotocol/sdk/types.js");

const { z } = require("zod");

const {
  readLarkDocumentTool,
} = require("../../tools/lark/documents/read-lark-document");

const {
  listLarkWikiChildrenTool,
} = require("../../tools/lark/wiki/list-lark-wiki-children");

const app = express();
app.use((req, res, next) => {
  res.setHeader("X-Supermama-Debug", "v0.3.4");

  res.on("finish", () => {
    console.log(
      "[HTTP CHECK]",
      req.method,
      req.path,
      res.statusCode
    );
  });

  next();
});

app.use(express.json());


// 保存当前 MCP sessions
const sessions = new Map();


function createMcpServer() {
  const server = new McpServer({
    name: "supermama-lark",
    version: "0.3.4",
  });

  server.registerTool(
    "read_lark_document",
    {
      title: "Read Lark Document",

      description:
        "Read the content of a Supermama Lark Wiki document from its URL.",

      inputSchema: {
        url: z
          .string()
          .url()
          .describe("Lark Wiki or document URL"),
      },
    },

    async ({ url }) => {
      try {
        console.log(
          "Calling Lark tool:",
          url
        );

        const result =
          await readLarkDocumentTool({
            url,
          });

        console.log(
          "Lark tool call: SUCCESS"
        );

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(result),
            },
          ],
        };
      } catch (error) {
        console.error(
          "Lark tool call failed:",
          error
        );

        return {
          isError: true,

          content: [
            {
              type: "text",

              text:
                error instanceof Error
                  ? error.message
                  : String(error),
            },
          ],
        };
      }
    }
  );
  server.registerTool(
  "list_lark_wiki_children",
  {
    title:
      "List Lark Wiki Children",

    description:
      "List direct child nodes under a known Supermama Lark Wiki parent node.",

    inputSchema: {
      space_id:
        z.string(),

      parent_node_token:
        z.string(),

      page_size:
        z.number()
          .int()
          .min(1)
          .max(50)
          .optional(),

      page_token:
        z.string()
          .optional(),
    },
  },

  async ({
    space_id,
    parent_node_token,
    page_size,
    page_token,
  }) => {
    try {
      const result =
        await listLarkWikiChildrenTool({
          space_id,
          parent_node_token,
          page_size,
          page_token,
        });

      return {
        content: [
          {
            type: "text",
            text:
              JSON.stringify(result),
          },
        ],
      };
    } catch (error) {
      return {
        isError: true,

        content: [
          {
            type: "text",
            text:
              error instanceof Error
                ? error.message
                : String(error),
          },
        ],
      };
    }
  }
);

  registerWikiTreeTool(server);
  registerWikiSubtreeTool(server);
  registerWikiSearchTools(server);
  registerKnowledgeTools(server);
  return server;
}


// Health check
app.get("/health", (req, res) => {
  res.json({
    status: "ok",
    service: "supermama-lark-mcp",
    version: "0.3.4",
    sessions: sessions.size,
  });
});


// MCP POST
app.post("/mcp", async (req, res) => {
  try {
    const sessionId =
      req.headers["mcp-session-id"];

    console.log(
      "MCP POST:",
      req.body?.method || "unknown",
      "session:",
      sessionId || "none"
    );

    let transport;


    // 已存在 session
    if (
      sessionId &&
      sessions.has(sessionId)
    ) {
      transport =
        sessions.get(sessionId);

      await transport.handleRequest(
        req,
        res,
        req.body
      );

      return;
    }


    // 新 initialize 请求
    if (
      !sessionId &&
      isInitializeRequest(req.body)
    ) {
      transport =
        new StreamableHTTPServerTransport({
          sessionIdGenerator:
            () => randomUUID(),

          onsessioninitialized:
            (newSessionId) => {
              console.log(
                "MCP session initialized:",
                newSessionId
              );

              sessions.set(
                newSessionId,
                transport
              );
            },
        });


      transport.onclose = () => {
        if (transport.sessionId) {
          console.log(
            "MCP session closed:",
            transport.sessionId
          );

          sessions.delete(
            transport.sessionId
          );
        }
      };


      const server =
        createMcpServer();

      await server.connect(
        transport
      );

      await transport.handleRequest(
        req,
        res,
        req.body
      );

      return;
    }


    // 有 session ID 但找不到
    if (sessionId) {
      res.status(404).json({
        jsonrpc: "2.0",

        error: {
          code: -32001,
          message:
            "Session not found",
        },

        id: null,
      });

      return;
    }


    // 没有 session，而且不是 initialize
    res.status(400).json({
      jsonrpc: "2.0",

      error: {
        code: -32000,
        message:
          "Bad Request: initialization required",
      },

      id: null,
    });

  } catch (error) {
    console.error(
      "MCP request failed:",
      error
    );

    if (!res.headersSent) {
      res.status(500).json({
        jsonrpc: "2.0",

        error: {
          code: -32603,
          message:
            "Internal server error",
        },

        id: null,
      });
    }
  }
});


// GET /mcp
app.get("/mcp", async (req, res) => {
  const sessionId =
    req.headers["mcp-session-id"];

  console.log(
    "MCP GET session:",
    sessionId || "none"
  );

  if (
    !sessionId ||
    !sessions.has(sessionId)
  ) {
    res.status(400).json({
      jsonrpc: "2.0",

      error: {
        code: -32000,
        message:
          "Valid MCP session required",
      },

      id: null,
    });

    return;
  }

  const transport =
    sessions.get(sessionId);

  await transport.handleRequest(
    req,
    res
  );
});


// DELETE /mcp
app.delete(
  "/mcp",
  async (req, res) => {
    const sessionId =
      req.headers["mcp-session-id"];

    console.log(
      "MCP DELETE session:",
      sessionId || "none"
    );

    if (
      !sessionId ||
      !sessions.has(sessionId)
    ) {
      res.status(404).json({
        jsonrpc: "2.0",

        error: {
          code: -32001,
          message:
            "Session not found",
        },

        id: null,
      });

      return;
    }

    const transport =
      sessions.get(sessionId);

    await transport.handleRequest(
      req,
      res
    );
  }
);


const PORT =
  process.env.PORT || 3000;


app.listen(PORT, () => {
  console.log(
    `Supermama Lark MCP HTTP Server v0.3.4 running on port ${PORT}`
  );
});
