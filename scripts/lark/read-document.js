require("dotenv").config();

const documentId = "RMa7ddXq6om0ntxq58tleUPtg1c";

async function getTenantAccessToken() {
  const response = await fetch(
    "https://open.larksuite.com/open-apis/auth/v3/tenant_access_token/internal",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json; charset=utf-8",
      },
      body: JSON.stringify({
        app_id: process.env.LARK_APP_ID?.trim(),
        app_secret: process.env.LARK_APP_SECRET?.trim(),
      }),
    }
  );

  const data = await response.json();

  if (!response.ok || data.code !== 0) {
    throw new Error(`Auth failed: ${JSON.stringify(data)}`);
  }

  return data.tenant_access_token;
}

async function readDocument(documentId) {
  const accessToken = await getTenantAccessToken();

  const response = await fetch(
    `https://open.larksuite.com/open-apis/docx/v1/documents/${documentId}/raw_content`,
    {
      method: "GET",
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    }
  );

  const data = await response.json();

  console.log("HTTP status:", response.status);

  if (!response.ok || data.code !== 0) {
    console.error("Read document failed:");
    console.error(JSON.stringify(data, null, 2));
    return;
  }

  console.log("\n===== LARK DOCUMENT =====\n");
  console.log(data.data?.content);
  console.log("\n=========================\n");
}

readDocument(documentId).catch(console.error);
