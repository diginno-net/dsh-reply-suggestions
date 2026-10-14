import { readdir } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const files = (await readdir(new URL('../tests/', import.meta.url)))
  .filter(name => name.endsWith('.test.mjs')).sort()
  .map(name => fileURLToPath(new URL(`../tests/${name}`, import.meta.url)));
if (!files.length) throw new Error('No test files found');
// Expand filenames here: Windows shells and older Node 22 releases differ
// in how they handle the tests/*.test.mjs wildcard.
const result = spawnSync(process.execPath, ['--test', ...process.argv.slice(2), ...files], {
  cwd: root, stdio: 'inherit', shell: false,
});
if (result.error) throw result.error;
if (result.signal) throw new Error(`Test runner terminated by ${result.signal}`);
process.exitCode = result.status ?? 1;
