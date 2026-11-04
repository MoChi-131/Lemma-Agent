const { officialMcp } = require('../../integrations/lark/official-mcp/client');

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
