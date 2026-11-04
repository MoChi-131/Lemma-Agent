const { z } = require('zod');
const { inspectLarkFileAccessTool } = require('../../tools/lark/drive/inspect-lark-file-access');

function registerDriveTools(server) {
  server.registerTool('inspect_lark_file_access', {
    title: 'Inspect Lark File Access',
    description: 'Read a known Lark file metadata record and whether the configured Lemma app can view it. Does not list collaborators, expose permission settings, or modify Lark.',
    inputSchema: {
      token: z.string().regex(/^[A-Za-z0-9]+$/),
      type: z.enum(['doc', 'sheet', 'file', 'wiki', 'bitable', 'docx', 'mindnote']),
    },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
  }, async input => {
    try {
      const result = await inspectLarkFileAccessTool(input);
      return { content: [{ type: 'text', text: JSON.stringify(result) }], structuredContent: result };
    } catch {
      return { isError: true, content: [{ type: 'text', text: 'Lark file access check failed. Check token, type, credentials and app permissions.' }] };
    }
  });
}

module.exports = { registerDriveTools };
