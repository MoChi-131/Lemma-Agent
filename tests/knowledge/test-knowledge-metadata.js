// Live read-only CLI, not an offline unit test. Run from Lemma-Agent so dotenv
// finds .env. Existing terminal environment values take precedence over .env.
require('dotenv').config({ quiet: true });
const { getKnowledgeMetadata, getValidationReport } = require('../../integrations/lark/knowledge/knowledge-registry');
const fs = require('fs');
const path = require('path');

async function main() {
  // npm forwards arguments after --: --url selects a document; --registry a Base; --report saves validation report
  const args = process.argv.slice(2);
  if (args.includes('--help')) {
    console.log('Usage: npm run test:knowledge-metadata -- [--url <document URL>] [--registry <Base URL>] [--whitelist <Whitelist table URL>] [--report <output file>]');
    console.log('  --url: Filter by exact document URL');
    console.log('  --registry: Override registry Base URL');
    console.log('  --whitelist: Override external-reference whitelist table URL');
    console.log('  --report: Save validation report to file (includes Expected/Actual/PASS/FAIL/Evidence)');
    return;
  }
  const input = {};
  let reportFile = null;
  while (args.length) {
    const flag = args.shift();
    if (flag === '--help') continue;
    if (flag === '--report') {
      if (!args.length) throw new Error('--report requires a file path');
      reportFile = args.shift();
      continue;
    }
    if (!['--url', '--registry', '--whitelist'].includes(flag) || !args.length) throw new Error('Invalid arguments. Use --help.');
    const inputKey = { '--url': 'url', '--registry': 'registryUrl', '--whitelist': 'whitelistUrl' }[flag];
    input[inputKey] = args.shift();
  }
  // Report variable names only; never print credentials for troubleshooting.
  const missing = ['LARK_APP_ID', 'LARK_APP_SECRET'].filter(key => !process.env[key]?.trim());
  if (missing.length) throw new Error(`Missing configuration: ${missing.join(', ')}. Set these in Lemma-Agent/.env or the terminal environment. Do not share secret values.`);
  
  if (reportFile) {
    // Generate comprehensive validation report and save to file
    const report = await getValidationReport(input);
    const outputPath = path.resolve(reportFile);
    fs.writeFileSync(outputPath, report.report_text, 'utf8');
    console.log(JSON.stringify({
      success: true,
      message: 'Validation report saved',
      file: outputPath,
      summary: report.summary,
      timestamp: report.timestamp,
    }, null, 2));
  } else {
    // Display metadata with required-field report
    const result = await getKnowledgeMetadata(input);
    // Count affected records, not the total number of missing individual fields.
    // Successful reads with missing fields or found=false still exit with code 0.
    console.log(JSON.stringify({ ...result, validation: {
      number_of_records_with_missing_fields: result.documents.filter(row => row.missing_fields.length).length,
      number_of_documents_with_validation_errors: result.documents.filter(row => row.validation_status === 'invalid').length,
      number_of_documents_with_validation_warnings: result.documents.filter(row => row.validation_report?.summary.warnings > 0).length,
      note: 'Read-only retrieval with required-field and dictionary validation. Use --report to save detailed Expected/Actual/PASS/FAIL report.',
    } }, null, 2));
  }
}
// Retrieval/configuration failures go to stderr and exit 1, unlike Not Found.
main().catch(error => {
  console.error(JSON.stringify({ success: false, error: error.message }));
  process.exitCode = 1;
});
