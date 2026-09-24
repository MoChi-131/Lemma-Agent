# Knowledge Registry Reader and Retrieval Gate

The default retrieval module reads the Supermama Knowledge Registry from Lark Base without modifying records. It keeps only the completeness, whitelist and eligibility checks needed to select safe retrieval candidates. Detailed dictionary validation is isolated for the Knowledge Base Management Agent.

## Commands

Run from `Lemma-Agent`:

```powershell
npm.cmd run test:knowledge-metadata
npm.cmd run test:knowledge-metadata -- --url "https://tenant.larksuite.com/wiki/DOCUMENT_TOKEN"
npm.cmd run test:knowledge-metadata -- --report ./validation-report.md
npm.cmd run test:knowledge-registry
npm.cmd run test:knowledge-mcp:remote
```

The live commands use `LARK_APP_ID` and `LARK_APP_SECRET` from `.env`. The project has built-in defaults for the Supermama registry and whitelist tables. `LARK_REGISTRY_URL` and `LARK_WHITELIST_URL` remain optional overrides. Registry access needs `wiki:node:read` and `base:record:retrieve`. Rich document retrieval also needs Docx read access, a Sheet or Drive read scope for embedded Sheets, and Drive media download access for attachments and embedded images. The app must have access to the referenced documents, images, and files. Do not commit `.env` or print its values.

The whitelist table should use these field titles:

| Field | Example |
| --- | --- |
| `Source Name` | Hong Kong Housing Authority |
| `Domain` | housingauthority.gov.hk |
| `Whitelist Status` | Approved |

For compatibility with the live pilot table, a URL in `Source Name` is accepted as the domain and `Description` as the source name. `Organization`, `Source Domain`, and `Status` are also accepted aliases. Approved By and Approved Date may remain as optional audit columns; the reader ignores them.

## Functions

| Function | Purpose |
| --- | --- |
| `readKnowledgeRegistry(options, deps)` | Authenticate, resolve a Wiki-hosted Base, and read every record page. |
| `readExternalWhitelist(options, deps)` | Read the independently maintained external-domain whitelist table. |
| `normalizeDate(value)` | Normalize optional approval and project dates to `YYYY-MM-DD`. |
| `normalizeRecord(record)` | Map Base fields and calculate completeness, whitelist state and retrieval eligibility. |
| `getKnowledgeMetadata(input, deps)` | List normalized records or find exact document URL matches. |
| `searchKnowledgeRegistryTool(input, deps)` | Rank lightweight metadata matches before any Wiki content search. |
| `retrieveKnowledgeDocumentTool(input, deps)` | Check an exact Registry record and read its text, native tables, embedded Sheets, embedded images and PDF attachments only when retrieval is eligible. |

Detailed checks live in `integrations/lark/knowledge/knowledge-validation.js`. Its `validateRecord` and `getValidationReport` functions are intended for the Knowledge Base Management Agent and are excluded from the default MCP server.

Production calls omit `deps`. Tests inject fake token, Wiki, fetch, or registry functions so they run without credentials or network access.

### MCP acceptance test

Start the HTTP MCP server in one terminal:

```powershell
npm.cmd run mcp:http
```

In a second terminal, verify tool discovery, valid and invalid records, exact and missing URL lookups, approved and blocked external sources, report generation, and session reuse:

```powershell
npm.cmd run test:knowledge-mcp:remote
```

The command expects the frozen pilot baseline of 13 records. For a later baseline, pass the endpoint and expected count explicitly:

```powershell
npm.cmd run test:knowledge-mcp:remote -- "http://localhost:3000/mcp" 15
```

## Required fields

Every record requires `title`, `scope`, `primary_domain`, and `document_type`.

| Scope | Additional requirements |
| --- | --- |
| Knowledge Base | `source_url`, `authority_level`, `status` |
| Workspace | `source_url` |
| External Reference | `source_url`, derived `source_domain`, `authority_level` |

The Lark Base column remains `Lark URL`, while normalized JSON uses the frozen `source_url` field name. For External Reference records, `source_domain` is extracted automatically from `source_url`, and `whitelist_status` is copied from the matching whitelist-table record. These derived fields do not need columns in the metadata registry table.

For Knowledge Base, `version` is also required for SOP, Pricing, Policy, and Product Spec. `owner_person` is recommended but does not affect completeness. Last Reviewed Date, Approved By, and Approved Date are not v1.0 completeness requirements. `N/A` counts as missing when a field is required.

Approved Date is optional. When supplied, it must be today or earlier; a future value makes the record invalid. This is an approved operational constraint beyond Schema Freeze v1.0.

The reader also maps these optional frozen fields when their Base columns exist: `lark_owner`, `workstream`, `project_name`, `project_start_date`, and `project_end_date`. They do not affect completeness. Project dates are normalized to `YYYY-MM-DD`.

## Exact allowed values

### Scope

`Knowledge Base`, `Workspace`, `External Reference`

### Primary Domain

`Service`, `Property`, `Product`, `Customer`, `Marketing`, `Operation`, `IT`, `Company`, `Sales`

### Document Type by Scope

