const { officialMcp, TOOLS } = require('../official-mcp/client');

// Intersection of metadata and permission-check types.
const TYPES = new Set(['doc', 'sheet', 'file', 'wiki', 'bitable', 'docx', 'mindnote']);

async function inspectFileAccess({ token, type }, { mcp = officialMcp } = {}) {
  if (typeof token !== 'string' || !/^[A-Za-z0-9]+$/.test(token) || !TYPES.has(type)) {
    throw new Error('Provide a Lark file token and supported file type.');
  }
  const [metadata, permission] = await Promise.all([
    mcp.call(TOOLS.driveMetadata, { data: { request_docs: [{ doc_token: token, doc_type: type }], with_url: true } }),
    mcp.call(TOOLS.driveViewPermission, { path: { token }, params: { type, action: 'view' } }),
  ]);
  const item = metadata.metas?.[0] || metadata.docs?.[0];
  if (!item || typeof item !== 'object') throw new Error('Lark file metadata was unavailable.');
  const canView = permission.auth_result ?? permission.has_permission ?? permission.permission?.view;
  if (typeof canView !== 'boolean') throw new Error('Lark file permission result was invalid.');
  return {
    success: true, token, type,
    title: typeof item.title === 'string' ? item.title : null,
    url: typeof item.url === 'string' ? item.url : null,
    created_time: item.create_time || null,
    modified_time: item.latest_modify_time || item.modified_time || null,
    app_can_view: canView,
  };
}

module.exports = { inspectFileAccess };
