const { randomUUID } = require('node:crypto');

// Always use stderr: stdout is the MCP protocol channel in stdio mode.
/** Remove control characters, URLs, credentials, and environment-held secrets from log fields. */
function clean(value) {
  let text = String(value ?? '').replace(/[\x00-\x1f\x7f-\x9f]/g, ' ');
  for (const [key, secret] of Object.entries(process.env)) {
    if (/secret|token|password|api.?key|credential/i.test(key) && secret?.length >= 4) {
      text = text.split(secret).join('[REDACTED]');
    }
  }
  return text.replace(/https?:\/\/\S+/gi, '[URL]')
    .replace(/Bearer\s+\S+/gi, 'Bearer [REDACTED]')
    .replace(/((?:app_secret|access_token|refresh_token|password|api_key)\s*[=:]\s*)\S+/gi, '$1[REDACTED]')
    .replace(/\s+/g, ' ').trim().slice(0, 180);
}

/** Convert an unknown failure into a compact, redacted operational message. */
function errorSummary(error) {
  const message = typeof error === 'string' ? error : error?.message;
  // Upstream JSON can contain credentials, headers or document bodies.
  if (!message || /[{}]/.test(message)) return 'Operation failed; check credentials, permissions and upstream availability';
  return clean(message);
}

/**
 * Create concise color-capable stderr logging without exposing request content or credentials.
 * @param {{write?: Function, color?: boolean}} options test output writer and color override.
 * @returns {{info: Function, success: Function, warn: Function, error: Function}} level-specific log functions.
 */
function createLogger({ write = line => process.stderr.write(line), color } = {}) {
  function log(level, message, fields = {}) {
    const enabled = color ?? (!('NO_COLOR' in process.env) &&
      (process.env.LOG_COLOR === 'always' || (process.env.LOG_COLOR !== 'never' && Boolean(process.stderr.isTTY))));
    const colors = { INFO: 36, OK: 32, WARN: 33, ERROR: 31 };
    const details = Object.entries(fields).filter(([, value]) => value !== undefined)
      .map(([key, value]) => `${clean(key)}=${clean(value)}`).join(' ');
    const line = `${new Date().toISOString()} ${level.padEnd(5)} ${clean(message)}${details ? ` | ${details}` : ''}`;
    write(`${enabled ? `\x1b[${colors[level]}m${line}\x1b[0m` : line}\n`);
  }
  return {
    info: (message, fields) => log('INFO', message, fields),
    success: (message, fields) => log('OK', message, fields),
    warn: (message, fields) => log('WARN', message, fields),
    error: (message, fields) => log('ERROR', message, fields),
  };
}

const logger = createLogger();
const activityId = () => randomUUID().slice(0, 8);
module.exports = { logger, createLogger, errorSummary, activityId };
