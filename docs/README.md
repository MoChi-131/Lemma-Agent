# Documentation

Use this page as the entry point for current project documentation.

## Start here

| Document | Purpose |
| --- | --- |
| [Agent Instructions](operations/supermama-agent-instructions.md) | Simple colleague workflows for retrieval, uploaded drafts, reviewed Wiki saving and source handling. |
| [ChatGPT Acceptance Prompts](operations/test-prompts.md) | Copy-ready end-to-end prompts with observable pass/fail oracles. |
| [Knowledge Registry](reference/knowledge-registry.md) | Current metadata schema, whitelist, retrieval gate, tools and test commands. |
| [Retrieval Ranking](reference/retrieval-ranking.md) | Ranking contexts, score tables, result ordering, and returned ranking evidence. |
| [Project Structure](architecture/project-structure.md) | Code ownership, directory layout and dependency direction. |
| [Roadmap](planning/roadmap.md) | Deferred enhancements that are outside the current retrieval version. |
| [Approved Document Creation](planning/v2-plan.md) | Drafting, reviewed Wiki placement, approved writing and read-back; metadata handled separately. |
| [Document Publication Setup](reference/document-publication.md) | Configuration, API contracts, local receipts and failure handling. |
| [Metadata Acceptance Report](reports/metadata-acceptance-report.md) | Historical evidence from the frozen 13-record Metadata MVP run. |

Use Agent Instructions for runtime behavior and Knowledge Registry for the current technical contract. Acceptance and release documents preserve an earlier test baseline and may contain historical counts or limitations.

## Historical releases

Release notes are retained under [`versions/`](versions/):

- [v1.1.0](versions/v1.1.0.md)
- [v0.1.0](versions/v0.1.0.md)
- [v0.3.2](versions/v0.3.2.md)
- [v0.3.3](versions/v0.3.3.md)
- [v0.3.4](versions/v0.3.4.md)
- [Changelog](versions/CHANGELOG.md)

Historical notes describe the project at the time of that release. Commands and limitations may have changed since then.

## Generated report

[`validation-report.md`](../validation-report.md) is generated from the live Lark Base. Regenerate it instead of editing its record results manually.
