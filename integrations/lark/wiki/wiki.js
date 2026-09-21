const { getTenantAccessToken } = require("../core/auth");

function extractWikiToken(url) {
  const match = url.match(/\/wiki\/([^/?#]+)/);

  if (!match) {
    throw new Error("Invalid Lark Wiki URL");
  }

  return match[1];
}

async function getWikiNode(wikiToken, { signal } = {}) {
  const accessToken = await getTenantAccessToken({ signal });

  const response = await fetch(
    `https://open.larksuite.com/open-apis/wiki/v2/spaces/get_node?token=${encodeURIComponent(
      wikiToken
    )}`,
    {
      signal,
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    }
  );

  const data = await response.json();

  if (!response.ok || data.code !== 0) {
    throw new Error(`Get Wiki node failed: ${JSON.stringify(data)}`);
  }

  return data.data.node;
}

async function listWikiNodes({
  spaceId,
  parentNodeToken,
  pageSize = 50,
  pageToken,
}) {
  const accessToken = await getTenantAccessToken();

  const params = new URLSearchParams();

  if (parentNodeToken) {
    params.set("parent_node_token", parentNodeToken);
  }

  if (pageSize) {
    params.set("page_size", String(pageSize));
  }

  if (pageToken) {
    params.set("page_token", pageToken);
  }

  const response = await fetch(
    `https://open.larksuite.com/open-apis/wiki/v2/spaces/${spaceId}/nodes?${params.toString()}`,
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    }
  );

  const data = await response.json();

  if (!response.ok || data.code !== 0) {
    throw new Error(
      `List Wiki nodes failed: ${JSON.stringify(data)}`
    );
  }

  return {
    items: data.data?.items || [],
    hasMore: data.data?.has_more || false,
    pageToken: data.data?.page_token || null,
  };
}
async function listWikiChildren({
  spaceId,
  parentNodeToken,
  pageSize = 50,
  pageToken,
  signal,
}) {
  const accessToken = await getTenantAccessToken({ signal });

  const params = new URLSearchParams({
    parent_node_token: parentNodeToken,
    page_size: String(pageSize),
  });

  if (pageToken) {
    params.set("page_token", pageToken);
  }

  const response = await fetch(
    `https://open.larksuite.com/open-apis/wiki/v2/spaces/${spaceId}/nodes?${params.toString()}`,
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
      `List Wiki children failed: ${JSON.stringify(data)}`
    );
  }

  return {
    items: data.data?.items || [],
    hasMore: data.data?.has_more || false,
    pageToken: data.data?.page_token || null,
  };
}

module.exports = {
  extractWikiToken,
  getWikiNode,
  listWikiNodes,
  listWikiChildren,
};
