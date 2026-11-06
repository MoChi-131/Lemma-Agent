const {
  StdioServerTransport,
} = require('@modelcontextprotocol/sdk/server/stdio.js');
const { logger, errorSummary } = require('../core/logger');
require('../core/official-mcp-shutdown').installOfficialMcpShutdown({ stdio: true });
const {
  createLarkMcpServer,
  SERVER_INFO,
} = require('../core/create-lark-mcp-server');

/** Start the stdio transport; stdout remains reserved exclusively for MCP protocol frames. */
async function main() {
  logger.info('MCP server starting', { transport: 'stdio', version: SERVER_INFO.version });
  const server = createLarkMcpServer();
  await server.connect(new StdioServerTransport());
  logger.success('MCP server ready', { transport: 'stdio', version: SERVER_INFO.version });
}

main().catch(error => {
  logger.error('MCP server failed', { reason: errorSummary(error) });
  process.exitCode = 1;
});
