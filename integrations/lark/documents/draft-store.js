const fs = require('node:fs/promises');
const path = require('node:path');
const { randomUUID } = require('node:crypto');

const DEFAULT_DIRECTORY = path.resolve(__dirname, '../../..', '.lemma-drafts');

/** Private local receipts survive server restarts; no additional Lark table is needed. */
function createDraftStore(directory = DEFAULT_DIRECTORY) {
  function filename(id) {
    if (!/^[a-f0-9]{64}$/.test(id)) throw new Error('Invalid internal draft reference.');
    return path.join(directory, `${id}.json`);
  }
  async function initialize() {
    await fs.mkdir(directory, { recursive: true, mode: 0o700 });
  }
  return {
    async read(id) {
      try { return JSON.parse(await fs.readFile(filename(id), 'utf8')); }
      catch (error) { if (error.code === 'ENOENT') return null; throw error; }
    },
    async save(draft) {
      await initialize();
      const target = filename(draft.draft_id);
      const temporary = `${target}.${randomUUID()}.tmp`;
      const file = await fs.open(temporary, 'wx', 0o600);
      try { await file.writeFile(JSON.stringify(draft), 'utf8'); await file.sync(); }
      finally { await file.close(); }
      await fs.rename(temporary, target);
    },
    async withLock(operation) {
      await initialize();
      const lockPath = path.join(directory, 'publication.lock');
      let lock;
      try { lock = await fs.open(lockPath, 'wx', 0o600); }
      catch (error) {
        if (error.code === 'EEXIST') throw new Error('A publication is running or needs inspection after a server interruption. Do not retry creation.');
        throw error;
      }
      try { return await operation(); }
      finally { await lock.close(); await fs.unlink(lockPath); }
    },
  };
}

module.exports = { createDraftStore };
