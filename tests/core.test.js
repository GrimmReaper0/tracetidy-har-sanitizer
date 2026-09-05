import test from 'node:test';
import assert from 'node:assert/strict';
import { parseHar, sanitizeHar, toMarkdown, HarError, MAX_INPUT_BYTES, MAX_ENTRIES, MAX_PAGES } from '../src/core.js';
import { createDemoHar } from '../examples/demo.mjs';

const one = () => { const h = createDemoHar(); h.log.entries = [h.log.entries[0]]; return h; };
const clean = (h, options) => sanitizeHar(h, options);
const entry = (h) => h.log.entries[0];
const CANARY = 'PRIVATE_CANARY_Q7k9_123456';
function noCanary(result) {
  const text = JSON.stringify(result) + toMarkdown(result);
  assert.ok(!text.includes(CANARY));
  assert.ok(!text.includes(Buffer.from(CANARY).toString('base64')));
}

for (const [name, value] of [['null', null], ['array', []], ['number', 5], ['empty object', {}], ['missing entries', { log: {} }], ['non-array entries', { log: { entries: {} } }]]) {
  test(`rejects ${name}`, () => assert.throws(() => clean(value), HarError));
}
test('rejects invalid JSON without revealing snippets', () => {
  assert.throws(() => parseHar(`{"secret":"${CANARY}"`), (e) => e.code === 'INVALID_JSON' && !e.message.includes(CANARY));
});
test('accepts a UTF-8 BOM', () => assert.deepEqual(parseHar('\uFEFF{"log":{"entries":[]}}'), { log: { entries: [] } }));
test('requires text for parsing', () => assert.throws(() => parseHar({}), HarError));
test('enforces input byte limit, not character count', () => {
  assert.throws(() => parseHar(' '.repeat(MAX_INPUT_BYTES + 1)), (e) => e.code === 'INPUT_TOO_LARGE');
  assert.throws(() => parseHar('\u00e9'.repeat(Math.ceil(MAX_INPUT_BYTES / 2) + 1)), (e) => e.code === 'INPUT_TOO_LARGE');
});
test('rejects too many entries before processing', () => assert.throws(() => clean({ log: { entries: new Array(MAX_ENTRIES + 1) } }), (e) => e.code === 'TOO_MANY_ENTRIES'));
test('rejects too many pages', () => assert.throws(() => clean({ log: { entries: [], pages: new Array(MAX_PAGES + 1) } }), (e) => e.code === 'TOO_MANY_PAGES'));
test('rejects malformed entries without including their values', () => {
  for (const bad of [null, { request: null, response: {} }, { request: {}, response: [] }]) {
    const h = one(); h.log.entries = [bad]; assert.throws(() => clean(h), HarError);
  }
});
test('rejects oversized optional arrays', () => { const h = one(); entry(h).request.headers = new Array(10001); assert.throws(() => clean(h), (e) => e.code === 'COLLECTION_TOO_LARGE'); });
test('accepts empty captures with finite statistics', () => {
  const r = clean({ log: { entries: [] } });
  assert.equal(r.summary.totalRequests, 0); assert.equal(r.summary.durationMs, 0);
  assert.equal(r.summary.medianMs, 0); assert.equal(r.summary.p95Ms, 0);
  assert.match(toMarkdown(r), /No requests/);
});
test('rejects unsupported modes', () => assert.throws(() => clean(one(), { mode: 'unsafe' }), (e) => e.code === 'INVALID_MODE'));
test('strips all headers, cookies, and bodies', () => {
  const r = clean(createDemoHar());
  assert.deepEqual(r.report.removed.headers, 60); assert.equal(r.report.removed.cookies, 24); assert.equal(r.report.removed.bodies, 14);
  for (const e of r.har.log.entries) {
    assert.deepEqual(e.request.headers, []); assert.deepEqual(e.response.headers, []);
    assert.deepEqual(e.request.cookies, []); assert.deepEqual(e.response.cookies, []);
    assert.equal(e.request.postData, undefined); assert.equal(e.response.content.text, undefined);
    assert.equal(e.response.content.encoding, undefined);
  }
});
test('does not modify input, including deeply frozen input', () => {
  const h = createDemoHar(); const before = JSON.stringify(h);
  const freeze = (v) => { if (v && typeof v === 'object') { Object.values(v).forEach(freeze); Object.freeze(v); } };
  freeze(h); clean(h); assert.equal(JSON.stringify(h), before);
});
test('retains methods, status, timings, and recorded sizes on valid input', () => {
  const h = createDemoHar(); const r = clean(h);
  for (let i = 0; i < h.log.entries.length; i++) {
    const a = h.log.entries[i], b = r.har.log.entries[i];
    assert.equal(b.request.method, a.request.method); assert.equal(b.response.status, a.response.status);
    assert.equal(b.time, a.time); assert.deepEqual(b.timings, a.timings);
    assert.equal(b.response.bodySize, a.response.bodySize);
  }
});
test('aliases private URL host, path, and parameter names', () => {
  const h = one(); entry(h).request.url = `https://${CANARY}.example.test/${CANARY}?${CANARY}=${CANARY}#${CANARY}`;
  entry(h).request.queryString = [{ name: CANARY, value: CANARY }];
  const r = clean(h); noCanary(r);
  assert.match(entry(r.har).request.url, /^https:\/\/host-1\.invalid\/p1\?q1=REDACTED$/);
  assert.deepEqual(entry(r.har).request.queryString, [{ name: 'q1', value: 'REDACTED' }]);
  assert.equal(r.report.removed.fragments, 1); assert.equal(r.report.removed.queryValues, 2);
});
test('keeps readable host/path/names only in diagnostic mode', () => {
  const h = one(); entry(h).request.url = `https://example.test/private/${CANARY}?email=${CANARY}`;
  const r = clean(h, { mode: 'diagnostic' });
  assert.equal(entry(r.har).request.url, `https://example.test/private/${CANARY}?email=REDACTED`);
  assert.equal(r.report.replaced.hosts, 0); assert.match(r.report.warnings[0], /Diagnostic mode/);
  assert.match(toMarkdown(r), /WARNING: readable/);
});
test('strips user info, fragments, and query values in both modes', () => {
  for (const mode of ['private', 'diagnostic']) {
    const h = one(); entry(h).request.url = `https://${CANARY}:${CANARY}@example.test/a?x=${CANARY}#${CANARY}`;
    const r = clean(h, { mode }); noCanary(r);
    assert.equal(r.report.removed.urlCredentials, 1); assert.equal(r.report.removed.fragments, 1);
  }
});
test('preserves duplicate queries and empty keys while redacting every copy', () => {
  const h = one(); entry(h).request.url = 'https://example.test/?a=1&a=2&=3&flag';
  const url = new URL(entry(clean(h).har).request.url);
  assert.deepEqual([...url.searchParams], [['q1', 'REDACTED'], ['q1', 'REDACTED'], ['q2', 'REDACTED'], ['q3', 'REDACTED']]);
});
test('aliases repeated hosts, paths, and query names consistently', () => {
  const h = one(); h.log.entries.push(structuredClone(entry(h)));
  const r = clean(h); assert.equal(r.har.log.entries[0].request.url, r.har.log.entries[1].request.url);
});
test('aliases do not carry over to another capture', () => {
  const h = one(); entry(h).request.url = 'https://first.test/first'; clean(h);
  entry(h).request.url = 'https://second.test/second'; assert.equal(entry(clean(h).har).request.url, 'https://host-1.invalid/p1');
});
test('private mode removes ports; diagnostic mode preserves ports', () => {
  const h = one(); entry(h).request.url = 'https://example.test:9443/path';
  assert.ok(!entry(clean(h).har).request.url.includes('9443'));
  assert.ok(entry(clean(h, { mode: 'diagnostic' }).har).request.url.includes('9443'));
});
for (const protocol of ['http', 'https', 'ws', 'wss']) {
  test(`handles ${protocol} URLs`, () => { const h = one(); entry(h).request.url = `${protocol}://example.test/x`; assert.ok(entry(clean(h).har).request.url.startsWith(`${protocol}://`)); });
}
for (const value of [`data:text/plain,${CANARY}`, `javascript:alert('${CANARY}')`, `file:///${CANARY}`, `mailto:${CANARY}@example.test`, CANARY, '', null, 42]) {
  test(`replaces unsupported URL ${String(value).slice(0, 12)}`, () => {
    const h = one(); entry(h).request.url = value; const r = clean(h); noCanary(r);
    assert.ok(r.report.warnings.some((v) => /URLs/.test(v))); assert.match(entry(r.har).request.url, /^https:\/\/host-\d+\.invalid\/$/);
  });
}
test('replaces URLs longer than the configured field limit', () => { const h = one(); entry(h).request.url = 'https://x.test/' + 'a'.repeat(65536); assert.equal(new URL(entry(clean(h).har).request.url).pathname, '/'); });
test('handles IPv6, Unicode paths, percent encodings, and repeated slashes', () => {
  const h = one(); entry(h).request.url = 'https://[2001:db8::1]:9000/a//%E2%9C%93/%2F?q=%00&x=%252F';
  const r = clean(h); const url = new URL(entry(r.har).request.url);
  assert.equal(url.hostname, 'host-1.invalid'); assert.equal(url.pathname, '/p1//p2/p3'); assert.equal([...url.searchParams.values()].join(','), 'REDACTED,REDACTED');
});
test('resolves and cleans relative redirects against the original request', () => {
  const h = one(); entry(h).response.redirectURL = `/next/${CANARY}?token=${CANARY}#${CANARY}`;
  const r = clean(h); noCanary(r); assert.match(entry(r.har).response.redirectURL, /^https:\/\/host-1\.invalid\/p2\/p3\?q1=REDACTED$/);
});
test('cleans cross-origin redirects and credentials', () => {
  const h = one(); entry(h).response.redirectURL = `https://u:${CANARY}@other.test/next?q=${CANARY}`;
  const r = clean(h); noCanary(r); assert.match(entry(r.har).response.redirectURL, /host-2\.invalid/);
});
test('handles malformed redirect fields without propagating their objects', () => {
  const h = one(); entry(h).response.redirectURL = { [CANARY]: CANARY }; const r = clean(h); noCanary(r); assert.equal(entry(r.har).response.redirectURL, '');
});
test('relabels pages, shifts dates, and preserves relative offsets', () => {
  const h = createDemoHar(); const r = clean(h);
  assert.equal(r.har.log.pages[0].id, 'page-1'); assert.equal(r.har.log.pages[0].title, 'Page 1');
  assert.equal(r.har.log.pages[0].startedDateTime, '2000-01-01T00:00:00.000Z');
  assert.equal(r.har.log.entries[2].pageref, 'page-1');
  assert.equal(Date.parse(r.har.log.entries[2].startedDateTime) - Date.parse(r.har.log.entries[0].startedDateTime), 105);
});
test('removes unmatched page references', () => { const h = one(); entry(h).pageref = CANARY; const r = clean(h); noCanary(r); assert.equal(entry(r.har).pageref, undefined); assert.ok(r.report.warnings.some((v) => /page references/.test(v))); });
test('rejects duplicate page IDs', () => { const h = one(); h.log.pages.push(structuredClone(h.log.pages[0])); assert.throws(() => clean(h), /unique/); });
test('rejects malformed page objects', () => { const h = one(); h.log.pages = [null]; assert.throws(() => clean(h), HarError); });
test('normalizes malformed and huge-span dates without exposing strings', () => {
  const h = one(); h.log.pages[0].startedDateTime = CANARY; entry(h).startedDateTime = CANARY; const r = clean(h); noCanary(r); assert.equal(entry(r.har).startedDateTime, '2000-01-01T00:00:00.000Z');
  const h2 = one(); h2.log.pages[0].startedDateTime = '1970-01-01T00:00:00Z'; assert.ok(clean(h2).report.warnings.some((v) => /timestamps/.test(v)));
});
test('preserves one-millisecond intervals and timezone equivalence', () => {
  const h = one(); h.log.pages = []; entry(h).startedDateTime = '2026-01-01T10:00:00.000+02:00';
  h.log.entries.push(structuredClone(entry(h))); h.log.entries[1].startedDateTime = '2026-01-01T08:00:00.001Z';
  const r = clean(h); assert.equal(Date.parse(r.har.log.entries[1].startedDateTime) - Date.parse(r.har.log.entries[0].startedDateTime), 1);
});
test('normalizes invalid numeric and custom text fields', () => {
  const h = one(); const e = entry(h);
  e.time = Infinity; e.response.status = -100; e.request.bodySize = CANARY;
  e.response.content.size = -2; e.request.method = CANARY; e.request.httpVersion = CANARY;
  e.response.content.mimeType = `application/${CANARY}`; e.timings.send = NaN;
  const r = clean(h); noCanary(r); const out = entry(r.har);
  assert.equal(out.time, 0); assert.equal(out.response.status, 0); assert.equal(out.request.bodySize, -1);
  assert.equal(out.response.content.size, 0); assert.equal(out.request.method, 'UNKNOWN'); assert.equal(out.timings.send, 0);
});
test('removes MIME parameters while preserving recognized base types', () => {
  const h = one(); entry(h).response.content.mimeType = `Application/JSON; private=${CANARY}`;
  const r = clean(h); noCanary(r); assert.equal(entry(r.har).response.content.mimeType, 'application/json');
});
test('normalizes missing fields on minimal request/response objects', () => {
  const r = clean({ log: { entries: [{ request: {}, response: {} }] } });
  assert.equal(entry(r.har).time, 0); assert.equal(entry(r.har).response.content.size, 0);
  assert.equal(entry(r.har).request.method, 'UNKNOWN'); assert.deepEqual(entry(r.har).request.queryString, []);
});
test('discards malformed optional arrays instead of copying them', () => {
  const h = one(); entry(h).request.headers = { [CANARY]: CANARY }; entry(h).response.cookies = CANARY;
  entry(h).request.queryString = [null, 6, { name: 'a', value: CANARY, comment: CANARY }];
  const r = clean(h); noCanary(r); assert.equal(entry(r.har).request.queryString.length, 3);
  assert.ok(r.report.warnings.some((v) => /collections/.test(v)));
});
test('drops arbitrary metadata and does not leak field names in the audit', () => {
  const h = one(); const e = entry(h);
  for (const obj of [h, h.log, h.log.pages[0], h.log.pages[0].pageTimings, e, e.request, e.response, e.response.content, e.timings]) obj[CANARY] = { nested: CANARY };
  e.comment = CANARY; e.serverIPAddress = CANARY; e.connection = CANARY;
  e._webSocketMessages = [{ data: CANARY }]; e._securityDetails = { issuer: CANARY };
  e.cache = { beforeRequest: { eTag: CANARY } };
  const r = clean(h); noCanary(r); assert.deepEqual(entry(r.har).cache, {});
});
test('drops binary/base64 bodies, multipart parameters, and filenames', () => {
  const h = one(); entry(h).request.postData = { text: CANARY, params: [{ name: CANARY, fileName: CANARY, value: CANARY }] };
  entry(h).response.content.text = Buffer.from(CANARY).toString('base64'); entry(h).response.content.encoding = 'base64';
  noCanary(clean(h));
});
test('does not prototype-pollute from JSON keys', () => {
  const h = one(); h.log = Object.assign(h.log, JSON.parse('{"__proto__":{"polluted":"yes"},"constructor":{"prototype":{"polluted":"yes"}}}'));
  const r = clean(h); assert.equal({}.polluted, undefined); assert.ok(!JSON.stringify(r).includes('polluted'));
});
test('computes failures, median, p95, and span from observed data', () => {
  const r = clean(createDemoHar()); assert.equal(r.summary.totalRequests, 12); assert.equal(r.summary.failedRequests, 3);
  assert.equal(r.summary.httpErrors, 2); assert.equal(r.summary.networkFailures, 1); assert.equal(r.summary.durationMs, 3920);
  assert.equal(r.summary.p95Ms, 2170); assert.equal(r.summary.medianMs, 266); assert.equal(r.summary.unknownBodySizes, 1);
  assert.equal(r.summary.slowest[0].index, 6); assert.equal(r.summary.failures[0].status, 503);
});
test('uses nearest-rank p95 and even-sample median', () => {
  const h = one(); h.log.entries = Array.from({ length: 20 }, (_, i) => ({ ...structuredClone(entry(h)), time: i + 1 }));
  const r = clean(h); assert.equal(r.summary.p95Ms, 19); assert.equal(r.summary.medianMs, 10.5);
});
test('sorts slow requests deterministically, with a bounded failure list', () => {
  const h = one(); const e = entry(h); h.log.entries = Array.from({ length: 15 }, () => ({ ...structuredClone(e), response: { ...structuredClone(e.response), status: 500 } }));
  const r = clean(h); assert.equal(r.summary.failures.length, 10); assert.equal(r.summary.slowest.length, 5); assert.deepEqual(r.summary.slowest.map((v) => v.index), [1, 2, 3, 4, 5]);
});
test('a second private pass preserves valid cleaned HAR structure', () => {
  const first = clean(createDemoHar()); const second = clean(first.har); assert.deepEqual(second.har, first.har);
});
test('Markdown contains observed evidence, caveats, and reproducibility prompts', () => {
  const text = toMarkdown(clean(createDemoHar()));
  for (const phrase of ['# Network debugging brief', 'Steps to reproduce:', 'not page load time', 'does not infer root cause', 'Review before sharing', 'status-zero']) assert.ok(text.includes(phrase));
  assert.ok(!text.includes('DEMO_ONLY')); assert.ok(!text.includes('alex@example'));
});
test('escapes Markdown control characters in diagnostic URLs', () => {
  const h = one(); entry(h).request.url = 'https://example.test/a|b*_(x)!?q=x';
  const text = toMarkdown(clean(h, { mode: 'diagnostic' }));
  assert.ok(text.includes('a\\|b\\*\\_\\(x\\)\\!')); assert.ok(!text.includes('a|b*_(x)!'));
});
