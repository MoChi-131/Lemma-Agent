const {
  readLarkDocumentData,
} = require("../../../integrations/lark/core/client");

async function readLarkDocumentTool(input) {
  if (!input?.url) {
    throw new Error("url is required");
  }

  const { content, tables, embedded_sheets: embeddedSheets, attachments, images } = await readLarkDocumentData(input.url);

  return {
    success: true,
    source: "lark",
    action: "read_document",
    url: input.url,
    content,
    tables,
    embedded_sheets: embeddedSheets,
    attachments,
    images,
  };
}

module.exports = {
  readLarkDocumentTool,
};
