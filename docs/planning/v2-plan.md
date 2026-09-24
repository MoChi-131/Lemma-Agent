# Retrieval Agent Version 2 Plan

Version 2 improves governed knowledge retrieval while preserving the Version 1 route: search the Registry first, read only eligible documents, use Wiki search only as a fallback, and restrict external web sources to approved domains.

## Ownership boundary

The Retrieval Agent owns:

- Registry-first search and explainable result ranking.
- Eligibility-gated document retrieval.
- Text, native table, embedded Sheet, PDF, and linked-file access.
- Approved-domain external web governance.
- A minimum `Possible Conflict` check on content already retrieved.
- MCP security, reliability, and operational diagnostics.

The Knowledge Base Management Agent owns:

- Wiki Inventory-to-Registry mapping and coverage reports.
- Metadata validation feedback and Base write-back.
- Registry correction alerts and editor workflows.
- Full duplicate analysis, conflict classification, and conflict decisions.

Inventory mapping and validation write-back are therefore dependencies for trusted data quality, not implementation phases in this Retrieval Agent release.

## Phase 1: Explainable retrieval ranking

Improve metadata ranking without reading document bodies unnecessarily.

Ranking signals, in priority order:

1. Retrieval eligibility.
2. Exact title, model, or tag match.
3. Approved status and authority level.
4. Scope and document type relevance.
5. Applicable version or date.
6. General keyword overlap.

Acceptance criteria:

- Each result includes a score and short reason breakdown.
- Exact model and title matches outrank broad tag matches.
- Ineligible records cannot become retrieval candidates because of a high text score.
- Workspace records remain ineligible for formal retrieval.
- Tests cover English and Chinese queries, ties, model numbers, and ineligible matches.

## Phase 2: Retrieval completeness and efficiency

Make one governed retrieval call return the useful content needed for an answer.

Deliverables:

- Stable handling of text, native tables, embedded Sheets, and PDF attachments.
- Clear per-component success and error states.
- Bounded content size, page count, and processing time.
- No duplicate read of the same document or attachment in one request.
- Linked Google Drive content is opened only when relevant and permitted.

Acceptance criteria:

- Partial Sheet or attachment failures do not hide readable document content.
- A failed component is not retried repeatedly in one request.
- Large documents are truncated safely and report that truncation.
- Retrieved content is treated as source data rather than instructions.

## Phase 3: Governed fallback behavior

Make fallback routes predictable and testable.

Deliverables:

- Wiki search runs only when Registry search finds no relevant eligible document or the user requests other documents.
- External web search obtains approved domains before searching.
- Final and redirected web URLs pass the whitelist check before use.
- Failed governance checks stop the affected fallback route.

Acceptance criteria:

- Tests prove that a valid Registry result prevents unnecessary Wiki and web searches.
- Lookalike, HTTP, Pending, Suspended, and Rejected domains are blocked.
- A Registry, whitelist, or authorization failure never silently becomes an unrestricted search.

## Phase 4: Operational readiness

Prepare the HTTP MCP service for controlled shared use.

Deliverables:

- Application-level authentication for the HTTP endpoint.
- Request timeouts and size limits for document, Sheet, and PDF reads.
- Structured logs without credentials or document bodies.
- Health and readiness checks for Lark credentials and required scopes.
- Deployment and credential-rotation documentation.

Acceptance criteria:

- Unauthenticated requests cannot invoke MCP tools.
- Logs contain request IDs, tool names, duration, and sanitized errors.
- Permission failures identify the missing capability without exposing secrets.
- Stdio and HTTP expose the same default tool contract.

## Phase 5: Version 2 acceptance

Run one release acceptance set covering:

- Registry-first discovery and ranking quality.
- Eligibility-gated retrieval.
- Text, native table, embedded Sheet, PDF, and linked-file handling.
- Wiki fallback rules.
- Approved-domain external web governance.
- Minimum `Possible Conflict` reporting.
- MCP discovery, sessions, authentication, and error handling.

Publish:

- `docs/reports/v2-acceptance-report.md`
- Updated `docs/reference/knowledge-registry.md`
- Updated `docs/operations/supermama-agent-instructions.md`
- Release notes and Git tag `v2.0.0`

## External dependencies

Before final Version 2 acceptance, obtain these outputs from the Knowledge Base Management Agent:

- A completed Inventory-to-Registry coverage report without unresolved crawl errors.
- A documented process for correcting invalid Registry records.
- A stable Registry and whitelist schema for the acceptance baseline.

The Retrieval Agent may still be developed and tested with fixtures while those governance tasks are in progress.

## Recommended order

Implement ranking first, then retrieval completeness and fallback behavior. Finish authentication and operational controls before shared deployment. Run final acceptance after the Knowledge Base Management Agent supplies the required governance evidence.
