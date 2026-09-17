# Metadata Acceptance Report

Date: 2026-09-17  
Pilot baseline: 13 Lark Base records  
Scope: Knowledge Registry metadata retrieval, validation, whitelist checks, and MCP output

## Result

**Status: PASS with known limitations**

| Measure | Result |
| --- | ---: |
| Total records | 13 |
| Valid records | 8 |
| Intentionally invalid records | 5 |
| Records with warnings | 2 |
| Registry unit tests | 17 passed, 0 failed |
| MCP acceptance | PASS |

Invalid records are retained as negative-test evidence. A negative test passes when the validator rejects the record and explains the correction.

## Required Metadata Cases

| ID | Test | Result | Evidence |
| --- | --- | --- | --- |
| META-01 | Complete Knowledge Base SOP | PASS | Complete SOP returned as valid. |
| META-02 | Knowledge Base FAQ | PASS | FAQ cycle of 90 rejected; action requires 180 days. |
| META-03 | Workspace governance boundary | PASS | Workspace records are not forced to provide KB-only fields. |
| META-04 | Approved External Reference | PASS | Approved whitelist match returns `retrieval_eligible=true`. |
| META-05 | External source not approved | PASS | Missing, Pending, or Rejected whitelist match returns `retrieval_eligible=false`. |
| META-06 | Registry URL not found | PASS | Exact lookup returns `found=false` and no guessed metadata. |
| META-07 | SOP without Version | PASS | Record is invalid and reports `version` missing. |
| META-08 | Approved record missing approval data | PASS | Missing approval fields are reported as required. |
| META-09 | Primary Domain validation | PASS | Values outside the controlled enum are rejected. |
| META-10 | Review date calculation | PASS | Consistent dates pass; conflicting cycle or date values fail. |

## MCP Acceptance

The HTTP MCP acceptance test passed:

```text
Tool discovery                  PASS
13-record retrieval             PASS
Exact URL lookup                PASS
Missing URL returns found=false PASS
Approved external retrieval     PASS
Blocked external retrieval      PASS
Validation report generation    PASS
Session reuse                   PASS
```

Run the evidence again with:

```powershell
npm.cmd run test:knowledge-registry
npm.cmd run test:knowledge-metadata -- --report validation-report.md
```

In two terminals:

```powershell
npm.cmd run mcp:http
npm.cmd run test:knowledge-mcp:remote
```

## Approved Schema Changes

- `Active` was removed from Status. Allowed values are Draft, Review, Approved, and Archived.
- `Review Cycle Days = 0` is valid and means the cycle is disabled.
- `Approved Date` cannot be later than today.
- External `source_domain` and `whitelist_status` are derived from the URL and whitelist table.

## Known Limitations

- URL lookup is an exact string match.
The system finds a record only when the submitted URL exactly matches the URL stored in Lark Base. Differences such as extra query parameters, a trailing slash, or another valid URL format for the same document may return found=false.
- Validation results are reported but are not written back to Lark Base.
Invalid fields and suggested actions appear in the terminal, MCP output, and validation-report.md. The system does not currently update the Lark record or create an alert for colleagues automatically.
- Wiki Inventory-to-Registry mapping evidence is still outstanding.
The registry can be read and validated, but there is no completed report comparing all documents in the relevant Lark Wiki with the registry. Therefore, it has not yet been demonstrated that every required Wiki document has a corresponding registry record.
- Conflict taxonomy, dataset, compare tool, and conflict tests are outside this acceptance report.

## Conclusion

The read-only Metadata MVP is accepted for the frozen 13-record pilot. The next handover task is the Wiki Inventory-to-Registry mapping, followed by the Conflict and Duplicate workstream.
