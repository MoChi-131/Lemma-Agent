const {
  domainMatches,
  isEmptyRecord,
  normalizeDomain,
  normalizeWhitelistRecord,
  readExternalWhitelist,
} = require('../../../integrations/lark/knowledge/knowledge-registry');

/** Return the approved domains that may be supplied to an external web search. */
async function getApprovedWebDomains(input = {}, deps = {}) {
  const readWhitelist = deps.readWhitelist || readExternalWhitelist;
  const rows = await readWhitelist({ whitelistUrl: input.whitelistUrl }, deps);
  const approved = rows
    .filter(record => !isEmptyRecord(record))
    .map(normalizeWhitelistRecord)
    .filter(record => record.domain && record.status === 'Approved');

  const unique = new Map();
  for (const record of approved) {
    if (!unique.has(record.domain)) unique.set(record.domain, record);
  }

  return {
    success: true,
    source: 'external_whitelist_base',
    action: 'restrict_web_search_to_approved_domains',
    query: input.query || null,
    approved_domain_count: unique.size,
    approved_domains: [...unique.values()],
  };
}

/** Fail closed: only HTTPS URLs on an approved host or real subdomain pass. */
async function checkExternalUrls(input, deps = {}) {
  const whitelist = await getApprovedWebDomains(input, deps);
  const results = input.urls.map(url => authorizeUrl(url, whitelist.approved_domains));

  return {
    success: true,
    source: whitelist.source,
    action: 'check_external_urls',
    all_approved: results.every(result => result.approved),
    approved_count: results.filter(result => result.approved).length,
    blocked_count: results.filter(result => !result.approved).length,
    results,
  };
}

function authorizeUrl(value, approvedDomains) {
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    return blockedResult(value, null, 'invalid_url');
  }

  if (parsed.protocol !== 'https:' || parsed.username || parsed.password) {
    return blockedResult(value, normalizeDomain(value), 'https_required');
  }

  const documentDomain = normalizeDomain(value);
  const match = approvedDomains.find(record => domainMatches(documentDomain, record.domain));
  if (!match) return blockedResult(value, documentDomain, 'domain_not_approved');

  return {
    url: value,
    document_domain: documentDomain,
    approved: true,
    reason: 'approved_domain_match',
    matched_domain: match.domain,
    source_name: match.source_name,
    whitelist_record_id: match.record_id,
  };
}

function blockedResult(url, documentDomain, reason) {
  return {
    url,
    document_domain: documentDomain,
    approved: false,
    reason,
    matched_domain: null,
    source_name: null,
    whitelist_record_id: null,
  };
}

module.exports = { authorizeUrl, checkExternalUrls, getApprovedWebDomains };
