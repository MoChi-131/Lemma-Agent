const {
  readLarkDocument,
} = require("../../../integrations/lark/core/client");

async function readLarkDocumentTool(input) {
  if (!input?.url) {
    throw new Error("url is required");
  }

  const content = await readLarkDocument(input.url);

  return {
    success: true,
    source: "lark",
    action: "read_document",
    url: input.url,
    content,
  };
}

module.exports = {
  readLarkDocumentTool,
};