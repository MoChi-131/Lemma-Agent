# Wiki document publication

Lemma-Agent publishes through the pinned official Lark MCP only. There is no local draft store, receipt, replay path, or direct Lark REST publication client.

## Configuration

```dotenv
LARK_DOCUMENT_WIKI_ROOT_URL=https://your-tenant.larksuite.com/wiki/ROOT_TOKEN
ENABLE_LARK_DOCUMENT_WRITES=true
```

The Lark application must have `docx:document` and `wiki:wiki`, be released, and have administrator access to the target Wiki space.

## Tools

| Tool | Purpose |
| --- | --- |
| `publish_approved_document` | Creates one Docx Wiki child from a title, Markdown body, and parent Wiki URL after `approval_confirmed=true`. It checks the destination, rejects duplicate titles, and reads the document back. |
| `inspect_document_publication` | Reads metadata for a known Wiki document. |

The write tool never edits, moves, deletes, or retries an existing document. A failed write must be inspected in Lark before another request is made.
