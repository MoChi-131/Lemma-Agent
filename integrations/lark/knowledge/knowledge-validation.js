const { getKnowledgeMetadata } = require('./knowledge-registry');

// Detailed dictionary validation belongs to the Knowledge Base Management
// Agent. The retrieval agent only consumes the lightweight governance fields
// produced by knowledge-registry.js.
const documentTypesByScope = {
  'Knowledge Base': ['SOP', 'FAQ', 'Pricing', 'Policy', 'Guide', 'Product Spec', 'Service Info', 'Official Notice', 'Knowledge Article', 'Reference', 'Template'],
  Workspace: ['Meeting Notes', 'Analysis', 'Research', 'Planning', 'Campaign', 'Architecture', 'Design', 'Development Doc', 'Test Doc', 'Project Doc', 'Report'],
  'External Reference': ['Official Notice', 'Policy', 'Guide', 'Reference'],
};

const enums = {
  scope: ['Knowledge Base', 'Workspace', 'External Reference'],
  primary_domain: ['Service', 'Property', 'Product', 'Customer', 'Marketing', 'Operation', 'IT', 'Company', 'Sales'],
  document_type: [...new Set(Object.values(documentTypesByScope).flat())],
  document_type_by_scope: documentTypesByScope,
  status: ['Draft', 'Review', 'Approved', 'Archived'],
  authority_level: ['Internal Official', 'External Official', 'Reference', 'Unverified'],
  whitelist_status: ['Pending', 'Approved', 'Suspended', 'Rejected'],
};

function validateRecord(metadata, missingFields = [], recordId) {
  const report = {
    record_id: recordId || '(unknown)',
    checks: {},
    summary: { passed: 0, failed: 0, warnings: 0 },
  };

  addCheck(report, 'required_fields', {
    expected: 'no missing required fields',
    actual: missingFields.length ? `${missingFields.length} missing` : 'complete',
    pass: missingFields.length === 0,
    evidence: missingFields.length ? missingFields.join(', ') : 'All required fields present',
  });
  addEnumChecks(report, metadata);
  addApprovedDateCheck(report, metadata.approved_date);
  return report;
}

function addCheck(report, name, { expected, actual, pass, evidence, severity = 'error' }) {
  report.checks[name] = { expected, actual, pass, evidence, severity };
  if (pass) report.summary.passed++;
  else if (severity === 'warning') report.summary.warnings++;
  else report.summary.failed++;
}

function addEnumCheck(report, name, allowedValues, actual, validEvidence, invalidEvidence) {
  const pass = allowedValues.includes(actual);
  addCheck(report, name, {
    expected: allowedValues.join(' | '), actual, pass,
    evidence: pass ? validEvidence : invalidEvidence,
  });
}

function addEnumChecks(report, metadata) {
  if (metadata.scope) addEnumCheck(report, 'scope_value', enums.scope, metadata.scope, 'Valid enum value', `Unknown value: ${metadata.scope}`);
  if (metadata.primary_domain) addEnumCheck(report, 'primary_domain_value', enums.primary_domain, metadata.primary_domain, 'Valid enum value', `Unknown value: ${metadata.primary_domain}`);

  const allowedDocumentTypes = documentTypesByScope[metadata.scope];
  if (allowedDocumentTypes && metadata.document_type) {
    addEnumCheck(report, 'document_type_value', allowedDocumentTypes, metadata.document_type, `Valid for ${metadata.scope}`, `Not allowed for ${metadata.scope}`);
  }
  if (metadata.scope === 'Knowledge Base' && metadata.status) {
    addEnumCheck(report, 'status_value', enums.status, metadata.status, 'Valid enum value', `Unknown value: ${metadata.status}`);
  }
  if (metadata.authority_level && metadata.authority_level !== 'N/A') {
    addEnumCheck(report, 'authority_level_value', enums.authority_level, metadata.authority_level, 'Valid enum value', `Unknown value: ${metadata.authority_level}`);
  }
  if (metadata.scope === 'External Reference' && metadata.whitelist_status) {
    addEnumCheck(report, 'whitelist_status_value', enums.whitelist_status, metadata.whitelist_status, 'Valid enum value', `Unknown value: ${metadata.whitelist_status}`);
  }
}

function addApprovedDateCheck(report, approvedDate) {
  if (!approvedDate) return;
  const today = getLocalIsoDate();
  const pass = approvedDate <= today;
  addCheck(report, 'approved_date_not_future', {
    expected: `on or before ${today}`, actual: approvedDate, pass,
    evidence: pass
      ? `Approved Date ${approvedDate} is not in the future`
      : `Approved Date ${approvedDate} is later than today (${today})`,
  });
}

