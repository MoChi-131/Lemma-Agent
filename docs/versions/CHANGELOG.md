# Changelog

This file summarizes notable project releases. Detailed historical evidence remains in the linked release notes.

## Unreleased

### Added

- Knowledge Registry validation, whitelist checks and retrieval eligibility.
- Governed `retrieve_knowledge_document` flow that checks eligibility before reading content.
- Deterministic duplicate and conflict comparison with reusable approved decisions.
- Agent-submitted semantic assessment as a `Pending` human-review proposal.

### Changed

- Shared MCP server factory now supplies both stdio and HTTP transports.
- MCP registrations, tool handlers and Lark integration logic are separated by responsibility.

### Removed

- Internal OpenAI conflict-review calls and the unused v0.1 architecture page.

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
