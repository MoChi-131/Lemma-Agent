require('dotenv').config({ quiet: true });
const assert = require('node:assert/strict');
const { getKnowledgeMetadata } = require('../../integrations/lark/knowledge/knowledge-registry');
const { getApprovedWebDomains } = require('../../tools/lark/knowledge/external-web-governance');
const { officialMcp } = require('../../integrations/lark/official-mcp/client');

// Read-only live acceptance: no record titles, URLs, receipts or credentials printed.
async function main() {
  try {
    const metadata = await getKnowledgeMetadata();
    assert.equal(metadata.success, true);
    assert.equal(metadata.record_count, metadata.documents.length);
    const whitelist = await getApprovedWebDomains();
    assert.equal(whitelist.success, true);
    console.log(JSON.stringify({
      status: 'PASS',
      verified_published_metadata: true,
      record_count: metadata.record_count,
      retrieval_eligible_count: metadata.documents.filter(doc => doc.retrieval_eligible).length,
      skipped_empty_record_count: metadata.skipped_empty_record_count,
      approved_domain_count: whitelist.approved_domain_count,
      access: 'read_only',
    }, null, 2));
  } finally {
    await officialMcp.close();
  }
}

main().catch(() => {
  console.error('Base acceptance failed. Check the configured mirror, Journal, whitelist, application permissions and safe server logs.');
  process.exitCode = 1;
});
