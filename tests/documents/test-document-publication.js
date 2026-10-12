const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { createDocumentPublisher } = require('../../integrations/lark/documents/document-publication');
const { createDraftStore } = require('../../integrations/lark/documents/draft-store');
const { createPublicationApi } = require('../../integrations/lark/documents/publication-api');
const { prepareConvertedContent, verifyContent } = require('../../integrations/lark/documents/publication-content');
const { registerDocumentPublicationTools } = require('../../runtime/registrations/register-document-publication-tools');

const origin = 'https://example.larksuite.com';
const input = { title: '驗樓預約指引', markdown: '# 驗樓\n\n資料來源：直播稿，第 2 頁。',
  parent_url: `${origin}/wiki/service`, location_reason: '服務指引位於服務分類。' };
const textBlock = (id, content, type = 2) => ({ block_id: id, block_type: type,
  [type === 3 ? 'heading1' : 'text']: { elements: [{ text_run: { content } }] } });

async function fixture(t) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'lemma-publication-'));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  const store = createDraftStore(directory);
  const env = { LARK_DOCUMENT_WIKI_ROOT_URL: `${origin}/wiki/root`, ENABLE_LARK_DOCUMENT_WRITES: 'true' };
  const nodes = new Map([
    ['root', { node_token: 'root', space_id: '123', title: '知識庫', parent_node_token: '', node_type: 'origin' }],
    ['service', { node_token: 'service', space_id: '123', title: '服務', parent_node_token: 'root', node_type: 'origin' }],
    ['outside', { node_token: 'outside', space_id: '123', title: '其他', parent_node_token: '', node_type: 'origin' }],
  ]);
  const calls = { create: 0, insert: 0 };
  let stored = [];
  const api = {
    getNode: async token => structuredClone(nodes.get(token)),
    listChildren: async parent => [...nodes.values()].filter(n => n.parent_node_token === parent.node_token),
    convert: async markdown => markdown === input.markdown
      ? { first_level_block_ids: ['heading', 'body'],
        blocks: [textBlock('heading', '驗樓', 3), textBlock('body', '資料來源：直播稿，第 2 頁。')] }
      : { first_level_block_ids: ['body'], blocks: [textBlock('body', markdown)] },
    createNode: async (parent, title) => {
      calls.create++;
      const node = { node_token: 'created', obj_token: 'document', obj_type: 'docx',
        title, parent_node_token: parent.node_token, space_id: parent.space_id };
      nodes.set(node.node_token, node);
      return structuredClone(node);
    },
    insertBlocks: async (documentId, converted) => {
      calls.insert++;
      const remap = id => `stored${id}`;
      stored = converted.blocks.map(block => {
        const copy = structuredClone(block);
        copy.block_id = remap(block.block_id);
        copy.parent_id = documentId;
        if (copy.children) copy.children = copy.children.map(remap);
        if (copy.table?.cells) copy.table.cells = copy.table.cells.map(remap);
        return copy;
      });
      stored.unshift({ block_id: documentId, block_type: 1, children: converted.first_level_block_ids.map(remap) });
    },
    readBlocks: async () => structuredClone(stored),
  };
  const options = { env, store, apiFactory: () => api };
  return { publisher: createDocumentPublisher(options), options, env, store, api, nodes, calls, directory,
    setBlocks: blocks => { stored = blocks; } };
}

test('preparation preserves UTF-8 body and location without any remote writes', async t => {
  const f = await fixture(t);
  const draft = await f.publisher.prepare(input);
  assert.equal(draft.mode, 'review');
  assert.equal(draft.markdown, input.markdown);
  assert.equal(draft.title, input.title);
  assert.deepEqual(draft.location.map(n => n.title), ['知識庫', '服務']);
  assert.deepEqual(f.calls, { create: 0, insert: 0 });
  assert.equal(draft.lark_data_changed, false);
});

test('missing approval and disabled writes stop before creating any document', async t => {
  const f = await fixture(t);
  const { draft_id } = await f.publisher.prepare(input);
  await assert.rejects(f.publisher.publish({ draft_id }), /Explicit approval/);
  f.env.ENABLE_LARK_DOCUMENT_WRITES = 'false';
  await assert.rejects(f.publisher.publish({ draft_id, approval_confirmed: true }), /disabled/);
  assert.equal(f.calls.create, 0);
});

