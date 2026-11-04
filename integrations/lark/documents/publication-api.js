const { officialMcp, TOOLS } = require('../official-mcp/client');
const { getWikiNode, listWikiChildren } = require('../wiki/wiki');
const { readDocumentBlocks } = require('../core/documents');

/** Official MCP adapter for publication. */
function createOfficialPublicationApi({ mcp = officialMcp } = {}) {
  return {
    getNode: token => getWikiNode(token, {}, { mcp }),
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
    convert: markdown => mcp.call(TOOLS.docxConvert, { data: { content_type: 'markdown', content: markdown } }),
    async createNode(parent, title) {
      const data = await mcp.call(TOOLS.wikiCreateNode, { path: { space_id: parent.space_id },
        data: { obj_type: 'docx', node_type: 'origin', parent_node_token: parent.node_token, title } });
      if (!data.node || typeof data.node !== 'object') throw new Error('Official Lark MCP returned an invalid created Wiki node.');
      return data.node;
    },
    insertBlocks(documentId, converted) {
      return mcp.call(TOOLS.docxCreateDescendants, { path: { document_id: documentId, block_id: documentId },
        params: { document_revision_id: -1 },
        data: { children_id: converted.first_level_block_ids, descendants: converted.blocks, index: 0 } });
    },
    readBlocks: documentId => readDocumentBlocks(documentId, { mcp }),
  };
}

module.exports = { createOfficialPublicationApi };
