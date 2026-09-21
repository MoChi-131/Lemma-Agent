const DEFAULT_REGISTRY_URL = 'https://ysgjyjx6z20y.sg.larksuite.com/wiki/KkWCwccRviWlJLk8bAFlEToagKc?table=tblS0JtYp4Tx3BKB&view=vewPu2Lfe7';
const DEFAULT_WHITELIST_URL = 'https://ysgjyjx6z20y.sg.larksuite.com/wiki/KkWCwccRviWlJLk8bAFlEToagKc?table=tblxxLSOp5lg3z9g';

const LARK_HOST_PATTERN = /^[a-z0-9.-]+\.larksuite\.com$/i;
const REGISTRY_PATH_PATTERN = /^\/(wiki|base)\/([a-zA-Z0-9]+)\/?$/;
const TABLE_ID_PATTERN = /^tbl[a-zA-Z0-9]+$/;
const BASE_TOKEN_PATTERN = /^[a-zA-Z0-9]+$/;
const MAX_RECORD_PAGES = 100;
const RECORD_PAGE_SIZE = '500';
const REQUEST_TIMEOUT_MS = 60000;

// Exact column labels accepted in the separate External Reference whitelist table.
// The first label in each list is the recommended field title in Lark Base.
const whitelistFields = {
  // The live pilot stores its URL in Source Name and organization in
  // Description. Prefer the frozen labels but keep that existing shape readable.
  domain: ['Domain', 'Source Domain', 'Source Name'],
  status: ['Whitelist Status', 'Status'],
  source_name: ['Description', 'Organization', 'Source Name'],
};

// Output JSON keys -> exact Base column labels. A renamed/missing column reads null.
const fields = {
  title: 'Title',
  // The Base column keeps its editor-friendly title; normalized output follows
  // the Schema Freeze v1.0 `source_url` contract.
  source_url: 'Lark URL',
  scope: 'Scope',
  primary_domain: 'Primary Domain',
  document_type: 'Document Type',
  tags: 'Tags',
  owner_person: 'Owner Person',
  lark_owner: 'Lark Owner',
  authority_level: 'Authority Level',
  status: 'Status',
  version: 'Version',
  approved_date: 'Approved Date',
  workstream: 'Workstream',
  project_name: 'Project Name',
  project_start_date: 'Project Start Date',
  project_end_date: 'Project End Date',
};

const listFieldKeys = new Set(['tags', 'owner_person', 'lark_owner']);
const dateFieldKeys = new Set(['approved_date', 'project_start_date', 'project_end_date']);

