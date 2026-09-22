const {
  StdioServerTransport,
} = require('@modelcontextprotocol/sdk/server/stdio.js');
const {
  createLarkMcpServer,
  SERVER_INFO,
} = require('../core/create-lark-mcp-server');

async function main() {
  const server = createLarkMcpServer();
  await server.connect(new StdioServerTransport());
  console.error(`Supermama Lark MCP Server v${SERVER_INFO.version} started`);
}

main().catch(error => {
  console.error('MCP Server failed:', error);
  process.exitCode = 1;
});
