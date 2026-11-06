// Confirms Drive access inspection stays within the reviewed read-only MCP tools.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { inspectFileAccess } = require('../integrations/lark/drive/file-access');
const { TOOLS } = require('../integrations/lark/official-mcp/constants');

test('file access inspection uses only approved official read tools', async () => {
  const calls = [];
  const result = await inspectFileAccess({ token: 'doc123', type: 'docx' }, { mcp: { call: async (name) => {
    calls.push(name);
    return name === TOOLS.driveMetadata
      ? { metas: [{ title: 'Safe title', url: 'https://example.larksuite.com/docx/doc123', create_time: '1' }] }
      : { auth_result: true };
  } } });
  assert.deepEqual(calls.sort(), [TOOLS.driveMetadata, TOOLS.driveViewPermission].sort());
  assert.equal(result.app_can_view, true);
  assert.equal(result.title, 'Safe title');
  await assert.rejects(inspectFileAccess({ token: '../bad', type: 'docx' }), /token/);
});
