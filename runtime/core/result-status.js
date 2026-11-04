/** Inspect known result/resource fields only; never log their contents. */
function partialResultInfo(result) {
  const seen = new WeakSet();
  const info = { resource_issues: 0, errors: 0, truncated: false };
  const resourceKeys = ['images', 'attachments', 'embedded_sheets', 'whiteboards', 'worksheets', 'documents'];
  function visit(value, resource = false) {
    if (!value || typeof value !== 'object' || seen.has(value)) return;
    seen.add(value);
    if (resource && value.success === false) info.resource_issues++;
    if (Array.isArray(value.errors)) info.errors += value.errors.length;
    if (value.truncated || value.content_truncated || value.text_truncated ||
        value.images_truncated || value.results_truncated || value.skipped_count > 0) info.truncated = true;
    for (const key of resourceKeys) {
      if (Array.isArray(value[key])) value[key].forEach(item => visit(item, true));
    }
  }
  visit(result);
  return info;
}

module.exports = { partialResultInfo };
