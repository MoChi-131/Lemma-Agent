# Project Structure

Production code is grouped by responsibility and then by feature.

```text
integrations/lark/
  core/         Lark authentication and document APIs
  wiki/         Wiki traversal, metadata and subtree logic
  knowledge/    Registry, validation, whitelist and eligibility rules
  conflicts/    Comparison rules and approved-decision reuse

tools/lark/
  documents/    Raw document read and append handlers
  wiki/         Wiki tree, subtree, metadata and search handlers
  knowledge/    Governed metadata-to-content retrieval
  conflicts/    Conflict resolution and assessment handlers

runtime/
  core/         Shared MCP server factory and legacy local skill runner
  registrations/MCP tool schemas, descriptions and handlers
  servers/      Stdio and Streamable HTTP transport entry points

tests/
  wiki/         Wiki traversal, body reading and search
  knowledge/    Registry, validation and governed retrieval
  conflicts/    Classification, decision reuse and assessment
  mcp/          MCP client checks
  integration/  Manual integration checks
  fixtures/     Shared deterministic test data

scripts/lark/   Standalone Lark diagnostics
skills/         Local skill instructions
docs/           Current specifications, acceptance evidence and release history
```

## Dependency direction

```text
MCP client
  -> runtime/servers
  -> runtime/core/create-lark-mcp-server
  -> runtime/registrations
  -> tools/lark
  -> integrations/lark
  -> Lark APIs
```

- Servers handle transport and sessions only.
- Registrations define MCP names, descriptions, schemas and annotations.
- Tools coordinate one user-facing operation.
- Integrations contain reusable API and domain logic.
- Production code must not import from `tests/` or `scripts/`.
- Both MCP transports use the shared server factory so their core tool behavior stays consistent.
