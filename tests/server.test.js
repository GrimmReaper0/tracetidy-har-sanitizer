import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { createServer } from 'node:net';
import { once } from 'node:events';
import { fileURLToPath } from 'node:url';
const script = fileURLToPath(new URL('../scripts/serve.mjs', import.meta.url));
async function launch(t) {
  const probe = createServer(); probe.listen(0, '127.0.0.1'); await once(probe, 'listening');
  const port = probe.address().port; await new Promise((resolve) => probe.close(resolve));
  const child = spawn(process.execPath, [script], { env: { ...process.env, PORT: String(port) }, stdio: ['ignore', 'pipe', 'pipe'] });
  t.after(() => { child.kill(); });
  await Promise.race([once(child.stdout, 'data'), once(child, 'exit').then(() => { throw new Error('Server exited before listening.'); }), new Promise((_, reject) => { const timer = setTimeout(() => reject(new Error('Server startup timed out')), 5000); timer.unref(); })]);
  return `http://127.0.0.1:${port}`;
}
test('local server returns the offline app and no-cache headers', async (t) => {
  const base = await launch(t); const response = await fetch(base);
  assert.equal(response.status, 200); assert.match(response.headers.get('content-type'), /text\/html/);
  assert.equal(response.headers.get('cache-control'), 'no-store'); assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
  assert.ok((await response.text()).includes('TraceTidy'));
});
test('local server supports HEAD and refuses non-GET/HEAD methods', async (t) => {
  const base = await launch(t); const head = await fetch(base, { method: 'HEAD' }); assert.equal(head.status, 200); assert.equal(await head.text(), '');
  const post = await fetch(base, { method: 'POST', body: 'synthetic' }); assert.equal(post.status, 405); assert.equal(post.headers.get('allow'), 'GET, HEAD');
});
test('local server never exposes arbitrary repository files', async (t) => {
  const base = await launch(t);
  for (const path of ['/package.json', '/src/core.js', '/.git/config', '/%2e%2e/README.md']) assert.equal((await fetch(base + path)).status, 404);
});
test('invalid local-server port fails before listening', () => {
  const result = spawnSync(process.execPath, [script], { env: { ...process.env, PORT: 'invalid' }, encoding: 'utf8' }); assert.notEqual(result.status, 0);
});
