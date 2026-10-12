const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const { readValidatedMetadata } = require('../../integrations/lark/knowledge/validated-metadata');
const { readKnowledgeRegistry } = require('../../integrations/lark/knowledge/knowledge-registry');

const validatedUrl = 'https://tenant.larksuite.com/base/BASE?table=tblValidated';
const journalUrl = 'https://tenant.larksuite.com/base/BASE?table=tblJournal';
const fields = { Title: '已驗證版本' };
const rows = [{ record_id: 'backup', fields }];
const hash = createHash('sha256').update('[{"fields":{"Title":"已驗證版本"},"record_id":"backup"}]').digest('hex');
const publication = (changes = {}) => ({ state: 'published', recovery_url: validatedUrl,
  published_at: '2026-10-08T10:00:00Z', published_records: rows, published_hash: hash, ...changes });
const journalRow = receipt => ({ record_id: 'journal', fields: { 'Receipt JSON': JSON.stringify(receipt) } });

test('uses the verified mirror and keeps the last published version during refresh or manual edits', async () => {
  for (const current of [rows, [{ record_id: 'backup', fields: { Title: '半更新版本' } }]]) {
    const result = await readValidatedMetadata({ validatedUrl, journalUrl }, { readTable: async url =>
      url === journalUrl ? [journalRow(publication()), journalRow({ state: 'publication_started', recovery_url: validatedUrl })] : current });
    assert.deepEqual(result, rows);
  }
});

test('selects the most recent complete version and rejects missing, corrupt or wrong-table publications', async () => {
  const old = journalRow(publication({ published_at: '2026-10-07T10:00:00Z' }));
  assert.deepEqual(await readValidatedMetadata({ validatedUrl, journalUrl }, { readTable: async url =>
    url === journalUrl ? [old, journalRow(publication())] : rows }), rows);
  for (const entries of [[], [journalRow(publication({ published_hash: 'wrong' }))],
    [journalRow(publication({ recovery_url: 'https://tenant.larksuite.com/base/BASE?table=tblOther' }))]]) {
    await assert.rejects(readValidatedMetadata({ validatedUrl, journalUrl }, { readTable: async () => entries }), /No verified/);
  }
});

test('normal knowledge retrieval requires the validated table and rejects the working Registry', async () => {
  await assert.rejects(readKnowledgeRegistry({}, { env: {}, getToken: async () => assert.fail('Must not authenticate') }), /Configure/);
  await assert.rejects(readKnowledgeRegistry({ registryUrl: 'working-table' }, { env: {
    LARK_VALIDATED_METADATA_URL: validatedUrl, LARK_VALIDATION_JOURNAL_URL: journalUrl,
  } }), /configured Validated Metadata/);
});
