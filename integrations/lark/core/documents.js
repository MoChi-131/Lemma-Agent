const { getTenantAccessToken } = require("./auth");

async function readDocument(documentId, { signal } = {}) {
  const accessToken = await getTenantAccessToken({ signal });

  const response = await fetch(
    `https://open.larksuite.com/open-apis/docx/v1/documents/${documentId}/raw_content`,
    {
      signal,
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    }
  );

  const data = await response.json();

  if (!response.ok || data.code !== 0) {
    throw new Error(
      `Read document failed: ${JSON.stringify(data)}`
    );
  }

  if (typeof data.data?.content !== "string") {
    throw new Error("Invalid Lark document content response.");
  }
  return data.data.content;
}

async function appendTextToDocument(documentId, text) {
  const accessToken = await getTenantAccessToken();

  const response = await fetch(
    `https://open.larksuite.com/open-apis/docx/v1/documents/${documentId}/blocks/${documentId}/children`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
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

  if (!response.ok || data.code !== 0) {
    throw new Error(
      `Write document failed: ${JSON.stringify(data)}`
    );
  }

  return data.data;
}

module.exports = {
  readDocument,
  appendTextToDocument,
};
