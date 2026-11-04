# Official Lark MCP document reader

Lemma uses the pinned `@larksuiteoapi/lark-mcp@0.5.1` package as a private stdio
child process for five read operations:

| Lemma operation | Official tool |
| --- | --- |
| Resolve a Wiki node to its underlying resource | `wiki.v2.space.getNode` |
| Read a Wiki child-node page | `wiki.v2.spaceNode.list` |
| Read Base records (mirror, Journal and whitelist) | `bitable.v1.appTableRecord.list` |
| Read document text (including subtree/search body reads) | `docx.v1.document.rawContent` |
| Read all document block pages | `docx.v1.documentBlock.list` |

The package is started lazily on the first read and shared across concurrent calls
and HTTP sessions in one Lemma process. Startup verifies that exactly these five
tools are available. It does not add official tools to Lemma's public tool list.

## Configuration and deployment

Use Node.js 20 or later and the existing `LARK_APP_ID` and `LARK_APP_SECRET`.
No additional credentials, interactive login or public port are required.
The child uses application identity (`tenant_access_token`) and the fixed
international API domain `https://open.larksuite.com`.

Deploy source and `package-lock.json`, run `npm ci`, then restart the existing
Lemma service. The service must be permitted to spawn Node child processes and
write to `logs/official-mcp/`. Do not deploy a ZIP containing `.env` to a public
location. Keep server credentials in the existing private deployment environment.

`worker.js` launches the installed official CLI using a fixed argument list.
The worker wraps official tool callbacks with async request context and attaches
the MCP cancellation signal to both official Axios HTTP clients. Token and API
requests have a 30-second HTTP deadline; cancelling one tool aborts its HTTP work
without terminating the shared worker or unrelated requests. This compatibility
shim is specific to the pinned official package and covered by a real-worker test.
It redirects the package's state/log locations into ignored project logs and
disables raw package diagnostic logging. Credentials are passed only through
child environment variables (`APP_ID`, `APP_SECRET`); Lemma's `.env` is not
loaded by the child and inherited `NODE_OPTIONS` are not forwarded.

The official package's OAuth/native keychain features are not used for these
application-identity reads. The package has transitive native and proxy dependencies;
an offline fixture run proves the selected read path works without interactive
login. Installation reported 14 dependency advisories (5 moderate, 8 high,
1 critical) in the combined dependency tree. These remain unresolved; this
migration is not a dependency-security remediation or production-authentication
release. Do not apply a forced audit downgrade without checking compatibility.

## Retained behavior

- `read_lark_document` and `retrieve_knowledge_document` keep their existing
  schemas and output format, including MCP image content.
  Serialized document responses are capped at 8 MiB, below the SDK's default
  10 MiB stdio frame limit. Downloaded images that cannot fit inline are omitted
  with explicit `images_truncated`, `inline_image_count` and `omitted_image_count`
  fields, producing a yellow partial-result log. Their metadata is retained.
  Oversized text/metadata returns `DOCUMENT_RESPONSE_TOO_LARGE` rather than an
  unreadable frame. Inline omission does not provide a continuation token; use
  smaller documents when a full image response is required.
- Registry publication checks, retrieval eligibility, ranking, external-domain
  governance and approved-document publication remain in Lemma.
- Native table interpretation, embedded Sheet reads, image downloads, PDF text
  extraction and whiteboard source/image reads remain in the existing readers.
- A direct media token is obtained only when embedded resources need it.
- Whiteboard originals are downloaded in ordered batches of four, continuing past
  the previous twenty-image cap. A failed image does not stop later batches.
  Original-image output is bounded to 50 MiB across all boards in a document,
  each image remains limited to 10 MiB. Source nodes/text are collected first
  under a separate 30-second deadline. Original-image downloads then share their
  own 30-second deadline, so an image timeout cannot suppress later-board text.
  Byte-budget or deadline stops are explicitly reported as
  incomplete results with skipped counts. Streamed downloads are size-checked
  while reading, including when Content-Length is missing.
- Wiki child listing now uses official MCP. Tree traversal, subtree body reads and
  literal search retain their existing depth, node, page and cancellation limits.
  Empty pages with advancing cursors remain valid; malformed pages and missing or
  non-advancing cursors fail explicitly.
