const { inspectFileAccess } = require('../../../integrations/lark/drive/file-access');
// Re-export the integration under the public MCP tool name; it performs no mutation.
module.exports = { inspectLarkFileAccessTool: inspectFileAccess };
