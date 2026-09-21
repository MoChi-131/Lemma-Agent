require("dotenv").config();

const wikiToken = "UvMrwd23Ti4BW3k6oHslXcABgec";

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

async function getWikiNode(token) {
  const accessToken = await getTenantAccessToken();

  const response = await fetch(
    `https://open.larksuite.com/open-apis/wiki/v2/spaces/get_node?token=${encodeURIComponent(token)}`,
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    }
  );

  const data = await response.json();

  console.log("HTTP status:", response.status);
  console.log(JSON.stringify(data, null, 2));
}

getWikiNode(wikiToken).catch((error) => {
  console.error(error);
});
