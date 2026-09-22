const { test } = require("node:test");
const assert = require("node:assert/strict");
const { crawlLarkWikiTreeTool: crawl } = require("../../tools/lark/wiki/crawl-lark-wiki-tree");
const url = "https://example.sg.larksuite.com/wiki/root?from=share#section";
const node = (token, has_child = false) => ({ node_token: token, title: token, space_id: "123", has_child, obj_type: "docx" });
function fixture(pages = {}, root = node("root", true)) {
  const calls = [];
  return {
    calls,
    getWikiNode: async (token, { signal }) => { assert.equal(token, "root"); assert.ok(signal); return root; },
    listWikiChildren: async args => {
      calls.push(args);
      const page = pages[args.parentNodeToken + ":" + (args.pageToken || "")];
      if (page instanceof Error) throw page;
      assert.ok(page, "Unexpected child-list call");
      return { items: [], hasMore: false, ...page };
    },
  };
}

test("nested tree, pagination, metadata and count include root; no body API needed", async () => {
  const api = fixture({
    "root:": { items: [node("a", true)], hasMore: true, pageToken: "next" },
    "root:next": { items: [node("b")] },
    "a:": { items: [node("c")] },
  });
  const r = await crawl({ url }, api);
  assert.equal(r.node_count, 4);
  assert.equal(r.truncated, false);
  assert.deepEqual(r.tree.map(n => n.title), ["a", "b"]);
  assert.equal(r.tree[0].children[0].parent_node_token, "a");
  assert.equal(r.root.url, "https://example.sg.larksuite.com/wiki/root");
  assert.equal(api.calls[1].pageToken, "next");
});

test("depth zero and root-only count require no child-list call", async () => {
  for (const limits of [{ max_depth: 0 }, { max_nodes: 1 }]) {
    const api = fixture();
    const r = await crawl({ url, ...limits }, api);
    assert.equal(r.node_count, 1);
    assert.equal(r.truncated, true);
    assert.equal(api.calls.length, 0);
  }
});

test("depth boundary retains nodes but omits deeper descendants", async () => {
  const api = fixture({ "root:": { items: [node("a", true)] } });
  const r = await crawl({ url, max_depth: 1 }, api);
  assert.equal(r.node_count, 2);
  assert.deepEqual(r.truncation_reasons, ["max_depth"]);
  assert.equal(api.calls.length, 1);
});

test("exact full leaf tree at count limit is complete; extra nodes truncate", async () => {
  for (const extra of [false, true]) {
    const api = fixture({ "root:": { items: [node("a"), ...(extra ? [node("b")] : [])] } });
    const r = await crawl({ url, max_nodes: 2 }, api);
    assert.equal(r.node_count, 2);
    assert.equal(r.truncated, extra);
  }
});

test("node budget stops pagination without another request", async () => {
  const api = fixture({ "root:": { items: [node("a")], hasMore: true, pageToken: "next" } });
  const r = await crawl({ url, max_nodes: 2 }, api);
  assert.equal(r.truncated, true);
  assert.equal(api.calls.length, 1);
});

test("cycles and duplicate node references terminate and do not inflate counts", async () => {
  const api = fixture({ "root:": { items: [node("root", true), node("a"), node("a")] } });
  const r = await crawl({ url }, api);
  assert.equal(r.node_count, 2);
  assert.deepEqual(r.truncation_reasons, ["cycle_or_duplicate"]);
});

test("empty pages can advance, repeated or missing tokens cannot loop", async () => {
  for (const token of [null, "next"]) {
    const api = fixture({
      "root:": { hasMore: true, pageToken: "next" },
      "root:next": { hasMore: true, pageToken: token },
    });
    const r = await crawl({ url }, api);
    assert.equal(api.calls.length, 2);
    assert.deepEqual(r.truncation_reasons, ["invalid_pagination"]);
  }
});

test("branch failure is isolated and raw API errors are not returned", async () => {
  const api = fixture({
    "root:": { items: [node("a", true), node("b", true)] },
    "a:": new Error("PRIVATE upstream response"),
    "b:": { items: [node("c")] },
  });
  const r = await crawl({ url }, api);
  assert.equal(r.node_count, 4);
  assert.equal(r.errors[0].node_token, "a");
  assert.equal(JSON.stringify(r).includes("PRIVATE"), false);
});

test("root failure is fatal and sanitized", async () => {
  await assert.rejects(crawl({ url }, { getWikiNode: async () => { throw Error("PRIVATE"); } }),
    /Unable to resolve the Wiki root/);
});

test("invalid URLs and limits fail before any API call", async () => {
  const bad = [
    { url: "http://example.larksuite.com/wiki/root" },
    { url: "https://example.larksuite.com.evil.test/wiki/root" },
    { url: "https://user:pass@example.larksuite.com/wiki/root" },
    { url: "https://example.larksuite.com/docx/root" },
    { url: "https://example.larksuite.com/wiki/%2f" },
    { max_depth: -1 }, { max_depth: 21 }, { max_depth: 1.5 }, { max_depth: null },
    { max_nodes: 0 }, { max_nodes: 1001 }, { max_nodes: "10" },
  ];
  for (const input of bad) await assert.rejects(crawl({ url, ...input }, {}));
});

test("leaf root is complete even with zero depth and one node budget", async () => {
  const r = await crawl({ url, max_depth: 0, max_nodes: 1 }, fixture({}, node("root")));
  assert.equal(r.truncated, false);
  assert.equal(r.node_count, 1);
});

test("malformed child metadata reports incomplete result", async () => {
  const r = await crawl({ url }, fixture({ "root:": { items: [{}] } }));
  assert.equal(r.truncated, true);
  assert.equal(r.errors.length, 1);
});

test("unbounded empty pagination is stopped by page budget", async () => {
  let pages = 0;
  const r = await crawl({ url }, {
    getWikiNode: async () => node("root", true),
    listWikiChildren: async () => ({ items: [], hasMore: true, pageToken: String(++pages) }),
  });
  assert.equal(pages, 2000);
  assert.deepEqual(r.truncation_reasons, ["max_pages"]);
});
