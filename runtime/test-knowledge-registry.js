const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readKnowledgeRegistry, getKnowledgeMetadata } = require('../integrations/lark/knowledge-registry');
// Inject fake API functions: these tests need no credentials and make no network calls.
test('reads paginated Base through Wiki using only GET requests', async () => {
  // Two pages verify cursor following and that a view cannot hide lookup records.
  let calls = 0;
  const rows = await readKnowledgeRegistry({}, {
    getWikiNode: async () => ({ obj_type: 'bitable', obj_token: 'base123' }),
    getToken: async () => 'secret',
    fetch: async (url, options) => {
      assert.equal(options.method, undefined);
      assert.ok(!url.includes('view_id'));
      calls++;
      if (calls === 2) assert.ok(url.includes('page_token=next'));
      return { ok: true, json: async () => ({ code: 0, data: { items: [{ record_id: String(calls), fields: {} }], has_more: calls === 1, page_token: 'next' } }) };
    },
  });
  assert.equal(rows.length, 2);
});
test('lookup preserves missing fields and Pending; absent row differs from failure', async () => {
  // A matched incomplete record, no match, and a failed request are distinct outcomes.
  const read = async () => [{ record_id: '1', fields: { Title: [{ text: '測試' }], 'Lark URL': { link: 'https://example.com/doc' }, Scope: 'Knowledge Base', 'Document Type': 'SOP' } }];
  const result = await getKnowledgeMetadata({ url: 'https://example.com/doc' }, { read });
  assert.equal(result.found, true);
  assert.equal(result.documents[0].metadata.version, null);
  assert.ok(result.documents[0].missing_fields.includes('version'));
  assert.equal(result.documents[0].validation_status, 'invalid');
  assert.equal((await getKnowledgeMetadata({ url: 'https://example.com/missing' }, { read })).found, false);
  const external = await getKnowledgeMetadata({}, { read: async () => [{ fields: { Scope: 'External Reference', 'Whitelist Status': 'Pending' } }] });
  assert.equal(external.documents[0].external_source_approved, false);
  const complete = await getKnowledgeMetadata({}, { read: async () => [{ fields: {
    Title: 'External guide', Scope: 'External Reference', 'Primary Domain': 'Property',
    'Document Type': 'Guide', 'Authority Level': 'External Official',
    'Source Domain': 'example.com', 'Whitelist Status': 'Pending',
  } }] });
  // Complete metadata can still describe an unapproved external source.
  assert.equal(complete.documents[0].validation_status, 'valid');
  assert.equal(complete.documents[0].external_source_approved, false);
  await assert.rejects(getKnowledgeMetadata({}, { read: async () => { throw Error('failure'); } }));
});
test('pagination failure never returns incomplete records or secrets', async () => {
  // has_more without a next cursor must reject rather than return partial success.
  await assert.rejects(readKnowledgeRegistry({ registryUrl: 'https://example.larksuite.com/base/base123?table=tbl123' }, {
    getToken: async () => 'secret', fetch: async () => ({ ok: true, json: async () => ({ code: 0, data: { items: [], has_more: true } }) }),
  }), /Registry read failed/);
});
