const wiki = require("./wiki");

const LIMITS = Object.freeze({
  defaultDepth: 4, defaultNodes: 100, maxDepth: 20, maxNodes: 1000,
  maxPages: 2000, timeoutMs: 30000,
});

function validateCrawlInput({ url, max_depth = 4, max_nodes = 100 } = {}) {
  let parsed;
  try { parsed = new URL(url); } catch { throw new Error("A valid HTTPS Lark Wiki URL is required."); }
  if (parsed.protocol !== "https:" || parsed.username || parsed.password ||
      parsed.port || !/^[a-z0-9.-]+\.larksuite\.com$/i.test(parsed.hostname) ||
      !/^\/wiki\/[a-zA-Z0-9]+\/?$/.test(parsed.pathname)) {
    throw new Error("Use an HTTPS *.larksuite.com/wiki/<token> URL.");
  }
  if (!Number.isInteger(max_depth) || max_depth < 0 || max_depth > LIMITS.maxDepth) {
    throw new Error("max_depth must be an integer from 0 to 20.");
  }
  if (!Number.isInteger(max_nodes) || max_nodes < 1 || max_nodes > LIMITS.maxNodes) {
    throw new Error("max_nodes must be an integer from 1 to 1000.");
  }
  return { origin: parsed.origin, token: parsed.pathname.split("/")[2], max_depth, max_nodes };
}

function normalizeNode(node, origin, spaceId, parentToken = null) {
  if (!node || typeof node.node_token !== "string" ||
      !/^[a-zA-Z0-9]+$/.test(node.node_token) ||
      typeof (node.space_id || spaceId) !== "string" ||
      !/^\d+$/.test(node.space_id || spaceId) ||
      typeof node.has_child !== "boolean") {
    throw new Error("Invalid Wiki node metadata.");
  }
  return {
    title: node.title || "",
    url: origin + "/wiki/" + node.node_token,
    node_token: node.node_token,
    space_id: node.space_id || spaceId,
    obj_token: node.obj_token || null,
    obj_type: node.obj_type || null,
    parent_node_token: node.parent_node_token || parentToken,
    has_child: node.has_child,
  };
}

// Only get_node and child-list APIs are used; document bodies are never fetched.
// Dependencies are injectable so the traversal can be tested without credentials.
async function crawlWikiTree(input, api = wiki) {
  const { origin, token, max_depth, max_nodes } = validateCrawlInput(input);
  const signal = AbortSignal.timeout(LIMITS.timeoutMs);
  let root;
  try {
    root = normalizeNode(await api.getWikiNode(token, { signal }), origin);
  } catch {
    throw new Error("Unable to resolve the Wiki root. Check the URL, Lark credentials and node access.");
  }
  const tree = [];
  const result = { root, tree, node_count: 1, truncated: false, truncation_reasons: [], errors: [] };
  const reasons = new Set();
  const seen = new Set([root.node_token]);
  const queue = [{ node: root, children: tree, depth: 0 }];
  let pages = 0;
  const truncate = reason => { result.truncated = true; reasons.add(reason); };
  for (let index = 0; index < queue.length; index++) {
    const { node, children, depth } = queue[index];
    if (!node.has_child) continue;
    if (depth >= max_depth) { truncate("max_depth"); continue; }
    if (result.node_count >= max_nodes) { truncate("max_nodes"); continue; }
    let pageToken;
    const pageTokens = new Set();
    do {
      if (signal.aborted || pages >= LIMITS.maxPages) {
        truncate(signal.aborted ? "timeout" : "max_pages");
        index = queue.length;
        break;
      }
      let page;
      try {
        pages++;
        page = await api.listWikiChildren({
          spaceId: node.space_id, parentNodeToken: node.node_token,
          pageSize: Math.min(50, max_nodes - result.node_count),
          pageToken, signal,
        });
        if (!page || !Array.isArray(page.items) || typeof page.hasMore !== "boolean") {
          throw new Error("Invalid Wiki page.");
        }
        for (const item of page.items) {
          const child = normalizeNode(item, origin, node.space_id, node.node_token);
          if (seen.has(child.node_token)) { truncate("cycle_or_duplicate"); continue; }
          if (result.node_count >= max_nodes) { truncate("max_nodes"); break; }
          seen.add(child.node_token);
          child.children = [];
          children.push(child);
          result.node_count++;
          queue.push({ node: child, children: child.children, depth: depth + 1 });
        }
      } catch {
        truncate(signal.aborted ? "timeout" : "list_failed");
        result.errors.push({
          node_token: node.node_token,
          message: "Unable to list all children; check Lark access or retry.",
        });
        break;
      }
      if (!page.hasMore) break;
      if (result.node_count >= max_nodes) { truncate("max_nodes"); break; }
      if (typeof page.pageToken !== "string" || !page.pageToken || pageTokens.has(page.pageToken)) {
        truncate("invalid_pagination");
        result.errors.push({ node_token: node.node_token, message: "Missing or repeated pagination token." });
        break;
      }
      pageTokens.add(page.pageToken);
      pageToken = page.pageToken;
    } while (true);
  }
  result.truncation_reasons = [...reasons];
  return result;
}

module.exports = { crawlWikiTree, validateCrawlInput, LIMITS };
