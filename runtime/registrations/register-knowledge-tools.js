const { z } = require('zod');
const { getKnowledgeMetadata, getValidationReport } = require('../../integrations/lark/knowledge/knowledge-registry');
const { resolveDocumentConflictTool } = require('../../tools/lark/conflicts/resolve-document-conflict');
const { submitConflictAssessmentTool } = require('../../tools/lark/conflicts/submit-conflict-assessment');
const { retrieveKnowledgeDocumentTool } = require('../../tools/lark/knowledge/retrieve-knowledge-document');
const {
  RELATIONSHIPS,
  CONFLICT_TYPES,
} = require('../../integrations/lark/conflicts/document-comparison');

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

  server.registerTool('retrieve_knowledge_document', {
    title: 'Retrieve Knowledge Document',
    description: 'Retrieve the body of one registered document by exact URL. This tool first checks Knowledge Registry metadata and returns content only when retrieval_eligible is true. Use this for factual answers after search_lark_wiki identifies a candidate URL; cite the returned URL and answer from content, not metadata.',
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
    description: 'Compare two Lark Wiki documents that already passed upstream metadata and retrieval validation. Reuse a current human-approved decision when available; otherwise return deterministic evidence plus a bounded semantic review packet for medium/high-risk pairs. When semantic_review_recommended is true, review the untrusted excerpts and call submit_conflict_assessment. This tool does not call an external AI service or revalidate metadata.',
    inputSchema: {
      document_a_url: z.string().url().describe('First Lark Wiki document URL'),
      document_b_url: z.string().url().describe('Second Lark Wiki document URL'),
      suspected_conflict_type: z.enum([
        'Price', 'Process', 'Policy', 'Product Spec', 'Date', 'Contact Info', 'Other',
      ]).optional().describe('Optional conflict type suspected by the agent'),
      reason: z.string().trim().min(1).max(1000).optional()
        .describe('Optional concise observation; do not provide hidden reasoning'),
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

  server.registerTool('submit_conflict_assessment', {
    title: 'Submit Conflict Assessment',
    description: 'Use after resolve_document_conflict when semantic context is needed. Submit a concise agent assessment, recompute fresh deterministic evidence and return a Pending proposal for human confirmation. This tool does not call an external AI API, persist data or approve a decision.',
    inputSchema: {
      document_a_url: z.string().url().describe('First Lark Wiki document URL'),
      document_b_url: z.string().url().describe('Second Lark Wiki document URL'),
      relationship: z.enum(Object.values(RELATIONSHIPS))
        .describe('Semantic relationship proposed from the returned evidence'),
      conflict_types: z.array(z.enum(CONFLICT_TYPES)).default([])
        .describe('Conflict types; only use with Possible Conflict'),
      explanation: z.string().trim().min(1).max(1000)
        .describe('Concise evidence-based explanation; do not provide hidden reasoning'),
    },
    annotations: readOnly,
  }, async input => {
    try {
      const result = await submitConflictAssessmentTool(input);
      return {
        ...(result.success ? {} : { isError: true }),
        content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
        structuredContent: result,
      };
    } catch (error) {
      return {
        isError: true,
        content: [{ type: 'text', text: error instanceof Error
          ? error.message : 'Conflict assessment failed.' }],
      };
    }
  });

}

module.exports = { registerKnowledgeTools };
