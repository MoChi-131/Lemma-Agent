
const DEFAULT_REGISTRY_URL = 'https://ysgjyjx6z20y.sg.larksuite.com/wiki/KkWCwccRviWlJLk8bAFlEToagKc?table=tbllHIJ3Mx3zQ1BS';

/**
 * Fetch raw Base records without modifying them or reading document bodies.
 * registryUrl precedence: explicit argument > LARK_REGISTRY_URL > project default.
 * deps supplies optional getToken/getWikiNode/fetch replacements for offline tests.
 * Resolves a Wiki-hosted Base, then follows every records page. Throws on failure;
 * an incomplete read must never be mistaken for a document being absent.
 * @returns {Promise<Array>} Lark records shaped as { record_id, fields }.
 * @example const records = await readKnowledgeRegistry({ registryUrl: baseUrl });
 */
// Read the whole table, deliberately ignoring view filters so lookup cannot hide records.
async function readKnowledgeRegistry({ registryUrl = process.env.LARK_REGISTRY_URL || DEFAULT_REGISTRY_URL } = {}, deps = {}) {
  const url = new URL(registryUrl);
  const match = url.pathname.match(/^\/(wiki|base)\/([a-zA-Z0-9]+)\/?$/);
  const table = url.searchParams.get('table');
  if (url.protocol !== 'https:' || !/^[a-z0-9.-]+\.larksuite\.com$/i.test(url.hostname) || url.username || url.password || url.port || !match || !/^tbl[a-zA-Z0-9]+$/.test(table || '')) {
    throw new Error('Use an HTTPS Lark Base or Wiki URL with a table parameter.');
  }
  // One timeout covers authentication, Wiki resolution, and all record pages.
  const signal = AbortSignal.timeout(60000);
  let app = match[2];
  let stage = 'authentication';
  let httpStatus;
  let apiCode;
  try {
    const token = await (deps.getToken || require('./auth').getTenantAccessToken)({ signal });
    if (match[1] === 'wiki') {
      // A Wiki node token is not a Base app token; obj_token supplies the latter.
      stage = 'wiki_resolution';
      const node = await (deps.getWikiNode || require('./wiki').getWikiNode)(app, { signal });
      if (node.obj_type !== 'bitable') throw new Error('Not a Base');
      app = node.obj_token;
    }
    if (!/^[a-zA-Z0-9]+$/.test(app || '')) throw new Error('Invalid Base token');
    stage = 'base_records';
    const records = [];
    const seenPages = new Set();
    // The API returns at most one page per request; page_token is its next cursor.
    // Repeated/missing cursors and the page cap fail instead of silently truncating.
    let pageToken;
    for (let page = 0; page < 100; page++) {
      const query = new URLSearchParams({ page_size: '500' });
      if (pageToken) query.set('page_token', pageToken);
      const response = await (deps.fetch || fetch)(`https://open.larksuite.com/open-apis/bitable/v1/apps/${app}/tables/${table}/records?${query}`, {
        signal, headers: { Authorization: `Bearer ${token}` },
      });
      const body = await response.json();
      httpStatus = response.status;
      apiCode = Number.isInteger(body.code) ? body.code : undefined;
      if (!response.ok || body.code !== 0 || !Array.isArray(body.data?.items)) throw new Error('Read failed');
      records.push(...body.data.items);
      if (body.data.has_more === false) return records;
      pageToken = body.data.page_token;
      if (body.data.has_more !== true || typeof pageToken !== 'string' || !pageToken || seenPages.has(pageToken)) throw new Error('Invalid pagination');
      seenPages.add(pageToken);
    }
    throw new Error('Page limit exceeded');
  } catch (error) {
    // Legacy auth/wiki helpers embed JSON errors. Extract only a numeric code.
    const legacyCode = /"code"\s*:\s*(-?\d+)/.exec(error.message || '');
    if (apiCode === undefined && legacyCode) apiCode = Number(legacyCode[1]);
    const network = error.cause?.code;
    const safeNetwork = ['ENOTFOUND', 'ECONNREFUSED', 'ETIMEDOUT', 'ECONNRESET', 'UND_ERR_CONNECT_TIMEOUT'].includes(network) ? network : undefined;
    const hints = {
      authentication: 'Check LARK_APP_ID and LARK_APP_SECRET in .env.',
      wiki_resolution: 'Check Wiki read permission, access to the Wiki node, and that the URL points to a Base.',
      base_records: 'Check Base record read permission and access to the specified table.',
    };
    const detail = [Number.isInteger(httpStatus) ? `HTTP ${httpStatus}` : null,
      Number.isInteger(apiCode) ? `Lark code ${apiCode}` : null, safeNetwork,
      signal.aborted ? 'timeout' : null].filter(Boolean).join(', ');
    throw new Error(`Registry read failed at ${stage}${detail ? ` (${detail})` : ''}. ${hints[stage]} No complete result was returned.`);
  }
}