| Scope | Allowed values |
| --- | --- |
| Knowledge Base | SOP, FAQ, Pricing, Policy, Guide, Product Spec, Service Info, Official Notice, Knowledge Article, Reference, Template |
| Workspace | Meeting Notes, Analysis, Research, Planning, Campaign, Architecture, Design, Development Doc, Test Doc, Project Doc, Report |
| External Reference | Official Notice, Policy, Guide, Reference |

### Governance values

| Field | Allowed values |
| --- | --- |
| Status, Knowledge Base only | Draft, Review, Approved, Archived |
| Authority Level | Internal Official, External Official, Reference, Unverified |
| Whitelist Status, External Reference only | Pending, Approved, Suspended, Rejected |

The user-approved `N/A` extension is accepted for fields that do not apply to the record's Scope. It does not replace a missing required value.

## Fields excluded from Schema Freeze v1.0

Last Reviewed Date, Review Cycle, Next Review Date, reviewed-by fields, and complex approval workflow fields do not affect v1.0 completeness or validation. They can be introduced under a later schema version without changing the frozen v1.0 contract.

## Output meanings

Each item in `documents` follows the flat Schema Freeze v1.0 contract. Registry fields such as `title`, `source_url`, and `scope` are direct properties; there is no nested `metadata` wrapper.

```json
{
  "record_id": "rec123",
  "title": "驗樓SOP",
  "source_url": "https://tenant.larksuite.com/wiki/example",
  "scope": "Knowledge Base",
  "primary_domain": "Service",
  "document_type": "SOP",
  "authority_level": "Internal Official",
  "status": "Approved",
  "version": "v1.0",
  "metadata_complete": true,
  "missing_fields": [],
  "whitelist_valid": null,
  "retrieval_eligible": true
}
```

| Output | Meaning |
| --- | --- |
| `success: true` | The full read completed. It does not mean every record is valid. |
| `found: false` | A complete exact-URL lookup found no record. |
| `skipped_empty_record_count` | Number of completely blank Base rows excluded from output and validation. |
| `missing_fields: []` | No required-field gaps were found. Optional fields can still be empty. |
| `metadata_complete: true` | All fields required by Schema Freeze v1.0 are present. |
| `whitelist_valid` | `true` or `false` for External Reference; `null` for other scopes. |
| `retrieval_eligible: true` | The complete record passed its Scope-specific Status, Authority, and whitelist gate. |
| `retrieval_eligible: false` | The record is incomplete or blocked by its Scope, Status, Authority, or whitelist result. |
| `whitelist_check` | Matching evidence: document domain, matched domain, source name, status, and whitelist record ID. |

Retrieval eligibility follows Schema Freeze v1.0:

- Knowledge Base: complete, Status Approved, and Authority Internal Official or Reference.
- External Reference: complete, approved whitelist domain, and Authority External Official or Reference.
- Workspace: always false for formal Knowledge Retrieval.

`authority_level` is maintained only in the main metadata registry. The whitelist controls domain approval through `Whitelist Status`; it does not duplicate or override document Authority Level.

### Approved whitelist deviation

Schema Freeze v1.0 listed Authority Level in the whitelist sub-schema. The project owner subsequently approved keeping Authority Level only in the main metadata registry to prevent duplicate or conflicting authority values. The whitelist therefore contains source identity and approval status only. This is a documented project decision and should be incorporated into the next schema revision.

## MCP tools

Both `mcp:start` using stdio and `mcp:http` register these retrieval tools by default:

- `get_knowledge_metadata`
- `search_knowledge_registry`
- `retrieve_knowledge_document`
- `get_approved_web_domains`
- `check_external_urls`

These tools declare read-only, non-destructive, idempotent annotations. Normal topic retrieval starts with `search_knowledge_registry`; a relevant result then goes to `retrieve_knowledge_document`. `search_lark_wiki` is a fallback only when the Registry has no relevant result or the user explicitly requests other documents.

External web search must first call `get_approved_web_domains` and restrict the search to those hosts. Every candidate or redirected final URL must then pass `check_external_urls` before the agent reads, uses or cites it. Both checks fail closed if the whitelist cannot be read.

Set `ENABLE_VALIDATION_TOOLS=true` only on the Knowledge Base Management Agent to expose `get_knowledge_validation_report`. The retrieval agent performs only the minimum conflict check described in [Agent Instructions](../operations/supermama-agent-instructions.md).

## Current limits

- URL lookup is exact and retains duplicate matches for human review.
- Completely blank rows are skipped. `N/A`, zero, or any populated cell keeps the row.
- Optional approval and project dates are normalized to `YYYY-MM-DD` when present.
- External Reference `source_domain`, `whitelist_status`, and eligibility are derived from the document URL and separate whitelist table.
- An approved parent domain also approves its real subdomains. For example, `housingauthority.gov.hk` matches `hos.housingauthority.gov.hk`, but not `fakehousingauthority.gov.hk`.
- Keep whitelist domains as specific as the business requirement allows. Do not approve a broad parent domain when only one service subdomain is required.
- The validator does not confirm that Approved By is one of the authorized approvers.
- Base native field types and reference-option conditions are not proved by record values alone.

## Roadmap

Deferred write-back alerts and Wiki Inventory-to-Registry mapping are specified in [Roadmap](../planning/roadmap.md).
