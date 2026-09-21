const {
  appendToLarkDocument,
} = require("../../../integrations/lark/core/client");

async function appendLarkDocumentTool(input) {
  if (!input?.url) {
    throw new Error("url is required");
  }

  if (!input?.text) {
    throw new Error("text is required");
  }

  const result = await appendToLarkDocument(
    input.url,
    input.text
  );

  return {
    success: true,
    source: "lark",
    action: "append_document",
    url: input.url,
    result,
  };
}

module.exports = {
  appendLarkDocumentTool,
};