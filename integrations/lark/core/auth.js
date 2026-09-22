require("dotenv").config({ quiet: true });

async function getTenantAccessToken({ signal } = {}) {
  const response = await fetch(
    "https://open.larksuite.com/open-apis/auth/v3/tenant_access_token/internal",
    {
      method: "POST",
      signal,
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
    throw new Error(`Lark auth failed: ${JSON.stringify(data)}`);
  }

  return data.tenant_access_token;
}

module.exports = {
  getTenantAccessToken,
};
