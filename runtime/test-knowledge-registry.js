const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
  readKnowledgeRegistry,
  getKnowledgeMetadata,
  getValidationReport,
  validateRecord,
  normalizeDate,
  normalizeDomain,
  domainMatches,
  isEmptyRecord,
  enums,
} = require('../integrations/lark/knowledge-registry');
const { registerKnowledgeTools } = require('./register-knowledge-tools');
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
  assert.equal(result.documents[0].version, null);
  assert.ok(result.documents[0].missing_fields.includes('version'));
  assert.equal(result.documents[0].validation_status, 'invalid');
  assert.equal((await getKnowledgeMetadata({ url: 'https://example.com/missing' }, { read })).found, false);
  const external = await getKnowledgeMetadata({}, { read: async () => [{ fields: { Scope: 'External Reference', 'Whitelist Status': 'Pending' } }] });
  assert.equal(external.documents[0].whitelist_valid, false);
  const complete = await getKnowledgeMetadata({}, { read: async () => [{ record_id: 'test1', fields: {
    Title: 'External guide', Scope: 'External Reference', 'Primary Domain': 'Property',
    'Document Type': 'Guide', 'Authority Level': 'External Official',
    'Lark URL': 'https://example.com/guide',
  } }] });
  // Complete metadata can still describe an unapproved external source.
  assert.equal(complete.documents[0].validation_status, 'valid');
  assert.equal(complete.documents[0].metadata_complete, true);
  assert.equal(complete.documents[0].whitelist_valid, false);
  assert.equal(complete.documents[0].retrieval_eligible, false);
  await assert.rejects(getKnowledgeMetadata({}, { read: async () => { throw Error('failure'); } }));
});
test('external retrieval eligibility comes from the separate whitelist table', async () => {
  const registryRows = [
    { record_id: 'approved-document', fields: {
      Title: 'Housing Authority notice',
      'Lark URL': 'https://hos.housingauthority.gov.hk/notice.html',
      Scope: 'External Reference',
      'Primary Domain': 'Property',
      'Document Type': 'Official Notice',
      'Authority Level': 'External Official',
    } },
    { record_id: 'unknown-document', fields: {
      Title: 'Unknown source',
      'Lark URL': 'https://example.com/article',
      Scope: 'External Reference',
      'Primary Domain': 'Property',
      'Document Type': 'Reference',
      'Authority Level': 'External Official',
      'Source Domain': 'example.com',
      'Whitelist Status': 'Approved',
    } },
  ];
  const whitelistRows = [{ record_id: 'white-1', fields: {
    'Whitelist Status': 'Approved',
    'Source Name': { link: 'http://housingauthority.gov.hk', text: 'housingauthority.gov.hk' },
    Description: 'Hong Kong Housing Authority',
    'Approved By': [{ name: 'Penny' }],
    'Approved Date': '2026/09/16',
  } }];

  const result = await getKnowledgeMetadata({}, {
    read: async () => registryRows,
    readWhitelist: async () => whitelistRows,
  });

  assert.equal(result.documents[0].retrieval_eligible, true);
  assert.equal(result.documents[0].metadata_complete, true);
  assert.equal(result.documents[0].whitelist_valid, true);
  assert.equal(result.documents[0].source_domain, 'hos.housingauthority.gov.hk');
  assert.equal(result.documents[0].whitelist_status, 'Approved');
  assert.equal(result.documents[0].missing_fields.includes('source_domain'), false);
  assert.equal(result.documents[0].missing_fields.includes('whitelist_status'), false);
  assert.equal(result.documents[0].whitelist_check.document_domain, 'hos.housingauthority.gov.hk');
  assert.equal(result.documents[0].whitelist_check.matched_domain, 'housingauthority.gov.hk');
  assert.equal(result.documents[0].whitelist_check.source_name, 'Hong Kong Housing Authority');
  // The metadata row says Approved, but an absent whitelist domain must still fail closed.
  assert.equal(result.documents[1].retrieval_eligible, false);
  assert.equal(result.documents[1].whitelist_valid, false);
  assert.equal(result.documents[1].source_domain, 'example.com');
  assert.equal(result.documents[1].whitelist_status, null);
  assert.equal(result.documents[1].whitelist_check.matched_domain, null);
});
test('Schema Freeze v1.0 retrieval gate applies completeness, scope, status, authority, and whitelist', async () => {
  const records = [
    ['kb-approved', 'Knowledge Base', 'Guide', 'Approved', 'Internal Official'],
    ['kb-reference', 'Knowledge Base', 'Guide', 'Approved', 'Reference'],
    ['kb-draft', 'Knowledge Base', 'Guide', 'Draft', 'Internal Official'],
    ['kb-unverified', 'Knowledge Base', 'Guide', 'Approved', 'Unverified'],
    ['workspace', 'Workspace', 'Meeting Notes', null, null],
    ['external-approved', 'External Reference', 'Guide', null, 'External Official'],
    ['external-unverified', 'External Reference', 'Guide', null, 'Unverified'],
  ].map(([id, scope, documentType, status, authority]) => ({ record_id: id, fields: {
    Title: id,
    'Lark URL': scope === 'External Reference'
      ? `https://${id === 'external-unverified' ? 'unverified.example' : 'approved.example'}/${id}`
      : `https://example.com/${id}`,
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
    readWhitelist: async () => [
      { record_id: 'allow', fields: {
        Domain: 'approved.example', 'Whitelist Status': 'Approved',
      } },
      { record_id: 'unverified', fields: {
        Domain: 'unverified.example', 'Whitelist Status': 'Approved',
      } },
    ],
  });
  const byId = Object.fromEntries(result.documents.map(doc => [doc.record_id, doc]));

  assert.equal(byId['kb-approved'].retrieval_eligible, true);
  assert.equal(byId['kb-reference'].retrieval_eligible, true);
  assert.equal(byId['kb-draft'].retrieval_eligible, false);
  assert.equal(byId['kb-unverified'].retrieval_eligible, false);
  assert.equal(byId.workspace.retrieval_eligible, false);
  assert.equal(byId.workspace.whitelist_valid, null);
  assert.equal(byId['external-approved'].retrieval_eligible, true);
  assert.equal(byId['external-unverified'].retrieval_eligible, false);
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
test('Suspended is a valid whitelist status but blocks external retrieval', async () => {
  const result = await getKnowledgeMetadata({}, {
    read: async () => [{ record_id: 'suspended-doc', fields: {
      Title: 'Suspended source', 'Lark URL': 'https://suspended.example/notice',
      Scope: 'External Reference', 'Primary Domain': 'Property',
      'Document Type': 'Official Notice', 'Authority Level': 'External Official',
    } }],
    readWhitelist: async () => [{ record_id: 'suspended-domain', fields: {
      Domain: 'suspended.example', 'Whitelist Status': 'Suspended',
    } }],
  });
  const doc = result.documents[0];

  assert.equal(doc.whitelist_valid, false);
  assert.equal(doc.retrieval_eligible, false);
  assert.equal(doc.validation_report.checks.whitelist_status_value.pass, true);
});
test('external retrieval combines whitelist status with metadata Authority Level and fails closed', async () => {
  const cases = [
    ['official', 'official.approved.test', 'External Official'],
    ['reference', 'reference.approved.test', 'Reference'],
    ['unverified', 'unverified.test', 'Unverified'],
    ['suspended', 'suspended.test', 'External Official'],
    ['missing', 'missing.test', 'External Official'],
    ['lookalike', 'fakeapproved.test', 'External Official'],
  ];
  const records = cases.map(([id, domain, manualAuthority]) => ({ record_id: id, fields: {
    Title: id, 'Lark URL': `https://${domain}/notice`, Scope: 'External Reference',
    'Primary Domain': 'Property', 'Document Type': 'Official Notice',
    ...(manualAuthority ? { 'Authority Level': manualAuthority } : {}),
  } }));
  const whitelistRows = [
    ['official.approved.test', 'Approved'],
    ['reference.approved.test', 'Approved'],
    ['unverified.test', 'Approved'],
    ['suspended.test', 'Suspended'],
    ['approved.test', 'Approved'],
  ].map(([domain, status], index) => ({ record_id: `white-${index}`, fields: {
    'Source Name': domain, Domain: domain, 'Whitelist Status': status,
  } }));

  const result = await getKnowledgeMetadata({}, {
    read: async () => records,
    readWhitelist: async () => whitelistRows,
  });
  const byId = Object.fromEntries(result.documents.map(doc => [doc.record_id, doc]));

  assert.equal(byId.official.authority_level, 'External Official');
  assert.equal(byId.official.retrieval_eligible, true);
  assert.equal(byId.reference.authority_level, 'Reference');
  assert.equal(byId.reference.retrieval_eligible, true);
  assert.equal(byId.unverified.whitelist_valid, true);
  assert.equal(byId.unverified.authority_level, 'Unverified');
  assert.equal(byId.unverified.retrieval_eligible, false);
  assert.equal(byId.suspended.whitelist_valid, false);
  assert.equal(byId.suspended.retrieval_eligible, false);
  assert.equal(byId.missing.whitelist_valid, false);
  assert.equal(byId.missing.retrieval_eligible, false);
  assert.equal(byId.lookalike.whitelist_check.matched_domain, null);
  assert.equal(byId.lookalike.retrieval_eligible, false);
});
test('pagination failure never returns incomplete records or secrets', async () => {
  // has_more without a next cursor must reject rather than return partial success.
  await assert.rejects(readKnowledgeRegistry({ registryUrl: 'https://example.larksuite.com/base/base123?table=tbl123' }, {
    getToken: async () => 'secret', fetch: async () => ({ ok: true, json: async () => ({ code: 0, data: { items: [], has_more: true } }) }),
  }), /Registry read failed/);
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
test('validates enum values for Scope, Document Type, Status, Authority Level', async () => {
  const record = { record_id: 'enum-test', fields: {
    Title: 'Test', Scope: 'Knowledge Base', 'Primary Domain': 'IT',
    'Document Type': 'SOP', 'Authority Level': 'Internal Official', Status: 'Draft',
    'Lark URL': 'https://example.com/doc', 'Owner Person': [{ name: 'Alice' }],
    'Last Reviewed Date': '2024-01-15',
  } };
  
  const result = await getKnowledgeMetadata({}, { read: async () => [record] });
  const doc = result.documents[0];
  
  // Valid enums should pass
  assert.equal(doc.validation_report.checks.scope_value.pass, true);
  assert.equal(doc.validation_report.checks.document_type_value.pass, true);
  assert.equal(doc.validation_report.checks.status_value.pass, true);
  assert.equal(doc.validation_report.checks.authority_level_value.pass, true);
  
  // Test invalid enum
  const badRecord = { ...record, fields: { ...record.fields, Status: 'InvalidStatus' } };
  const badResult = await getKnowledgeMetadata({}, { read: async () => [badRecord] });
  assert.equal(badResult.documents[0].validation_report.checks.status_value.pass, false);
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
    { record_id: 'external-invalid-url', fields: {
      Title: 'External guide', 'Lark URL': 'not a valid URL',
      Scope: 'External Reference', 'Primary Domain': 'Property', 'Document Type': 'Guide',
      'Authority Level': 'External Official',
    } },
  ] });

  assert.deepEqual(result.documents[0].missing_fields, []);
  assert.equal(result.documents[0].source_url, 'https://example.com/guide');
  assert.equal(result.documents[0].metadata, undefined);
  assert.equal(result.documents[0].lark_url, undefined);
  assert.deepEqual(result.documents[1].missing_fields, []);
  assert.deepEqual(result.documents[2].missing_fields, ['source_domain']);
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
test('dictionary enums and Scope-specific document types are exact', () => {
  assert.deepEqual(enums.status, ['Draft', 'Review', 'Approved', 'Archived']);
  const retiredStatus = validateRecord({ scope: 'Knowledge Base', status: 'Active' }, [], 'retired-status');
  assert.equal(retiredStatus.checks.status_value.pass, false);
  assert.deepEqual(enums.authority_level, ['Internal Official', 'External Official', 'Reference', 'Unverified']);
  assert.deepEqual(enums.whitelist_status, ['Pending', 'Approved', 'Suspended', 'Rejected']);
  assert.ok(enums.document_type_by_scope.Workspace.includes('Architecture'));
  assert.ok(enums.document_type_by_scope['External Reference'].includes('Official Notice'));
  assert.equal(enums.document_type.includes('Process'), false);
  const invalid = validateRecord({ scope: 'External Reference', primary_domain: 'Property', document_type: 'SOP' }, [], 'scope-type');
  assert.equal(invalid.checks.document_type_value.pass, false);
});
test('v1.0 ignores excluded review-cycle Base columns', async () => {
  const result = await getKnowledgeMetadata({}, { read: async () => [{ record_id: 'excluded-fields', fields: {
    Title: 'FAQ', 'Lark URL': 'https://example.com/faq', Scope: 'Knowledge Base',
    'Primary Domain': 'Service', 'Document Type': 'FAQ',
    'Authority Level': 'Internal Official', Status: 'Draft',
    'Last Reviewed Date': 'invalid',
    'Review Cycle Days': -10, 'Next Review Date': 'invalid',
  } }] });
  const doc = result.documents[0];

  assert.equal(doc.validation_status, 'valid');
  assert.equal(doc.validation_report.summary.failed, 0);
  assert.equal(doc.approved_date, null);
  assert.equal(doc.review_cycle_days, undefined);
});
test('optional Approved Date cannot be in the future', async () => {
  const baseFields = {
    Title: 'Approved guide', 'Lark URL': 'https://example.com/approved-guide',
    Scope: 'Knowledge Base', 'Primary Domain': 'Service', 'Document Type': 'Guide',
    'Authority Level': 'Internal Official', Status: 'Approved',
  };
  const result = await getKnowledgeMetadata({}, { read: async () => [
    { record_id: 'past', fields: { ...baseFields, 'Approved Date': '2000-01-01' } },
    { record_id: 'future', fields: { ...baseFields, 'Approved Date': '2999-01-01' } },
    { record_id: 'missing', fields: baseFields },
  ] });
  const byId = Object.fromEntries(result.documents.map(doc => [doc.record_id, doc]));

  assert.equal(byId.past.validation_report.checks.approved_date_not_future.pass, true);
  assert.equal(byId.past.validation_status, 'valid');
  assert.equal(byId.future.validation_report.checks.approved_date_not_future.pass, false);
  assert.equal(byId.future.validation_status, 'invalid');
  assert.equal(byId.missing.validation_report.checks.approved_date_not_future, undefined);
  assert.equal(byId.missing.metadata_complete, true);
});
test('knowledge MCP registrations are read-only and shared by both transports', () => {
  const registrations = [];
  registerKnowledgeTools({ registerTool: (name, config, handler) => registrations.push({ name, config, handler }) });
  assert.deepEqual(registrations.map(item => item.name), ['get_knowledge_metadata', 'get_knowledge_validation_report']);
  for (const item of registrations) {
    assert.equal(item.config.annotations.readOnlyHint, true);
    assert.equal(item.config.annotations.destructiveHint, false);
  }
});
