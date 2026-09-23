const { z } = require('zod');
const {
  readLarkDocumentTool,
} = require('../../tools/lark/documents/read-lark-document');

function registerDocumentTools(server) {
  server.registerTool('read_lark_document', {
    title: 'Read Lark Document',
    description: 'Read text, native tables, embedded Sheets and supported PDF attachments from a known Lark Wiki document. Prefer retrieve_knowledge_document for governed knowledge because it enforces registry retrieval eligibility first.',
    inputSchema: {
      url: z.string().url().describe('Lark Wiki document URL'),
    },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    },
  }, async ({ url }) => {
    try {
      const result = await readLarkDocumentTool({ url });
      return {
        content: [{ type: 'text', text: JSON.stringify(result) }],
        structuredContent: result,
      };
    } catch (error) {
      return {
        isError: true,
        content: [{ type: 'text', text: error instanceof Error ? error.message : String(error) }],
      };
    }
  });
}

module.exports = { registerDocumentTools };