test('approved publication verifies content and parent; repeats and restarts never create again', async t => {
  const f = await fixture(t);
  const { draft_id } = await f.publisher.prepare(input);
  const request = { draft_id, approval_confirmed: true };
  const result = await f.publisher.publish(request);
  assert.equal(result.success, true);
  assert.equal(result.document_url, `${origin}/wiki/created`);
  assert.equal(result.verification.complete, true);
  assert.equal(result.metadata_changed, false);
  const restarted = createDocumentPublisher({ ...f.options, store: createDraftStore(f.directory) });
  assert.equal((await restarted.publish(request)).success, true);
  assert.equal((await restarted.inspect({ draft_id })).success, true);
  assert.equal((await restarted.prepare(input)).state, 'verified');
  assert.deepEqual(f.calls, { create: 1, insert: 1 });
});

test('edits produce a different immutable draft; publish cannot substitute new body arguments', async t => {
  const f = await fixture(t);
  const before = await f.publisher.prepare(input);
  const after = await f.publisher.prepare({ ...input, markdown: '# 修訂' });
  assert.notEqual(before.draft_id, after.draft_id);
  await f.publisher.publish({ draft_id: before.draft_id, approval_confirmed: true, markdown: 'injected body' });
  assert.equal((await f.store.read(before.draft_id)).markdown, input.markdown);
  assert.equal((await f.store.read(after.draft_id)).state, 'prepared');
});

test('outside roots, foreign tenants and shortcut parents are rejected', async t => {
  const f = await fixture(t);
  await assert.rejects(f.publisher.prepare({ ...input, parent_url: `${origin}/wiki/outside` }), /outside/);
  await assert.rejects(f.publisher.prepare({ ...input, parent_url: 'https://other.larksuite.com/wiki/service' }), /tenant/);
  f.nodes.get('service').node_type = 'shortcut';
  await assert.rejects(f.publisher.prepare(input), /shortcut/);
  assert.equal(f.calls.create, 0);
});

test('changed root or renamed/moved destination requires another review', async t => {
  const f = await fixture(t);
  const { draft_id } = await f.publisher.prepare(input);
  f.nodes.get('service').title = '新服務分類';
  await assert.rejects(f.publisher.publish({ draft_id, approval_confirmed: true }), /path changed/);
  const updated = await f.publisher.prepare(input);
  assert.notEqual(updated.draft_id, draft_id);
  assert.equal(updated.location.at(-1).title, '新服務分類');
  f.env.LARK_DOCUMENT_WIKI_ROOT_URL = `${origin}/wiki/outside`;
  await assert.rejects(f.publisher.publish({ draft_id, approval_confirmed: true }), /root changed/);
  assert.equal(f.calls.create, 0);
});

test('same-name detection runs again immediately before creation', async t => {
  const f = await fixture(t);
  const { draft_id } = await f.publisher.prepare(input);
  f.nodes.set('duplicate', { title: input.title, parent_node_token: 'service' });
  await assert.rejects(f.publisher.publish({ draft_id, approval_confirmed: true }), /already exists/);
  await assert.rejects(f.publisher.prepare({ ...input, markdown: 'new body' }), /already exists/);
  assert.equal(f.calls.create, 0);
});

test('unsupported images fail before Wiki creation', async t => {
  const f = await fixture(t);
  f.api.convert = async () => ({ first_level_block_ids: ['image'], blocks: [{ block_id: 'image', block_type: 27, image: {} }] });
  await assert.rejects(f.publisher.prepare(input), /Unsupported/);
  assert.equal(f.calls.create, 0);
});

test('invalid drafts and unknown references stop without network mutations', async t => {
  const f = await fixture(t);
  for (const change of [{ title: ' ' }, { markdown: ' ' }, { markdown: '字'.repeat(40000) }]) {
    await assert.rejects(f.publisher.prepare({ ...input, ...change }), /Supply/);
  }
  await assert.rejects(f.publisher.publish({ draft_id: 'f'.repeat(64), approval_confirmed: true }), /unavailable/);
  f.env.LARK_DOCUMENT_WIKI_ROOT_URL = '';
  await assert.rejects(f.publisher.prepare(input), /Configure/);
  assert.equal(f.calls.create, 0);
});

test('uncertain creation is recorded durably and cannot be replayed or reset by prepare', async t => {
  const f = await fixture(t);
  f.api.createNode = async () => { f.calls.create++; throw new Error('Request timed out'); };
  const { draft_id } = await f.publisher.prepare(input);
  const request = { draft_id, approval_confirmed: true };
  assert.equal((await f.publisher.publish(request)).state, 'creation_started');
  assert.equal((await f.publisher.prepare(input)).state, 'creation_started');
  const result = await createDocumentPublisher(f.options).publish(request);
  assert.equal(result.success, false);
  assert.equal(result.automatic_retry_allowed, false);
  assert.equal(f.calls.create, 1);
});

