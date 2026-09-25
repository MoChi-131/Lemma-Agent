const { McpServer } = require('@modelcontextprotocol/sdk/server/mcp.js');
const { registerDocumentTools } = require('../registrations/register-document-tools');
const { registerKnowledgeTools } = require('../registrations/register-knowledge-tools');
const { registerWikiChildrenTool } = require('../registrations/register-wiki-children-tool');
const { registerWikiSearchTools } = require('../registrations/register-wiki-search-tools');
const { registerWikiSubtreeTool } = require('../registrations/register-wiki-subtree-tool');
const { registerWikiTreeTool } = require('../registrations/register-wiki-tree-tool');

const SERVER_INFO = {
  name: 'supermama-lark',
  version: '1.1.0',
};

/** Build one MCP server so stdio and HTTP expose the same core tools. */
function createLarkMcpServer({
  includeWikiChildren = false,
} = {}) {
  const server = new McpServer(SERVER_INFO);

  registerDocumentTools(server);
  if (includeWikiChildren) registerWikiChildrenTool(server);
  registerWikiTreeTool(server);
  registerWikiSubtreeTool(server);
  registerWikiSearchTools(server);
  registerKnowledgeTools(server);

  return server;
}

module.exports = { createLarkMcpServer, SERVER_INFO };
