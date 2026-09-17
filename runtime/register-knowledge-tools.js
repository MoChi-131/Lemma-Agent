const { z } = require('zod');
const { getKnowledgeMetadata, getValidationReport } = require('../integrations/lark/knowledge-registry');

/** Register the same read-only registry tools on stdio and HTTP MCP servers. */
function registerKnowledgeTools(server) {
  const readOnly = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true };

  server.registerTool('get_knowledge_metadata', {
    title: 'Get Knowledge Metadata',
    description: 'Read registry metadata without modifying Base records. External Reference retrieval_eligible is verified against the separate domain whitelist table.',
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

  server.registerTool('get_knowledge_validation_report', {
    title: 'Get Knowledge Validation Report',
    description: 'Read the registry and report dictionary checks using Expected, Actual, PASS/FAIL/WARNING and Evidence. Makes no Base changes.',
    inputSchema: {
      registryUrl: z.string().url().optional().describe('Optional registry Base URL override'),
      whitelistUrl: z.string().url().optional().describe('Optional whitelist table URL override'),
    },
    annotations: readOnly,
  }, async input => {
    try {
      const result = await getValidationReport(input);
      return { content: [{ type: 'text', text: result.report_text }], structuredContent: {
        success: result.success, source: result.source, timestamp: result.timestamp,
        record_count: result.record_count, skipped_empty_record_count: result.skipped_empty_record_count,
        summary: result.summary,
      } };
    } catch {
      return { isError: true, content: [{ type: 'text', text: 'Knowledge validation report failed. Check credentials, permissions and Base access.' }] };
    }
  });
}

module.exports = { registerKnowledgeTools };
