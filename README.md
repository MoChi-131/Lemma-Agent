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

HTTP:

```powershell
npm.cmd run mcp:http
```

Stdio:

```powershell
npm.cmd run mcp:start
```

The HTTP health endpoint is `http://localhost:3000/health`; the Streamable HTTP MCP endpoint is `http://localhost:3000/mcp`.

The HTTP server remains a development service without application-level authentication. Do not expose it as a production company service without an authentication and deployment review.
