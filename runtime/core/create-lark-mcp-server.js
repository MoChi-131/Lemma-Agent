const { McpServer } = require('@modelcontextprotocol/sdk/server/mcp.js');
const { instrumentTools } = require('./tool-logging');
const { registerDocumentTools } = require('../registrations/register-document-tools');
const { registerDriveTools } = require('../registrations/register-drive-tools');
const { registerDocumentPublicationTools } = require('../registrations/register-document-publication-tools');
const { registerKnowledgeTools } = require('../registrations/register-knowledge-tools');
const { registerWikiChildrenTool } = require('../registrations/register-wiki-children-tool');
const { registerWikiSearchTools } = require('../registrations/register-wiki-search-tools');
const { registerWikiSubtreeTool } = require('../registrations/register-wiki-subtree-tool');
const { registerWikiTreeTool } = require('../registrations/register-wiki-tree-tool');

const SERVER_INFO = {
  name: 'supermama-lark',
  version: '1.1.0',
};

/**
 * Build one MCP server so stdio and HTTP expose the same core tools.
 * @param {{includeWikiChildren?: boolean}} options enables the lower-level child-list tool when needed.
 * @returns {McpServer} configured server with logging wrapped around every tool handler.
 */
function createLarkMcpServer({
  includeWikiChildren = false,
} = {}) {
  const server = new McpServer(SERVER_INFO);
  instrumentTools(server);

  registerDocumentTools(server);
  registerDriveTools(server);
  registerDocumentPublicationTools(server);
  if (includeWikiChildren) registerWikiChildrenTool(server);
  registerWikiTreeTool(server);
  registerWikiSubtreeTool(server);
  registerWikiSearchTools(server);
  registerKnowledgeTools(server);

  return server;
}

module.exports = { createLarkMcpServer, SERVER_INFO };
