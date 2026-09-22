const { callTool } = require("../../runtime/core/tool-registry");

const url = process.argv[2];

if (!url) {
  console.error(
    "Usage: node tests/integration/test-tool.js <LARK_WIKI_URL>"
  );
  process.exit(1);
}

callTool("read_lark_document", { url })
  .then((result) => {
    console.log("Lark tool test: SUCCESS");
    console.log(
      "Document content length:",
      result.content.length
    );
  })
  .catch((error) => {
    console.error("Lark tool test: FAILED");
    console.error(error.message);
    process.exit(1);
  });
