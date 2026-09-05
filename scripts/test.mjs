// Expand test files in JavaScript so Windows and Unix use the same file list.
import { readdir } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const files = (await readdir(resolve(root, 'tests'))).filter((file) => file.endsWith('.test.js')).sort().map((file) => `tests/${file}`);
const args = process.argv.includes('--coverage') ? ['--experimental-test-coverage', '--test', ...files] : ['--test', ...files];
const result = spawnSync(process.execPath, args, { cwd: root, stdio: 'inherit' });
if (result.error) console.error('Could not start the Node test runner.');
process.exitCode = result.status ?? 1;
