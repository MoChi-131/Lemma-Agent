const { z } = require('zod');
const { getKnowledgeMetadata } = require('../../integrations/lark/knowledge/knowledge-registry');
const { retrieveKnowledgeDocumentTool } = require('../../tools/lark/knowledge/retrieve-knowledge-document');
const { searchKnowledgeRegistryTool } = require('../../tools/lark/knowledge/search-knowledge-registry');

/** Register the same read-only registry tools on stdio and HTTP MCP servers. */
function registerKnowledgeTools(server) {
  const readOnly = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true };

  server.registerTool('get_knowledge_metadata', {
    title: 'Get Knowledge Metadata',
    description: 'Read registry metadata without document content or Base changes. retrieval_eligible applies the frozen completeness, Scope, Status, Authority and external-whitelist rules. For a user question about document facts, do not answer from metadata: when eligible, call retrieve_knowledge_document with the exact source_url.',
    inputSchema: {
      url: z.string().url().optional().describe('Optional exact document URL'),
      registryUrl: z.string().url().optional().describe('Optional registry Base URL override'),
      whitelistUrl: z.string().url().optional().describe('Optional whitelist table URL override'),
    },
    annotations: readOnly,
  }, async input => {
    try {
      const result = await getKnowledgeMetadata(input);
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }], structuredContent: result };
    } catch {
      return { isError: true, content: [{ type: 'text', text: 'Knowledge metadata read failed. Check URL, credentials, permissions and Base access.' }] };
    }
  });

  server.registerTool('search_knowledge_registry', {
    title: 'Search Knowledge Registry',
    description: 'First-choice discovery tool for topic and product questions. Search lightweight Registry metadata before Wiki content. If a relevant result is returned, pass its source_url to retrieve_knowledge_document. Use search_lark_wiki only when this returns no relevant result or the user explicitly requests unregistered or other Wiki documents.',
    inputSchema: {
      query: z.string().trim().min(1).max(200)
        .describe('One to three distinctive terms, such as a product, service or model'),
      retrieval_eligible_only: z.boolean().default(true)
        .describe('Return only documents currently allowed for retrieval'),
      max_results: z.number().int().min(1).max(50).default(10),
      registryUrl: z.string().url().optional(),
      whitelistUrl: z.string().url().optional(),
    },
    annotations: readOnly,
  }, async input => {
    try {
      const result = await searchKnowledgeRegistryTool(input);
      return {
        content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
        structuredContent: result,
      };
    } catch {
      return {
        isError: true,
        content: [{ type: 'text', text: 'Knowledge Registry search failed. Check credentials, permissions and Base access.' }],
      };
    }
  });

  server.registerTool('retrieve_knowledge_document', {
    title: 'Retrieve Knowledge Document',
    description: 'Retrieve the body of one registered document by exact URL. This tool first checks Knowledge Registry metadata and returns content only when retrieval_eligible is true. Use it after search_knowledge_registry selects a candidate, or for an exact URL. Cite the returned URL and answer from content, not metadata.',
    inputSchema: {
      url: z.string().url().describe('Exact Lark Wiki document URL from the registry or a Wiki search result'),
      registryUrl: z.string().url().optional().describe('Optional registry Base URL override'),
      whitelistUrl: z.string().url().optional().describe('Optional whitelist table URL override'),
    },
    annotations: readOnly,
  }, async input => {
    try {
      const result = await retrieveKnowledgeDocumentTool(input);
      return {
        ...(result.success ? {} : { isError: true }),
        content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
        structuredContent: result,
      };
    } catch (error) {
      return {
        isError: true,
        content: [{ type: 'text', text: error instanceof Error
          ? error.message : 'Knowledge document retrieval failed.' }],
      };
    }
  });

}

module.exports = { registerKnowledgeTools };
