const { z } = require('zod');
const {
  CONFLICT_TYPES,
  RELATIONSHIPS,
} = require('../../integrations/lark/conflicts/document-comparison');
const {
  resolveDocumentConflictTool,
} = require('../../tools/lark/conflicts/resolve-document-conflict');
const {
  submitConflictAssessmentTool,
} = require('../../tools/lark/conflicts/submit-conflict-assessment');

const READ_ONLY = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: true,
};

/** Register the full conflict workflow for a Knowledge Base Management Agent. */
function registerConflictTools(server) {
  server.registerTool('resolve_document_conflict', {
    title: 'Resolve Document Conflict',
    description: 'Compare two retrieval-eligible Lark Wiki documents. Reuse a current human-approved decision when available; otherwise return deterministic evidence and a bounded semantic review packet. This tool does not call an external AI service or revalidate metadata.',
    inputSchema: {
      document_a_url: z.string().url().describe('First Lark Wiki document URL'),
      document_b_url: z.string().url().describe('Second Lark Wiki document URL'),
      suspected_conflict_type: z.enum(CONFLICT_TYPES).optional(),
      reason: z.string().trim().min(1).max(1000).optional()
        .describe('Concise observation; do not provide hidden reasoning'),
    },
    annotations: READ_ONLY,
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
        content: [{ type: 'text', text: error instanceof Error
          ? error.message : 'Document conflict resolution failed.' }],
      };
    }
  });

  server.registerTool('submit_conflict_assessment', {
    title: 'Submit Conflict Assessment',
    description: 'Use after resolve_document_conflict when semantic context is needed. Recompute evidence and return a Pending proposal for human confirmation. This tool does not persist or approve a decision.',
    inputSchema: {
      document_a_url: z.string().url(),
      document_b_url: z.string().url(),
      relationship: z.enum(Object.values(RELATIONSHIPS)),
      conflict_types: z.array(z.enum(CONFLICT_TYPES)).default([]),
      explanation: z.string().trim().min(1).max(1000)
        .describe('Concise evidence-based explanation; do not provide hidden reasoning'),
    },
    annotations: READ_ONLY,
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

module.exports = { registerConflictTools };
