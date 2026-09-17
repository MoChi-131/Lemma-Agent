# Knowledge Registry Reader and Validator

This module reads the Supermama Knowledge Registry from Lark Base without modifying records. It implements the field rules in `Supermama_Knowledge_Registry_MVP_Data_Dictionary_v1_TC` and the read-only boundary in the handover.

## Commands

Run from `Lemma-Agent`:

```powershell
npm.cmd run test:knowledge-metadata
npm.cmd run test:knowledge-metadata -- --url "https://tenant.larksuite.com/wiki/DOCUMENT_TOKEN"
npm.cmd run test:knowledge-metadata -- --report ./validation-report.md
npm.cmd run test:knowledge-registry
npm.cmd run test:knowledge-mcp:remote
```

The live commands use `LARK_APP_ID` and `LARK_APP_SECRET` from `.env`. The project has built-in defaults for the Supermama registry and whitelist tables. `LARK_REGISTRY_URL` and `LARK_WHITELIST_URL` remain optional overrides. The app needs `wiki:node:read`, `base:record:retrieve`, and access to both tables. Do not commit `.env` or print its values.

The whitelist table should use these field titles:

| Field | Example |
| --- | --- |
| `Whitelist Status` | Approved |
| `Domain` | housingauthority.gov.hk |
| `Organization` | Hong Kong Housing Authority |
| `Approved By` | Penny |
| `Approved Date` | 2026-09-16 |

`Status` and `Source Domain` are also accepted as aliases for the first two fields.

## Functions

| Function | Purpose |
| --- | --- |
| `readKnowledgeRegistry(options, deps)` | Authenticate, resolve a Wiki-hosted Base, and read every record page. |
| `readExternalWhitelist(options, deps)` | Read the independently maintained external-domain whitelist table. |
| `normalizeDate(value)` | Parse supported Lark and ISO date shapes for validation. |
| `normalizeNumber(value)` | Parse a non-negative integer review cycle. |
| `validateRecord(metadata, missingFields, recordId)` | Produce Expected, Actual, PASS/FAIL/WARNING, and Evidence checks. |
| `normalizeRecord(record)` | Map Base fields, find required-field gaps, validate, and set record status. |
| `getKnowledgeMetadata(input, deps)` | List normalized records or find exact document URL matches. |
| `getValidationReport(input, deps)` | Generate the Markdown validation report. |

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
| Knowledge Base | `lark_url`, `owner_person`, `authority_level`, `status`, `last_reviewed_date` |
| Workspace | `lark_url` |
| External Reference | `lark_url`, `authority_level` |

For External Reference records, `source_domain` is extracted automatically from `lark_url`, and `whitelist_status` is copied from the matching whitelist-table record. These two fields do not need columns in the metadata registry table.

For Knowledge Base, `version` is also required for SOP, Pricing, Policy, and Product Spec. `approved_by` and `approved_date` are required when Status is Approved. `N/A` counts as missing when a field is required.

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
| Whitelist Status, External Reference only | Approved, Pending, Rejected |

The user-approved `N/A` extension is accepted for fields that do not apply to the record's Scope. It does not replace a missing required value.

## Review rules

| Document Type | Review Cycle Days | Version |
| --- | ---: | --- |
| Pricing | 30 | Required |
| SOP | 90 | Required |
| Policy | 90 | Required |
| Product Spec | 90 | Required |
| FAQ | 180 | Optional |

A missing recommended cycle produces a warning. `Review Cycle Days = 0` is valid and means the cycle is disabled; for a type with a recommended cycle it produces a warning rather than an error. A supplied conflicting positive cycle, invalid date or number, a future `Approved Date`, or inconsistent `Next Review Date` produces an error. A past Next Review Date is reported as `overdue`; it is operational status rather than invalid metadata.

## Output meanings

| Output | Meaning |
| --- | --- |
| `success: true` | The full read completed. It does not mean every record is valid. |
| `found: false` | A complete exact-URL lookup found no record. |
| `skipped_empty_record_count` | Number of completely blank Base rows excluded from output and validation. |
| `missing_fields: []` | No required-field gaps were found. Optional fields can still be empty. |
| `validation_status: valid` | No applicable error-level check failed. Warnings may remain. |
| `validation_status: invalid` | At least one required-field, enum, format, or consistency error failed. |
| `retrieval_eligible: true` | The record may be retrieved. For External Reference, its URL domain matched an Approved whitelist row. |
| `retrieval_eligible: false` | External Reference domain was absent, Pending, Rejected, or invalid. |
| `whitelist_check` | Matching evidence: document domain, matched whitelist domain, status, and whitelist record ID. |
| `external_source_approved` | Backward-compatible alias of the External Reference whitelist result; `null` for other scopes. |

