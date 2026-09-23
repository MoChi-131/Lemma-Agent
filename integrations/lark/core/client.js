const { extractWikiToken, getWikiNode } = require("../wiki/wiki");
const {
  readDocument,
} = require("./documents");

async function resolveDocument(url) {
  if (!url.includes("/wiki/")) {
    throw new Error("Currently only Lark Wiki URLs are supported.");
  }

  const wikiToken = extractWikiToken(url);
  const node = await getWikiNode(wikiToken);

  if (node.obj_type !== "docx") {
    throw new Error(
      `Unsupported Lark object type: ${node.obj_type}`
    );
  }

  return {
    documentId: node.obj_token,
    title: node.title,
    type: node.obj_type,
  };
}

async function readLarkDocument(url) {
  const { documentId } = await resolveDocument(url);
  return readDocument(documentId);
}

module.exports = {
  resolveDocument,
  readLarkDocument,
};
