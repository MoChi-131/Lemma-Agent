require("dotenv").config();

const {
  listLarkWikiChildrenTool,
} = require("../../tools/lark/wiki/list-lark-wiki-children");

async function main() {
  const result =
    await listLarkWikiChildrenTool({
      space_id:
        "7511199137614823462",

      parent_node_token:
        "NR06wEWBsiMVNnkOclVlKgAAg6e",

      page_size:
        50,
    });

  console.log(
    JSON.stringify(
      result,
      null,
      2
    )
  );
}

main().catch(console.error);
