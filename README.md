# Lemma Agent

Supermama AI Assistant 的 Lark MCP 與知識治理專案。

## Current capabilities

- Wiki tree discovery, subtree body reading and literal search.
- Lark Base metadata validation and external-domain whitelist checks.
- Governed document retrieval through `retrieval_eligible`.
- Deterministic duplicate and conflict evidence with human decision reuse.
- Stdio and Streamable HTTP MCP transports using one shared server factory.

See the [documentation index](docs/README.md) for specifications, acceptance evidence, project structure and historical release notes.

## Setup

```powershell
npm.cmd install
```

Create a local `.env` containing `LARK_APP_ID` and `LARK_APP_SECRET`. Never commit `.env` or print its values.

## Test

```powershell
npm.cmd test
npm.cmd run test:knowledge-registry
npm.cmd run test:conflicts
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