test('failed content write retains the link, reports failure and never appends again', async t => {
  const f = await fixture(t);
  f.api.insertBlocks = async () => { f.calls.insert++; throw new Error('Permission denied'); };
  const { draft_id } = await f.publisher.prepare(input);
  const request = { draft_id, approval_confirmed: true };
  const result = await f.publisher.publish(request);
  assert.equal(result.success, false);
  assert.equal(result.document_url, `${origin}/wiki/created`);
  assert.equal(result.state, 'content_write_started');
  assert.equal((await f.publisher.publish(request)).success, false);
  assert.deepEqual(f.calls, { create: 1, insert: 1 });
});

test('a timed-out insert that succeeded can be verified without another write', async t => {
  const f = await fixture(t);
  const insert = f.api.insertBlocks;
  f.api.insertBlocks = async (...args) => { await insert(...args); throw new Error('Response lost'); };
  const { draft_id } = await f.publisher.prepare(input);
  assert.equal((await f.publisher.publish({ draft_id, approval_confirmed: true })).success, false);
  assert.equal((await f.publisher.inspect({ draft_id })).success, true);
  assert.equal((await f.publisher.publish({ draft_id, approval_confirmed: true })).success, true);
  assert.deepEqual(f.calls, { create: 1, insert: 1 });
});

test('read-back detects changed title, parent and body independently', async t => {
  const f = await fixture(t);
  const { draft_id } = await f.publisher.prepare(input);
  await f.publisher.publish({ draft_id, approval_confirmed: true });
  for (const [field, value] of [['title', 'wrong'], ['parent_node_token', 'root']]) {
    const original = f.nodes.get('created')[field];
    f.nodes.get('created')[field] = value;
    assert.equal((await f.publisher.inspect({ draft_id })).success, false);
    f.nodes.get('created')[field] = original;
  }
  f.setBlocks([{ block_id: 'document', block_type: 1, children: ['wrong'] }, textBlock('wrong', 'different')]);
  assert.equal((await f.publisher.inspect({ draft_id })).success, false);
});

test('tables are verified by dimensions, cell order and nested cell text, independent of IDs', () => {
  const converted = { first_level_block_ids: ['table'], blocks: [
    { block_id: 'table', block_type: 31, children: ['a', 'b'], table: { cells: ['a', 'b'],
      property: { row_size: 1, column_size: 2, merge_info: [{ row_span: 1, col_span: 1 }] } } },
    { block_id: 'a', block_type: 32, table_cell: {}, children: ['one'] },
    { block_id: 'b', block_type: 32, table_cell: {}, children: ['two'] },
    textBlock('one', '費用'), textBlock('two', 'HK$200'),
  ] };
  const { expected, converted: prepared } = prepareConvertedContent(converted);
  assert.equal(prepared.blocks[0].table.property.merge_info, undefined);
  const stored = [{ block_id: 'document', block_type: 1, children: ['table'] }, ...prepared.blocks];
  verifyContent(stored, 'document', expected);
  stored.at(-1).text.elements[0].text_run.content = 'HK$300';
  assert.throws(() => verifyContent(stored, 'document', expected), /differs/);
  assert.throws(() => prepareConvertedContent({ ...converted, blocks: converted.blocks.slice(0, -1) }), /Incomplete/);
  converted.blocks[0].table.property.merge_info[0].col_span = 2;
  assert.throws(() => prepareConvertedContent(converted), /Merged/);
});

test('read-back accepts server-split text runs but detects changed hyperlinks', () => {
  const block = textBlock('source', '來源連結');
  block.text.elements[0].text_run.text_element_style = { link: { url: 'https://example.com/source' } };
  const { expected } = prepareConvertedContent({ first_level_block_ids: ['source'], blocks: [block] });
  const first = structuredClone(block.text.elements[0]);
  const second = structuredClone(first);
  first.text_run.content = '來源';
  second.text_run.content = '連結';
  const actual = [{ block_id: 'document', block_type: 1, children: ['stored'] },
    { block_id: 'stored', block_type: 2, text: { elements: [first, second] } }];
  verifyContent(actual, 'document', expected);
  second.text_run.text_element_style.link.url = 'https://example.com/wrong';
  assert.throws(() => verifyContent(actual, 'document', expected), /differs/);
});

