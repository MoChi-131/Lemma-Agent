const TOOLS = Object.freeze({
  // Read-only knowledge retrieval.
  wikiNode: 'wiki.v2.space.getNode',
  wikiChildren: 'wiki.v2.spaceNode.list',
  baseRecords: 'bitable.v1.appTableRecord.list',
  rawContent: 'docx.v1.document.rawContent',
  blocks: 'docx.v1.documentBlock.list',
  whiteboardNodes: 'board.v1.whiteboardNode.list',
  driveMetadata: 'drive.v1.meta.batchQuery',
  driveViewPermission: 'drive.v1.permissionMember.auth',
  // Explicit document publication operations. These are exposed only through
  // Lemma's guarded public write tool, never directly to ChatGPT.
  docxConvert: 'docx.v1.document.convert',
  docxCreate: 'docx.v1.document.create',
  docxCreateDescendants: 'docx.v1.documentBlockDescendant.create',
  wikiCreateNode: 'wiki.v2.spaceNode.create',
  wikiMoveNode: 'wiki.v2.spaceNode.move',
  wikiMoveDocumentToWiki: 'wiki.v2.spaceNode.moveDocsToWiki',
});
module.exports = { TOOLS };
