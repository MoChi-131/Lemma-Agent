const { z } = require('zod');
const { getKnowledgeMetadata } = require('../../integrations/lark/knowledge/knowledge-registry');
const { retrieveKnowledgeDocumentTool } = require('../../tools/lark/knowledge/retrieve-knowledge-document');
const { searchKnowledgeRegistryTool } = require('../../tools/lark/knowledge/search-knowledge-registry');
const { checkExternalUrls, getApprovedWebDomains } = require('../../tools/lark/knowledge/external-web-governance');

const READ_ONLY = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: true,
};

function jsonResult(result, { isError = false } = {}) {
  return {
    ...(isError ? { isError: true } : {}),
    content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
    structuredContent: result,
  };
}

function errorResult(message) {
  return { isError: true, content: [{ type: 'text', text: message }] };
}

/** Register the same read-only registry tools on stdio and HTTP MCP servers. */
function registerKnowledgeTools(server) {
  server.registerTool('get_knowledge_metadata', {
    title: 'Get Knowledge Metadata',
    description: 'Read registry metadata without document content or Base changes. retrieval_eligible applies the frozen completeness, Scope, Status, Authority and external-whitelist rules. For a user question about document facts, do not answer from metadata: when eligible, call retrieve_knowledge_document with the exact source_url.',
    inputSchema: {
      url: z.string().url().optional().describe('Optional exact document URL'),
      registryUrl: z.string().url().optional().describe('Optional registry Base URL override'),
      whitelistUrl: z.string().url().optional().describe('Optional whitelist table URL override'),
    },
    annotations: READ_ONLY,
  }, async input => {
    try {
      return jsonResult(await getKnowledgeMetadata(input));
    } catch {
      return errorResult('Knowledge metadata read failed. Check URL, credentials, permissions and Base access.');
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
    annotations: READ_ONLY,
  }, async input => {
    try {
      return jsonResult(await searchKnowledgeRegistryTool(input));
    } catch {
      return errorResult('Knowledge Registry search failed. Check credentials, permissions and Base access.');
    }
  });

  server.registerTool('retrieve_knowledge_document', {
    title: 'Retrieve Knowledge Document',
    description: 'Retrieve text, native tables, embedded Sheets and supported PDF attachments from one registered document by exact URL. This tool checks retrieval_eligible first. Use it after search_knowledge_registry or for an exact URL. Cite the source and answer from retrieved content, never metadata alone.',
    inputSchema: {
      url: z.string().url().describe('Exact Lark Wiki document URL from the registry or a Wiki search result'),
      registryUrl: z.string().url().optional().describe('Optional registry Base URL override'),
      whitelistUrl: z.string().url().optional().describe('Optional whitelist table URL override'),
    },
    annotations: READ_ONLY,
  }, async input => {
    try {
      const result = await retrieveKnowledgeDocumentTool(input);
      return jsonResult(result, { isError: !result.success });
    } catch (error) {
      return errorResult(error instanceof Error ? error.message : 'Knowledge document retrieval failed.');
    }
  });

  server.registerTool('get_approved_web_domains', {
    title: 'Get Approved Web Domains',
    description: 'Required before external web search. Returns only domains with Approved status in the external whitelist. Restrict the web search to these domains; if none are approved, do not search the web.',
    inputSchema: {
      query: z.string().trim().min(1).max(500).optional().describe('The intended web-search query'),
      whitelistUrl: z.string().url().optional().describe('Optional whitelist table URL override'),
    },
    annotations: READ_ONLY,
  }, async input => {
    try {
      return jsonResult(await getApprovedWebDomains(input));
    } catch {
      return errorResult('Approved web-domain lookup failed. Do not perform external web search.');
    }
  });

  server.registerTool('check_external_urls', {
    title: 'Check External URLs',
    description: 'Required after external web search and after redirects. Allows only HTTPS URLs whose hostname exactly matches an Approved whitelist domain or its real subdomain. Discard every blocked result.',
    inputSchema: {
      urls: z.array(z.string()).min(1).max(50).describe('Candidate or final URLs to validate'),
      whitelistUrl: z.string().url().optional().describe('Optional whitelist table URL override'),
    },
    annotations: READ_ONLY,
  }, async input => {
    try {
      return jsonResult(await checkExternalUrls(input));
    } catch {
      return errorResult('External URL whitelist check failed. Do not use or cite these URLs.');
    }
  });
}

module.exports = { registerKnowledgeTools };
