const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
  authorizeUrl,
  checkExternalUrls,
  getApprovedWebDomains,
} = require('../../tools/lark/knowledge/external-web-governance');

const whitelistRows = [
  { record_id: 'approved', fields: { Domain: 'housingauthority.gov.hk', 'Whitelist Status': 'Approved', 'Source Name': 'Housing Authority' } },
  { record_id: 'pending', fields: { Domain: 'pending.example', 'Whitelist Status': 'Pending' } },
  { record_id: 'duplicate', fields: { Domain: 'www.housingauthority.gov.hk', 'Whitelist Status': 'Approved' } },
  { record_id: 'blank', fields: {} },
];

const deps = { readWhitelist: async () => whitelistRows };

test('returns unique Approved domains only', async () => {
  const result = await getApprovedWebDomains({ query: 'housing policy' }, deps);
  assert.equal(result.approved_domain_count, 1);
  assert.equal(result.approved_domains[0].domain, 'housingauthority.gov.hk');
  assert.equal(result.query, 'housing policy');
});

test('allows exact approved hosts and real subdomains', async () => {
  const result = await checkExternalUrls({ urls: [
    'https://housingauthority.gov.hk/notice',
    'https://hos.housingauthority.gov.hk/notice',
  ] }, deps);
  assert.equal(result.all_approved, true);
  assert.equal(result.approved_count, 2);
  assert.equal(result.results[1].matched_domain, 'housingauthority.gov.hk');
});

test('blocks lookalikes, pending domains, HTTP, credentials and invalid URLs', async () => {
  const result = await checkExternalUrls({ urls: [
    'https://housingauthority.gov.hk.fake-site.com',
    'https://pending.example/page',
    'http://housingauthority.gov.hk/page',
    'https://user:password@housingauthority.gov.hk/page',
    'not-a-url',
  ] }, deps);
  assert.equal(result.all_approved, false);
  assert.equal(result.blocked_count, 5);
  assert.deepEqual(result.results.map(item => item.reason), [
    'domain_not_approved', 'domain_not_approved', 'https_required', 'https_required', 'invalid_url',
  ]);
});

test('authorization fails closed when no approved domain matches', () => {
  const result = authorizeUrl('https://example.com', []);
  assert.equal(result.approved, false);
  assert.equal(result.reason, 'domain_not_approved');
});
