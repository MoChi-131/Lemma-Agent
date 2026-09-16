# Read Base registry metadata

Run from Lemma-Agent:

```powershell
npm run test:knowledge-metadata
npm run test:knowledge-metadata -- --url "https://your-tenant.larksuite.com/wiki/DOCUMENT_TOKEN"
npm run test:knowledge-registry
```

The first command reads the configured whole table and prints JSON. The second looks up an exact document URL and returns found=false only after a complete successful read finds no matching record. Duplicate matches remain visible in documents. The last command runs offline tests.

Use existing LARK_APP_ID and LARK_APP_SECRET in local .env. The app needs Wiki node access (for a Wiki-hosted Base), Base record read permission and access to the registry itself. Do not paste credentials into commands or commit .env.

The default registry is the Supermama Wiki-hosted Base supplied in this task. Override with LARK_REGISTRY_URL or --registry "https://.../base/...?table=...". View filters are intentionally ignored. Reads are bounded to 60 seconds and 100 pages; failures return an error, never a partial successful lookup.

Implementation: integrations/lark/knowledge-registry.js. CLI: runtime/test-knowledge-metadata.js. This is not yet registered as an MCP tool.

Missing values are null; populated tags and people are arrays. Dates and review cycles retain their original API values: dates can be epoch milliseconds, formula dates can be arrays of text objects, and cycles can be strings such as "30". These types are not yet standardized. Required-field gaps are reported in missing_fields and do not fail successful retrieval. N/A remains distinct from missing data. external_source_approved reflects the stored Whitelist Status only, not independent verification of an approved domain list.

## Functions and flow

`CLI main -> getKnowledgeMetadata -> readKnowledgeRegistry -> normalizeRecord for each record -> optional exact URL filter -> JSON`

| Function | Responsibility |
| --- | --- |
| readKnowledgeRegistry(options, deps) | Authenticate, resolve Wiki to Base when needed, fetch all pages of raw records. |
| text(value) (internal) | Extract text, link target or person name from a cell value. |
| normalizeRecord(record) | Map Base labels to JSON keys and report conditional required-field gaps, without network calls. |
| getKnowledgeMetadata(input, deps) | Return normalized records, optionally filtered by exact document URL. |
| main() (CLI) | Read flags, check configuration and print JSON or an error. |

`deps` means optional replacement functions. Production calls normally omit it; tests provide fake readers so they can run offline.

## Function examples

In a CommonJS script at the Lemma-Agent project root:

```javascript
require('dotenv').config({ quiet: true });
const { getKnowledgeMetadata } = require('./integrations/lark/knowledge-registry');

async function example() {
  const all = await getKnowledgeMetadata();
  console.log(all.record_count);

  const one = await getKnowledgeMetadata({
    url: 'https://ysgjyjx6z20y.sg.larksuite.com/wiki/Y0RHwYVP2iBs1fkSEoHlkpRLgBe',
  });
  console.log(one.found, one.documents);
}
example().catch(() => { console.error('Metadata lookup failed.'); process.exitCode = 1; });
```

Use `registryUrl` to override the registry, and `url` to select a document inside it. The lookup compares stored URL strings exactly; it retains multiple matches rather than silently choosing one.

### Offline sample with expected results

```javascript
const { getKnowledgeMetadata } = require('./integrations/lark/knowledge-registry');

async function example() {
  const read = async () => [{
    record_id: 'sample',
    fields: {
      Title: 'Example SOP',
      'Lark URL': { link: 'https://example.com/sop', text: 'Example SOP' },
      Scope: 'Knowledge Base',
      'Primary Domain': 'Service',
      'Document Type': 'SOP',
      'Owner Person': [{ name: 'Example Owner' }],
      'Authority Level': 'Internal Official',
    },
  }];
  const result = await getKnowledgeMetadata({ url: 'https://example.com/sop' }, { read });
  console.log(result.found); // true
  console.log(result.record_count); // 1
  console.log(result.documents[0].missing_fields);
  // ['status', 'last_reviewed_date', 'version']
  console.log(result.documents[0].external_source_approved); // null

  const absent = await getKnowledgeMetadata({ url: 'https://example.com/absent' }, { read });
  console.log(absent.found, absent.documents); // false, []
}
example().catch(console.error);
```

## Reading the output

| Output | Meaning |
| --- | --- |
| success: true | Complete retrieval succeeded; this is not a governance approval. |
| found: false | A complete lookup found no exact URL match. Not returned for list-all calls. |
| metadata field: null | Source field missing/empty, or unsupported text object shape. |
| missing_fields: [] | No required-field gaps detected under the current presence checks; optional fields can still be empty. |
| validation_status: valid / invalid | valid means missing_fields is empty; invalid means at least one required-field gap. This is a completeness check only, not enum validation, whitelist approval or a full governance audit. |
| external_source_approved: null | Not an External Reference record. |
| external_source_approved: false | External Reference without stored Approved whitelist status. |
| external_source_approved: true | External Reference with stored Approved whitelist status. |

The missing-field check does not validate every enum, inspect whether person arrays contain real accounts, apply review-cycle defaults, calculate next review dates, or verify authorization of approvers. Those are separate validation work. Unknown scopes do not receive the known scopes' conditional checks.

## Windows commands and failures

Use `npm.cmd` instead of `npm` in PowerShell if script execution policy blocks npm.ps1:

```powershell
npm.cmd run test:knowledge-metadata
npm.cmd run test:knowledge-metadata -- --url "https://example.com/sop"
npm.cmd run test:knowledge-registry
```

Errors identify `authentication`, `wiki_resolution`, or `base_records`, with numeric API/HTTP codes when available. Secrets and raw server responses are not printed. A missing permission requires app configuration/access changes, not filling missing metadata cells.

Exit 0 means retrieval completed, including found=false or missing metadata. Exit 1 means arguments/access/network/pagination failed. This initial reader is not a full schema validation, date-calculation or governance acceptance suite.

API reference: https://pkg.go.dev/github.com/larksuite/oapi-sdk-go/v2/service/bitable/v1 (AppTableRecordListReq and response pagination).
