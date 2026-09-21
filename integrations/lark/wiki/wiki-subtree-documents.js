const { readDocument } = require("../core/documents");

const SUBTREE_LIMITS = Object.freeze({
  defaultDocuments: 10,
  maxDocuments: 50,
  maxDocumentChars: 20000,
  maxTotalChars: 100000,
  readTimeoutMs: 20000,
  documentTimeoutMs: 8000,
});

// UTF-16 character budget, without splitting a Unicode surrogate pair.
function boundedText(text, limit) {
  let end = Math.min(text.length, limit);
  if (end > 0 && end < text.length && /[\uD800-\uDBFF]/.test(text[end - 1])) end--;
  return text.slice(0, end);
}

// Read known docx tokens directly: no second Wiki lookup and no write APIs.
// Budgets apply to attempts, including failed reads, rather than only successes.
async function readWikiSubtreeDocuments(nodes, maxDocuments, {
  read = readDocument,
  signal = AbortSignal.timeout(SUBTREE_LIMITS.readTimeoutMs),
} = {}) {
  const documents = [];
  const skipped = [];
  const errors = [];
  const candidates = [];
  const seen = new Set();
  const reasons = new Set();
  let attempted = 0;
  let totalChars = 0;
  for (const node of nodes) {
    if (node.obj_type !== "docx") {
      skipped.push({ node_token: node.node_token, obj_type: node.obj_type, reason: "unsupported_type" });
    } else if (typeof node.obj_token !== "string" || !/^[a-zA-Z0-9]+$/.test(node.obj_token)) {
      errors.push({ stage: "read", node_token: node.node_token, url: node.url,
        code: "invalid_document_token", message: "Missing or invalid docx token." });
      reasons.add("document_failed");
    } else if (seen.has(node.obj_token)) {
      skipped.push({ node_token: node.node_token, obj_token: node.obj_token, reason: "duplicate_document" });
    } else {
      seen.add(node.obj_token);
      candidates.push(node);
    }
  }
  for (const node of candidates) {
    if (attempted >= maxDocuments) { reasons.add("max_documents"); break; }
    if (signal.aborted) { reasons.add("read_timeout"); break; }
    if (totalChars >= SUBTREE_LIMITS.maxTotalChars) { reasons.add("max_total_chars"); break; }
    attempted++;
    const documentSignal = AbortSignal.any([
      signal, AbortSignal.timeout(SUBTREE_LIMITS.documentTimeoutMs),
    ]);
    try {
      documentSignal.throwIfAborted();
      const text = await read(node.obj_token, { signal: documentSignal });
      documentSignal.throwIfAborted();
      if (typeof text !== "string") throw new Error("Invalid document response.");
      const remaining = SUBTREE_LIMITS.maxTotalChars - totalChars;
      const content = boundedText(text, Math.min(SUBTREE_LIMITS.maxDocumentChars, remaining));
      const truncated = content.length < text.length;
      const contentReasons = [];
      if (truncated) {
        const reason = remaining < SUBTREE_LIMITS.maxDocumentChars ? "max_total_chars" : "max_document_chars";
        reasons.add(reason);
        contentReasons.push(reason);
      }
      const { children, ...metadata } = node;
      documents.push({
        ...metadata, content, content_length: content.length,
        original_content_length: text.length, content_truncated: truncated,
        content_truncation_reasons: contentReasons,
      });
      totalChars += content.length;
    } catch {
      const code = signal.aborted ? "read_timeout" :
        documentSignal.aborted ? "document_timeout" : "document_failed";
      reasons.add(code);
      errors.push({ stage: "read", node_token: node.node_token, obj_token: node.obj_token,
        url: node.url, code,
        message: "Unable to read this document. Check Lark access or retry." });
    }
  }
  return {
    documents, document_count: documents.length,
    attempted_document_count: attempted, eligible_document_count: candidates.length,
    unattempted_document_count: candidates.length - attempted,
    total_content_chars: totalChars, skipped, errors,
    truncated: reasons.size > 0, truncation_reasons: [...reasons],
  };
}

module.exports = { readWikiSubtreeDocuments, SUBTREE_LIMITS };
