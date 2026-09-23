const DEFAULT_REGISTRY_URL = 'https://ysgjyjx6z20y.sg.larksuite.com/wiki/KkWCwccRviWlJLk8bAFlEToagKc?table=tblhBZGzkAfGXIzw&view=vewPu2Lfe7';
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
 * Convert one raw record into retrieval metadata and governance eligibility.
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

module.exports = {
  readKnowledgeRegistry,
  readExternalWhitelist,
  normalizeRecord,
  normalizeWhitelistRecord,
  normalizeDomain,
  domainMatches,
  getKnowledgeMetadata,
  normalizeDate,
  isEmptyRecord,
};
