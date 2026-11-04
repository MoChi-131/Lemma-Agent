const { TOOLS } = require('../../integrations/lark/official-mcp/constants');

// Adapt the existing binary-reader HTTP fixtures to the official MCP data contract.
// Actual official-package transport/HTTP compatibility is tested separately.
function fixtureDocumentMcp(fetchImpl) {
  return { async call(name, args, options) {
    if (name === TOOLS.whiteboardNodes) {
      const response = await fetchImpl(
        `https://open.larksuite.com/open-apis/board/v1/whiteboards/${args.path.whiteboard_id}/nodes`, options,
      );
      const body = await response.json();
      if (!response.ok || body.code !== 0) throw Error('Fixture whiteboard read failed');
      return body.data;
    }
    const base = `https://open.larksuite.com/open-apis/docx/v1/documents/${args.path.document_id}`;
    const url = name === TOOLS.rawContent ? `${base}/raw_content` : `${base}/blocks?${new URLSearchParams(args.params)}`;
    const response = await fetchImpl(url, options);
    const body = await response.json();
    if (!response.ok || body.code !== 0) throw Error('Fixture document read failed');
    return body.data;
  } };
}
module.exports = { fixtureDocumentMcp };
