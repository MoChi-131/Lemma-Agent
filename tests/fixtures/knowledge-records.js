const { createHash } = require('node:crypto');
const validatedUrl = 'https://example.larksuite.com/base/fixtureBase?table=tblValidated';
const journalUrl = 'https://example.larksuite.com/base/fixtureBase?table=tblJournal';
const whitelistUrl = 'https://example.larksuite.com/base/fixtureBase?table=tblWhitelist';
const records = [
  { record_id: 'approved', fields: {
    Title: 'Approved guide', 'Lark URL': 'https://example.larksuite.com/wiki/root',
    Scope: 'Knowledge Base', 'Primary Domain': 'Service', 'Document Type': 'Guide',
    Status: 'Approved', 'Authority Level': 'Internal Official',
  } },
  { record_id: 'pending', fields: {
    Title: 'Pending guide', 'Lark URL': 'https://example.larksuite.com/wiki/pending',
    Scope: 'Knowledge Base', 'Primary Domain': 'Service', 'Document Type': 'Guide',
    Status: 'Pending', 'Authority Level': 'Internal Official',
  } },
  { record_id: 'workspace', fields: {
    Title: 'Workspace notes', 'Lark URL': 'https://example.larksuite.com/wiki/workspace',
    Scope: 'Workspace', 'Primary Domain': 'Operation', 'Document Type': 'Meeting Notes',
  } },
];
function stable(value) {
  if (Array.isArray(value)) return '[' + value.map(stable).join(',') + ']';
  if (value && typeof value === 'object') return '{' + Object.keys(value).sort().map(key => JSON.stringify(key) + ':' + stable(value[key])).join(',') + '}';
  return JSON.stringify(value);
}
const hash = createHash('sha256').update(stable(records.slice().sort((a, b) => a.record_id.localeCompare(b.record_id)))).digest('hex');
const tables = {
  tblValidated: records,
  tblJournal: [{ record_id: 'journal', fields: { 'Receipt JSON': JSON.stringify({
    state: 'published', recovery_url: validatedUrl, published_at: '2026-11-02T00:00:00Z',
    published_records: records, published_hash: hash,
  }) } }],
  tblWhitelist: [
    { record_id: 'allow', fields: { Domain: 'example.com', Status: 'Approved' } },
    { record_id: 'deny', fields: { Domain: 'pending.test', Status: 'Pending' } },
  ],
};
module.exports = { validatedUrl, journalUrl, whitelistUrl, tables };
