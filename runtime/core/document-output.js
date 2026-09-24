/** Convert downloaded images into MCP image blocks without duplicating base64 in JSON. */
function documentResult(result, { isError = false } = {}) {
  const images = Array.isArray(result.images) ? result.images : [];
  const safeImages = images.map(({ data, ...metadata }) => metadata);
  const safeResult = { ...result, images: safeImages };
  const imageContent = images
    .filter(image => image.success && image.data && image.mime_type)
    .map(image => ({ type: 'image', data: image.data, mimeType: image.mime_type }));

  return {
    ...(isError ? { isError: true } : {}),
    content: [
      { type: 'text', text: JSON.stringify(safeResult, null, 2) },
      ...imageContent,
    ],
    structuredContent: safeResult,
  };
}

module.exports = { documentResult };
