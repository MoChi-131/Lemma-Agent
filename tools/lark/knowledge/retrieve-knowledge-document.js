const {
  getKnowledgeMetadata,
} = require('../../../integrations/lark/knowledge/knowledge-registry');
const {
  readLarkDocumentTool,
} = require('../documents/read-lark-document');

/**
 * Apply the registry retrieval gate before returning a document body.
 * This keeps metadata authorization and content retrieval in one MCP call.
 */
async function retrieveKnowledgeDocumentTool(input, deps = {}) {
  const readMetadata = deps.getKnowledgeMetadata || getKnowledgeMetadata;
  const readDocument = deps.readLarkDocument || readLarkDocumentTool;
  const metadataResult = await readMetadata(input);
  const metadata = metadataResult.documents?.[0];

  if (!metadataResult.found || !metadata) {
    return {
      success: false,
      error_code: 'NOT_REGISTERED',
      message: 'The exact document URL was not found in the Knowledge Registry.',
      url: input.url,
    };
  }

  if (metadata.retrieval_eligible !== true) {
    return {
      success: false,
      error_code: 'RETRIEVAL_NOT_ELIGIBLE',
      message: 'The registry record does not pass the frozen retrieval eligibility rules.',
      url: input.url,
      metadata,
    };
  }

  const document = await readDocument({ url: input.url });
  return {
    success: true,
    source: 'lark_knowledge',
    action: 'retrieve_knowledge_document',
    url: input.url,
    metadata,
    content: document.content,
  };
}

module.exports = { retrieveKnowledgeDocumentTool };
