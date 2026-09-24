# Roadmap

Deferred enhancements for the Knowledge Base Management Agent are kept here so the current retrieval contract stays concise. These items are not required for the present read-only retrieval flow.

## Base validation feedback and alerts

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

- Missing fields, invalid enum values, malformed source URLs, and whitelist failures produce clear actions.
- Multiple problems on one record are included in one update.
- External Reference status comes from the whitelist table, not manual metadata input.
- A partial read or failed validation never writes updates.
- Re-running the sync with unchanged records produces no unnecessary writes.
- Offline tests cover dry-run planning, field mapping, fail-closed behavior, and update failures.

## Wiki Inventory-to-Registry mapping

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
