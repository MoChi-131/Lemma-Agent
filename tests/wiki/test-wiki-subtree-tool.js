const { test } = require("node:test");
const assert = require("node:assert/strict");
const { readLarkWikiSubtreeTool: subtree } = require("../../tools/lark/wiki/read-lark-wiki-subtree");
const { readWikiSubtreeDocuments: batch, SUBTREE_LIMITS } = require("../../integrations/lark/wiki/wiki-subtree-documents");
const { readDocument } = require("../../integrations/lark/core/documents");
const url = "https://example.larksuite.com/wiki/root";
const node = (id, obj_type = "docx", children = []) => ({
  title: id, node_token: id, obj_token: id + "doc", obj_type, space_id: "123",
  url: "https://example.larksuite.com/wiki/" + id, children,
});
function inventory(root = node("root"), tree = [], extra = {}) {
  return { root, tree, node_count: 1 + tree.length, truncated: false, truncation_reasons: [], errors: [], ...extra };
}

test("root and descendants are read breadth-first with source metadata; crawl limits forwarded", async () => {
  const calls = [];
  const result = await subtree({ url, max_depth: 2, max_nodes: 20 }, {
    crawl: async args => {
      assert.deepEqual(args, { url, max_depth: 2, max_nodes: 20 });
      return inventory(node("root"), [node("a", "docx", [node("c")]), node("b")], { node_count: 4 });
    },
    read: async (id, { signal }) => { assert.ok(signal); calls.push(id); return id + " body"; },
  });
  assert.deepEqual(calls, ["rootdoc", "adoc", "bdoc", "cdoc"]);
  assert.equal(result.document_count, 4);
  assert.equal(result.truncated, false);
  assert.equal(result.documents[0].url, url);
  assert.equal(result.documents[0].children, undefined);
  assert.equal(result.documents[0].content, "rootdoc body");
});

test("root-only subtree reads the root body even with max_depth zero", async () => {
  const result = await subtree({ url, max_depth: 0, max_documents: 1 }, {
    crawl: async () => inventory(), read: async () => "",
  });
  assert.equal(result.document_count, 1);
  assert.equal(result.documents[0].content, "");
  assert.equal(result.truncated, false);
});

test("unsupported types are skipped but their docx descendants are retained", async () => {
  const result = await subtree({ url }, {
    crawl: async () => inventory(node("root", "sheet"), [node("a", "bitable", [node("b")])]),
    read: async id => { assert.equal(id, "bdoc"); return "body"; },
  });
  assert.equal(result.document_count, 1);
  assert.equal(result.skipped.length, 2);
  assert.equal(result.truncated, false);
});

test("docx aliases are read once, keeping skipped-node metadata", async () => {
  const r = await batch([node("a"), { ...node("alias"), obj_token: "adoc" }], 10, { read: async () => "body" });
  assert.equal(r.attempted_document_count, 1);
  assert.equal(r.eligible_document_count, 1);
  assert.equal(r.skipped[0].reason, "duplicate_document");
});

test("max_documents counts failures and stops before reading the next candidate", async () => {
  const calls = [];
  const r = await batch([node("a"), node("b"), node("c")], 2, { read: async id => {
    calls.push(id);
    if (id === "adoc") throw Error("PRIVATE upstream detail");
    return "body";
  } });
  assert.deepEqual(calls, ["adoc", "bdoc"]);
  assert.equal(r.document_count, 1);
  assert.equal(r.attempted_document_count, 2);
  assert.equal(r.unattempted_document_count, 1);
  assert.ok(r.truncation_reasons.includes("max_documents"));
  assert.equal(JSON.stringify(r).includes("PRIVATE"), false);
});

test("exact document limit is not truncated; no docx is an empty complete result", async () => {
  const read = async () => "body";
  assert.equal((await batch([node("a")], 1, { read })).truncated, false);
  const r = await batch([node("sheet", "sheet")], 1, { read });
  assert.equal(r.document_count, 0);
  assert.equal(r.truncated, false);
});

test("partial crawl errors and reasons propagate while readable docs are returned", async () => {
  const r = await subtree({ url }, {
    crawl: async () => inventory(node("root"), [], {
      truncated: true, truncation_reasons: ["list_failed"], errors: [{ node_token: "missing", message: "No access" }],
    }),
    read: async () => "body",
  });
  assert.equal(r.document_count, 1);
  assert.equal(r.crawl_truncated, true);
  assert.equal(r.truncated, true);
  assert.equal(r.errors[0].stage, "crawl");
});