function getLocalIsoDate(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function attachValidation(document) {
  const validationReport = validateRecord(document, document.missing_fields, document.record_id);
  return {
    ...document,
    validation_status: validationReport.summary.failed > 0 ? 'invalid' : 'valid',
    validation_report: validationReport,
  };
}

async function getValidationReport(input = {}, deps = {}) {
  const registry = await getKnowledgeMetadata(input, deps);
  const documents = registry.documents.map(attachValidation);
  const validDocs = documents.filter(doc => doc.validation_status === 'valid');
  const invalidDocs = documents.filter(doc => doc.validation_status === 'invalid');

  return {
    success: true,
    source: 'lark_base',
    timestamp: new Date().toISOString(),
    record_count: registry.record_count,
    skipped_empty_record_count: registry.skipped_empty_record_count,
    summary: {
      total: documents.length,
      valid: validDocs.length,
      invalid: invalidDocs.length,
      with_warnings: documents.filter(doc => doc.validation_report.summary.warnings > 0).length,
    },
    report_text: buildValidationReportText(registry, documents, validDocs, invalidDocs),
    documents,
  };
}

function buildValidationReportText(registry, documents, validDocs, invalidDocs) {
  const lines = [
    '# Knowledge Registry Validation Report',
    `Generated: ${new Date().toISOString()}`,
    `Total Records: ${registry.record_count}`,
    `Skipped Empty Rows: ${registry.skipped_empty_record_count}`,
    'Validation Mode: Schema Freeze v1.0 checks (required fields + Scope-specific enums)',
    '', '---', '', '## Summary of Validation Issues', '',
    `**Overall: ${validDocs.length} VALID | ${invalidDocs.length} INVALID (${percentage(documents.length, validDocs.length)}% valid)**`,
    '', '### Validation Statistics by Scope', '',
    ...scopeSummaryLines(documents),
    ...missingFieldSummaryLines(invalidDocs),
    '', '### Invalid Records Requiring Changes', '',
    ...invalidRecordLines(invalidDocs),
    '### Valid Records', '',
    ...(validDocs.length ? validDocs.map((doc, index) => `${index + 1}. **${doc.record_id}** - "${doc.title || '(no title)'}" (${doc.scope || 'Unknown'})`) : ['No valid records found.']),
    '', '---', '', '## Detailed Validation Report', '',
    ...documents.flatMap(detailedRecordLines),
  ];
  return lines.join('\n');
}

function percentage(total, count) {
  return total ? Math.round((count / total) * 100) : 0;
}

function scopeSummaryLines(documents) {
  const groups = {};
  for (const doc of documents) {
    const scope = doc.scope || 'Unknown';
    groups[scope] ||= { valid: 0, invalid: 0 };
    groups[scope][doc.validation_status]++;
  }
  return Object.entries(groups).map(([scope, stats]) => {
    const total = stats.valid + stats.invalid;
    return `- **${scope}**: ${stats.valid}/${total} valid (${percentage(total, stats.valid)}%)`;
  });
}

function missingFieldSummaryLines(documents) {
  const counts = {};
  for (const doc of documents) for (const field of doc.missing_fields || []) counts[field] = (counts[field] || 0) + 1;
  const entries = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  return entries.length ? ['', '### Missing Required Fields Summary', '', ...entries.map(([field, count]) => `- \`${field}\`: missing in ${count} record${count > 1 ? 's' : ''}`)] : [];
}

function invalidRecordLines(documents) {
  if (!documents.length) return ['No invalid records found.', ''];
  return documents.flatMap((doc, index) => [
    `#### ${index + 1}. **${doc.record_id}** - "${doc.title || '(no title)'}"`,
    `- **Scope**: ${doc.scope || 'Unknown'}`,
    ...(doc.missing_fields?.length ? [`- **Missing Required Fields**: ${doc.missing_fields.length}`, ...doc.missing_fields.map(field => `  - \`${field}\``)] : []),
    `- **Action**: ${requiredActions(doc).join(' ')}`, '',
  ]);
}

function requiredActions(doc) {
  const actions = [];
  if (doc.missing_fields?.length) actions.push(`Add required field${doc.missing_fields.length > 1 ? 's' : ''}: ${doc.missing_fields.join(', ')}.`);
  for (const [name, check] of Object.entries(doc.validation_report.checks)) {
    if (check.pass || check.severity === 'warning' || name === 'required_fields') continue;
    if (name === 'approved_date_not_future') actions.push(`Change Approved Date to today or an earlier date. Current value ${check.actual}; expected ${check.expected}.`);
    else if (name.endsWith('_value')) actions.push(`Select a valid ${name.replace(/_value$/, '').replaceAll('_', ' ')}. Current value is ${check.actual}; allowed values are ${check.expected}.`);
    else actions.push(`${name.replaceAll('_', ' ')} failed: expected ${check.expected}, actual ${check.actual}. ${check.evidence}.`);
  }
  return actions.length ? actions : ['Review this record.'];
}

function detailedRecordLines(doc) {
  const summary = doc.validation_report.summary;
  return [
    `## Record: ${doc.record_id}`, `Title: ${doc.title || '(no title)'}`, `Scope: ${doc.scope || '(no scope)'}`, '',
    '### Validation Checks', '',
    ...Object.entries(doc.validation_report.checks).flatMap(([name, check]) => [
      `**${name}**: ${check.severity === 'warning' ? 'WARNING' : check.pass ? 'PASS' : 'FAIL'}`,
      `  - Expected: ${JSON.stringify(check.expected)}`,
      `  - Actual: ${JSON.stringify(check.actual)}`,
      `  - Evidence: ${check.evidence}`, '',
    ]),
    ...(doc.missing_fields?.length ? ['### Missing Required Fields', ...doc.missing_fields.map(field => `- ${field}`), ''] : []),
    '### Summary', `- Overall Status: ${doc.validation_status.toUpperCase()}`,
    `- Retrieval Eligible: ${doc.retrieval_eligible}`, `- Checks Passed: ${summary.passed}`,
    `- Checks Failed: ${summary.failed}`, `- Warnings: ${summary.warnings}`, '', '---', '',
  ];
}

module.exports = { getValidationReport, validateRecord, attachValidation, enums };
