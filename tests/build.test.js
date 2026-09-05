import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { Script } from 'node:vm';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../', import.meta.url));
const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('single-file build has an exact matching CSP hash (replacement-token regression)', async () => {
  const html = await read('dist/index.html'); const script = html.match(/<script>([\s\S]*?)<\/script>/)[1];
  const hash = createHash('sha256').update(script).digest('base64');
  assert.ok(html.includes(`script-src 'sha256-${hash}'`)); assert.ok(!html.includes('INLINE_JS'));
  assert.doesNotThrow(() => new Script(script));
});
test('offline build has no remote scripts, styles, fonts or iframes', async () => {
  const html = await read('dist/index.html');
  assert.ok(!/<script[^>]+src=/i.test(html)); assert.ok(!/<link[^>]+rel=["']stylesheet/i.test(html));
  assert.ok(!/@import\s|@font-face|<iframe|<form/i.test(html)); assert.ok(!/\beval\s*\(|new Function\s*\(/.test(html));
  assert.ok(html.includes("connect-src 'none'")); assert.ok(html.includes("form-action 'none'"));
});
test('source uses text-only DOM rendering, not HTML injection or browser storage', async () => {
  const app = await read('web/app.js');
  assert.ok(!/innerHTML|outerHTML|insertAdjacentHTML|localStorage|sessionStorage|indexedDB|fetch\s*\(|XMLHttpRequest|sendBeacon/.test(app));
});
test('build is deterministic', async () => {
  const before = await read('dist/index.html');
  const r = spawnSync(process.execPath, ['scripts/build.mjs'], { cwd: root, encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr); assert.equal(await read('dist/index.html'), before);
});
test('package is dependency-free at runtime and lockfile matches the version', async () => {
  const pkg = JSON.parse(await read('package.json')); const lock = JSON.parse(await read('package-lock.json'));
  assert.deepEqual(pkg.dependencies ?? {}, {}); assert.equal(pkg.version, lock.version); assert.equal(pkg.version, lock.packages[''].version);
});
test('source and build do not claim a registry package or guaranteed anonymity', async () => {
  const html = await read('dist/index.html'); assert.ok(html.includes('not mean anonymous')); assert.ok(html.includes('not a compliance guarantee'));
});
