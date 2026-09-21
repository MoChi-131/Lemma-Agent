const {
  readLarkDocumentTool,
} = require("../../tools/lark/documents/read-lark-document");

const {
  appendLarkDocumentTool,
} = require("../../tools/lark/documents/append-lark-document");

const tools = {
  read_lark_document: readLarkDocumentTool,
  append_lark_document: appendLarkDocumentTool,
};

async function callTool(name, input) {
  const tool = tools[name];

  if (!tool) {
    throw new Error(`Unknown tool: ${name}`);
  }

  return tool(input);
}

module.exports = {
  tools,
  callTool,
};
