// Adapts the approved official MCP tools to the publication coordinator.
const { officialMcp, TOOLS } = require('../official-mcp/client');
const { getWikiNode, listWikiChildren } = require('../wiki/wiki');
const { readDocumentBlocks } = require('../core/documents');

/** Official MCP adapter for publication. */
function createOfficialPublicationApi({ mcp = officialMcp } = {}) {
  return {
    getNode: token => getWikiNode(token, {}, { mcp }),
    // Collect every child page so duplicate-title checks cannot miss a later page.
    async listChildren(parent) {
      const items = [];
      let pageToken;
      do {
        const page = await listWikiChildren({ spaceId: parent.space_id, parentNodeToken: parent.node_token,
          pageSize: 50, pageToken }, { mcp });
        items.push(...page.items);
        pageToken = page.hasMore ? page.pageToken : null;
      } while (pageToken);
      return items;
    },
    /** Convert Markdown into native Docx blocks without creating a document. */
    convert: markdown => mcp.call(TOOLS.docxConvert, { data: { content_type: 'markdown', content: markdown } }),
    /** Create a Docx Wiki child beneath an already validated parent node. */
    async createNode(parent, title) {
      const data = await mcp.call(TOOLS.wikiCreateNode, { path: { space_id: parent.space_id },
        data: { obj_type: 'docx', node_type: 'origin', parent_node_token: parent.node_token, title } });
      if (!data.node || typeof data.node !== 'object') throw new Error('Official Lark MCP returned an invalid created Wiki node.');
      return data.node;
    },
    /** Write the converted block tree into the newly created Docx document. */
    insertBlocks(documentId, converted) {
      return mcp.call(TOOLS.docxCreateDescendants, { path: { document_id: documentId, block_id: documentId },
        params: { document_revision_id: -1 },
        data: { children_id: converted.first_level_block_ids, descendants: converted.blocks, index: 0 } });
    },
    /** Read blocks for post-write verification. */
    readBlocks: documentId => readDocumentBlocks(documentId, { mcp }),
  };
}

module.exports = { createOfficialPublicationApi };
