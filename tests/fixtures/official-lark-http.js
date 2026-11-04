// Loaded only by tests, before the real official CLI. Intercept every Axios request.
process.env.LEMMA_OFFICIAL_HTTP_FIXTURE = '1';
require('./lark-fetch');
require('axios').defaults.adapter = async config => {
  const url = new URL(config.url, config.baseURL || 'https://open.larksuite.com');
  for (const [key, value] of Object.entries(config.params || {})) {
    if (value !== undefined && value !== null) url.searchParams.set(key, String(value));
  }
  if (url.origin !== 'https://open.larksuite.com') throw Error('Unexpected official MCP outbound host');
  // The SDK authenticates via app_access_token; provide the fixture token without network.
  const body = url.pathname.includes('/auth/')
    ? { code: 0, tenant_access_token: 'fixture-token', app_access_token: 'fixture-token', expire: 7200 }
    : await (await global.fetch(url.href, { method: config.method?.toUpperCase() })).json();
  return { data: body, status: 200, statusText: 'OK', headers: {}, config };
};
