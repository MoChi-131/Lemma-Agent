// Converts one crawl inventory into stable, subtree-relative metadata records.
/** Flatten a Wiki tree while retaining each node's ancestry and retrieval timestamp. */
function flattenWikiMetadata(inventory, retrievedAt = new Date().toISOString()) {
  const queue = [{ node: inventory.root, ancestors: [] }];
  const result = [];
  for (let i = 0; i < queue.length; i++) {
    const { node, ancestors } = queue[i];
    const { children, ...fields } = node;
    const path = [...ancestors, { node_token: node.node_token, title: node.title, url: node.url }];
    result.push({ ...fields, metadata_version: "1", depth: ancestors.length,
      path, scope_root_url: inventory.root.url, retrieved_at: retrievedAt });
    for (const child of (i === 0 ? inventory.tree : children) || []) {
      queue.push({ node: child, ancestors: path });
    }
  }
  return result;
}
module.exports = { flattenWikiMetadata };
