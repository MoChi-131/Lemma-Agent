const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
  readKnowledgeRegistry,
  getKnowledgeMetadata,
  getValidationReport,
  validateRecord,
  normalizeDate,
  normalizeNumber,
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
  assert.equal(result.documents[0].metadata.version, null);
  assert.ok(result.documents[0].missing_fields.includes('version'));
  assert.equal(result.documents[0].validation_status, 'invalid');
  assert.equal((await getKnowledgeMetadata({ url: 'https://example.com/missing' }, { read })).found, false);
  const external = await getKnowledgeMetadata({}, { read: async () => [{ fields: { Scope: 'External Reference', 'Whitelist Status': 'Pending' } }] });
  assert.equal(external.documents[0].external_source_approved, false);
  const complete = await getKnowledgeMetadata({}, { read: async () => [{ record_id: 'test1', fields: {
    Title: 'External guide', Scope: 'External Reference', 'Primary Domain': 'Property',
    'Document Type': 'Guide', 'Authority Level': 'External Official',
    'Lark URL': 'https://example.com/guide',
  } }] });
  // Complete metadata can still describe an unapproved external source.
  assert.equal(complete.documents[0].validation_status, 'valid');
  assert.equal(complete.documents[0].external_source_approved, false);
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
    Domain: { link: 'http://housingauthority.gov.hk', text: 'housingauthority.gov.hk' },
    Organization: 'Hong Kong Housing Authority',
    'Approved By': [{ name: 'Penny' }],
    'Approved Date': '2026/09/16',
  } }];

  const result = await getKnowledgeMetadata({}, {
    read: async () => registryRows,
    readWhitelist: async () => whitelistRows,
  });

  assert.equal(result.documents[0].retrieval_eligible, true);
  assert.equal(result.documents[0].external_source_approved, true);
  assert.equal(result.documents[0].metadata.source_domain, 'hos.housingauthority.gov.hk');
  assert.equal(result.documents[0].metadata.whitelist_status, 'Approved');
  assert.equal(result.documents[0].missing_fields.includes('source_domain'), false);
  assert.equal(result.documents[0].missing_fields.includes('whitelist_status'), false);
  assert.equal(result.documents[0].whitelist_check.document_domain, 'hos.housingauthority.gov.hk');
  assert.equal(result.documents[0].whitelist_check.matched_domain, 'housingauthority.gov.hk');
  // The metadata row says Approved, but an absent whitelist domain must still fail closed.
  assert.equal(result.documents[1].retrieval_eligible, false);
  assert.equal(result.documents[1].whitelist_check.matched_domain, null);
});
test('domain matching accepts real subdomains and rejects lookalike domains', () => {
  assert.equal(normalizeDomain('HTTP://WWW.HousingAuthority.gov.hk/path'), 'housingauthority.gov.hk');
  assert.equal(domainMatches('hos.housingauthority.gov.hk', 'housingauthority.gov.hk'), true);
  assert.equal(domainMatches('housingauthority.gov.hk', 'housingauthority.gov.hk'), true);
  assert.equal(domainMatches('fakehousingauthority.gov.hk', 'housingauthority.gov.hk'), false);
  assert.equal(domainMatches('housingauthority.gov.hk.example.com', 'housingauthority.gov.hk'), false);
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
test('validates date formats and normalizes to ISO 8601', async () => {
  const record = { record_id: 'date-test', fields: {
    Title: 'Test', Scope: 'Knowledge Base', 'Primary Domain': 'IT',
    'Document Type': 'SOP', 'Lark URL': 'https://example.com/doc',
    'Owner Person': [{ name: 'Alice' }], 'Authority Level': 'Internal Official',
    Status: 'Draft', 'Last Reviewed Date': '2024-01-15',
    'Approved Date': new Date('2024-01-01').getTime(),
  } };
  
  const result = await getKnowledgeMetadata({}, { read: async () => [record] });
  const doc = result.documents[0];
  
  assert.equal(doc.validation_report.checks.approved_date_format.pass, true);
  assert.ok(doc.validation_report.checks.approved_date_format.actual.match(/^\d{4}-\d{2}-\d{2}$/));
});
test('rejects a future Approved Date and explains how to correct it', async () => {
  const report = await getValidationReport({}, { read: async () => [{ record_id: 'future-approval', fields: {
    Title: 'Future approval',
    'Lark URL': 'https://example.com/future',
    Scope: 'Knowledge Base',
    'Primary Domain': 'Service',
    'Document Type': 'Guide',
    'Owner Person': [{ name: 'Owner' }],
    'Authority Level': 'Internal Official',
    Status: 'Approved',
    'Approved By': [{ name: 'Approver' }],
    'Approved Date': '2999-01-01',
    'Last Reviewed Date': '2026-01-01',
  } }] });
  const doc = report.documents[0];

  assert.equal(doc.validation_report.checks.approved_date_not_future.pass, false);
  assert.equal(doc.validation_status, 'invalid');
  assert.match(report.report_text, /The current value 2999-01-01 is in the future/);
});
test('validates Review Cycle Days as a non-negative integer', async () => {
  const record = { record_id: 'cycle-test', fields: {
    Title: 'Test', Scope: 'Knowledge Base', 'Primary Domain': 'IT',
    'Document Type': 'SOP', 'Lark URL': 'https://example.com/doc',
    'Owner Person': [{ name: 'Alice' }], 'Authority Level': 'Internal Official',
    Status: 'Draft', 'Last Reviewed Date': '2024-01-15',
    'Review Cycle Days': '30',
  } };
  
  const result = await getKnowledgeMetadata({}, { read: async () => [record] });
  const doc = result.documents[0];
  
  assert.equal(doc.validation_report.checks.review_cycle_days_format.pass, true);
  assert.equal(doc.validation_report.checks.review_cycle_days_format.actual, 30);
});
test('accepts zero review cycle and reports an empty Lark review date as missing', async () => {
  const result = await getKnowledgeMetadata({}, { read: async () => [{ record_id: 'zero-cycle', fields: {
    Title: 'SOP with disabled cycle',
    'Lark URL': 'https://example.com/sop',
    Scope: 'Knowledge Base',
    'Primary Domain': 'Service',
    'Document Type': 'SOP',
    'Owner Person': [{ name: 'Owner' }],
    'Authority Level': 'Internal Official',
    Status: 'Draft',
    Version: 'v1.0',
    'Last Reviewed Date': [{ text: '' }],
    'Review Cycle Days': 0,
  } }] });
  const doc = result.documents[0];

  assert.equal(doc.validation_report.checks.review_cycle_days_format.pass, true);
  assert.equal(doc.validation_report.checks.review_cycle_days_format.actual, 0);
  assert.equal(doc.validation_report.checks.review_cycle_rule.severity, 'warning');
  assert.ok(doc.missing_fields.includes('last_reviewed_date'));
  assert.equal(doc.validation_report.checks.last_reviewed_date_format, undefined);
  assert.equal(doc.validation_status, 'invalid');
});
test('validation report explains a failed review-cycle rule with expected and actual values', async () => {
  const report = await getValidationReport({}, { read: async () => [{ record_id: 'faq-cycle', fields: {
    Title: 'FAQ',
    'Lark URL': 'https://example.com/faq',
    Scope: 'Knowledge Base',
    'Primary Domain': 'Service',
    'Document Type': 'FAQ',
    'Owner Person': [{ name: 'Owner' }],
    'Authority Level': 'Internal Official',
    Status: 'Draft',
    'Last Reviewed Date': '2026-01-01',
    'Review Cycle Days': 90,
  } }] });

  assert.match(
    report.report_text,
    /Set Review Cycle Days to 180 for FAQ\. The current value is 90, which does not match the required review-cycle rule\./,
  );
});
test('validates next review date consistency with review cycle', async () => {
  const lastReviewDate = '2024-01-15';
  const nextReviewDate = '2024-02-14'; // 30 days later
  
  const record = { record_id: 'cycle-consistency-test', fields: {
    Title: 'Test', Scope: 'Knowledge Base', 'Primary Domain': 'IT',
    'Document Type': 'SOP', 'Lark URL': 'https://example.com/doc',
    'Owner Person': [{ name: 'Alice' }], 'Authority Level': 'Internal Official',
    Status: 'Draft', 'Last Reviewed Date': lastReviewDate,
    'Review Cycle Days': '30', 'Next Review Date': nextReviewDate,
  } };
  
  const result = await getKnowledgeMetadata({}, { read: async () => [record] });
  const doc = result.documents[0];
  
  assert.equal(doc.validation_report.checks.review_cycle_consistency.pass, true);
});
test('helper functions normalize dates and numbers correctly', async () => {
  // Test date normalization
  assert.equal(normalizeDate('2024-01-15'), '2024-01-15');
  assert.equal(normalizeDate(new Date('2024-01-15').getTime()), '2024-01-15');
  assert.equal(normalizeDate(new Date('2024-01-15')), '2024-01-15');
  assert.equal(normalizeDate(null), null);
  assert.equal(normalizeDate(''), null);
  
  // Test number normalization
  assert.equal(normalizeNumber('30'), 30);
  assert.equal(normalizeNumber(30), 30);
  assert.equal(normalizeNumber('-5'), null); // negative not allowed
  assert.equal(normalizeNumber(0), 0);
  assert.equal(normalizeNumber(null), null);
  assert.equal(normalizeNumber(''), null);
});
test('dictionary enums and Scope-specific document types are exact', () => {
  assert.deepEqual(enums.status, ['Draft', 'Review', 'Approved', 'Archived']);
  const retiredStatus = validateRecord({ scope: 'Knowledge Base', status: 'Active' }, [], 'retired-status');
  assert.equal(retiredStatus.checks.status_value.pass, false);
  assert.deepEqual(enums.authority_level, ['Internal Official', 'External Official', 'Reference', 'Unverified']);
  assert.deepEqual(enums.whitelist_status, ['Approved', 'Pending', 'Rejected']);
  assert.ok(enums.document_type_by_scope.Workspace.includes('Architecture'));
  assert.ok(enums.document_type_by_scope['External Reference'].includes('Official Notice'));
  assert.equal(enums.document_type.includes('Process'), false);
  const invalid = validateRecord({ scope: 'External Reference', primary_domain: 'Property', document_type: 'SOP' }, [], 'scope-type');
  assert.equal(invalid.checks.document_type_value.pass, false);
});
test('validation status includes format errors but treats missing recommended cycle as warning', async () => {
  const base = {
    Title: 'FAQ', 'Lark URL': 'https://example.com/faq', Scope: 'Knowledge Base',
    'Primary Domain': 'Service', 'Document Type': 'FAQ', 'Owner Person': [{ name: 'Owner' }],
    'Authority Level': 'Internal Official', Status: 'Draft', 'Last Reviewed Date': '2026-01-01',
  };
  const warningOnly = await getKnowledgeMetadata({}, { read: async () => [{ record_id: 'warning', fields: base }] });
  assert.equal(warningOnly.documents[0].validation_status, 'valid');
  assert.equal(warningOnly.documents[0].validation_report.summary.warnings, 1);
  const badDate = await getKnowledgeMetadata({}, { read: async () => [{ record_id: 'bad-date', fields: { ...base, 'Last Reviewed Date': 'not-a-date' } }] });
  assert.equal(badDate.documents[0].validation_status, 'invalid');
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
