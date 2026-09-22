require("dotenv").config();

const OpenAI = require("openai");
const { ProxyAgent, setGlobalDispatcher } = require("undici");

const proxyAgent = new ProxyAgent(
  "http://127.0.0.1:7897"
);

setGlobalDispatcher(proxyAgent);

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

async function main() {
  const response = await client.responses.create({
    model: "gpt-5.6",
    input: "Say hello",
  });

  console.log(response.output_text);
}

main().catch(console.error);