# Project Structure

Production code is grouped by responsibility and then by feature.

```text
integrations/lark/
  core/         Lark authentication and document APIs
  documents/    Reviewed drafts, new Wiki publication and read-back verification
  wiki/         Wiki traversal, metadata and subtree logic
  knowledge/    Registry retrieval gate and external-domain governance

tools/lark/
  documents/    Raw document read handler
  wiki/         Wiki tree, subtree, metadata and search handlers
  knowledge/    Registry-first discovery, governed retrieval and external URL authorization

runtime/
  core/         Shared MCP server factory
  registrations/  MCP tool schemas, descriptions and feature groups
  servers/      Stdio and Streamable HTTP transport entry points

tests/
  documents/    Approved publication, content mapping and failure handling
  wiki/         Wiki traversal, body reading and search
  knowledge/    Registry, validation and governed retrieval
  mcp/          MCP client checks
  fixtures/     Shared deterministic test data

scripts/lark/   Authentication diagnostic
docs/
  operations/   Runtime instructions for the retrieval agent
  reference/    Current technical contracts
  architecture/ Code structure and dependency documentation
  planning/     Roadmap and release plans
  reports/      Acceptance evidence and generated-report guidance
  versions/     Historical release notes and changelog
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
- Document publication registrations call the publication coordinator in `integrations/lark/documents/`; its API and local receipt store are injectable for offline tests.
- Private drafts and publication receipts are kept in `.lemma-drafts/`, which is excluded from Git.
- Detailed metadata validation belongs to the separate Knowledge Base Management Agent.
