const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
  readKnowledgeRegistry,
  readExternalWhitelist,
  getKnowledgeMetadata,
  normalizeDate,
  normalizeDomain,
  domainMatches,
  isEmptyRecord,
} = require('../../integrations/lark/knowledge/knowledge-registry');
const { registerKnowledgeTools } = require('../../runtime/registrations/register-knowledge-tools');
// Inject fake API functions: these tests need no credentials and make no network calls.
test('reads paginated Base through official MCP without view filters or separate authentication', async () => {
  // Two pages verify cursor following and that a view cannot hide lookup records.
  let calls = 0;
  const rows = await readExternalWhitelist({ whitelistUrl: 'https://example.larksuite.com/wiki/base123?table=tbl123' }, {
    getWikiNode: async () => ({ obj_type: 'bitable', obj_token: 'base123' }),
    mcp: { call: async (name, args, options) => {
      assert.equal(name, 'bitable.v1.appTableRecord.list');
      assert.deepEqual(args.path, { app_token: 'base123', table_id: 'tbl123' });
      assert.ok(options.signal instanceof AbortSignal);
      assert.equal(args.params.view_id, undefined);
      assert.equal(args.params.filter, undefined);
      assert.equal(args.params.page_size, 500);
      calls++;
      if (calls === 2) assert.equal(args.params.page_token, 'next');
      return { items: [{ record_id: String(calls), fields: {} }], has_more: calls === 1, page_token: 'next' };
    } },
  });
  assert.equal(rows.length, 2);
});
test('lookup preserves missing fields and Pending; absent row differs from failure', async () => {
  // A matched incomplete record, no match, and a failed request are distinct outcomes.
  const read = async () => [{ record_id: '1', fields: { Title: [{ text: '測試' }], 'Lark URL': { link: 'https://example.com/doc' }, Scope: 'Knowledge Base', 'Document Type': 'SOP' } }];
  const result = await getKnowledgeMetadata({ url: 'https://example.com/doc' }, { read });
  assert.equal(result.found, true);
  assert.equal(result.documents[0].version, null);
  assert.ok(result.documents[0].missing_fields.includes('version'));
  assert.equal(result.documents[0].metadata_complete, false);
  assert.equal((await getKnowledgeMetadata({ url: 'https://example.com/missing' }, { read })).found, false);
  await assert.rejects(getKnowledgeMetadata({}, { read: async () => { throw Error('failure'); } }));
});
test('Registry retrieval gate applies completeness, scope, status, and authority', async () => {
  const records = [
    ['kb-approved', 'Knowledge Base', 'Guide', 'Approved', 'Internal Official'],
    ['kb-reference', 'Knowledge Base', 'Guide', 'Approved', 'Reference'],
    ['kb-draft', 'Knowledge Base', 'Guide', 'Draft', 'Internal Official'],
    ['kb-unverified', 'Knowledge Base', 'Guide', 'Approved', 'Unverified'],
    ['workspace', 'Workspace', 'Meeting Notes', null, null],
  ].map(([id, scope, documentType, status, authority]) => ({ record_id: id, fields: {
    Title: id,
    'Lark URL': `https://example.com/${id}`,
    Scope: scope,
    'Primary Domain': scope === 'Workspace' ? 'Operation' : 'Service',
    'Document Type': documentType,
    ...(status ? { Status: status } : {}),
    ...(authority ? { 'Authority Level': authority } : {}),
  } }));
  records.push({ record_id: 'kb-incomplete', fields: {
    Title: 'Incomplete SOP', 'Lark URL': 'https://example.com/incomplete',
    Scope: 'Knowledge Base', 'Primary Domain': 'Service', 'Document Type': 'SOP',
    Status: 'Approved', 'Authority Level': 'Internal Official',
  } });

  const result = await getKnowledgeMetadata({}, {
    read: async () => records,
  });
  const byId = Object.fromEntries(result.documents.map(doc => [doc.record_id, doc]));

  assert.equal(byId['kb-approved'].retrieval_eligible, true);
  assert.equal(byId['kb-reference'].retrieval_eligible, true);
  assert.equal(byId['kb-draft'].retrieval_eligible, false);
  assert.equal(byId['kb-unverified'].retrieval_eligible, false);
  assert.equal(byId.workspace.retrieval_eligible, false);
  assert.equal(byId['kb-incomplete'].metadata_complete, false);
  assert.equal(byId['kb-incomplete'].retrieval_eligible, false);
});
test('domain matching accepts real subdomains and rejects lookalike domains', () => {
  assert.equal(normalizeDomain('HTTP://WWW.HousingAuthority.gov.hk/path'), 'housingauthority.gov.hk');
  assert.equal(domainMatches('hos.housingauthority.gov.hk', 'housingauthority.gov.hk'), true);
  assert.equal(domainMatches('housingauthority.gov.hk', 'housingauthority.gov.hk'), true);
  assert.equal(domainMatches('fakehousingauthority.gov.hk', 'housingauthority.gov.hk'), false);
  assert.equal(domainMatches('housingauthority.gov.hk.fake-site.com', 'housingauthority.gov.hk'), false);
  assert.equal(domainMatches('housingauthority.gov.hk.example.com', 'housingauthority.gov.hk'), false);
});
test('pagination failure never returns incomplete records or secrets', async () => {
  // has_more without a next cursor must reject rather than return partial success.
  await assert.rejects(readExternalWhitelist({ whitelistUrl: 'https://example.larksuite.com/base/base123?table=tbl123' }, {
    mcp: { call: async () => ({ items: [], has_more: true }) },
  }), /Registry read failed/);
});

