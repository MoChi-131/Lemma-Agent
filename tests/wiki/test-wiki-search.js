const { test } = require("node:test");
const assert = require("node:assert/strict");
const { getLarkWikiMetadataTool } = require("../../tools/lark/wiki/get-lark-wiki-metadata");
const { searchLarkWikiTool } = require("../../tools/lark/wiki/search-lark-wiki");
const { readLarkWikiSubtreeTool } = require("../../tools/lark/wiki/read-lark-wiki-subtree");
const url = "https://example.larksuite.com/wiki/root";
const node = (token, title, children = []) => ({ node_token: token, obj_token: token,
  title, url: `https://example.larksuite.com/wiki/${token}`, obj_type: "docx", children });
const inventory = () => ({ root: node("root", "目錄"), tree: [node("a", "驗樓", [node("b", "筆記")])],
  node_count: 3, truncated: false, truncation_reasons: [], errors: [] });
const metadata = input => getLarkWikiMetadataTool(input, { crawl: async () => inventory() });
const read = async token => token === "b" ? "實際驗樓正文 ABC 😀" : "";
test("metadata preserves relative ancestry and retrieval time; subtree bodies receive it", async () => {
  const result = await metadata({ url });
  assert.deepEqual(result.nodes.map(n => n.depth), [0, 1, 2]);
  assert.deepEqual(result.nodes[2].path.map(n => n.node_token), ["root", "a", "b"]);
  assert.ok(Number.isFinite(Date.parse(result.nodes[0].retrieved_at)));
  assert.equal(result.nodes[2].scope_root_url, url);
  assert.equal(result.nodes[2].content, undefined);
  const bodies = await readLarkWikiSubtreeTool({ url }, { crawl: async () => inventory(), read });
  assert.equal(bodies.documents[2].depth, 2);
});
test("title search reads no bodies, and both ranks title before body with exact source snippets", async () => {
  const title = await searchLarkWikiTool({ url, query: "驗樓", search_in: "title" },
    { metadata, read: () => { throw Error("must not read"); } });
  assert.equal(title.result_count, 1);
  assert.equal(title.scanned_document_count, 0);
  const both = await searchLarkWikiTool({ url, query: "驗樓" }, { metadata, read });
  assert.deepEqual(both.results.map(n => n.node_token), ["a", "b"]);
  assert.equal(both.results[1].snippet, "實際驗樓正文 ABC 😀");
  assert.equal(both.results[1].content, undefined);
});
test("literal matching supports CJK, case folding, emoji and regex punctuation", async () => {
  for (const query of ["abc", "😀", ".*"]) {
    const r = await searchLarkWikiTool({ url, query, search_in: "content" }, { metadata, read });
    assert.equal(r.result_count, query === ".*" ? 0 : 1);
  }
});
test("zero matches with unread candidates is explicitly incomplete", async () => {
  const r = await searchLarkWikiTool({ url, query: "missing", max_documents: 1 }, { metadata, read });
  assert.equal(r.result_count, 0);
  assert.equal(r.search_complete, false);
  assert.ok(r.truncation_reasons.includes("max_documents"));
});
test("result limit is independent of scanned coverage", async () => {
  const r = await searchLarkWikiTool({ url, query: "驗樓", max_results: 1 }, { metadata, read });
  assert.equal(r.search_complete, true);
  assert.equal(r.matched_node_count, 2);
  assert.equal(r.result_count, 1);
  assert.deepEqual(r.truncation_reasons, ["max_results"]);
});
test("body failures and crawl incompleteness survive search with sanitized errors", async () => {
  const r = await searchLarkWikiTool({ url, query: "驗樓" }, { metadata: async input => ({
    ...await metadata(input), truncated: true, truncation_reasons: ["max_depth"], errors: [] }),
    read: async () => { throw Error("PRIVATE SECRET"); } });
  assert.equal(r.search_complete, false);
  assert.equal(r.result_count, 1);
  assert.equal(r.errors.length, 3);
  assert.equal(JSON.stringify(r).includes("PRIVATE"), false);
});
test("aliases share one body request but retain their own paths", async () => {
  let count = 0;
  const r = await searchLarkWikiTool({ url, query: "body", search_in: "content" }, {
    metadata: async input => { const m = await metadata(input); m.nodes[2].obj_token = "a"; return m; },
    read: async () => { count++; return "body"; } });
  assert.equal(count, 2);
  assert.equal(r.result_count, 3);
  assert.equal(r.results[2].depth, 2);
});
test("invalid inputs fail before network work", async () => {
  for (const input of [{ query: " " }, { query: "x", max_results: 0 }, { query: "x", max_documents: 51 },
    { query: "x", search_in: "regex" }, { query: "x", url: "https://evil.test" }]) {
    await assert.rejects(searchLarkWikiTool({ url, ...input }, { metadata: () => assert.fail("unexpected request") }));
  }
});

test("body clipping prevents complete-search claims, and snippets are bounded original text", async () => {
  const r = await searchLarkWikiTool({ url, query: "驗樓" }, { metadata,
    read: async () => "😀".repeat(400) + "驗樓" + "文".repeat(22000) });
  assert.equal(r.search_complete, false);
  assert.ok(r.truncation_reasons.includes("max_document_chars"));
  for (const hit of r.results) {
    assert.ok(Array.from(hit.snippet).length <= 240);
    assert.ok(hit.snippet.includes("驗樓"));
    assert.equal(hit.content_truncated, true);
  }
});
