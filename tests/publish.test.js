import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const script = fileURLToPath(new URL('../scripts/publish.mjs', import.meta.url));
const run = (...args) => spawnSync(process.execPath, [script, ...args], { encoding: 'utf8', timeout: 10000 });
test('publishing dry-run works without credentials or writes', () => {
  const r = run('--dry-run'); assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /DRY RUN: no account access or local\/remote writes/);
  assert.match(r.stdout, /GrimmReaper0\/tracetidy-har-sanitizer \(PUBLIC\)/);
});
test('publishing dry-run describes optional Pages setup honestly', () => { const r = run('--dry-run', '--pages'); assert.equal(r.status, 0); assert.match(r.stdout, /Request GitHub Pages setup/); });
test('publishing refuses unsafe owner and repo arguments', () => {
  for (const args of [['--owner', '../oops'], ['--name', '-bad'], ['--name', 'a/b'], ['--unexpected']]) assert.notEqual(run('--dry-run', ...args).status, 0);
});
test('publishing helper provides local authentication instructions', () => { const r = run('--help'); assert.equal(r.status, 0); assert.match(r.stdout, /local gh auth login/); });
