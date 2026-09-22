# Documentation

Use this page as the entry point for current project documentation.

## Current specifications

| Document | Purpose |
| --- | --- |
| [Knowledge Registry](knowledge-registry.md) | Metadata schema, validation, whitelist and governed retrieval behavior. |
| [Metadata Acceptance Report](metadata-acceptance-report.md) | Evidence from the frozen 13-record Metadata MVP acceptance run. |
| [Conflict Taxonomy v1](conflict-taxonomy-v1.md) | Duplicate and conflict categories, comparison method and review policy. |
| [Conflict Ground-Truth Cases](conflict-cases.md) | Human-readable summary of the automated conflict fixtures. |
| [Project Structure](project-structure.md) | Responsibilities of runtime, registrations, tools, integrations and tests. |
| [Agent Instructions](supermama-agent-instructions.md) | Concise ChatGPT Agent routing rules for Lark, metadata, conflicts and linked Google Drive files. |

Specifications explain expected behavior. Acceptance reports preserve evidence from a particular test baseline and should not be used as the latest operational instructions.

## Historical releases

Release notes are retained under [`versions/`](versions/):

- [v0.1.0](versions/v0.1.0.md)
- [v0.3.2](versions/v0.3.2.md)
- [v0.3.3](versions/v0.3.3.md)
- [v0.3.4](versions/v0.3.4.md)
- [Changelog](versions/CHANGELOG.md)

Historical notes describe the project at the time of that release. Commands and limitations may have changed since then.

## Generated artifacts

`validation-report.md` at the repository root is generated from the live Lark Base. Regenerate it rather than manually maintaining its record results.

Images used by documentation are stored under [`assets/`](assets/).
