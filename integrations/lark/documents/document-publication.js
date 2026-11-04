const { createOfficialPublicationApi } = require('./publication-api');
const { prepareConvertedContent, verifyContent } = require('./publication-content');
const { validateCrawlInput } = require('../wiki/wiki-tree');
const { getWikiNode } = require('../wiki/wiki');
const { readDocumentBlocks } = require('../core/documents');
const { officialMcp } = require('../official-mcp/client');

function wikiUrl(url) {
  const { origin, token } = validateCrawlInput({ url });
  return { origin, token, url: `${origin}/wiki/${token}` };
}

function validateNode(node, token) {
  if (!node || node.node_token !== token || !/^\d+$/.test(node.space_id) ||
      typeof node.title !== 'string' || typeof node.parent_node_token !== 'string') {
    throw new Error('Invalid Wiki location metadata.');
  }
  return node;
}

async function resolveParent(api, rootUrl, parentUrl) {
  const root = wikiUrl(rootUrl);
  const parent = wikiUrl(parentUrl);
  if (parent.origin !== root.origin) throw new Error('Location must belong to the configured Wiki tenant.');
  const rootNode = validateNode(await api.getNode(root.token), root.token);
  const seen = new Set();
  let token = parent.token;
  let selected;
  for (let depth = 0; depth <= 20 && token; depth++) {
    if (seen.has(token)) throw new Error('Wiki ancestry contains a cycle.');
    seen.add(token);
    const node = validateNode(await api.getNode(token), token);
    selected ||= node;
    if (node.space_id !== rootNode.space_id || (node.node_type && node.node_type !== 'origin')) {
      throw new Error('Use an original Wiki node in the configured space, not a shortcut.');
    }
    if (token === root.token) return { node: selected, url: parent.url };
    token = node.parent_node_token;
  }
  throw new Error('Location is outside the configured Wiki subtree or its ancestry cannot be confirmed.');
}

function createPublicationReadApi({ mcp = officialMcp } = {}) {
  return {
    getNode: token => getWikiNode(token, {}, { mcp }),
    readBlocks: documentId => readDocumentBlocks(documentId, { mcp }),
  };
}

function createDocumentPublisher({ env = process.env, apiFactory = createOfficialPublicationApi,
  readApiFactory = () => createPublicationReadApi() } = {}) {
  function rootUrl() {
    if (!env.LARK_DOCUMENT_WIKI_ROOT_URL) throw new Error('Configure LARK_DOCUMENT_WIKI_ROOT_URL before publishing.');
    return wikiUrl(env.LARK_DOCUMENT_WIKI_ROOT_URL).url;
  }

  return {
    async publishSimple({ title, markdown, parent_url, approval_confirmed }) {
      if (approval_confirmed !== true) throw new Error('Set approval_confirmed=true to create the document.');
      if (env.ENABLE_LARK_DOCUMENT_WRITES !== 'true') throw new Error('Document writing is disabled; set ENABLE_LARK_DOCUMENT_WRITES=true.');
      if (!title?.trim() || title.trim().length > 200 || /[\r\n]/.test(title) || typeof markdown !== 'string' ||
          !markdown.trim() || Buffer.byteLength(markdown, 'utf8') > 100000 || !parent_url) {
        throw new Error('Supply title, Markdown body and an existing Wiki parent URL.');
      }
      title = title.trim();
      const api = apiFactory();
      const parent = await resolveParent(api, rootUrl(), parent_url);
      const children = await api.listChildren(parent.node);
      if (children.some(node => node.title?.trim().normalize('NFC') === title.normalize('NFC'))) {
        throw new Error('A document with this title already exists at the selected location.');
      }
      const content = prepareConvertedContent(await api.convert(markdown));
      const node = await api.createNode(parent.node, title);
      if (!node || node.obj_type !== 'docx' || node.parent_node_token !== parent.node.node_token ||
          node.space_id !== parent.node.space_id || node.title !== title) {
        throw new Error('Created Wiki node could not be verified.');
      }
      await api.insertBlocks(node.obj_token, content.converted);
      const readApi = readApiFactory();
      const confirmed = validateNode(await readApi.getNode(node.node_token), node.node_token);
      if (confirmed.title !== title || confirmed.parent_node_token !== parent.node.node_token || confirmed.obj_token !== node.obj_token) {
        throw new Error('Read-back title, location or document identity differs from the created document.');
      }
      verifyContent(await readApi.readBlocks(node.obj_token), node.obj_token, content.expected);
      return { success: true, state: 'verified', title, document_url: `${new URL(parent.url).origin}/wiki/${node.node_token}`,
        verification: { complete: true, title_matches: true, parent_matches: true, content_matches: true } };
    },

    async inspectSimple({ url }) {
      const root = wikiUrl(rootUrl());
      const target = wikiUrl(url);
      if (target.origin !== root.origin) throw new Error('Document must belong to the configured Wiki tenant.');
      const node = validateNode(await readApiFactory().getNode(target.token), target.token);
      return { success: true, mode: 'inspection', document_url: target.url, title: node.title, obj_type: node.obj_type,
        obj_token: node.obj_token, parent_node_token: node.parent_node_token, space_id: node.space_id };
    },
  };
}

module.exports = { createDocumentPublisher, createPublicationReadApi };
