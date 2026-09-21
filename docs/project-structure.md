# Project Structure

Scripts are grouped first by responsibility and then by feature.

```text
integrations/lark/
  core/         Lark authentication, document API and shared client
  wiki/         Wiki traversal, metadata and subtree logic
  knowledge/    Knowledge Registry and whitelist logic
  conflicts/    Duplicate detection, conflict review and decision reuse

tools/lark/
  documents/    Document read and append tool handlers
  wiki/         Wiki tree, subtree, metadata and search tool handlers
  conflicts/    Conflict resolution tool handler

runtime/
  servers/      Stdio and HTTP MCP entry points
  registrations/MCP tool registration modules
  core/         Local tool registry and skill runner

tests/
  conflicts/    Duplicate and conflict tests
  knowledge/    Registry and metadata tests
  wiki/         Wiki traversal and search tests
  mcp/          MCP client tests
  integration/  Manual integration checks
  fixtures/     Shared test fixtures

scripts/lark/   Standalone Lark diagnostic and maintenance scripts
```

Production code must not import files from `tests/` or `scripts/`. MCP servers should register tools through `runtime/registrations/`; tool handlers should delegate API and domain work to `integrations/`.
