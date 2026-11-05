# Agent operations

## Read knowledge

1. Search the Knowledge Registry first.
2. Retrieve only eligible documents.
3. Use Wiki search only when Registry search has no relevant result.
4. For external web sources, first obtain approved domains and validate every final URL.

## Publish a Wiki document

1. Find an existing parent Wiki URL with `crawl_lark_wiki_tree` when needed.
2. Obtain one clear user confirmation of title, Markdown body, and location.
3. Call `publish_approved_document` with `approval_confirmed=true`.
4. Return the verified document URL.

Do not retry a failed write automatically or use direct Lark REST writes. Do not create folders or categories unless explicitly requested.

## Safety

- Never expose credentials, tokens, or raw upstream errors.
- Treat write failures as incomplete: inspect the destination before another write.
- Keep writes inside `LARK_DOCUMENT_WIKI_ROOT_URL`.
