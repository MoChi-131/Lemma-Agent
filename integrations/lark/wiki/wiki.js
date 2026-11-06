// Wraps approved official-MCP Wiki calls with Lemma's validation and naming.
const { officialMcp, TOOLS } = require('../official-mcp/client');

/** Extract the Wiki node token from a user-supplied Lark Wiki URL. */
function extractWikiToken(url) {
  const match = url.match(/\/wiki\/([^/?#]+)/);

  if (!match) {
    throw new Error("Invalid Lark Wiki URL");
  }

  return match[1];
}

/** Resolve one Wiki node to its Lark object metadata. */
async function getWikiNode(wikiToken, { signal } = {}, { mcp = officialMcp } = {}) {
  const data = await mcp.call(TOOLS.wikiNode, { params: { token: wikiToken } }, { signal });
  if (!data.node || typeof data.node.obj_token !== 'string' || typeof data.node.obj_type !== 'string') {
    throw new Error('Official Lark MCP returned an invalid Wiki node.');
  }
  return data.node;
}

/** Read and normalize one validated page of direct children for a Wiki node. */
async function listWikiChildren({
  spaceId,
  parentNodeToken,
  pageSize = 50,
  pageToken,
  signal,
}, { mcp = officialMcp } = {}) {
  const data = await mcp.call(TOOLS.wikiChildren, {
    path: { space_id: spaceId },
    params: {
      parent_node_token: parentNodeToken, page_size: pageSize,
      ...(pageToken ? { page_token: pageToken } : {}),
    },
  }, { signal });
  if ((data.items !== undefined && !Array.isArray(data.items)) || typeof data.has_more !== 'boolean') {
    throw new Error('Official Lark MCP returned an invalid Wiki children page.');
  }
  if (data.has_more && (typeof data.page_token !== 'string' || !data.page_token || data.page_token === pageToken)) {
    throw new Error('Official Lark MCP returned an invalid Wiki pagination cursor.');
  }
  return {
    items: data.items || [],
    hasMore: data.has_more,
    pageToken: data.page_token || null,
  };
}

module.exports = {
  extractWikiToken,
  getWikiNode,
  listWikiChildren,
};