## MCP tools

Both `mcp:start` using stdio and `mcp:http` register:

- `get_knowledge_metadata`
- `get_knowledge_validation_report`

Both tools declare read-only, non-destructive, idempotent annotations. The metadata tool returns JSON structured content; the report tool returns Markdown plus a structured summary.

## Current limits

- URL lookup is exact and retains duplicate matches for human review.
- Completely blank rows are skipped. `N/A`, zero, or any populated cell keeps the row.
- Dates are normalized for validation evidence, while metadata preserves the original Lark API value.
- External Reference `source_domain`, `whitelist_status`, and eligibility are derived from the document URL and separate whitelist table.
- An approved parent domain also approves its real subdomains. For example, `housingauthority.gov.hk` matches `hos.housingauthority.gov.hk`, but not `fakehousingauthority.gov.hk`.
- The validator does not confirm that Approved By is one of the authorized approvers.
- Base native field types and reference-option conditions are not proved by record values alone.

## Future task: Base validation feedback and alerts

**Priority:** Post-MVP enhancement. This is useful when several colleagues regularly edit the registry, but it does not block the current read-only metadata retrieval and validation prototype.

Add system-managed fields to the main metadata table so editors can see problems without opening the Markdown validation report:

| Field | Type | Purpose |
| --- | --- | --- |
| `Validation Status` | Single Option | `Valid`, `Warning`, or `Invalid` |
| `Action Required` | Multiline Text | Plain-language corrections for all failed rules |
| `Validation Issues` | Multiline Text | Stable machine-readable rule names |
| `Retrieval Eligible` | Checkbox | Whether the record is currently allowed for retrieval |
| `Detected Domain` | Text | Domain extracted from an External Reference URL |
| `Last Validated At` | Date and Time | Time of the latest successful validation sync |

Implement a separate synchronization command rather than adding writes to normal retrieval:

```powershell
npm.cmd run sync:knowledge-validation -- --dry-run
npm.cmd run sync:knowledge-validation -- --apply
```

The dry run must show proposed changes without modifying Lark. The apply mode should update only the system-managed fields and only after a complete registry and whitelist read. It will require Base record-edit permission and edit access to the metadata table.

Create these operational views after write-back is available:

- `Needs Correction`: `Validation Status = Invalid`
- `Needs Review`: `Validation Status = Warning`
- `Ready for Retrieval`: `Validation Status = Valid` and `Retrieval Eligible` is checked

Optionally add Lark automations that notify `Owner Person` when a record changes to `Invalid` or `Warning`. The notification should include `Title`, `Validation Issues`, and `Action Required`.

Acceptance criteria:

- Missing fields, invalid values, review-cycle problems, malformed URLs, and whitelist failures produce clear actions.
- Multiple problems on one record are included in one update.
- External Reference status comes from the whitelist table, not manual metadata input.
- A partial read or failed validation never writes updates.
- Re-running the sync with unchanged records produces no unnecessary writes.
- Offline tests cover dry-run planning, field mapping, fail-closed behavior, and update failures.

## Future task: Wiki Inventory-to-Registry mapping

**Priority:** Post-MVP enhancement. This provides evidence that every expected document in a selected Lark Wiki subtree has one metadata registry record.

Compare the output of `get_lark_wiki_metadata` with all internal records returned by `get_knowledge_metadata`. Match records by canonical Lark Wiki URL and exclude `External Reference` records.

The mapping report should classify each item as:

- `Matched`: one Wiki document matches one registry record.
- `Missing in Registry`: a Wiki document has no registry record.
- `Registry Only`: a registry URL is absent from the selected Wiki inventory.
- `Duplicate Registry Entry`: multiple registry records use the same Wiki URL.
- `Title Mismatch`: the URL matches but the titles differ.

Save the result as `docs/wiki-inventory-registry-mapping.md`. Do not claim complete coverage when the Wiki crawl is truncated or contains errors.

Acceptance criteria:

- The Wiki root URL and retrieval time are recorded.
- The crawl reports `truncated: false` and no unresolved errors.
- Every expected internal Wiki document is `Matched` or has a documented action.
- Missing, duplicate, registry-only, and title-mismatch cases have clear correction steps.
- External references are excluded from the Wiki coverage calculation.
