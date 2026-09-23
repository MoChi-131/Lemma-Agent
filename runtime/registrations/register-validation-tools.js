const { z } = require('zod');
const { getValidationReport } = require('../../integrations/lark/knowledge/knowledge-validation');

/** Register audit tools used by the Knowledge Base Management Agent. */
function registerValidationTools(server) {
  server.registerTool('get_knowledge_validation_report', {
    title: 'Get Knowledge Validation Report',
    description: 'Audit the registry dictionary using Expected, Actual, PASS/FAIL/WARNING and Evidence. Makes no Base changes.',
    inputSchema: {
      registryUrl: z.string().url().optional().describe('Optional registry Base URL override'),
      whitelistUrl: z.string().url().optional().describe('Optional whitelist table URL override'),
    },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    },
  }, async input => {
    try {
      const result = await getValidationReport(input);
      return {
        content: [{ type: 'text', text: result.report_text }],
        structuredContent: {
          success: result.success,
          source: result.source,
          timestamp: result.timestamp,
          record_count: result.record_count,
          skipped_empty_record_count: result.skipped_empty_record_count,
          summary: result.summary,
        },
      };
    } catch {
      return {
        isError: true,
        content: [{ type: 'text', text: 'Knowledge validation report failed. Check credentials, permissions and Base access.' }],
      };
    }
  });
}

module.exports = { registerValidationTools };
