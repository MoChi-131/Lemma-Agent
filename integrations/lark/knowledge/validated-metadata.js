const { createHash } = require('node:crypto');

// A failed or in-progress publication must not expose half-updated metadata.
async function readValidatedMetadata({ validatedUrl, journalUrl }, { readTable }) {
  if (!validatedUrl || !journalUrl) throw new Error('Configure LARK_VALIDATED_METADATA_URL and LARK_VALIDATION_JOURNAL_URL before knowledge retrieval.');
  const journalRows = await readTable(journalUrl);
  const publications = journalRows.map(row => parseReceipt(row.fields?.['Receipt JSON']))
    .filter(receipt => receipt?.state === 'published' && sameTable(receipt.recovery_url, validatedUrl));
  publications.sort((a, b) => Date.parse(b.published_at) - Date.parse(a.published_at));
  const latest = publications[0];
  if (!latest || !Number.isFinite(Date.parse(latest.published_at)) || !Array.isArray(latest.published_records)
      || rowsHash(latest.published_records) !== latest.published_hash) {
    throw new Error('No verified published metadata version is available; do not read the working Registry.');
  }
  const rows = await readTable(validatedUrl);
  // The Journal holds the last complete version while the table is being refreshed.
  return rowsHash(rows) === latest.published_hash ? rows : latest.published_records;
}

function parseReceipt(value) {
  const text = Array.isArray(value) ? value.map(item => item?.text || '').join('')
    : typeof value === 'object' ? value?.text : value;
  try { return JSON.parse(text); } catch { return null; }
}

function sameTable(left, right) {
  try {
    const a = new URL(left); const b = new URL(right);
    return a.origin === b.origin && a.pathname === b.pathname && a.searchParams.get('table') === b.searchParams.get('table');
  } catch { return false; }
}

// Same canonical hash contract as the independent management service.
function rowsHash(rows) {
  const value = rows.filter(row => Object.keys(row.fields || {}).length > 0)
    .slice().sort((a, b) => a.record_id.localeCompare(b.record_id))
    .map(row => ({ record_id: row.record_id, fields: row.fields }));
  return createHash('sha256').update(stableJson(value)).digest('hex');
}

function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(',')}}`;
  return JSON.stringify(value);
}

module.exports = { readValidatedMetadata };
