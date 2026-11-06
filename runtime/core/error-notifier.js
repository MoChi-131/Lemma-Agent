// Sends small, redacted operational alerts only when an HTTPS webhook is configured.
const { errorSummary } = require('./logger');

const COOLDOWN_MS = 60_000;
const sentAt = new Map();

/**
 * Send a small, redacted incident alert when an HTTPS webhook is configured.
 * Repeated messages are rate-limited in memory and alert delivery never affects the service result.
 * @param {{source: string, error: unknown, fetchImpl?: Function, env?: object}} options alert context and test overrides.
 * @returns {Promise<boolean>} true only when the webhook accepted the alert.
 */
async function notifyError({ source, error, fetchImpl = fetch, env = process.env } = {}) {
  const url = env.ERROR_WEBHOOK_URL;
  if (!url || !/^https:\/\//i.test(url)) return false;
  const message = errorSummary(error);
  const key = `${source}:${message}`;
  const now = Date.now();
  if (now - (sentAt.get(key) || 0) < COOLDOWN_MS) return false;
  sentAt.set(key, now);
  try {
    const response = await fetchImpl(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ service: 'supermama-lark-mcp', level: 'error', source, message, occurred_at: new Date(now).toISOString() }),
      signal: AbortSignal.timeout(5000),
    });
    return response.ok;
  } catch {
    // Alert delivery must never block or crash the MCP service.
    return false;
  }
}

module.exports = { notifyError };
