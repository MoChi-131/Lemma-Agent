// Live read-only CLI, not an offline unit test. Run from Lemma-Agent so dotenv
// finds .env. Existing terminal environment values take precedence over .env.
require('dotenv').config({ quiet: true });
const { getKnowledgeMetadata } = require('../integrations/lark/knowledge-registry');

async function main() {
  // npm forwards arguments after --: --url selects a document; --registry a Base.
  const args = process.argv.slice(2);
  if (args.includes('--help')) {
    console.log('Usage: npm run test:knowledge-metadata -- [--url <document URL>] [--registry <Base URL>]');
    return;
  }
  const input = {};
  while (args.length) {
    const flag = args.shift();
    if (!['--url', '--registry'].includes(flag) || !args.length) throw new Error('Invalid arguments. Use --help.');
    input[flag === '--url' ? 'url' : 'registryUrl'] = args.shift();
  }
  // Report variable names only; never print credentials for troubleshooting.
  const missing = ['LARK_APP_ID', 'LARK_APP_SECRET'].filter(key => !process.env[key]?.trim());
  if (missing.length) throw new Error(`Missing configuration: ${missing.join(', ')}. Set these in Lemma-Agent/.env or the terminal environment. Do not share secret values.`);
  const result = await getKnowledgeMetadata(input);
  // Count affected records, not the total number of missing individual fields.
  // Successful reads with missing fields or found=false still exit with code 0.
  console.log(JSON.stringify({ ...result, validation: {
    number_of_records_with_missing_fields: result.documents.filter(row => row.missing_fields.length).length,
    note: 'Read-only retrieval and required-field report. This is not a complete dictionary or approval audit.',
  } }, null, 2));
}
// Retrieval/configuration failures go to stderr and exit 1, unlike Not Found.
main().catch(error => {
  console.error(JSON.stringify({ success: false, error: error.message }));
  process.exitCode = 1;
});
