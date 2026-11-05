# Project structure

```text
integrations/lark/  Lark domain and official-MCP adapters
tools/lark/         User-facing tool handlers
runtime/            Stdio/HTTP MCP servers and registrations
tests/              Unit and integration tests
docs/               Current guidance and historical records
```

Flow: `MCP transport → registration → tool → integration → Lark`.

- `official-mcp/` starts the pinned Lark package privately over stdio.
- `documents/` creates and verifies Wiki documents through official MCP.
- `wiki/`, `knowledge/`, and `drive/` contain read and governance logic.
- Production code never imports test fixtures.
