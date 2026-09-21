// Only preload this in tests. No request is sent to Lark or any other host.
const node = (token, has_child = false) => ({
  node_token: token, space_id: "123", title: token,
  obj_token: token + "doc", obj_type: "docx", has_child,
});
global.fetch = async (input, options = {}) => {
  const url = new URL(input);
  if (url.origin !== "https://open.larksuite.com") throw Error("Unexpected outbound host");
  let data;
  if (url.pathname.endsWith("/tenant_access_token/internal")) {
    data = { code: 0, tenant_access_token: "fixture-token" };
  } else if (url.pathname.endsWith("/get_node")) {
    const token = url.searchParams.get("token");
    if (!["root", "partial"].includes(token)) throw Error("Unexpected root");
    data = { code: 0, data: { node: node(token, true) } };
  } else if (url.pathname.endsWith("/nodes")) {
    if (options.method && options.method !== "GET") throw Error("Unexpected mutation");
    const parent = url.searchParams.get("parent_node_token");
    const next = url.searchParams.get("page_token");
    const items = parent === "partial" ? [node("denied"), node("c")] :
      parent === "root" ? [node(next ? "b" : "a", !next)] : [node("c")];
    data = { code: 0, data: { items, has_more: parent === "root" && !next, page_token: next ? null : "next" } };
  } else if (url.pathname.endsWith("/raw_content")) {
    data = url.pathname.includes("/denieddoc/")
      ? { code: 999, msg: "PRIVATE upstream detail" }
      : { code: 0, data: { content: "Fixture document body" } };
  } else {
    throw Error("Unexpected API path");
  }
  return new Response(JSON.stringify(data), { headers: { "Content-Type": "application/json" } });
};
