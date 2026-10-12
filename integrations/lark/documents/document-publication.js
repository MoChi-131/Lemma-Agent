const { createHash } = require('node:crypto');
const { createPublicationApi } = require('./publication-api');
const { createDraftStore } = require('./draft-store');
const { prepareConvertedContent, verifyContent } = require('./publication-content');
const { validateCrawlInput, crawlWikiTree } = require('../wiki/wiki-tree');

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

/** Check ancestry directly, so a large Wiki tree does not require a full inventory. */
async function resolveParent(api, rootUrl, parentUrl) {
  const root = wikiUrl(rootUrl);
  const parent = wikiUrl(parentUrl);
  if (parent.origin !== root.origin) throw new Error('Location must belong to the configured Wiki tenant.');
  const path = [];
  const seen = new Set();
  let token = parent.token;
  let selected;
  for (let depth = 0; depth <= 20 && token; depth++) {
    if (seen.has(token)) throw new Error('Wiki ancestry contains a cycle.');
    seen.add(token);
    const node = validateNode(await api.getNode(token), token);
    selected ||= node;
    if (node.space_id !== selected.space_id || (node.node_type && node.node_type !== 'origin')) {
      throw new Error('Use an original Wiki node in the configured space, not a shortcut.');
    }
    path.unshift({ title: node.title, url: `${root.origin}/wiki/${token}` });
    if (token === root.token) return { node: selected, path, url: parent.url };
    token = node.parent_node_token;
  }
  throw new Error('Location is outside the configured Wiki subtree or its ancestry cannot be confirmed.');
}

async function checkDuplicate(api, parent, title) {
  const children = await api.listChildren(parent);
  if (children.some(node => node.title?.trim().normalize('NFC') === title.normalize('NFC'))) {
    throw new Error('A document with this title already exists at the selected location. Review it or choose another title.');
  }
}

function reviewResult(draft) {
  return {
    success: true, mode: 'review', draft_id: draft.draft_id, state: draft.state,
    title: draft.title, markdown: draft.markdown, parent_url: draft.parent_url,
    location: draft.parent_path, location_reason: draft.location_reason,
    block_count: draft.converted.blocks.length, lark_data_changed: false,
    approval_required: draft.state === 'prepared',
    requires_inspection: draft.state !== 'prepared',
  };
}

function publicationResult(draft, verified, error) {
  return {
    success: verified, mode: 'publication', draft_id: draft.draft_id,
    state: verified ? 'verified' : draft.state, title: draft.title,
    document_url: draft.node ? `${new URL(draft.parent_url).origin}/wiki/${draft.node.node_token}` : null,
    verification: { complete: verified, title_matches: verified, parent_matches: verified, content_matches: verified },
    metadata_changed: false,
    ...(error ? { error, automatic_retry_allowed: false } : {}),
  };
}

async function verifyDraft(api, draft, rootUrl) {
  if (!draft.node) throw new Error('No confirmed document reference. Inspect the selected Wiki location; do not repeat creation.');
  await resolveParent(api, rootUrl, draft.parent_url);
  const node = validateNode(await api.getNode(draft.node.node_token), draft.node.node_token);
  if (node.title !== draft.title || node.parent_node_token !== draft.parent_token ||
      node.space_id !== draft.space_id || node.obj_type !== 'docx' || node.obj_token !== draft.node.obj_token) {
    throw new Error('Read-back title, location or document identity differs from the reviewed draft.');
  }
  verifyContent(await api.readBlocks(node.obj_token), node.obj_token, draft.expected);
}

