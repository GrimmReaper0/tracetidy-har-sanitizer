import { performance } from 'node:perf_hooks';
import { parseHar, sanitizeHar, MAX_INPUT_BYTES } from '../src/core.js';
import { createDemoHar } from '../examples/demo.mjs';
const count = Number(process.argv[2] ?? 10000);
if (!Number.isInteger(count) || count < 1 || count > 25000) throw new Error('Request count must be an integer from 1 to 25000.');
const input = createDemoHar();
const base = structuredClone(input.log.entries[0]);
input.log.entries = Array.from({ length: count }, (_, i) => {
  const e = structuredClone(base);
  e.request.url = `https://synthetic.example.test/api/users/${i}?token=BENCHMARK_NOT_A_REAL_SECRET`;
  e.startedDateTime = new Date(Date.UTC(2026, 0, 1, 10) + i * 3).toISOString();
  e.time = (i * 17) % 3000;
  return e;
});
const text = JSON.stringify(input);
if (Buffer.byteLength(text) > MAX_INPUT_BYTES) throw new Error('This synthetic capture exceeds the supported input size. Reduce the request count.');
const samples = [];
let result;
let output;
for (let i = 0; i < 5; i++) {
  const start = performance.now();
  result = sanitizeHar(parseHar(text));
  output = JSON.stringify(result.har);
  samples.push(Number((performance.now() - start).toFixed(2)));
}
console.log(JSON.stringify({
  description: 'Local synthetic benchmark: parse + sanitize + compact JSON serialization. Five runs; no I/O.',
  node: process.version, platform: process.platform, architecture: process.arch,
  requests: count, inputBytes: Buffer.byteLength(text), outputBytes: Buffer.byteLength(output),
  samplesMs: samples, medianMs: [...samples].sort((a, b) => a - b)[2],
  warning: 'A local measurement, not a performance guarantee. Different hardware, captures, and browsers vary.',
}, null, 2));
