# Manual acceptance prompts

Use a new ChatGPT conversation with the Lemma MCP selected.

1. **Read**: “Read this Wiki document: `<URL>`.”
   - Expect title and readable body; no credentials in output.
2. **Tree**: “List children of `<Wiki URL>`.”
   - Expect correct node count and paths.
3. **Registry search**: “Find approved internal guidance about `<topic>`.”
   - Expect Registry results before document retrieval.
4. **Publish**: “Create `<title>` under `<parent URL>` with this Markdown: `<body>`. I approve it.”
   - Expect one document URL and verified result.
5. **Duplicate**: repeat the same publish request.
   - Expect duplicate-title rejection and no new document.

For every run, record date, prompt, result URL, MCP version, and any Lark permission error.