test("root resolution failure is fatal and no document is read", async () => {
  await assert.rejects(subtree({ url }, {
    crawl: async () => { throw Error("Root inaccessible"); },
    read: async () => assert.fail("must not read"),
  }), /Root inaccessible/);
});

test("invalid inputs fail before crawling", async () => {
  for (const input of [{ max_documents: 0 }, { max_documents: 51 }, { max_documents: 1.5 },
    { max_documents: "10" }, { max_documents: null }, { max_depth: 21 },
    { url: "https://evil.test/wiki/root" }]) {
    await assert.rejects(subtree({ url, ...input }, { crawl: async () => assert.fail("must validate before crawl") }));
  }
});

test("missing tokens and malformed body responses are isolated", async () => {
  const r = await batch([{ ...node("invalid"), obj_token: "../bad" }, node("a"), node("b")], 10,
    { read: async id => id === "adoc" ? undefined : "body" });
  assert.equal(r.document_count, 1);
  assert.equal(r.errors.length, 2);
  assert.equal(r.errors[0].code, "invalid_document_token");
});

test("per-document truncation does not split a surrogate pair", async () => {
  const text = "x".repeat(SUBTREE_LIMITS.maxDocumentChars - 1) + "😀end";
  const r = await batch([node("a")], 1, { read: async () => text });
  assert.equal(r.documents[0].content.length, SUBTREE_LIMITS.maxDocumentChars - 1);
  assert.equal(r.documents[0].content_truncated, true);
  assert.deepEqual(r.truncation_reasons, ["max_document_chars"]);
});

test("aggregate body budget stops further reads and clips the boundary document", async () => {
  let reads = 0;
  const nodes = Array.from({ length: 8 }, (_, i) => node("n" + i));
  const r = await batch(nodes, 10, { read: async () => { reads++; return "x".repeat(18000); } });
  assert.equal(reads, 6);
  assert.equal(r.total_content_chars, SUBTREE_LIMITS.maxTotalChars);
  assert.equal(r.documents[5].content.length, 10000);
  assert.ok(r.truncation_reasons.includes("max_total_chars"));
  assert.equal(r.unattempted_document_count, 2);
});

test("expired read budget starts no request", async () => {
  const controller = new AbortController(); controller.abort();
  const r = await batch([node("a")], 1, {
    signal: controller.signal, read: async () => assert.fail("must not read"),
  });
  assert.equal(r.attempted_document_count, 0);
  assert.deepEqual(r.truncation_reasons, ["read_timeout"]);
});

test("budget cancellation interrupts an in-flight read and stops remaining requests", async () => {
  const controller = new AbortController();
  const r = await batch([node("a"), node("b")], 10, {
    signal: controller.signal,
    read: async (id, { signal }) => {
      assert.equal(id, "adoc");
      controller.abort();
      signal.throwIfAborted();
    },
  });
  assert.equal(r.attempted_document_count, 1);
  assert.equal(r.errors[0].code, "read_timeout");
  assert.equal(r.unattempted_document_count, 1);
});

test("one document timeout is isolated and the next document can succeed", async t => {
  let timers = 0;
  t.mock.method(AbortSignal, "timeout", ms => {
    assert.equal(ms, SUBTREE_LIMITS.documentTimeoutMs);
    const controller = new AbortController();
    if (++timers === 1) controller.abort();
    return controller.signal;
  });
  const r = await batch([node("a"), node("b")], 10, {
    signal: new AbortController().signal, read: async id => { assert.equal(id, "bdoc"); return "body"; },
  });
  assert.equal(r.attempted_document_count, 2);
  assert.equal(r.document_count, 1);
  assert.equal(r.errors[0].code, "document_timeout");
});

test("readDocument passes the cancellation signal to auth and raw-content requests", async t => {
  const signal = new AbortController().signal;
  const paths = [];
  t.mock.method(global, "fetch", async (input, options) => {
    assert.equal(options.signal, signal);
    paths.push(new URL(input).pathname);
    return new Response(JSON.stringify(paths.length === 1
      ? { code: 0, tenant_access_token: "test" }
      : { code: 0, data: { content: "body" } }));
  });
  assert.equal(await readDocument("adoc", { signal }), "body");
  assert.ok(paths[0].endsWith("/tenant_access_token/internal"));
  assert.ok(paths[1].endsWith("/documents/adoc/raw_content"));
});