test('Base MCP reader rejects malformed pages, cyclic cursors and page-limit exhaustion', async () => {
  const url = 'https://example.larksuite.com/base/base123?table=tbl123';
  for (const page of [
    { items: [] }, { items: [], has_more: 'false' },
    { items: {}, has_more: false }, { items: [null], has_more: false },
    { items: [{ record_id: 'bad', fields: [] }], has_more: false },
    { items: [{ fields: {} }], has_more: false },
    { items: [], has_more: true, page_token: 123 },
  ]) {
    await assert.rejects(readExternalWhitelist({ whitelistUrl: url }, {
      mcp: { call: async () => page },
    }), /No complete result/);
  }
  for (const mode of ['cycle', 'limit']) {
    let calls = 0;
    await assert.rejects(readExternalWhitelist({ whitelistUrl: url }, {
      mcp: { call: async () => ({ items: [], has_more: true,
        page_token: mode === 'cycle' ? (++calls % 2 ? 'A' : 'B') : String(++calls) }) },
    }), /No complete result/);
    assert.equal(calls, mode === 'cycle' ? 3 : 100);
  }
});

test('Base MCP reader preserves raw field shapes and advances through empty pages', async () => {
  const record = { record_id: 'record', fields: {
    Title: [{ text: 'Rich text' }], 'Approved Date': 1735689600000,
    Lookup: ['A', 'B'], Zero: 0, Empty: [],
  } };
  let calls = 0;
  const rows = await readExternalWhitelist({ whitelistUrl: 'https://example.larksuite.com/base/base123?table=tbl123&view=hidden' }, {
    mcp: { call: async (_name, args) => {
      assert.deepEqual(Object.keys(args.params).sort(), ++calls === 1 ? ['page_size'] : ['page_size', 'page_token']);
      return calls === 1 ? { items: [], has_more: true, page_token: 'next' }
        : { items: [record], has_more: false };
    } },
  });
  assert.equal(calls, 2);
  assert.equal(rows[0], record);
  assert.deepEqual(rows[0].fields.Lookup, ['A', 'B']);
});

