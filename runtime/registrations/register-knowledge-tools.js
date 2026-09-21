const { z } = require('zod');
const { getKnowledgeMetadata, getValidationReport } = require('../../integrations/lark/knowledge/knowledge-registry');
const { resolveDocumentConflictTool } = require('../../tools/lark/conflicts/resolve-document-conflict');

/** Register the same read-only registry tools on stdio and HTTP MCP servers. */
function registerKnowledgeTools(server) {
  const readOnly = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true };

  server.registerTool('get_knowledge_metadata', {
    title: 'Get Knowledge Metadata',
    description: 'Read registry metadata without modifying Base records. retrieval_eligible applies the frozen completeness, Scope, Status, Authority and external-whitelist rules.',
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

  server.registerTool('resolve_document_conflict', {
    title: 'Resolve Document Conflict',
    description: 'Compare two Lark Wiki documents that already passed upstream metadata and retrieval validation. Reuse a current human-approved decision when available; otherwise return targeted evidence and, when needed, a Pending review proposal. This tool does not revalidate metadata.',
    inputSchema: {
      document_a_url: z.string().url().describe('First Lark Wiki document URL'),
      document_b_url: z.string().url().describe('Second Lark Wiki document URL'),
      suspected_conflict_type: z.enum([
        'Price', 'Process', 'Policy', 'Product Spec', 'Date', 'Contact Info', 'Other',
      ]).optional().describe('Optional conflict type suspected by the agent'),
      reason: z.string().trim().min(1).max(1000).optional()
        .describe('Optional concise observation; do not provide hidden reasoning'),
      use_ai: z.boolean().optional()
        .describe('Use targeted AI contextual review when a rule-based conflict candidate is found; defaults to true'),
    },
    annotations: readOnly,
  }, async input => {
    try {
      const result = await resolveDocumentConflictTool(input);
      return {
        ...(result.success ? {} : { isError: true }),
        content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
        structuredContent: result,
      };
    } catch (error) {
      return {
        isError: true,
        content: [{
          type: 'text',
          text: error instanceof Error ? error.message : 'Document conflict resolution failed.',
        }],
      };
    }
  });
}

module.exports = { registerKnowledgeTools };