function createDocumentPublisher({
  env = process.env, apiFactory = createPublicationApi, store = createDraftStore(), crawl = crawlWikiTree,
} = {}) {
  function rootUrl() {
    if (!env.LARK_DOCUMENT_WIKI_ROOT_URL) throw new Error('Configure LARK_DOCUMENT_WIKI_ROOT_URL before preparing a publication.');
    return wikiUrl(env.LARK_DOCUMENT_WIKI_ROOT_URL).url;
  }

  return {
    async prepare({ title, markdown, parent_url, location_reason = '' }) {
      const root = rootUrl();
      if (!title?.trim() || title.trim().length > 200 || /[\r\n]/.test(title) ||
          typeof markdown !== 'string' || !markdown.trim() || Buffer.byteLength(markdown, 'utf8') > 100000) {
        throw new Error('Supply a nonempty title (up to 200 characters) and Markdown body (up to 100 KB).');
      }
      if (!parent_url) {
        const locations = await crawl({ url: root, max_depth: 6, max_nodes: 200 });
        return { success: true, mode: 'choose_location', wiki_root_url: root, locations,
          message: 'Suggest an existing location, then prepare again with its parent_url. No Lark document was created.' };
      }
      const api = apiFactory();
      const parent = await resolveParent(api, root, parent_url);
      title = title.trim();
      const draftId = createHash('sha256').update(JSON.stringify([root, parent.path, title, markdown])).digest('hex');
      return store.withLock(async () => {
        const existing = await store.read(draftId);
        // Re-preparing the same draft must not erase a previous write receipt.
        if (existing) return reviewResult(existing);
        await checkDuplicate(api, parent.node, title);
        const content = prepareConvertedContent(await api.convert(markdown));
        const draft = {
          draft_id: draftId, state: 'prepared', title, markdown, location_reason,
          root_url: root, parent_url: parent.url, parent_token: parent.node.node_token,
          space_id: parent.node.space_id, parent_path: parent.path,
          ...content, created_at: new Date().toISOString(),
        };
        await store.save(draft);
        return reviewResult(draft);
      });
    },

    async publish({ draft_id, approval_confirmed }) {
      if (approval_confirmed !== true) throw new Error('Explicit approval of the final title, body and location is required.');
      if (env.ENABLE_LARK_DOCUMENT_WRITES !== 'true') throw new Error('Document writing is disabled; set ENABLE_LARK_DOCUMENT_WRITES=true to enable approved publishing.');
      const root = rootUrl();
      return store.withLock(async () => {
        const draft = await store.read(draft_id);
        if (!draft) throw new Error('The reviewed draft is unavailable. Prepare it again for review.');
        if (root !== draft.root_url) throw new Error('The publishing root changed. Prepare and review the destination again.');
        const api = apiFactory();
        if (draft.state !== 'prepared') {
          // A repeated call can inspect the original write, but cannot send another POST.
          try {
            await verifyDraft(api, draft, root);
            draft.state = 'verified';
            await store.save(draft);
            return publicationResult(draft, true);
          } catch (error) { return publicationResult(draft, false, error.message); }
        }
        const parent = await resolveParent(api, root, draft.parent_url);
        if (JSON.stringify(parent.path) !== JSON.stringify(draft.parent_path)) {
          throw new Error('The suggested Wiki path changed. Prepare it again for human review.');
        }
        await checkDuplicate(api, parent.node, draft.title);
        // Persist before each mutation: a crash or timeout cannot restart the write.
        draft.state = 'creation_started';
        await store.save(draft);
        try {
          const node = await api.createNode(parent.node, draft.title);
          if (!node || !/^[a-zA-Z0-9]+$/.test(node.node_token) || !/^[a-zA-Z0-9]+$/.test(node.obj_token) ||
              node.obj_type !== 'docx' || node.space_id !== draft.space_id ||
              node.parent_node_token !== draft.parent_token || node.title !== draft.title) {
            throw new Error('Wiki creation returned an unconfirmed document identity. Inspect the location before any further action.');
          }
          draft.node = { node_token: node.node_token, obj_token: node.obj_token };
          draft.state = 'content_write_started';
          await store.save(draft);
          await api.insertBlocks(node.obj_token, draft.converted);
          draft.state = 'verification_pending';
          await store.save(draft);
          await verifyDraft(api, draft, root);
          draft.state = 'verified';
          await store.save(draft);
          return publicationResult(draft, true);
        } catch (error) {
          return publicationResult(draft, false, error.message);
        }
      });
    },

    async inspect({ draft_id }) {
      const draft = await store.read(draft_id);
      if (!draft) throw new Error('No local draft receipt was found.');
      const root = rootUrl();
      if (draft.root_url !== root) throw new Error('The publishing root differs from the stored draft.');
      try {
        await verifyDraft(apiFactory(), draft, root);
        return publicationResult(draft, true);
      } catch (error) { return publicationResult(draft, false, error.message); }
    },
  };
}

module.exports = { createDocumentPublisher };