const documentTypesByScope = {
  'Knowledge Base': [
    'SOP',
    'FAQ',
    'Pricing',
    'Policy',
    'Guide',
    'Product Spec',
    'Service Info',
    'Official Notice',
    'Knowledge Article',
    'Reference',
    'Template',
  ],
  Workspace: [
    'Meeting Notes',
    'Analysis',
    'Research',
    'Planning',
    'Campaign',
    'Architecture',
    'Design',
    'Development Doc',
    'Test Doc',
    'Project Doc',
    'Report',
  ],
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

const requiredByScope = {
  // Schema Freeze v1.0 treats Owner Person as recommended and excludes review
  // and approval-workflow fields from metadata completeness.
  'Knowledge Base': ['source_url', 'authority_level', 'status'],
  Workspace: ['source_url'],
  // Source Domain is required by the contract but derived from the URL, so an
  // invalid URL still produces a clear missing-field result without a Base column.
  'External Reference': ['source_url', 'source_domain', 'authority_level'],
};

const versionRequiredDocumentTypes = ['SOP', 'Pricing', 'Policy', 'Product Spec'];
const larkDateObjectKeys = ['text', 'value', 'date', 'result', 'formula_result', 'display_value', 'timestamp', 'dateTime'];

/**
 * Fetch raw Base records without modifying them or reading document bodies.
 * registryUrl precedence: explicit argument > LARK_REGISTRY_URL > project default.
 * deps supplies optional getToken/getWikiNode/fetch replacements for offline tests.
 *
 * @returns {Promise<Array>} Lark records shaped as { record_id, fields }.
 * @example const records = await readKnowledgeRegistry({ registryUrl: baseUrl });
 */
async function readKnowledgeRegistry(
  { registryUrl = process.env.LARK_REGISTRY_URL || DEFAULT_REGISTRY_URL } = {},
  deps = {},
) {
  const { sourceType, appToken, tableId } = parseRegistryUrl(registryUrl);
  const signal = AbortSignal.timeout(REQUEST_TIMEOUT_MS);

  let app = appToken;
  let stage = 'authentication';
  let httpStatus;
  let apiCode;

  try {
    const token = await (deps.getToken || require('../core/auth').getTenantAccessToken)({ signal });

    if (sourceType === 'wiki') {
      stage = 'wiki_resolution';
      app = await resolveWikiBaseToken(app, signal, deps);
    }

    stage = 'base_records';
    return await fetchAllBaseRecords({
      app,
      tableId,
      token,
      signal,
      deps,
      onResponse(response, body) {
        httpStatus = response.status;
        apiCode = Number.isInteger(body.code) ? body.code : undefined;
      },
    });
  } catch (error) {
    throw buildRegistryReadError({
      error,
      stage,
      httpStatus,
      apiCode: extractLegacyLarkCode(error, apiCode),
      signal,
    });
  }
}

/**
 * Read the project's separate whitelist table. LARK_WHITELIST_URL or an
 * explicit whitelistUrl can override the built-in Supermama table.
 *
 * @example const rows = await readExternalWhitelist({ whitelistUrl });
 */
async function readExternalWhitelist(
  { whitelistUrl = process.env.LARK_WHITELIST_URL || DEFAULT_WHITELIST_URL } = {},
  deps = {},
) {
  return readKnowledgeRegistry({ registryUrl: whitelistUrl }, deps);
}

function parseRegistryUrl(registryUrl) {
  const url = new URL(registryUrl);
  const pathMatch = url.pathname.match(REGISTRY_PATH_PATTERN);
  const tableId = url.searchParams.get('table');

  const isValid =
    url.protocol === 'https:' &&
    LARK_HOST_PATTERN.test(url.hostname) &&
    !url.username &&
    !url.password &&
    !url.port &&
    pathMatch &&
    TABLE_ID_PATTERN.test(tableId || '');

  if (!isValid) {
    throw new Error('Use an HTTPS Lark Base or Wiki URL with a table parameter.');
  }

  return {
    sourceType: pathMatch[1],
    appToken: pathMatch[2],
    tableId,
  };
}

async function resolveWikiBaseToken(wikiNodeToken, signal, deps) {
  const node = await (deps.getWikiNode || require('../wiki/wiki').getWikiNode)(wikiNodeToken, { signal });

  if (node.obj_type !== 'bitable') {
    throw new Error('Not a Base');
  }

  if (!BASE_TOKEN_PATTERN.test(node.obj_token || '')) {
    throw new Error('Invalid Base token');
  }

  return node.obj_token;
}

async function fetchAllBaseRecords({ app, tableId, token, signal, deps, onResponse }) {
  if (!BASE_TOKEN_PATTERN.test(app || '')) {
    throw new Error('Invalid Base token');
  }

  const records = [];
  const seenPageTokens = new Set();
  let pageToken;

  for (let page = 0; page < MAX_RECORD_PAGES; page++) {
    const { items, hasMore, nextPageToken } = await fetchBaseRecordPage({
      app,
      tableId,
      token,
      pageToken,
      signal,
      deps,
      onResponse,
    });

    records.push(...items);

    if (!hasMore) {
      return records;
    }

    if (!nextPageToken || seenPageTokens.has(nextPageToken)) {
      throw new Error('Invalid pagination');
    }

    seenPageTokens.add(nextPageToken);
    pageToken = nextPageToken;
  }

  throw new Error('Page limit exceeded');
}

async function fetchBaseRecordPage({ app, tableId, token, pageToken, signal, deps, onResponse }) {
  const query = new URLSearchParams({ page_size: RECORD_PAGE_SIZE });
  if (pageToken) query.set('page_token', pageToken);

  const response = await (deps.fetch || fetch)(
    `https://open.larksuite.com/open-apis/bitable/v1/apps/${app}/tables/${tableId}/records?${query}`,
    {
      signal,
      headers: { Authorization: `Bearer ${token}` },
    },
  );
  const body = await response.json();
  onResponse(response, body);

  if (!response.ok || body.code !== 0 || !Array.isArray(body.data?.items)) {
    throw new Error('Read failed');
  }

  return {
    items: body.data.items,
    hasMore: body.data.has_more === true,
    nextPageToken: body.data.page_token,
  };
}

function extractLegacyLarkCode(error, currentCode) {
  if (currentCode !== undefined) {
    return currentCode;
  }

  const legacyCode = /"code"\s*:\s*(-?\d+)/.exec(error.message || '');
  return legacyCode ? Number(legacyCode[1]) : undefined;
}

function buildRegistryReadError({ error, stage, httpStatus, apiCode, signal }) {
  const hints = {
    authentication: 'Check LARK_APP_ID and LARK_APP_SECRET in .env.',
    wiki_resolution: 'Check Wiki read permission, access to the Wiki node, and that the URL points to a Base.',
    base_records: 'Check Base record read permission and access to the specified table.',
  };

  const detail = [
    Number.isInteger(httpStatus) ? `HTTP ${httpStatus}` : null,
    Number.isInteger(apiCode) ? `Lark code ${apiCode}` : null,
    getSafeNetworkCode(error),
    signal.aborted ? 'timeout' : null,
  ].filter(Boolean).join(', ');

  return new Error(
    `Registry read failed at ${stage}${detail ? ` (${detail})` : ''}. ${hints[stage]} No complete result was returned.`,
  );
}

function getSafeNetworkCode(error) {
  const code = error.cause?.code;
  const safeCodes = ['ENOTFOUND', 'ECONNREFUSED', 'ETIMEDOUT', 'ECONNRESET', 'UND_ERR_CONNECT_TIMEOUT'];
  return safeCodes.includes(code) ? code : undefined;
}

/**
 * Extract a URL, text fragment, or person name from Lark's varying cell shapes.
 * Rich-text fragments are joined; unknown object shapes become null.
 */
function text(value) {
  if (value == null || value === '') return null;
  if (Array.isArray(value)) return value.map(text).filter(item => item != null).join('');
  if (typeof value === 'object') return value.link || value.text || value.name || null;
  return String(value);
}

/** True when a Base cell has no user-visible value. N/A and zero are meaningful. */
function isBlankValue(value) {
  if (value == null) return true;
  if (typeof value === 'string') return value.trim() === '';
  if (Array.isArray(value)) return value.length === 0 || value.every(isBlankValue);
  if (typeof value === 'object') {
    const values = Object.values(value);
    return values.length === 0 || values.every(isBlankValue);
  }
  return false;
}

/** A record is empty only when every returned Base field is blank. */
function isEmptyRecord(record) {
  const values = Object.values(record?.fields || {});
  return values.length === 0 || values.every(isBlankValue);
}

/** Convert supported Lark, ISO, and YYYY/MM/DD date shapes to YYYY-MM-DD. */
function normalizeDate(value) {
  if (value == null || value === '') return null;

  if (typeof value === 'number' || value instanceof Date) {
    return dateToIsoDate(value);
  }

  if (Array.isArray(value)) {
    const joined = value
      .map(item => (typeof item === 'object' && item?.text ? item.text : item))
      .filter(item => item != null)
      .join('');
    return joined ? normalizeDate(joined) : null;
  }

  if (typeof value === 'string') {
    return normalizeDateString(value);
  }

  if (typeof value === 'object') {
    return normalizeDateObject(value);
  }

  return null;
}

function dateToIsoDate(value) {
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString().split('T')[0];
}

function normalizeDateString(value) {
  const match = value.trim().match(/^(\d{4})[-/.](\d{2})[-/.](\d{2})(T|$)/);

  if (!match) {
    return null;
  }

  return dateToIsoDate(`${match[1]}-${match[2]}-${match[3]}`);
}

function normalizeDateObject(value) {
  for (const key of larkDateObjectKeys) {
    if (value[key] != null && value[key] !== '') {
      const normalized = normalizeDate(value[key]);
      if (normalized) return normalized;
    }
  }

  for (const nestedValue of Object.values(value)) {
    if (nestedValue != null && nestedValue !== '' && typeof nestedValue !== 'object') {
      const normalized = normalizeDate(nestedValue);
      if (normalized) return normalized;
    }
  }

  return null;
}

/**
 * Validate one record against the frozen v1.0 required-field and enum rules.
 * Returns Expected, Actual, PASS/FAIL/WARNING, and Evidence for each check.
 */
function validateRecord(metadata, missingFields, recordId) {
  const report = createValidationReport(recordId);

  addRequiredFieldsCheck(report, missingFields);
  addEnumChecks(report, metadata);
  addApprovedDateCheck(report, metadata.approved_date);

  return report;
}

/** An optional approval date is valid only when it is not later than today. */
function addApprovedDateCheck(report, approvedDate) {
  if (!approvedDate) return;

  const today = getLocalIsoDate();
  const pass = approvedDate <= today;

  addCheck(report, 'approved_date_not_future', {
    expected: `on or before ${today}`,
    actual: approvedDate,
    pass,
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

function createValidationReport(recordId) {
  return {
    record_id: recordId || '(unknown)',
    checks: {},
    summary: { passed: 0, failed: 0, warnings: 0 },
  };
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
    expected: allowedValues.join(' | '),
    actual,
    pass,
    evidence: pass ? validEvidence : invalidEvidence,
  });
}

function addRequiredFieldsCheck(report, missingFields) {
  addCheck(report, 'required_fields', {
    expected: 'no missing required fields',
    actual: missingFields.length > 0 ? `${missingFields.length} missing` : 'complete',
    pass: missingFields.length === 0,
    evidence: missingFields.length > 0 ? missingFields.join(', ') : 'All required fields present',
  });
}

function addEnumChecks(report, metadata) {
  if (metadata.scope) {
    addEnumCheck(report, 'scope_value', enums.scope, metadata.scope, 'Valid enum value', `Unknown value: ${metadata.scope}`);
  }

  if (metadata.primary_domain) {
    addEnumCheck(
      report,
      'primary_domain_value',
      enums.primary_domain,
      metadata.primary_domain,
      'Valid enum value',
      `Unknown value: ${metadata.primary_domain}`,
    );
  }

  const allowedDocumentTypes = documentTypesByScope[metadata.scope];
  if (allowedDocumentTypes && metadata.document_type) {
    addEnumCheck(
      report,
      'document_type_value',
      allowedDocumentTypes,
      metadata.document_type,
      `Valid for ${metadata.scope}`,
      `Not allowed for ${metadata.scope}`,
    );
  }

  if (metadata.scope === 'Knowledge Base' && metadata.status) {
    addEnumCheck(report, 'status_value', enums.status, metadata.status, 'Valid enum value', `Unknown value: ${metadata.status}`);
  }

  if (metadata.authority_level && metadata.authority_level !== 'N/A') {
    addEnumCheck(
      report,
      'authority_level_value',
      enums.authority_level,
      metadata.authority_level,
      'Valid enum value',
      `Unknown value: ${metadata.authority_level}`,
    );
  }

  if (metadata.scope === 'External Reference' && metadata.whitelist_status) {
    addEnumCheck(
      report,
      'whitelist_status_value',
      enums.whitelist_status,
      metadata.whitelist_status,
      'Valid enum value',
      `Unknown value: ${metadata.whitelist_status}`,
    );
  }
}

/**
 * Convert one raw record into metadata plus validation and whitelist eligibility.
 *
 * @example normalizeRecord({ record_id: 'example', fields: { Title: 'Example' } });
 */
function normalizeRecord(record, whitelist = []) {
  const metadata = mapBaseFieldsToMetadata(record.fields || {});
  const whitelistCheck = checkWhitelist(metadata, whitelist);

  // External governance fields come from the URL and whitelist source of truth;
  // they do not need to exist as columns in the metadata registry table.
  if (metadata.scope === 'External Reference') {
    metadata.source_domain = whitelistCheck.details.document_domain;
    metadata.whitelist_status = whitelistCheck.details.whitelist_status;
  }

  const missingFields = findMissingRequiredFields(metadata);
  const validationReport = validateRecord(metadata, missingFields, record.record_id);
  const metadataComplete = missingFields.length === 0;
  const whitelistValid = metadata.scope === 'External Reference' ? whitelistCheck.approved : null;
  const retrievalEligible = calculateRetrievalEligibility(metadata, metadataComplete, whitelistValid);

  return {
    record_id: record.record_id,
    ...metadata,
    metadata_complete: metadataComplete,
    missing_fields: missingFields,
    whitelist_valid: whitelistValid,
    retrieval_eligible: retrievalEligible,
    validation_status: hasErrorLevelFailure(validationReport) ? 'invalid' : 'valid',
    validation_report: validationReport,
    whitelist_check: whitelistCheck.details,
  };
}

function mapBaseFieldsToMetadata(rawFields) {
  const metadata = {};

  for (const [key, label] of Object.entries(fields)) {
    const value = rawFields[label];

    if (listFieldKeys.has(key)) {
      metadata[key] = value == null
        ? null
        : (Array.isArray(value) ? value : [value]).map(text).filter(item => item != null);
    } else if (dateFieldKeys.has(key)) {
      metadata[key] = normalizeDate(value);
    } else {
      metadata[key] = text(value);
    }
  }

  return metadata;
}

function findMissingRequiredFields(metadata) {
  const required = ['title', 'scope', 'primary_domain', 'document_type'];

  required.push(...(requiredByScope[metadata.scope] || []));

  if (metadata.scope === 'Knowledge Base' && versionRequiredDocumentTypes.includes(metadata.document_type)) {
    required.push('version');
  }

  return required.filter(key => isMissingRequiredValue(metadata[key]));
}

function isMissingRequiredValue(value) {
  return isBlankValue(value) || value === 'N/A';
}

function hasErrorLevelFailure(validationReport) {
  return Object.values(validationReport.checks).some(check => !check.pass && check.severity !== 'warning');
}

/** Convert a whitelist Base row into the small shape needed for matching. */
function normalizeWhitelistRecord(record) {
  const rawFields = record.fields || {};

  return {
    record_id: record.record_id,
    domain: normalizeDomain(readFirstField(rawFields, whitelistFields.domain)),
    status: text(readFirstField(rawFields, whitelistFields.status)),
    source_name: text(readFirstField(rawFields, whitelistFields.source_name)),
  };
}

function readFirstField(rawFields, labels) {
  for (const label of labels) {
    if (!isBlankValue(rawFields[label])) return rawFields[label];
  }

  return null;
}

/** Normalize a URL or domain cell for reliable comparisons. */
function normalizeDomain(value) {
  const raw = text(value)?.trim().toLowerCase();
  if (!raw) return null;

  try {
    const url = new URL(raw.includes('://') ? raw : `https://${raw}`);
    return url.hostname.replace(/^www\./, '').replace(/\.$/, '') || null;
  } catch {
    return null;
  }
}

function getDocumentDomain(metadata) {
  return normalizeDomain(metadata.source_url) || normalizeDomain(metadata.source_domain);
}

/** Parent domains approve their exact host and real subdomains only. */
function domainMatches(documentDomain, approvedDomain) {
  return Boolean(
    documentDomain &&
    approvedDomain &&
    (documentDomain === approvedDomain || documentDomain.endsWith(`.${approvedDomain}`)),
  );
}

function checkWhitelist(metadata, whitelist) {
  if (metadata.scope !== 'External Reference') {
    return { approved: null, details: null };
  }

  const documentDomain = getDocumentDomain(metadata);
  const match = whitelist.find(entry => domainMatches(documentDomain, entry.domain));
  const approved = match?.status === 'Approved';

  return {
    approved,
    details: {
      document_domain: documentDomain,
      matched_domain: match?.domain || null,
      whitelist_status: match?.status || null,
      source_name: match?.source_name || null,
      whitelist_record_id: match?.record_id || null,
    },
  };
}

/** Apply the frozen v1.0 retrieval gate after completeness and whitelist checks. */
function calculateRetrievalEligibility(metadata, metadataComplete, whitelistValid) {
  if (!metadataComplete) return false;

  if (metadata.scope === 'Knowledge Base') {
    return metadata.status === 'Approved' &&
      ['Internal Official', 'Reference'].includes(metadata.authority_level);
  }

  if (metadata.scope === 'External Reference') {
    return whitelistValid === true &&
      ['External Official', 'Reference'].includes(metadata.authority_level);
  }

  // Workspace and unknown scopes never enter formal Knowledge Retrieval.
  return false;
}

/**
 * Public reader: omit input.url to list all records, or supply an exact document URL.
 *
 * @example const all = await getKnowledgeMetadata();
 * @example const match = await getKnowledgeMetadata({ url: documentUrl });
 */
async function getKnowledgeMetadata(input = {}, deps = {}) {
  validateLookupUrl(input.url);

  const records = await (deps.read || readKnowledgeRegistry)(input, deps);
  const nonEmptyRecords = records.filter(record => !isEmptyRecord(record));
  const needsWhitelist = nonEmptyRecords.some(record => text(record.fields?.Scope) === 'External Reference');
  const whitelist = needsWhitelist ? await loadWhitelist(input, deps) : [];
  const documents = nonEmptyRecords
    .map(record => normalizeRecord(record, whitelist))
    .filter(row => !input.url || row.source_url === input.url);

  return {
    success: true,
    source: 'lark_base',
    ...(input.url ? { found: documents.length > 0 } : {}),
    record_count: documents.length,
    skipped_empty_record_count: records.length - nonEmptyRecords.length,
    documents,
  };
}

async function loadWhitelist(input, deps) {
  // Tests can inject readWhitelist without credentials or network access.
  const rows = deps.readWhitelist
    ? await deps.readWhitelist(input, deps)
    : deps.read
      ? []
      : await readExternalWhitelist(input, deps);

  return rows
    .filter(record => !isEmptyRecord(record))
    .map(normalizeWhitelistRecord)
    .filter(record => record.domain);
}

function validateLookupUrl(url) {
  if (url === undefined) {
    return;
  }

  const parsed = new URL(url);
  if (parsed.protocol !== 'https:' || parsed.username || parsed.password) {
    throw new Error('Lookup requires an HTTPS document URL.');
  }
}

/**
 * Generate a Markdown validation report plus structured summary data.
 *
 * @example const report = await getValidationReport({ registryUrl });
 */
async function getValidationReport(input = {}, deps = {}) {
  const result = await getKnowledgeMetadata(input, deps);
  const validDocs = result.documents.filter(doc => doc.validation_status === 'valid');
  const invalidDocs = result.documents.filter(doc => doc.validation_status === 'invalid');

  return {
    success: true,
    source: 'lark_base',
    timestamp: new Date().toISOString(),
    record_count: result.record_count,
    skipped_empty_record_count: result.skipped_empty_record_count,
    summary: buildValidationSummary(result.documents),
    report_text: buildValidationReportText({ result, validDocs, invalidDocs }),
    documents: result.documents,
  };
}

function buildValidationSummary(documents) {
  return {
    total: documents.length,
    valid: documents.filter(doc => doc.validation_status === 'valid').length,
    invalid: documents.filter(doc => doc.validation_status === 'invalid').length,
    with_warnings: documents.filter(doc => doc.validation_report?.summary.warnings > 0).length,
  };
}

function buildValidationReportText({ result, validDocs, invalidDocs }) {
  const lines = [
    '# Knowledge Registry Validation Report',
    `Generated: ${new Date().toISOString()}`,
    `Total Records: ${result.record_count}`,
    `Skipped Empty Rows: ${result.skipped_empty_record_count}`,
    'Validation Mode: Schema Freeze v1.0 checks (required fields + Scope-specific enums)',
    '',
    '---',
    '',
    '## Summary of Validation Issues',
    '',
    `**Overall: ${validDocs.length} VALID | ${invalidDocs.length} INVALID (${getValidPercentage(result.record_count, validDocs.length)}% valid)**`,
    '',
    '### Validation Statistics by Scope',
    '',
    ...buildScopeSummaryLines(result.documents),
    ...buildMissingFieldSummaryLines(invalidDocs),
    '',
    '### Invalid Records Requiring Changes',
    '',
    ...buildInvalidRecordLines(invalidDocs),
    '### Valid Records',
    '',
    ...buildValidRecordLines(validDocs),
    '',
    '---',
    '',
    '## Detailed Validation Report',
    '',
    ...buildDetailedRecordLines(result.documents),
  ];

  return lines.join('\n');
}

function getValidPercentage(total, validCount) {
  return total > 0 ? Math.round((validCount / total) * 100) : 0;
}

function buildScopeSummaryLines(documents) {
  return Object.entries(groupDocumentsByScope(documents)).map(([scope, stats]) => {
    const total = stats.valid + stats.invalid;
    return `- **${scope}**: ${stats.valid}/${total} valid (${getValidPercentage(total, stats.valid)}%)`;
  });
}

function groupDocumentsByScope(documents) {
  const byScope = {};

  for (const doc of documents) {
    const scope = doc.scope || 'Unknown';
    if (!byScope[scope]) byScope[scope] = { valid: 0, invalid: 0 };
    byScope[scope][doc.validation_status === 'valid' ? 'valid' : 'invalid']++;
  }

  return byScope;
}

function buildMissingFieldSummaryLines(invalidDocs) {
  const entries = Object.entries(countMissingFields(invalidDocs)).sort((a, b) => b[1] - a[1]);

  if (entries.length === 0) {
    return [];
  }

  return [
    '',
    '### Missing Required Fields Summary',
    '',
    ...entries.map(([field, count]) => `- \`${field}\`: missing in ${count} record${count > 1 ? 's' : ''}`),
  ];
}

function countMissingFields(documents) {
  const stats = {};

  for (const doc of documents) {
    for (const field of doc.missing_fields || []) {
      stats[field] = (stats[field] || 0) + 1;
    }
  }

  return stats;
}

function buildInvalidRecordLines(invalidDocs) {
  if (invalidDocs.length === 0) {
    return ['No invalid records found.', ''];
  }

  return invalidDocs.flatMap((doc, index) => {
    const action = buildRequiredActions(doc).join(' ');

    return [
      `#### ${index + 1}. **${doc.record_id}** - "${doc.title || '(no title)'}"`,
      `- **Scope**: ${doc.scope || 'Unknown'}`,
      ...buildInvalidRecordMissingFieldLines(doc),
      `- **Action**: ${action}`,
      '',
    ];
  });
}

function buildRequiredActions(doc) {
  const actions = [];

  if (doc.missing_fields?.length) {
    actions.push(`Add required field${doc.missing_fields.length > 1 ? 's' : ''}: ${doc.missing_fields.join(', ')}.`);
  }

  for (const [checkName, check] of getFailedErrorChecks(doc)) {
    if (checkName === 'required_fields') continue;
    actions.push(describeFailedCheck(checkName, check));
  }

  return actions.length ? actions : ['Review this record.'];
}

function describeFailedCheck(checkName, check) {
  if (checkName === 'approved_date_not_future') {
    return `Change Approved Date to today or an earlier date. Current value ${check.actual}; expected ${check.expected}.`;
  }

  if (checkName.endsWith('_format')) {
    const field = checkName.replace(/_format$/, '').replaceAll('_', ' ');
    return `Correct ${field}. Expected ${check.expected}; current value is ${check.actual}.`;
  }

  if (checkName.endsWith('_value')) {
    const field = checkName.replace(/_value$/, '').replaceAll('_', ' ');
    return `Select a valid ${field}. Current value is ${check.actual}; allowed values are ${check.expected}.`;
  }

  return `${checkName.replaceAll('_', ' ')} failed: expected ${check.expected}, actual ${check.actual}. ${check.evidence}.`;
}

function buildInvalidRecordMissingFieldLines(doc) {
  if (!doc.missing_fields?.length) {
    return [];
  }

  return [
    `- **Missing Required Fields**: ${doc.missing_fields.length}`,
    ...doc.missing_fields.map(field => `  - \`${field}\``),
  ];
}

function getFailedErrorChecks(doc) {
  return Object.entries(doc.validation_report?.checks || {})
    .filter(([, check]) => !check.pass && check.severity !== 'warning');
}

function buildValidRecordLines(validDocs) {
  if (validDocs.length === 0) {
    return ['No valid records found.'];
  }

  return validDocs.map((doc, index) => (
    `${index + 1}. **${doc.record_id}** - "${doc.title || '(no title)'}" (${doc.scope || 'Unknown'})`
  ));
}

function buildDetailedRecordLines(documents) {
  return documents.flatMap(doc => [
    `## Record: ${doc.record_id}`,
    `Title: ${doc.title || '(no title)'}`,
    `Scope: ${doc.scope || '(no scope)'}`,
    '',
    ...buildValidationCheckLines(doc),
    ...buildMissingFieldsLines(doc),
    ...buildRecordSummaryLines(doc),
    '---',
    '',
  ]);
}

function buildValidationCheckLines(doc) {
  const checks = Object.entries(doc.validation_report?.checks || {});
  if (checks.length === 0) {
    return [];
  }

  return [
    '### Validation Checks',
    '',
    ...checks.flatMap(([checkName, checkData]) => [
      `**${checkName}**: ${formatCheckStatus(checkData)}`,
      `  - Expected: ${JSON.stringify(checkData.expected)}`,
      `  - Actual: ${JSON.stringify(checkData.actual)}`,
      `  - Evidence: ${checkData.evidence}`,
      '',
    ]),
  ];
}

function formatCheckStatus(check) {
  if (check.severity === 'warning') return 'WARNING';
  return check.pass ? 'PASS' : 'FAIL';
}

function buildMissingFieldsLines(doc) {
  if (!doc.missing_fields?.length) {
    return [];
  }

  return [
    '### Missing Required Fields',
    ...doc.missing_fields.map(field => `- ${field}`),
    '',
  ];
}

function buildRecordSummaryLines(doc) {
  const summary = doc.validation_report?.summary;

  return [
    '### Summary',
    `- Overall Status: ${doc.validation_status.toUpperCase()}`,
    `- Retrieval Eligible: ${doc.retrieval_eligible}`,
    ...(summary ? [
      `- Checks Passed: ${summary.passed}`,
      `- Checks Failed: ${summary.failed}`,
      `- Warnings: ${summary.warnings}`,
    ] : []),
    '',
  ];
}

module.exports = {
  readKnowledgeRegistry,
  readExternalWhitelist,
  normalizeRecord,
  normalizeWhitelistRecord,
  normalizeDomain,
  domainMatches,
  getKnowledgeMetadata,
  getValidationReport,
  validateRecord,
  normalizeDate,
  isEmptyRecord,
  enums,
};
