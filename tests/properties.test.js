import test from 'node:test';
import assert from 'node:assert/strict';
import { sanitizeHar, toMarkdown } from '../src/core.js';
import { createDemoHar } from '../examples/demo.mjs';

function rng(seed) { return () => { seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5; return (seed >>> 0) / 4294967296; }; }
for (const seed of [1, 7, 42, 2026, 0xdeadbeef]) {
  test(`private-mode canary / immutability invariants: 200 generated cases, seed ${seed}`, () => {
    const random = rng(seed);
    for (let i = 0; i < 200; i++) {
      const canary = `CANARY_${seed}_${i}_${Math.floor(random() * 1e9)}`;
      const h = createDemoHar(); h.log.entries = h.log.entries.slice(0, 1 + Math.floor(random() * 5));
      for (const e of h.log.entries) {
        e.request.url = `https://${canary}.example.test/${encodeURIComponent(canary)}/${canary}?${canary}=${canary}&${canary}=${canary}#${canary}`;
        e.request.headers = [{ name: canary, value: canary }];
        e.response.headers = [{ name: canary, value: canary }];
        e.request.cookies = [{ name: canary, value: canary }];
        e.response.cookies = [{ name: canary, value: canary }];
        e.request.queryString = [{ name: canary, value: canary, comment: canary }];
        e.request.postData = { text: canary, params: [{ name: canary, value: canary }] };
        e.response.content.text = canary; e.response.statusText = canary;
        e._initiator = { stack: { frames: [canary] } }; e[canary] = canary;
        e.time = Math.floor(random() * 1e6); e.response.status = [0, 200, 301, 404, 500][Math.floor(random() * 5)];
      }
      const before = JSON.stringify(h);
      const result = sanitizeHar(h);
      assert.ok(!(JSON.stringify(result) + toMarkdown(result)).includes(canary));
      assert.equal(JSON.stringify(h), before);
      assert.equal(result.har.log.entries.length, h.log.entries.length);
      for (const e of result.har.log.entries) {
        assert.deepEqual(e.request.headers, []); assert.equal(e.request.postData, undefined);
        assert.equal(e.response.content.text, undefined); assert.ok(Number.isFinite(e.time));
        const url = new URL(e.request.url); assert.equal(url.hash, ''); assert.equal(url.username, '');
        for (const value of url.searchParams.values()) assert.equal(value, 'REDACTED');
      }
    }
  });
}
