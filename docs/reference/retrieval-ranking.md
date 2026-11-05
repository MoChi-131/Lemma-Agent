# Retrieval ranking

`search_knowledge_registry` ranks eligible internal metadata before document text is read.

Order:

1. Eligibility
2. Exact title or tag match
3. Authority: `Internal Official` before `Reference`
4. Scope: `Knowledge Base` before `Workspace`
5. Higher numeric version
6. Metadata match score

Use `ranking_context=business` for normal internal questions. Use `government` when an answer also needs current official web evidence; the external URL must still pass the approved-domain checks.

Ranking selects a document. It is not answer evidence: retrieve the document before making factual claims.
