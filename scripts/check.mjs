import { readdir, readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
let checked = 0;
for (const dir of ['src', 'bin', 'scripts', 'examples', 'tests', 'web']) {
  for (const file of await readdir(resolve(root, dir), { recursive: true })) {
    if (!/\.(mjs|js)$/.test(file)) continue;
    const result = spawnSync(process.execPath, ['--check', resolve(root, dir, file)], { encoding: 'utf8' });
    if (result.status !== 0) { console.error(result.stderr); process.exit(1); }
    checked++;
  }
}
const pkg = JSON.parse(await readFile(resolve(root, 'package.json'), 'utf8'));
if (pkg.dependencies && Object.keys(pkg.dependencies).length) throw new Error('Runtime dependency budget exceeded.');
console.log(`Syntax checked ${checked} JavaScript files. Runtime dependencies: 0.`);
