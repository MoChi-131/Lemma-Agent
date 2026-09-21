require("dotenv").config();

const fs = require("fs");
const path = require("path");
const OpenAI = require("openai");
const { callTool } = require("./tool-registry");

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

function loadSkill(skillName) {
  const skillPath = path.join(
    __dirname,
    "..",
    "skills",
    skillName,
    "SKILL.md"
  );

  return fs.readFileSync(skillPath, "utf8");
}

const toolDefinitions = [
  {
    type: "function",
    name: "read_lark_document",
    description: "Read the content of a Lark Wiki or document URL.",
    parameters: {
      type: "object",
      properties: {
        url: {
          type: "string",
        },
      },
      required: ["url"],
      additionalProperties: false,
    },
  },
  {
    type: "function",
    name: "append_lark_document",
    description:
      "Append text to an existing Lark document. Only use when the user explicitly asks to modify the document.",
    parameters: {
      type: "object",
      properties: {
        url: {
          type: "string",
        },
        text: {
          type: "string",
        },
      },
      required: ["url", "text"],
      additionalProperties: false,
    },
  },
];

async function runSkill({ skillName, userMessage }) {
  const skillInstructions = loadSkill(skillName);

  let response = await openai.responses.create({
    model: "gpt-5.6",
    instructions: skillInstructions,
    tools: toolDefinitions,
    input: [
      {
        role: "user",
        content: userMessage,
      },
    ],
  });

  while (true) {
    const toolCalls = response.output.filter(
      (item) => item.type === "function_call"
    );

    if (toolCalls.length === 0) {
      return response.output_text;
    }

    const toolOutputs = [];

    for (const toolCall of toolCalls) {
      const args = JSON.parse(toolCall.arguments);

      console.log(`Calling tool: ${toolCall.name}`);

      const result = await callTool(toolCall.name, args);

      toolOutputs.push({
        type: "function_call_output",
        call_id: toolCall.call_id,
        output: JSON.stringify(result),
      });
    }

    response = await openai.responses.create({
      model: "gpt-5.6",
      instructions: skillInstructions,
      tools: toolDefinitions,
      previous_response_id: response.id,
      input: toolOutputs,
    });
  }
}

module.exports = {
  runSkill,
};
