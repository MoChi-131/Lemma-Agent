const { runSkill } = require("../../runtime/core/skill-runner");

const larkUrl = process.argv[2];

if (!larkUrl) {
  console.error(
    "Usage: node tests/integration/test-lark-skill.js <LARK_WIKI_URL>"
  );
  process.exit(1);
}

async function test(name, message) {
  console.log("\n================================");
  console.log(`TEST: ${name}`);
  console.log("================================\n");

  try {
    const result = await runSkill({
      skillName: "lark-knowledge",
      userMessage: message,
    });

    console.log("\nRESULT:\n");
    console.log(result);
  } catch (error) {
    console.error("\nERROR:\n");
    console.error(error.message);
    process.exitCode = 1;
  }
}

async function main() {
  await test(
    "Test 1 - Summary",
    `
請讀取這份 Lark 文件：

${larkUrl}

幫我總結這份文件的重點。
`
  );
}

main();
