#!/usr/bin/env node
import { parseArgs } from 'node:util';
import { open, lstat, link, unlink } from 'node:fs/promises';
import { resolve, dirname, join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { parseHar, sanitizeHar, toMarkdown, HarError, MAX_INPUT_BYTES, VERSION } from '../src/core.js';

const HELP = `TraceTidy ${VERSION} - offline HAR sanitizer

Usage:
  tracetidy input.har -o cleaned.har
  tracetidy input.har -o cleaned.har --report audit.json --markdown brief.md
  tracetidy input.har --mode diagnostic -o cleaned.har
  cat input.har | tracetidy - > cleaned.har

Options:
  -o, --output PATH     Write cleaned HAR (default: stdout)
      --report PATH     Write a counts-only JSON audit report
      --markdown PATH   Write a debugging brief in Markdown
      --mode MODE       private (default) or diagnostic
      --compact         Compact JSON output
  -q, --quiet           Suppress the stderr summary (not errors)
  -h, --help            Show this help
  -v, --version         Print the version

Private mode aliases hosts, path segments, and query names. Diagnostic
mode retains them and can leak sensitive data. BOTH modes remove all
headers, cookies, bodies, URL credentials/fragments, and unknown metadata.
Review exports before sharing. Timing, sizes, status, and structure remain.

Limits: 25 MiB, 25,000 requests, 5,000 pages. Existing files are never
overwritten. Exit codes: 0 success, 1 I/O error, 2 invalid input/options.
`;

function ioError(message, error) {
  const codes = new Set(['ENOENT', 'EACCES', 'EPERM', 'EEXIST', 'EISDIR', 'ENOSPC', 'ENOTDIR', 'EMFILE', 'EXDEV', 'ENAMETOOLONG']);
  return new Error(`${message}${codes.has(error?.code) ? ` (${error.code})` : ''}.`);
}

async function readInput(path) {
  let handle;
  try {
    let stream;
    if (path === '-') stream = process.stdin;
    else {
      handle = await open(path, 'r');
      const stat = await handle.stat();
      if (!stat.isFile()) throw new HarError('Input must be a regular file or stdin.');
      if (stat.size > MAX_INPUT_BYTES) throw new HarError('The input exceeds the 25 MiB limit.', 'INPUT_TOO_LARGE');
      stream = handle.createReadStream({ autoClose: false });
    }
    let length = 0;
    const chunks = [];
    for await (const chunk of stream) {
      length += chunk.length;
      if (length > MAX_INPUT_BYTES) throw new HarError('The input exceeds the 25 MiB limit.', 'INPUT_TOO_LARGE');
      chunks.push(chunk);
    }
    try { return new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks)); }
    catch { throw new HarError('Input must contain valid UTF-8 JSON.', 'INVALID_ENCODING'); }
  } catch (error) {
    if (error instanceof HarError) throw error;
    throw ioError('Cannot read the input', error);
  } finally {
    if (handle) await handle.close().catch(() => {});
  }
}

/**
 * Stage complete files beside their destinations, then create no-clobber hard
 * links. This prevents partial-file visibility and refuses symlinks/existing
 * destinations. The group is best-effort transactional, not crash-atomic.
 */
async function writeOutputs(outputs) {
  const paths = outputs.map(([path]) => resolve(path));
  if (new Set(paths).size !== paths.length) throw new HarError('Output paths must be distinct.');
  const staged = [];
  const committed = [];
  try {
    for (const path of paths) {
      try {
        await lstat(path);
        throw new HarError('An output file already exists. Choose a new path.', 'OUTPUT_EXISTS');
      } catch (error) {
        if (error.code !== 'ENOENT') throw error;
      }
    }
    for (let i = 0; i < outputs.length; i++) {
      const temp = join(dirname(paths[i]), `.tracetidy-${randomUUID()}.tmp`);
      const handle = await open(temp, 'wx', 0o600);
      staged.push(temp);
      try { await handle.writeFile(outputs[i][1], 'utf8'); await handle.sync(); }
      finally { await handle.close(); }
    }
    for (let i = 0; i < outputs.length; i++) {
      await link(staged[i], paths[i]);
      committed.push({ path: paths[i], temp: staged[i] });
    }
  } catch (error) {
    for (const item of committed) {
      // Remove only our own inode, not a destination replaced by someone else.
      const a = await lstat(item.path).catch(() => null);
      const b = await lstat(item.temp).catch(() => null);
      if (a && b && a.ino === b.ino && a.dev === b.dev) await unlink(item.path).catch(() => {});
    }
    if (error instanceof HarError) throw error;
    throw ioError('Cannot write outputs; use a writable directory on a filesystem supporting hard links', error);
  } finally {
    for (const path of staged) await unlink(path).catch(() => {});
  }
}

async function main() {
  let args;
  try {
    args = parseArgs({
      options: {
        output: { type: 'string', short: 'o' }, report: { type: 'string' },
        markdown: { type: 'string' }, mode: { type: 'string', default: 'private' },
        compact: { type: 'boolean' }, quiet: { type: 'boolean', short: 'q' },
        help: { type: 'boolean', short: 'h' }, version: { type: 'boolean', short: 'v' },
      }, allowPositionals: true, strict: true,
    });
  } catch {
    throw new HarError('Invalid arguments. Run tracetidy --help.', 'INVALID_ARGUMENTS');
  }
  const { values, positionals } = args;
  if (values.help) { process.stdout.write(HELP); return; }
  if (values.version) { process.stdout.write(`${VERSION}\n`); return; }
  if (positionals.length > 1) throw new HarError('Supply one input file, or - for stdin.');
  if (!positionals.length && process.stdin.isTTY) { process.stdout.write(HELP); return; }
  for (const key of ['output', 'report', 'markdown']) {
    if (values[key] !== undefined && (!values[key].trim() || values[key] === '-')) {
      throw new HarError('Output options require a file path. Omit --output to use stdout.');
    }
  }
  if (!['private', 'diagnostic'].includes(values.mode)) throw new HarError('Mode must be private or diagnostic.');
  const input = await readInput(positionals[0] ?? '-');
  const result = sanitizeHar(parseHar(input), { mode: values.mode });
  const spacing = values.compact ? 0 : 2;
  const json = JSON.stringify(result.har, null, spacing) + '\n';
  const outputs = [];
  if (values.output) outputs.push([values.output, json]);
  if (values.report) outputs.push([values.report, JSON.stringify(result.report, null, 2) + '\n']);
  if (values.markdown) outputs.push([values.markdown, toMarkdown(result)]);
  await writeOutputs(outputs);
  if (!values.output) process.stdout.write(json);
  if (!values.quiet) {
    const r = result.report;
    process.stderr.write(`TraceTidy: ${r.entriesProcessed} requests processed (${r.mode}). Removed ${r.removed.headers} headers and ${r.removed.bodies} bodies.\n`);
    for (const warning of r.warnings) process.stderr.write(`Warning: ${warning}\n`);
    process.stderr.write('Review before sharing: timing, sizes, status codes, and structure remain.\n');
  }
}

process.stdout.on('error', (error) => {
  if (error.code === 'EPIPE') process.exit(0);
  process.stderr.write('TraceTidy: cannot write to stdout.\n');
  process.exit(1);
});
main().catch((error) => {
  process.stderr.write(`TraceTidy: ${error instanceof HarError || error.name === 'Error' ? error.message : 'Unexpected failure.'}\n`);
  process.exitCode = error instanceof HarError ? 2 : 1;
});
