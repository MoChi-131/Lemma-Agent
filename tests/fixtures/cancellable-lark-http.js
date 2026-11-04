const axios = require('axios');
const fs = require('node:fs');
// Test-only report path is passed by a test preload, never inherited in production.
const report = process.env.LEMMA_CANCELLATION_REPORT;
axios.defaults.adapter = async config => {
  if (config.url.includes('/auth/')) return { data: { code: 0, tenant_access_token: 'fixture-token',
    app_access_token: 'fixture-token', expire: 7200 }, status: 200, headers: {}, config };
  if (config.url.includes('/slow/')) {
    const state = { signal_present: Boolean(config.signal), timeout: config.timeout,
      aborted: false, completed: false };
    fs.writeFileSync(report, JSON.stringify(state));
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => { state.completed = true; fs.writeFileSync(report, JSON.stringify(state)); resolve(); }, 300);
      const abort = () => {
        clearTimeout(timer);
        state.aborted = true;
        fs.writeFileSync(report, JSON.stringify(state));
        reject(new axios.CanceledError());
      };
      if (config.signal?.aborted) abort();
      else config.signal?.addEventListener('abort', abort, { once: true });
    });
  }
  return { data: { code: 0, data: { content: 'fixture' } }, status: 200, headers: {}, config };
};