test('Base MCP reader sanitizes upstream failures and stops pagination after cancellation', async () => {
  const url = 'https://example.larksuite.com/base/base123?table=tbl123';
  await assert.rejects(readExternalWhitelist({ whitelistUrl: url }, {
    mcp: { call: async () => { throw Object.assign(Error('PRIVATE secret data'), { larkCode: 999 }); } },
  }), error => /Lark code 999/.test(error.message) && !/PRIVATE|secret data/.test(error.message));
  const controller = new AbortController();
  let calls = 0;
  await assert.rejects(readExternalWhitelist({ whitelistUrl: url }, {
    signal: controller.signal,
    mcp: { call: async (_name, _args, { signal }) => {
      calls++;
      controller.abort();
      assert.equal(signal.aborted, true);
      return { items: [], has_more: true, page_token: 'next' };
    } },
  }), /timeout/);
  assert.equal(calls, 1);
});
test('empty Base rows are skipped but N/A and zero remain meaningful', async () => {
  assert.equal(isEmptyRecord({ fields: {} }), true);
  assert.equal(isEmptyRecord({ fields: { Title: '  ', Tags: [], Formula: [{ text: '' }] } }), true);
  assert.equal(isEmptyRecord({ fields: { Status: 'N/A' } }), false);
  assert.equal(isEmptyRecord({ fields: { Count: 0 } }), false);
  const result = await getKnowledgeMetadata({}, { read: async () => [
    { record_id: 'blank-1', fields: {} },
    { record_id: 'blank-2', fields: { Title: '', Tags: [] } },
    { record_id: 'kept', fields: { Title: 'Document' } },
  ] });
  assert.equal(result.record_count, 1);
  assert.equal(result.skipped_empty_record_count, 2);
  assert.equal(result.documents[0].record_id, 'kept');
});
test('Schema Freeze v1.0 required fields exclude owner, review, and approval-workflow fields', async () => {
  const result = await getKnowledgeMetadata({}, { read: async () => [
    { record_id: 'kb', fields: {
      Title: 'Approved guide', 'Lark URL': 'https://example.com/guide',
      Scope: 'Knowledge Base', 'Primary Domain': 'Service', 'Document Type': 'Guide',
      'Authority Level': 'Internal Official', Status: 'Approved',
    } },
    { record_id: 'workspace', fields: {
      Title: 'Meeting', 'Lark URL': 'https://example.com/meeting',
      Scope: 'Workspace', 'Primary Domain': 'Operation', 'Document Type': 'Meeting Notes',
    } },
  ] });

  assert.deepEqual(result.documents[0].missing_fields, []);
  assert.equal(result.documents[0].source_url, 'https://example.com/guide');
  assert.equal(result.documents[0].metadata, undefined);
  assert.equal(result.documents[0].lark_url, undefined);
  assert.deepEqual(result.documents[1].missing_fields, []);
});
test('date helper normalizes optional frozen project dates', () => {
  assert.equal(normalizeDate('2024-01-15'), '2024-01-15');
  assert.equal(normalizeDate(new Date('2024-01-15').getTime()), '2024-01-15');
  assert.equal(normalizeDate(new Date('2024-01-15')), '2024-01-15');
  assert.equal(normalizeDate(null), null);
  assert.equal(normalizeDate(''), null);
});
test('optional frozen fields are normalized without affecting completeness', async () => {
  const result = await getKnowledgeMetadata({}, { read: async () => [{
    record_id: 'workspace-project',
    fields: {
      Title: 'Project plan',
      'Lark URL': 'https://example.com/project-plan',
      Scope: 'Workspace',
      'Primary Domain': 'Operation',
      'Document Type': 'Project Doc',
      'Lark Owner': [{ name: 'Penny' }],
      Workstream: 'Knowledge Registry',
      'Project Name': 'Supermama',
      'Project Start Date': '2026/09/01',
      'Project End Date': '2026-09-30',
    },
  }] });
  const doc = result.documents[0];

  assert.deepEqual(doc.lark_owner, ['Penny']);
  assert.equal(doc.workstream, 'Knowledge Registry');
  assert.equal(doc.project_name, 'Supermama');
  assert.equal(doc.project_start_date, '2026-09-01');
  assert.equal(doc.project_end_date, '2026-09-30');
  assert.equal(doc.metadata_complete, true);
});
test('knowledge MCP registrations are read-only and shared by both transports', () => {
  const registrations = [];
  registerKnowledgeTools({ registerTool: (name, config, handler) => registrations.push({ name, config, handler }) });
  assert.deepEqual(registrations.map(item => item.name), [
    'get_knowledge_metadata',
    'search_knowledge_registry',
    'retrieve_knowledge_document',
    'get_approved_web_domains',
    'check_external_urls',
  ]);
  for (const item of registrations) {
    assert.equal(item.config.annotations.readOnlyHint, true);
    assert.equal(item.config.annotations.destructiveHint, false);
  }
});
