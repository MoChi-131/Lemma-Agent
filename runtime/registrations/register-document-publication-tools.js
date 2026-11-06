const { z } = require('zod');
const { createDocumentPublisher } = require('../../integrations/lark/documents/document-publication');

/**
 * Register the minimal write surface: publish one confirmed document or inspect it.
 * @param {object} server MCP server receiving tool definitions.
 * @param {object} publisher injectable publisher for tests.
 */
function registerDocumentPublicationTools(server, publisher = createDocumentPublisher()) {
  const definitions = [
    ['publish_approved_document', 'Publish Approved Wiki Document',
      'Create one new Wiki document after one explicit confirmation. Checks for a duplicate title under the parent and verifies the created document. Does not edit an existing document.',
      { title: z.string().min(1).max(200), markdown: z.string().min(1).max(100000),
        parent_url: z.string().url(), approval_confirmed: z.literal(true) }, 'publishSimple', false],
    ['inspect_document_publication', 'Inspect Document Publication',
      'Read metadata for a known Wiki document. Never creates, edits, moves or retries a document.',
      { url: z.string().url() }, 'inspectSimple', true],
  ];
  for (const [name, title, description, inputSchema, method, readOnly] of definitions) {
    server.registerTool(name, { title, description, inputSchema,
      annotations: { readOnlyHint: readOnly, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    }, async input => {
      try {
        const result = await publisher[method](input);
        return { ...(result.success === false ? { isError: true } : {}),
          content: [{ type: 'text', text: JSON.stringify(result) }], structuredContent: result };
      } catch (error) {
        return { isError: true, content: [{ type: 'text', text: error.message }] };
      }
    });
  }
}

module.exports = { registerDocumentPublicationTools };
