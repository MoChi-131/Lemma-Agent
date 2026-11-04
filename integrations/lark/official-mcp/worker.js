// Private stdio worker. Run the pinned official MCP; never expose an HTTP listener.
const path = require('node:path');
const { TOOLS } = require('./constants');

// Keep the official package's state inside the ignored project logs directory.
const { ENV_PATHS } = require('@larksuiteoapi/lark-mcp/dist/utils/constants');
const userOAuth = process.env.LEMMA_LARK_USER_OAUTH === 'true';
for (const key of Object.keys(ENV_PATHS)) {
  // Local user OAuth tokens are encrypted in the official package's default
  // data directory. Keep that directory only for explicit local test mode.
  if (userOAuth && key === 'data') continue;
  ENV_PATHS[key] = path.resolve(__dirname, '../../..', 'logs', 'official-mcp', key);
}
// The parent emits concise activity/error summaries. Do not write raw upstream errors.
require('@larksuiteoapi/lark-mcp/dist/utils/logger').logger.setLevel(0);

const { McpServer } = require('@modelcontextprotocol/sdk/server/mcp.js');
const { commonHttpInstance, oapiHttpInstance } = require('@larksuiteoapi/lark-mcp/dist/utils/http-instance');
require('./http-lifecycle').installHttpLifecycle({
  McpServer, httpInstances: [commonHttpInstance, oapiHttpInstance],
});

const cli = require.resolve('@larksuiteoapi/lark-mcp/dist/cli.js');
process.argv = [process.execPath, cli, 'mcp', '--mode', 'stdio', '--domain',
  'https://open.larksuite.com', '--token-mode', userOAuth ? 'user_access_token' : 'tenant_access_token',
  ...(userOAuth ? ['--oauth'] : []),
  '--tool-name-case', 'dot', '--tools', Object.values(TOOLS).join(',')];
require(cli);
process.stdin.on('end', () => process.exit(0));