// Output JSON keys -> exact Base column labels. A renamed/missing column reads null.
const fields = {
  title: 'Title', lark_url: 'Lark URL', scope: 'Scope', primary_domain: 'Primary Domain',
  document_type: 'Document Type', tags: 'Tags', owner_person: 'Owner Person',
  authority_level: 'Authority Level', status: 'Status', version: 'Version',
  approved_by: 'Approved By', approved_date: 'Approved Date', last_reviewed_date: 'Last Reviewed Date',
  review_cycle_days: 'Review Cycle Days', next_review_date: 'Next Review Date',
  source_domain: 'Source Domain', whitelist_status: 'Whitelist Status',
};
/** Extract a URL, text fragment, or person name from Lark's varying cell shapes.
 * Rich-text fragments are joined; multi-value tags/people are handled separately.
 * Unknown object shapes become null rather than guessed strings.
 */
function text(value) {
  if (value == null || value === '') return null;
  if (Array.isArray(value)) return value.map(text).filter(v => v != null).join('');
  if (typeof value === 'object') return value.link || value.text || value.name || null;
  return String(value);
}
/**
 * Convert one raw record into metadata plus a conditional required-field report.
 * Pure function: no API requests and no mutation of the source record.
 * This checks presence only, not enum validity, approver authority or date validity.
 * @example normalizeRecord({ record_id: 'example', fields: { Title: 'Example' } });
 */
function normalizeRecord(record) {
  const raw = record.fields || {};
  const metadata = {};
  for (const [key, label] of Object.entries(fields)) {
    const value = raw[label];
    if (['owner_person', 'approved_by', 'tags'].includes(key)) {
      metadata[key] = value == null ? null : (Array.isArray(value) ? value : [value]).map(text);
    } else if (key.endsWith('_date') || key === 'review_cycle_days') {
      // Preserve native values: date fields may be epoch milliseconds, formula
      // dates may be arrays of text objects, and cycle values may be strings.
      // This prototype does not yet standardize dates/numbers or calculate dates.
      metadata[key] = value == null || value === '' ? null : value;
    } else metadata[key] = text(value);
  }
  // Apply the dictionary's required fields according to Scope and Document Type.
  // Optional blanks are not listed; [] means no detected REQUIRED-field gaps.
  const required = ['title', 'scope', 'primary_domain', 'document_type'];
  if (metadata.scope === 'Knowledge Base') {
    required.push('lark_url', 'owner_person', 'authority_level', 'status', 'last_reviewed_date');
    if (['SOP', 'Pricing', 'Policy', 'Product Spec'].includes(metadata.document_type)) required.push('version');
    if (['Approved', 'Active'].includes(metadata.status)) required.push('approved_by', 'approved_date');
  } else if (metadata.scope === 'Workspace') required.push('lark_url');
  else if (metadata.scope === 'External Reference') required.push('source_domain', 'whitelist_status', 'authority_level');
  const missing_fields = required.filter(key => metadata[key] == null || metadata[key] === '' || metadata[key] === 'N/A' || (Array.isArray(metadata[key]) && metadata[key].length === 0));
  // null = not an external record; false = external but not marked Approved.
  // true reflects the stored status only, not an independent whitelist audit.
  return { record_id: record.record_id, metadata, missing_fields,
    // Completeness under the current required-field checks, not governance approval.
    validation_status: missing_fields.length === 0 ? 'valid' : 'invalid',
    external_source_approved: metadata.scope === 'External Reference' ? metadata.whitelist_status === 'Approved' : null };
}

/**
 * Public reader: omit input.url to list all records, or supply an exact document
 * URL to look up matches. input.registryUrl selects the Base, not the document.
 * found is included only for lookups. Duplicate matches are retained for review.
 * URL matching does not remove query strings, fragments, or trailing slashes.
 * deps.read can replace the network reader for tests and runnable examples.
 * @example const all = await getKnowledgeMetadata();
 * @example const match = await getKnowledgeMetadata({ url: documentUrl });
 */
async function getKnowledgeMetadata(input = {}, deps = {}) {
  if (input.url !== undefined) {
    const url = new URL(input.url);
    if (url.protocol !== 'https:' || url.username || url.password) throw new Error('Lookup requires an HTTPS document URL.');
  }
  const records = await (deps.read || readKnowledgeRegistry)(input, deps);
  const documents = records.map(normalizeRecord).filter(row => !input.url || row.metadata.lark_url === input.url);
  return { success: true, source: 'lark_base', ...(input.url ? { found: documents.length > 0 } : {}),
    record_count: documents.length, documents };
}
module.exports = { readKnowledgeRegistry, normalizeRecord, getKnowledgeMetadata };
