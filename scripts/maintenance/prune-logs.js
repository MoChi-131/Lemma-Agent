// Deletes expired regular files from Lemma's local logs directory only.
const fs = require('node:fs/promises');
const path = require('node:path');

const projectRoot = path.resolve(__dirname, '../..');
const logRoot = path.resolve(process.env.LOG_DIRECTORY || path.join(projectRoot, 'logs'));
const days = Number(process.env.LOG_RETENTION_DAYS || 14);

/**
 * Reject unsafe retention configuration before any filesystem mutation.
 * The configured directory must remain below the project root, not merely share a prefix.
 */
function validateConfig() {
  if (!Number.isInteger(days) || days < 1 || days > 3650) throw new Error('LOG_RETENTION_DAYS must be an integer from 1 to 3650.');
  if (!logRoot.startsWith(`${projectRoot}${path.sep}`)) throw new Error('LOG_DIRECTORY must stay inside the project directory.');
}

/**
 * Remove regular log files older than the configured retention period.
 * @returns {Promise<number>} number of successfully removed files.
 */
async function pruneLogs() {
  validateConfig();
  const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
  let removed = 0;
  /** Walk only child directories of the validated log root; symlinks are never followed. */
  async function visit(directory) {
    const entries = await fs.readdir(directory, { withFileTypes: true }).catch(error => error.code === 'ENOENT' ? [] : Promise.reject(error));
    for (const entry of entries) {
      const target = path.join(directory, entry.name);
      if (entry.isDirectory()) await visit(target);
      else if (entry.isFile() && (await fs.stat(target)).mtimeMs < cutoff) {
        await fs.unlink(target);
        removed++;
      }
    }
  }
  await visit(logRoot);
  return removed;
}

pruneLogs().then(removed => console.log(`Pruned ${removed} expired log file(s).`)).catch(error => {
  console.error(`Log pruning failed: ${error.message}`);
  process.exitCode = 1;
});

module.exports = { pruneLogs, validateConfig };
