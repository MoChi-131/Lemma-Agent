require("dotenv").config();

const { getTenantAccessToken } = require("../../integrations/lark/core/auth");

const documentId = "RMa7ddXq6om0ntxq58tleUPtg1c";

async function appendText(documentId, text) {
  const token = await getTenantAccessToken();

  // Docx 的 root block id 就是 document id
  const response = await fetch(
    `https://open.larksuite.com/open-apis/docx/v1/documents/${documentId}/blocks/${documentId}/children`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json; charset=utf-8",
      },
      body: JSON.stringify({
        children: [
          {
            block_type: 2,
            text: {
              elements: [
                {
                  text_run: {
                    content: text,
                  },
                },
              ],
              style: {},
            },
          },
        ],
      }),
    }
  );

  const data = await response.json();

  console.log("HTTP status:", response.status);
  console.log(JSON.stringify(data, null, 2));
}

appendText(documentId, "Lemma-Agent write test").catch(console.error);

