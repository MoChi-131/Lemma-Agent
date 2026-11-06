const { AsyncLocalStorage } = require('node:async_hooks');

/**
 * Add cancellation/deadline propagation to the pinned official MCP's HTTP clients.
 * The upstream handlers ignore MCP's `extra.signal`, so this stores it in async
 * request context and attaches it to Axios requests at the socket layer.
 * @param {{McpServer: Function, httpInstances: object[], timeoutMs?: number}} options official internals to patch.
 */
function installHttpLifecycle({ McpServer, httpInstances, timeoutMs = 30000 }) {
  const context = new AsyncLocalStorage();
  const original = McpServer.prototype.tool;
  McpServer.prototype.tool = function (name, ...args) {
    const handler = args.at(-1);
    if (typeof handler === 'function') {
      args[args.length - 1] = (...callbackArgs) => context.run(
        { signal: callbackArgs.at(-1)?.signal }, () => handler(...callbackArgs));
    }
    return original.call(this, name, ...args);
  };
  for (const http of httpInstances) {
    http.defaults.timeout = timeoutMs;
    http.interceptors.request.use(config => {
      const signals = [AbortSignal.timeout(timeoutMs), context.getStore()?.signal, config.signal].filter(Boolean);
      config.signal = AbortSignal.any(signals);
      config.timeout = config.timeout > 0 ? Math.min(config.timeout, timeoutMs) : timeoutMs;
      return config;
    }, undefined, { synchronous: true });
  }
}

module.exports = { installHttpLifecycle };
