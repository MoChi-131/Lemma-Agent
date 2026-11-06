const { officialMcp } = require('../../integrations/lark/official-mcp/client');

/**
 * Close the child official-Lark-MCP process exactly once during service shutdown.
 * @param {{stdio?: boolean}} options also stops when a stdio client closes stdin.
 */
function installOfficialMcpShutdown({ stdio = false } = {}) {
  let stopping = false;
  const stop = async () => {
    if (stopping) return;
    stopping = true;
    await officialMcp.close();
    process.exit(0);
  };
  process.once('SIGINT', stop);
  process.once('SIGTERM', stop);
  if (stdio) process.stdin.once('end', stop);
}

module.exports = { installOfficialMcpShutdown };
