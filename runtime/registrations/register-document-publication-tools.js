const { z } = require('zod');
const { createDocumentPublisher } = require('../../integrations/lark/documents/document-publication');

function registerDocumentPublicationTools(server, publisher = createDocumentPublisher()) {
  const reference = z.string().regex(/^[a-f0-9]{64}$/).describe('Internal reference returned by prepare; never ask the colleague to supply it.');
  const definitions = [
    ['prepare_knowledge_document', 'Prepare Document for Review',
      'Prepare the full Markdown draft and an existing Wiki parent for human review. Does not create or edit Lark content. Omit parent_url to discover the configured root and suggested locations, then choose a suitable parent and prepare again. Show title, full body and location before approval. Images and original attachments are not supported.',
      { title: z.string().min(1).max(200), markdown: z.string().min(1).max(100000),
        parent_url: z.string().url().optional(), location_reason: z.string().max(1000).optional() }, 'prepare', false],
    ['publish_approved_document', 'Publish Approved Wiki Document',
      'Only after explicit human approval of the prepared title, full body and location, create a new Wiki document and verify its title, parent, text and tables. Does not modify metadata or existing documents. Repeated calls inspect the same receipt without repeating creation. Changed drafts require a new prepare and approval.',
      { draft_id: reference, approval_confirmed: z.literal(true) }, 'publish', false],
    ['inspect_document_publication', 'Inspect Document Publication',
      'Read back a prepared publication receipt and any confirmed Wiki document. Use after uncertain writes; never creates, edits, deletes or retries document creation.',
      { draft_id: reference }, 'inspect', true],
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