- Base record reads now use official MCP, with numeric page size 500, no view or
  search filters, a 100-page cap and a 60-second per-table budget. Raw record field
  shapes are preserved for publication hash verification. Malformed records,
  missing/cyclic cursors and incomplete pagination fail without returning partial
  records. Journal verification, retrieval eligibility, ranking and approved-domain
  filtering remain in Lemma. Safe numeric Lark error codes are retained.
- Publication's separate API adapter has not been migrated.
- The existing public endpoint's authentication behavior is unchanged. Internal
  official MCP integration does not implement client-facing OAuth or an account allowlist.

## Failure and lifecycle behavior

Each official tool call has a 30-second deadline, including waiting for startup.
Existing subtree/search AbortSignals cancel waiting and in-flight MCP calls.
Concurrent calls share one startup; cancelling one caller does not cancel other callers.
The client reconnects on the next request after a disconnect; failed tool calls
are not replayed and do not silently fall back to direct document APIs.

Block pagination is validated: missing/malformed pages, missing cursors, repeated
or cyclic cursors, and exceeding 100 pages are errors, not successful partial reads.
The adapter rejects MCP `isError` and Lark error envelopes without returning raw
upstream payloads. Parent logs record operation names, IDs, duration and safe status.
Nested image, attachment, Sheet or whiteboard failures and truncation produce
yellow WARN completion logs; top-level tool failures remain red ERROR. Complete
reads produce green OK. Each whiteboard image batch logs counts without image data.
SIGINT/SIGTERM and stdio input closure close the child. The worker also exits when
its parent closes stdin, including after an abrupt parent termination.

## Verification

```powershell
npm.cmd test
npm.cmd run test:knowledge-registry
```

For read-only live mirror/Journal/whitelist verification using the current `.env`:

```powershell
npm.cmd run test:base:live
```

This prints counts and verified-publication status only, without record text or
credentials. It does not bypass the Journal if a verified publication is absent.

The HTTP and stdio integration tests start the real installed official package
with an Axios fixture that intercepts requests before any Lark network access.
They verify discovery, Wiki resolution, document body reads, paginated native
tables, search/subtree behavior and unchanged public tool lists. Existing
document-reader fixtures cover images, PDF, Sheets and whiteboards. Adapter
tests cover connection reuse/reconnect, tool restrictions, cancellation,
malformed responses and error sanitization.
Regression tests also cover default stdio framing for large image collections,
bounded oversized-text errors, real-worker HTTP cancellation, an HTTP deadline
without client cancellation, and later-board text surviving an earlier image timeout.

No live Lark acceptance or AWS deployment is performed by these offline tests.
Before rollout, use an authorized test document containing text, a table, an image
and the embedded resources your team uses; confirm permissions and the returned
content through the existing `read_lark_document` tool.

Live read-only acceptance on 2026-11-02 used the user-provided Wiki document:
561 text characters, one 8-by-6 table, one whiteboard, 33 original whiteboard images
in nine batches, and 37 successful image outputs in total (including previews and
document images). The embedded-resource check returned PASS with no failures.
This document had no PDF or embedded Sheet results. AWS has not been updated.

The Wiki child-list migration was also checked against the same authorized node:
`wiki.v2.spaceNode.list` returned three children and `has_more=false`. The full
offline suite passed 92 tests after the migration, including the real installed
official worker with fixture-backed Wiki pagination, traversal and search.

## Review-fix acceptance (2026-11-04)

- 97 main regression tests and 27 knowledge-registry tests passed.
- The live Base check passed: 32 verified metadata records, 15 retrieval-eligible
  records, and four approved domains. Mirror and Journal verification used official
  MCP; no records were modified.
- The earlier Wiki document still downloaded all 37 image outputs successfully.
  With default stdio buffering, 23 fit inline and 14 were explicitly omitted by
  the 8 MiB response budget. The result was a readable PARTIAL response with a
  yellow warning, rather than a frame-size failure. The text (561 characters),
  one 8-by-6 table and whiteboard source remained available.
- No continuation/pagination tool for omitted inline images is implemented.
  The earlier all-images PASS used a larger test-only buffer, which has now been
  removed. The current acceptance does not claim all 37 images are delivered inline.
- No AWS deployment was performed.

Official references:
- [Lark MCP repository](https://github.com/larksuite/lark-openapi-mcp)
- [Configuration](https://github.com/larksuite/lark-openapi-mcp/blob/main/docs/usage/configuration/configuration.md)
- [Tool list](https://github.com/larksuite/lark-openapi-mcp/blob/main/docs/reference/tool-presets/tools-en.md)
