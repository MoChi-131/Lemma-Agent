const { AsyncLocalStorage } = require('node:async_hooks');

// The pinned official handlers ignore MCP's extra.signal. Keep the signal in
// async request context so their SDK/Axios calls can still abort at the socket.
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
