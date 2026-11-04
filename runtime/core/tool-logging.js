const { logger, errorSummary, activityId } = require('./logger');
const { partialResultInfo } = require('./result-status');

function withToolLogging(name, handler, log = logger) {
  return async function (...args) {
    const started = Date.now();
    const fields = { tool: name, call: activityId() };
    log.info('Tool started', fields);
    try {
      const result = await handler.apply(this, args);
      const duration = { ...fields, ms: Date.now() - started };
      const partial = partialResultInfo(result?.structuredContent);
      if (result?.isError || result?.structuredContent?.success === false) {
        const message = result.content?.find(item => item.type === 'text')?.text;
        log.error('Tool failed', { ...duration, reason: errorSummary(message) });
      } else if (partial.truncated || partial.errors || partial.resource_issues) {
        log.warn('Tool completed with partial results', {
          ...duration, ...partial,
        });
      } else {
        log.success('Tool completed', duration);
      }
      return result;
    } catch (error) {
      log.error('Tool failed', { ...fields, ms: Date.now() - started, reason: errorSummary(error) });
      throw error;
    }
  };
}

function instrumentTools(server) {
  const register = server.registerTool.bind(server);
  server.registerTool = (name, config, handler) => register(name, config, withToolLogging(name, handler));
}

module.exports = { instrumentTools, withToolLogging };