test('exclusive lock prevents concurrent publishing and inspection remains available after interruption', async t => {
  const f = await fixture(t);
  const { draft_id } = await f.publisher.prepare(input);
  await fs.writeFile(path.join(f.directory, 'publication.lock'), 'interrupted');
  await assert.rejects(f.publisher.publish({ draft_id, approval_confirmed: true }), /interruption/);
  assert.equal((await f.publisher.inspect({ draft_id })).success, false);
  assert.equal(f.calls.create, 0);
  await assert.rejects(f.store.read('../outside'), /Invalid internal/);
});

test('location discovery is read-only and reports crawl limits', async t => {
  const f = await fixture(t);
  const publisher = createDocumentPublisher({ ...f.options, crawl: async () => ({ truncated: true, tree: [] }) });
  const result = await publisher.prepare({ ...input, parent_url: undefined });
  assert.equal(result.mode, 'choose_location');
  assert.equal(result.locations.truncated, true);
  assert.equal(f.calls.create, 0);
});

test('native API sends correct Wiki/Markdown/nested-block bodies and reads every page with one token', async () => {
  const calls = [];
  let tokens = 0;
  const api = createPublicationApi({ getToken: async () => { tokens++; return 'fixture'; },
    fetchImpl: async (url, options) => {
      const parsed = new URL(url);
      const body = options.body ? JSON.parse(options.body) : undefined;
      calls.push({ path: parsed.pathname, method: options.method, body });
      let data;
      if (options.method === 'POST') data = { node: {} };
      else data = { items: [{ block_id: parsed.searchParams.has('page_token') ? 'two' : 'one' }],
        has_more: !parsed.searchParams.has('page_token'), page_token: 'next' };
      return new Response(JSON.stringify({ code: 0, data }));
    } });
  await api.convert('# 驗樓');
  await api.createNode({ space_id: '123', node_token: 'service' }, input.title);
  await api.insertBlocks('doc', { first_level_block_ids: ['first'], blocks: [textBlock('first', '文字')] });
  assert.equal((await api.readBlocks('doc')).length, 2);
  assert.equal(tokens, 1);
  assert.deepEqual(calls[0].body, { content_type: 'markdown', content: '# 驗樓' });
  assert.deepEqual(calls[1].body, { obj_type: 'docx', node_type: 'origin', parent_node_token: 'service', title: input.title });
  assert.match(calls[2].path, /\/blocks\/doc\/descendant$/);
  assert.deepEqual(calls[2].body.children_id, ['first']);
  assert.equal(calls[2].body.index, 0);
  assert.equal(calls.some(call => call.path.includes('bitable')), false);
});

test('API errors omit private payloads and mutating requests are not retried', async () => {
  let calls = 0;
  const api = createPublicationApi({ getToken: async () => 'fixture', fetchImpl: async () => {
    calls++;
    return new Response(JSON.stringify({ code: 999, msg: 'SECRET private text' }));
  } });
  await assert.rejects(api.createNode({ space_id: '123', node_token: 'parent' }, 'title'), error => {
    assert.equal(error.message.includes('SECRET'), false);
    assert.match(error.message, /code 999/);
    return true;
  });
  assert.equal(calls, 1);
});

test('incomplete pagination and private auth errors cannot become successful reads', async () => {
  const api = createPublicationApi({ getToken: async () => 'fixture', fetchImpl: async () =>
    new Response(JSON.stringify({ code: 0, data: { items: [], has_more: true, page_token: 'repeated' } })) });
  await assert.rejects(api.readBlocks('doc'), /pagination/);
  const denied = createPublicationApi({ getToken: async () => { throw new Error('SECRET auth payload'); } });
  await assert.rejects(denied.convert('body'), error => {
    assert.match(error.message, /authentication failed/);
    assert.equal(error.message.includes('SECRET'), false);
    return true;
  });
});

test('MCP registration exposes exact approval schema and reports write failures as errors', async () => {
  const tools = new Map();
  registerDocumentPublicationTools({ registerTool: (name, definition, handler) => tools.set(name, { definition, handler }) },
    { publish: async () => ({ success: false, state: 'creation_started' }) });
  assert.deepEqual([...tools.keys()], ['prepare_knowledge_document', 'publish_approved_document', 'inspect_document_publication']);
  const { definition, handler } = tools.get('publish_approved_document');
  assert.equal(definition.inputSchema.approval_confirmed.safeParse(false).success, false);
  assert.equal(definition.annotations.readOnlyHint, false);
  assert.equal((await handler({})).isError, true);
});
