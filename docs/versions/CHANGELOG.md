# Changelog

This file summarizes notable project releases. Detailed historical evidence remains in the linked release notes.

## [1.1.0]

### Added

- Registry completeness, whitelist checks, and retrieval eligibility.
- Registry-first metadata search and approved-domain web governance.
- Governed `retrieve_knowledge_document` flow that checks eligibility before reading content.
- Native Lark tables, embedded Sheets, PDF attachment extraction, images, and whiteboards.
- Minimum agent-level check for obvious contradictions in retrieved content.

### Changed

- Shared MCP server factory now supplies both stdio and HTTP transports.
- MCP registrations, tool handlers and Lark integration logic are separated by responsibility.
- Normal retrieval reads the Registry first and falls back to Wiki search only when needed.
- Agent instructions now use a concise, explicit retrieval order and stop rules.

### Removed

- Internal OpenAI conflict-review calls and the unused v0.1 architecture page.
- The full pairwise conflict comparison, decision registry and conflict MCP tools.
- Legacy metadata validation code and its optional MCP tool. Detailed validation now belongs to Knowledge Base Management Agent.

## [0.3.4]

- Added Wiki metadata discovery and literal title/content search.
- See [v0.3.4](v0.3.4.md).

## [0.3.3]

- Added bounded Wiki subtree document retrieval.
- See [v0.3.3](v0.3.3.md).

## [0.3.2]

- Added Wiki tree traversal and remote MCP acceptance guidance.
- See [v0.3.2](v0.3.2.md).

## [0.1.0]

- Added the first stdio Lark MCP server and `read_lark_document` tool.
- See [v0.1.0](v0.1.0.md).
