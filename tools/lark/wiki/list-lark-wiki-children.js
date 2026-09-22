const { listWikiChildren } = require('../../../integrations/lark/wiki/wiki');

function normalizeNode(item) {
  return {
    title: item.title,
    node_token: item.node_token,
    obj_token: item.obj_token,
    obj_type: item.obj_type,
    parent_node_token: item.parent_node_token || null,
    has_child: Boolean(item.has_child),
    space_id: item.space_id,
    url: item.url || null,
    node_create_time: item.node_create_time || null,
    obj_edit_time: item.obj_edit_time || null,
    owner: item.owner || null,
  };
}

async function listLarkWikiChildrenTool({
  space_id,
  parent_node_token,
  page_size = 50,
  page_token,
}) {
  if (!space_id) throw new Error('space_id is required');
  if (!parent_node_token) throw new Error('parent_node_token is required');

  const result = await listWikiChildren({
    spaceId: space_id,
    parentNodeToken: parent_node_token,
    pageSize: page_size,
    pageToken: page_token,
  });

  return {
    success: true,
    source: 'lark',
    action: 'list_wiki_children',
    space_id,
    parent_node_token,
    items: result.items.map(normalizeNode),
    has_more: result.hasMore,
    page_token: result.pageToken,
  };
}

module.exports = { listLarkWikiChildrenTool };
