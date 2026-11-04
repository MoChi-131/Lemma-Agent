const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createDocumentPublisher } = require('../../integrations/lark/documents/document-publication');
const { registerDocumentPublicationTools } = require('../../runtime/registrations/register-document-publication-tools');

const origin = 'https://example.larksuite.com';
const input = { title: 'Release note', markdown: '# Release note\n\nReady.', parent_url: `${origin}/wiki/parent`, approval_confirmed: true };
const textBlock = (id, content, type = 2) => ({ block_id: id, block_type: type,
  [type === 3 ? 'heading1' : 'text']: { elements: [{ text_run: { content } }] } });

function fixture() {
  const nodes = new Map([
    ['root', { node_token: 'root', space_id: '123', title: 'Root', parent_node_token: '', node_type: 'origin' }],
    ['parent', { node_token: 'parent', space_id: '123', title: 'Parent', parent_node_token: 'root', node_type: 'origin' }],
  ]);
  let stored = [];
  const calls = { create: 0, insert: 0 };
  const api = {
    getNode: async token => structuredClone(nodes.get(token)),
    listChildren: async parent => [...nodes.values()].filter(node => node.parent_node_token === parent.node_token),
    convert: async () => ({ first_level_block_ids: ['heading', 'body'], blocks: [textBlock('heading', 'Release note', 3), textBlock('body', 'Ready.')] }),
    createNode: async (parent, title) => {
      calls.create++;
      const node = { node_token: 'created', obj_token: 'document', obj_type: 'docx', title, parent_node_token: parent.node_token, space_id: parent.space_id };
      nodes.set(node.node_token, node);
      return structuredClone(node);
    },
    insertBlocks: async (documentId, converted) => {
      calls.insert++;
      stored = [{ block_id: documentId, block_type: 1, children: converted.first_level_block_ids }, ...converted.blocks];
    },
  };
  const readApi = { getNode: api.getNode, readBlocks: async () => structuredClone(stored) };
  const env = { LARK_DOCUMENT_WIKI_ROOT_URL: `${origin}/wiki/root`, ENABLE_LARK_DOCUMENT_WRITES: 'true' };
  return { publisher: createDocumentPublisher({ env, apiFactory: () => api, readApiFactory: () => readApi }), calls, env, nodes };
}

test('publishes once through the official-MCP-shaped API and verifies read-back', async () => {
  const f = fixture();
  const result = await f.publisher.publishSimple(input);
  assert.equal(result.success, true);
  assert.equal(result.state, 'verified');
  assert.equal(result.document_url, `${origin}/wiki/created`);
  assert.deepEqual(f.calls, { create: 1, insert: 1 });
});

test('validates confirmation, write switch, root and duplicate title before creating', async () => {
  const f = fixture();
  await assert.rejects(f.publisher.publishSimple({ ...input, approval_confirmed: false }), /approval_confirmed/);
  f.env.ENABLE_LARK_DOCUMENT_WRITES = 'false';
  await assert.rejects(f.publisher.publishSimple(input), /disabled/);
  f.env.ENABLE_LARK_DOCUMENT_WRITES = 'true';
  await assert.rejects(f.publisher.publishSimple({ ...input, parent_url: `${origin}/wiki/outside` }), /metadata/);
  f.nodes.set('duplicate', { node_token: 'duplicate', parent_node_token: 'parent', title: input.title });
  await assert.rejects(f.publisher.publishSimple(input), /already exists/);
  assert.equal(f.calls.create, 0);
});

test('inspects a known document without creating or modifying it', async () => {
  const f = fixture();
  const result = await f.publisher.inspectSimple({ url: `${origin}/wiki/root` });
  assert.equal(result.success, true);
  assert.equal(result.title, 'Root');
  assert.deepEqual(f.calls, { create: 0, insert: 0 });
});

test('registration exposes only simple publish and URL inspection', async () => {
  const tools = new Map();
  registerDocumentPublicationTools({ registerTool: (name, definition, handler) => tools.set(name, { definition, handler }) },
    { publishSimple: async () => ({ success: false }), inspectSimple: async () => ({ success: true }) });
  assert.deepEqual([...tools.keys()], ['publish_approved_document', 'inspect_document_publication']);
  assert.equal(tools.get('publish_approved_document').definition.inputSchema.approval_confirmed.safeParse(false).success, false);
});
