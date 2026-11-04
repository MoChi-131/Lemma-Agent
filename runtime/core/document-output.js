// Leave room below the SDK's default 10 MiB stdio frame limit for RPC metadata.
const MAX_DOCUMENT_RESPONSE_BYTES = 8 * 1024 * 1024;

/** Bound the serialized response, including duplicated structured/text metadata. */
function documentResult(result, { isError = false } = {}) {
  const images = Array.isArray(result.images) ? result.images : [];
  const safeImages = images.map(({ data, ...metadata }) => metadata);
  const safeResult = { ...result, images: safeImages };
  const candidates = images
    .filter(image => image.success && image.data && image.mime_type)
    .map(image => ({ type: 'image', data: image.data, mimeType: image.mime_type }));

  const makeResponse = imageContent => ({
    ...(isError ? { isError: true } : {}),
    content: [
      { type: 'text', text: JSON.stringify(safeResult, null, 2) },
      ...imageContent,
    ],
    structuredContent: safeResult,
  });
  const imageContent = [];
  let size = Buffer.byteLength(JSON.stringify(makeResponse([])));
  // Reserve space for the explicit truncation summary, added only if necessary.
  for (const image of candidates) {
    const imageSize = Buffer.byteLength(JSON.stringify(image)) + 1;
    if (size + imageSize <= MAX_DOCUMENT_RESPONSE_BYTES - 1024) {
      imageContent.push(image);
      size += imageSize;
    }
  }
  if (imageContent.length < candidates.length) {
    safeResult.images_truncated = true;
    safeResult.inline_image_count = imageContent.length;
    safeResult.omitted_image_count = candidates.length - imageContent.length;
    safeResult.image_output_note = 'Some downloaded images were omitted to keep this MCP response within its byte limit.';
  }
  const response = makeResponse(imageContent);
  if (Buffer.byteLength(JSON.stringify(response)) > MAX_DOCUMENT_RESPONSE_BYTES) {
    const failure = { success: false, error_code: 'DOCUMENT_RESPONSE_TOO_LARGE',
      message: 'Document metadata and text exceed the MCP response byte limit. Use a smaller document or a bounded subtree read.' };
    return { isError: true, content: [{ type: 'text', text: JSON.stringify(failure) }], structuredContent: failure };
  }
  return response;
}

module.exports = { documentResult, MAX_DOCUMENT_RESPONSE_BYTES };
