// Verifies redacted, concise runtime logging without changing tool payloads.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createLogger, errorSummary } = require('../runtime/core/logger');
const { withToolLogging } = require('../runtime/core/tool-logging');
const { partialResultInfo } = require('../runtime/core/result-status');

test('logs use readable colors and redact secrets and control characters', () => {
  const previous = process.env.LOG_TEST_SECRET;
  process.env.LOG_TEST_SECRET = 'private-test-secret';
  try {
    const lines = [];
    const log = createLogger({ color: true, write: line => lines.push(line) });
    log.success('Ready');
    log.error('Failure', { reason: 'private-test-secret\nBearer hidden-token https://private.test/document' });
    assert.match(lines[0], /\x1b\[32m.*OK\s+Ready/);
    assert.match(lines[1], /\x1b\[31m.*ERROR/);
    assert.doesNotMatch(lines.join(''), /private-test-secret|hidden-token|private\.test/);
    assert.equal(lines[1].split('\n').length, 2);
    const plain = [];
    createLogger({ color: false, write: line => plain.push(line) }).info('Ready');
    assert.doesNotMatch(plain[0], /\x1b/);
    assert.doesNotMatch(errorSummary(new Error('Auth failed: {"secret":"private"}')), /private/);
  } finally {
    if (previous === undefined) delete process.env.LOG_TEST_SECRET;
    else process.env.LOG_TEST_SECRET = previous;
  }
});

test('failed or truncated document resources produce yellow warnings and leave result contents unchanged', async () => {
  const scenarios = [
    { images: [{ success: false, error_code: 'WHITEBOARD_IMAGE_READ_FAILED' }] },
    { attachments: [{ success: true, text_truncated: true }] },
    { embedded_sheets: [{ success: false }] },
    { whiteboards: [{ success: true, images_truncated: true }] },
    { documents: [{ content_truncated: true }] },
    { results_truncated: true },
  ];
  for (const resource of scenarios) {
    const lines = [];
    const log = createLogger({ color: true, write: line => lines.push(line) });
    const result = { structuredContent: { success: true, ...resource } };
    assert.equal(await withToolLogging('read_lark_document', async () => result, log)(), result);
    assert.match(lines.at(-1), /\x1b\[33m.*WARN.*partial results/);
    assert.doesNotMatch(lines.at(-1), /Tool completed \|/);
  }
  assert.deepEqual(partialResultInfo({ images: [{ success: true }], metadata: { success: false } }),
    { resource_issues: 0, errors: 0, truncated: false });
});

test('tool logging preserves results and errors without logging inputs or successful contents', async () => {
  const events = [];
  const log = Object.fromEntries(['info', 'success', 'warn', 'error'].map(level =>
    [level, (message, fields) => events.push({ level, message, fields })]));
  const result = { content: [{ type: 'text', text: 'PRIVATE DOCUMENT BODY' }] };
  assert.equal(await withToolLogging('read', async () => result, log)({ token: 'PRIVATE INPUT' }), result);
  assert.deepEqual(events.map(event => event.level), ['info', 'success']);
  assert.equal(events[0].fields.call, events[1].fields.call);
  assert.doesNotMatch(JSON.stringify(events), /PRIVATE/);
  events.length = 0;
  const failed = { isError: true, content: [{ type: 'text', text: 'Permission denied' }] };
  assert.equal(await withToolLogging('read', async () => failed, log)(), failed);
  assert.equal(events[1].level, 'error');
  assert.equal(events[1].fields.reason, 'Permission denied');
  events.length = 0;
  await withToolLogging('read', async () => ({ structuredContent: { truncated: true, errors: [{}] } }), log)();
  assert.equal(events[1].level, 'warn');
  const error = new Error('Connection timed out');
  await assert.rejects(withToolLogging('read', async () => { throw error; }, log), value => value === error);
  assert.equal(events.at(-1).level, 'error');
});
