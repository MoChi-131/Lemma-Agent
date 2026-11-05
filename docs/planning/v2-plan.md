# Version 2 plan

Delivered:

- Official Lark MCP handles Wiki, Docx, Base, whiteboard, Drive inspection, and Wiki writes.
- `publish_approved_document` creates and verifies a new Wiki document in one call.
- Publication uses the official Lark MCP only.

Before production deployment, set `LARK_DOCUMENT_WIKI_ROOT_URL` and `ENABLE_LARK_DOCUMENT_WRITES=true`, grant the Lark app `docx:document` and `wiki:wiki`, and make the app a target Wiki space administrator.
