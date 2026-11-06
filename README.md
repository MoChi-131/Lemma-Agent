# Lemma Agent

Supermama AI Assistant 的 Lark MCP 與知識治理專案。

## Current capabilities

- Wiki tree discovery, subtree body reading and literal search.
- Lark Base metadata completeness, retrieval eligibility, and external-domain whitelist checks.
- Governed document retrieval through `retrieval_eligible`.
- A lightweight agent-level check for obvious contradictions in retrieved content.
- Draft review, approved creation of new Wiki documents, and read-back verification of title, location, text and tables.
- Stdio and Streamable HTTP MCP transports using one shared server factory.

See the [documentation index](docs/README.md) for specifications, acceptance evidence, project structure and historical release notes.

## Setup

```powershell
npm.cmd install
```

Create a local `.env` containing `LARK_APP_ID`, `LARK_APP_SECRET`, `LARK_VALIDATED_METADATA_URL` and `LARK_VALIDATION_JOURNAL_URL`. Point the latter two at the published metadata table and Journal. Colleagues edit the separate working Registry; Lemma uses the last complete verified publication. Never commit `.env` or print its values.

For document creation, configure `LARK_DOCUMENT_WIKI_ROOT_URL` and set `ENABLE_LARK_DOCUMENT_WRITES=true`. The application needs access to create children at the selected Wiki location and read/write the new document. Colleagues review the draft and location, then approve saving; technical references stay internal. See [publication setup](docs/reference/document-publication.md). Original uploaded files are summarized into text; this writer does not upload attachments or modify metadata.

## Test

```powershell
npm.cmd test
npm.cmd run test:knowledge-registry
npm.cmd run test:document-publication
npm.cmd run test:wiki-subtree:mcp
```

Offline tests use fixtures and do not require Lark credentials. Live and remote tests require the relevant Lark permissions and table access.

## Run MCP

Wiki node resolution, child listing, Base records, document text and Blocks use the pinned official Lark MCP
through a private stdio worker, using the existing application credentials.
Tables, images, PDF attachments, Sheets, whiteboards and governance stay in Lemma.
No extra public port is needed. See [official MCP integration](docs/reference/official-lark-mcp.md)
for deployment, cancellation behavior and validation limits.
Document responses are limited to 8 MiB for default stdio compatibility; oversized
inline image collections are explicitly marked partial. Whiteboard text is read
before image downloads under independent time budgets. Worker HTTP calls honor
MCP cancellation and have a 30-second deadline.

HTTP:

```powershell
npm.cmd run mcp:http
```

Stdio:

```powershell
npm.cmd run mcp:start
```

The default HTTP port is `6688`, overridden by `PORT` in the environment or `.env`. Use `http://localhost:6688/health` for liveness, `http://localhost:6688/ready` for configuration readiness, and `http://localhost:6688/mcp` for Streamable HTTP MCP.

After changing the port, restart the server and update the Codespace forwarded port, ChatGPT connection URL, or Tunnel target as applicable. Stdio does not use a port.

The HTTP server remains a development service without application-level authentication. Do not expose it as a production company service without an authentication and deployment review.

## Runtime logs

HTTP and stdio write concise activity logs to stderr (stdio stdout stays reserved for MCP).
Each line includes a UTC timestamp, level, activity, and relevant IDs, status and duration.
HTTP requests, session open/close, server startup and tool executions are logged. Tool calls
include start/completion, returned failures, thrown errors and partial-result warnings.
Nested resource failures or truncated images, attachments and whiteboards produce
yellow warnings instead of green completion logs. Whiteboard originals download
in batches of four beyond twenty images, with shared byte and time budgets;
see the official MCP integration reference for limits and live acceptance evidence.
Arguments, successful document contents, session tokens and headers are not logged.
Error summaries redact configured credential values and URLs, omit upstream JSON payloads,
and are limited to 180 characters; raw stacks and payloads are intentionally omitted.

Colors are green for OK, red for ERROR, yellow for WARN and cyan for INFO. The default
`LOG_COLOR=auto` enables colors in terminals. Use `LOG_COLOR=always` for PM2/Docker log
viewers that support ANSI colors, or `LOG_COLOR=never` / `NO_COLOR=1` for plain text.
Restart the service after changing its environment. Run `npm run test:logging` to check logging.

## Operations

- Run `npm.cmd run logs:prune` daily (for example, with cron, EventBridge, or a systemd timer). `LOG_RETENTION_DAYS=14` is the default and only files under `logs/` are eligible.
- Set `ERROR_WEBHOOK_URL` to an HTTPS incident webhook to receive redacted, 60-second-deduplicated error alerts. Never use a URL that embeds credentials.
- Configure your load balancer or monitor to check `/health`; use `/ready` before routing production MCP traffic after startup.
