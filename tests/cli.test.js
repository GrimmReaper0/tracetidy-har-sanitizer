import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, readFile, writeFile, readdir, stat, symlink, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createDemoHar } from '../examples/demo.mjs';
const bin = fileURLToPath(new URL('../bin/tracetidy.js', import.meta.url));
const fixture = JSON.stringify(createDemoHar());
const run = (args, input = fixture, cwd) => spawnSync(process.execPath, [bin, ...args], { input, encoding: 'utf8', cwd, timeout: 15000, maxBuffer: 30 * 1024 * 1024 });
async function temp(t) { const dir = await mkdtemp(join(tmpdir(), 'tracetidy-test-')); t.after(() => rm(dir, { recursive: true, force: true })); return dir; }

test('CLI --help', () => { const r = run(['--help']); assert.equal(r.status, 0); assert.match(r.stdout, /Usage:/); });
test('CLI --version', () => { const r = run(['--version']); assert.equal(r.status, 0); assert.equal(r.stdout.trim(), '1.0.0'); });
test('stdin to stdout is pure JSON; summaries go to stderr', () => {
  const r = run(['-']); assert.equal(r.status, 0, r.stderr); assert.equal(JSON.parse(r.stdout).log.entries.length, 12);
  assert.match(r.stderr, /12 requests/); assert.ok(!r.stdout.includes('DEMO_ONLY')); assert.ok(!r.stderr.includes('DEMO_ONLY'));
});
test('implicit stdin works', () => { const r = run([]); assert.equal(r.status, 0); assert.equal(JSON.parse(r.stdout).log.version, '1.2'); });
test('quiet and compact output', () => { const r = run(['-', '--quiet', '--compact']); assert.equal(r.status, 0); assert.equal(r.stderr, ''); assert.equal(r.stdout.trim().split('\n').length, 1); });
test('writes HAR, audit and brief together with restrictive file mode where supported', async (t) => {
  const dir = await temp(t); const r = run(['-', '-o', 'clean.har', '--report', 'audit.json', '--markdown', 'brief.md'], fixture, dir);
  assert.equal(r.status, 0, r.stderr); assert.equal(r.stdout, '');
  assert.equal(JSON.parse(await readFile(join(dir, 'clean.har'), 'utf8')).log.entries.length, 12);
  assert.equal(JSON.parse(await readFile(join(dir, 'audit.json'), 'utf8')).removed.headers, 60);
  assert.match(await readFile(join(dir, 'brief.md'), 'utf8'), /Network debugging brief/);
  assert.deepEqual((await readdir(dir)).sort(), ['audit.json', 'brief.md', 'clean.har']);
  if (process.platform !== 'win32') assert.equal((await stat(join(dir, 'clean.har'))).mode & 0o777, 0o600);
});
test('reads input from a regular file', async (t) => { const dir = await temp(t); await writeFile(join(dir, 'in.har'), fixture); const r = run(['in.har'], '', dir); assert.equal(r.status, 0, r.stderr); assert.equal(JSON.parse(r.stdout).log.entries.length, 12); });
test('handles paths containing spaces', async (t) => { const dir = await temp(t); await writeFile(join(dir, 'my input.har'), fixture); const r = run(['my input.har', '-o', 'my output.har'], '', dir); assert.equal(r.status, 0, r.stderr); assert.ok((await readFile(join(dir, 'my output.har'), 'utf8')).includes('TraceTidy')); });
test('refuses to overwrite input', async (t) => { const dir = await temp(t); await writeFile(join(dir, 'in.har'), fixture); const r = run(['in.har', '-o', 'in.har'], '', dir); assert.equal(r.status, 2); assert.equal(await readFile(join(dir, 'in.har'), 'utf8'), fixture); });
test('refuses existing destinations, without writing any other requested outputs', async (t) => {
  const dir = await temp(t); await writeFile(join(dir, 'audit.json'), 'KEEP');
  const r = run(['-', '-o', 'clean.har', '--report', 'audit.json'], fixture, dir);
  assert.equal(r.status, 2); assert.equal(r.stdout, ''); assert.equal(await readFile(join(dir, 'audit.json'), 'utf8'), 'KEEP'); assert.deepEqual(await readdir(dir), ['audit.json']);
});
test('refuses symlink output without changing the target', { skip: process.platform === 'win32' && 'Creating symlinks may require privileges on Windows' }, async (t) => {
  const dir = await temp(t); await writeFile(join(dir, 'original'), 'KEEP'); await symlink(join(dir, 'original'), join(dir, 'clean.har'));
  const r = run(['-', '-o', 'clean.har'], fixture, dir); assert.equal(r.status, 2); assert.equal(await readFile(join(dir, 'original'), 'utf8'), 'KEEP');
});
test('refuses duplicated normalized output paths', async (t) => { const dir = await temp(t); const r = run(['-', '-o', 'clean.har', '--report', './clean.har'], fixture, dir); assert.equal(r.status, 2); assert.deepEqual(await readdir(dir), []); });
test('cleans staging files when another output directory is missing', async (t) => {
  const dir = await temp(t); const r = run(['-', '-o', 'clean.har', '--report', 'missing/audit.json'], fixture, dir);
  assert.equal(r.status, 1); assert.equal(r.stdout, ''); assert.deepEqual(await readdir(dir), []);
});
test('reports missing input without a raw filename', async (t) => { const dir = await temp(t); const r = run(['PRIVATE_CANARY.har'], '', dir); assert.equal(r.status, 1); assert.equal(r.stdout, ''); assert.ok(!r.stderr.includes('PRIVATE_CANARY')); });
test('rejects directory input', async (t) => { const dir = await temp(t); const r = run([dir]); assert.notEqual(r.status, 0); assert.equal(r.stdout, ''); });
test('rejects invalid UTF-8', () => { const r = run(['-'], Buffer.from([0xff, 0xfe, 0xff])); assert.equal(r.status, 2); assert.match(r.stderr, /UTF-8/); });
test('rejects oversized stdin before creating output', () => { const r = run(['-'], ' '.repeat(25 * 1024 * 1024 + 1)); assert.equal(r.status, 2); assert.equal(r.stdout, ''); assert.match(r.stderr, /limit/); });
test('rejects oversized regular input before parsing', async (t) => { const dir = await temp(t); await writeFile(join(dir, 'large.har'), ' '.repeat(25 * 1024 * 1024 + 1)); const r = run(['large.har'], '', dir); assert.equal(r.status, 2); assert.equal(r.stdout, ''); });
test('rejects invalid JSON without exposing contents', () => { const r = run(['-'], '{"PRIVATE_CANARY":"'); assert.equal(r.status, 2); assert.ok(!r.stderr.includes('PRIVATE_CANARY')); assert.equal(r.stdout, ''); });
for (const args of [['--wat'], ['-', '--mode', 'unsafe'], ['a.har', 'b.har'], ['-', '-o', ''], ['-', '--report', '-'], ['-', '--output']]) {
  test(`rejects invalid CLI arguments ${JSON.stringify(args)}`, () => { const r = run(args); assert.equal(r.status, 2); assert.equal(r.stdout, ''); });
}
test('diagnostic CLI emits an explicit URL warning', () => { const r = run(['-', '--mode', 'diagnostic']); assert.equal(r.status, 0); assert.ok(r.stdout.includes('app.example.test/dashboard')); assert.match(r.stderr, /Diagnostic mode/); assert.ok(!r.stdout.includes('DEMO_ONLY')); });
test('report-only invocation still writes clean HAR to stdout', async (t) => { const dir = await temp(t); const r = run(['-', '--report', 'audit.json'], fixture, dir); assert.equal(r.status, 0); assert.equal(JSON.parse(r.stdout).log.entries.length, 12); assert.ok(await stat(join(dir, 'audit.json'))); });
