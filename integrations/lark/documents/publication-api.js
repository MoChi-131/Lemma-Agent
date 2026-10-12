const { getTenantAccessToken } = require('../core/auth');

/** A publication uses one token. Mutating requests are never retried here. */
function createPublicationApi({ fetchImpl = fetch, getToken = getTenantAccessToken } = {}) {
  let token;
  async function request(path, method = 'GET', body) {
    if (!token) {
      try { token = await getToken({ signal: AbortSignal.timeout(30000) }); }
      catch { throw new Error('Lark authentication failed. Check the application credentials and permissions.'); }
    }
    const response = await fetchImpl(`https://open.larksuite.com/open-apis/${path}`, {
      method,
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      signal: AbortSignal.timeout(30000),
    });
    let result;
    try { result = await response.json(); }
    catch { throw new Error(`Lark ${method} returned an unreadable response (HTTP ${response.status}).`); }
    if (!response.ok || result.code !== 0 || !result.data) {
      // Do not echo API payloads, which can contain private text or credentials.
      throw new Error(`Lark ${method} failed (HTTP ${response.status}, code ${Number(result.code) || 'unknown'}).`);
    }
    return result.data;
  }

  async function pages(path, params, key) {
    const items = [];
    const seen = new Set();
    for (let page = 0; page < 100; page++) {
      const data = await request(`${path}?${params}`);
      if (!Array.isArray(data[key]) || typeof data.has_more !== 'boolean') throw new Error('Invalid Lark list response.');
      items.push(...data[key]);
      if (!data.has_more) return items;
      if (!data.page_token || seen.has(data.page_token)) throw new Error('Incomplete Lark pagination.');
      seen.add(data.page_token);
      params.set('page_token', data.page_token);
    }
    throw new Error('Lark pagination limit reached; cannot confirm a complete read.');
  }

  return {
    async getNode(token) {
      return (await request(`wiki/v2/spaces/get_node?token=${encodeURIComponent(token)}`)).node;
    },
    listChildren(node) {
      return pages(`wiki/v2/spaces/${encodeURIComponent(node.space_id)}/nodes`,
        new URLSearchParams({ parent_node_token: node.node_token, page_size: '50' }), 'items');
    },
    convert(markdown) {
      return request('docx/v1/documents/blocks/convert', 'POST', { content_type: 'markdown', content: markdown });
    },
    async createNode(parent, title) {
      return (await request(`wiki/v2/spaces/${encodeURIComponent(parent.space_id)}/nodes`, 'POST', {
        obj_type: 'docx', node_type: 'origin', parent_node_token: parent.node_token, title,
      })).node;
    },
    insertBlocks(documentId, converted) {
      const id = encodeURIComponent(documentId);
      return request(`docx/v1/documents/${id}/blocks/${id}/descendant?document_revision_id=-1`, 'POST', {
        children_id: converted.first_level_block_ids, descendants: converted.blocks, index: 0,
      });
    },
    readBlocks(documentId) {
      return pages(`docx/v1/documents/${encodeURIComponent(documentId)}/blocks`,
        new URLSearchParams({ document_revision_id: '-1', page_size: '500' }), 'items');
    },
  };
}

module.exports = { createPublicationApi };
