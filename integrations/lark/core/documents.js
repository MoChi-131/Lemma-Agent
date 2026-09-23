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

module.exports = {
  readDocument,
};
