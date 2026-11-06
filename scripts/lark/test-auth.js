// Manual local credential check. It reports status only and never prints the token value.
require("dotenv").config({ quiet: true });

/**
 * Request a tenant access token from Lark to verify the configured app credentials.
 * This script is diagnostic only; it does not write Lark data or persist the returned token.
 */
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

  console.log("HTTP status:", response.status);

  if (!response.ok || data.code !== 0) {
    console.error("Lark authentication failed:");
    console.error(data);
    process.exit(1);
  }

  console.log("Lark authentication successful.");
  console.log("Token received:", Boolean(data.tenant_access_token));
  console.log("Expires in:", data.expire, "seconds");
}

getTenantAccessToken();
