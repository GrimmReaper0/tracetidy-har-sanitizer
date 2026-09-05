/**
 * TraceTidy's portable, dependency-free sanitization engine.
 * SECURITY: output is constructed from an allowlist, never by cloning input.
 * Do not add arbitrary input strings to errors, audit reports, or output fields.
 */
export const VERSION = '1.0.0';
export const MAX_INPUT_BYTES = 25 * 1024 * 1024;
export const MAX_ENTRIES = 25_000;
export const MAX_PAGES = 5_000;
const MAX_COLLECTION = 10_000;
const MAX_URL_LENGTH = 65_536;
const MAX_TRACE_MS = 366 * 24 * 60 * 60 * 1000;
const EPOCH = Date.UTC(2000, 0, 1);
const METHODS = new Set(['GET', 'HEAD', 'POST', 'PUT', 'DELETE', 'CONNECT', 'OPTIONS', 'TRACE', 'PATCH']);
const PROTOCOLS = new Set(['http:', 'https:', 'ws:', 'wss:']);
const HTTP_VERSIONS = new Set(['HTTP/0.9', 'HTTP/1.0', 'HTTP/1.1', 'HTTP/2', 'HTTP/2.0', 'HTTP/3', 'HTTP/3.0', 'h2', 'h3']);
const MIME_TYPES = new Set([
  'application/json', 'application/ld+json', 'application/problem+json',
  'application/javascript', 'application/x-javascript', 'application/xml',
  'application/octet-stream', 'application/pdf', 'application/wasm',
  'application/x-www-form-urlencoded', 'application/graphql', 'application/grpc',
  'application/manifest+json', 'application/zip', 'text/html', 'text/plain',
  'text/css', 'text/javascript', 'text/xml', 'text/event-stream', 'text/csv',
  'image/png', 'image/jpeg', 'image/gif', 'image/webp', 'image/svg+xml',
  'image/avif', 'image/x-icon', 'font/woff', 'font/woff2', 'font/ttf',
  'font/otf', 'audio/mpeg', 'audio/ogg', 'video/mp4', 'video/webm',
  'multipart/form-data', 'multipart/mixed',
]);
const LIMITATIONS = Object.freeze([
  'Timing, sizes, status codes, request counts, and repeated URL structure remain and can identify activity.',
  'This is data minimization, not a guarantee of anonymity or a security certification. Review every export before sharing.',
  'Bodies, headers, cache details, and browser extensions are removed; the output is not suitable for replay or full-fidelity debugging.',
]);
const WARNING_TEXT = Object.freeze({
  diagnostic: 'Diagnostic mode preserves hostnames, ports, paths, and query names. These can contain secrets or personal data.',
  invalidUrl: 'One or more unsupported, malformed, missing, or oversized URLs were replaced completely.',
  invalidDate: 'One or more missing, invalid, or out-of-range timestamps were normalized.',
  invalidNumber: 'One or more missing, invalid, or out-of-range numeric fields were normalized.',
  customText: 'One or more unrecognized methods, HTTP versions, or MIME types were replaced.',
  invalidCollection: 'One or more malformed optional collections were discarded.',
  orphanPage: 'One or more page references could not be matched and were omitted.',
});

export class HarError extends Error {
  constructor(message, code = 'INVALID_HAR') {
    super(message);
    this.name = 'HarError';
    this.code = code;
  }
}

function object(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
function own(value, key) {
  return Object.prototype.hasOwnProperty.call(value, key);
}

/** Parse untrusted JSON without including input fragments in exceptions. */
export function parseHar(text) {
  if (typeof text !== 'string') throw new HarError('Expected HAR JSON text.');
  if (new TextEncoder().encode(text).byteLength > MAX_INPUT_BYTES) {
    throw new HarError('The input exceeds the 25 MiB limit.', 'INPUT_TOO_LARGE');
  }
  try {
    return JSON.parse(text.replace(/^\uFEFF/, ''));
  } catch {
    throw new HarError('Invalid JSON. Export a HAR file and try again.', 'INVALID_JSON');
  }
}

function validate(input) {
  if (!object(input) || !object(input.log) || !Array.isArray(input.log.entries)) {
    throw new HarError('Expected a HAR object with a log.entries array.');
  }
  if (input.log.entries.length > MAX_ENTRIES) {
    throw new HarError('The HAR exceeds the 25,000 request limit.', 'TOO_MANY_ENTRIES');
  }
  if (Array.isArray(input.log.pages) && input.log.pages.length > MAX_PAGES) {
    throw new HarError('The HAR exceeds the 5,000 page limit.', 'TOO_MANY_PAGES');
  }
  for (let i = 0; i < input.log.entries.length; i++) {
    const e = input.log.entries[i];
    if (!object(e) || !object(e.request) || !object(e.response)) {
      throw new HarError(`Request ${i + 1} must have request and response objects.`);
    }
    for (const side of [e.request, e.response]) {
      for (const key of ['headers', 'cookies', 'queryString']) {
        if (Array.isArray(side[key]) && side[key].length > MAX_COLLECTION) {
          throw new HarError(`Request ${i + 1} exceeds an optional collection limit.`, 'COLLECTION_TOO_LARGE');
        }
      }
    }
  }
}

/**
 * Minimize a parsed HAR. Does not mutate input. Only use JSON-parsed objects;
 * arbitrary JS objects with getters/proxies are outside the trust boundary.
 * @param {unknown} input
 * @param {{mode?: 'private'|'diagnostic'}} [options]
 * @returns {{har: object, report: object, summary: object}}
 */
export function sanitizeHar(input, options = {}) {
  const mode = options.mode ?? 'private';
  if (mode !== 'private' && mode !== 'diagnostic') {
    throw new HarError('Mode must be private or diagnostic.', 'INVALID_MODE');
  }
  validate(input);
  const removed = {
    headers: 0, cookies: 0, bodies: 0, queryValues: 0,
    urlCredentials: 0, fragments: 0, metadataFields: 0,
  };
  const replaced = { hosts: 0, pathSegments: 0, queryNames: 0, timestamps: 0, pageLabels: 0 };
  const warningCodes = new Set(mode === 'diagnostic' ? ['diagnostic'] : []);
  const warn = (key) => warningCodes.add(key);
  const hosts = new Map();
  const segments = new Map();
  const parameters = new Map();
  const pagesById = new Map();
  const alias = (map, value, prefix) => {
    if (!map.has(value)) map.set(value, `${prefix}${map.size + 1}`);
    return map.get(value);
  };
  const extras = (value, keys) => {
    if (!object(value)) return;
    for (const key of Object.keys(value)) if (!keys.includes(key)) removed.metadataFields++;
  };
  const collection = (value) => {
    if (value === undefined) return [];
    if (!Array.isArray(value)) { warn('invalidCollection'); return []; }
    return value;
  };
  const numeric = (value, fallback, min, max, integer = false) => {
    if (typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max && (!integer || Number.isInteger(value))) {
      return Object.is(value, -0) ? 0 : value;
    }
    warn('invalidNumber');
    return fallback;
  };
  const size = (value) => numeric(value, -1, -1, Number.MAX_SAFE_INTEGER, true);
  const elapsed = (value, fallback = 0) => numeric(value, fallback, fallback === -1 ? -1 : 0, MAX_TRACE_MS);
  const enumText = (value, set, fallback) => {
    if (typeof value === 'string' && set.has(value)) return value;
    warn('customText');
    return fallback;
  };
  const mime = (value) => {
    // Parameters (including multipart boundaries) can contain secrets.
    const base = typeof value === 'string' ? value.split(';', 1)[0].trim().toLowerCase() : '';
    return enumText(base, MIME_TYPES, 'application/octet-stream');
  };
  const queryName = (name) => {
    const key = typeof name === 'string' ? name : '';
    if (mode === 'diagnostic') return key;
    replaced.queryNames++;
    return alias(parameters, key, 'q');
  };
  const scrubUrl = (raw, base) => {
    let url;
    try {
      if (typeof raw !== 'string' || raw.length === 0 || raw.length > MAX_URL_LENGTH) throw new Error();
      url = base ? new URL(raw, base) : new URL(raw);
      if (!PROTOCOLS.has(url.protocol)) throw new Error();
    } catch {
      warn('invalidUrl');
      url = new URL('https://redacted.invalid/');
    }
    if (url.username || url.password) removed.urlCredentials++;
    if (url.hash) removed.fragments++;
    let host = url.host;
    let path = url.pathname;
    if (mode === 'private') {
      host = `${alias(hosts, url.host, 'host-')}.invalid`;
      replaced.hosts++;
      path = path.split('/').map((part) => {
        if (!part) return '';
        replaced.pathSegments++;
        return alias(segments, part, 'p');
      }).join('/');
    }
    const params = new URLSearchParams();
    for (const [name] of url.searchParams) {
      removed.queryValues++;
      params.append(queryName(name), 'REDACTED');
    }
    const query = params.toString();
    return `${url.protocol}//${host}${path || '/'}${query ? `?${query}` : ''}`;
  };

  const rawPages = collection(input.log.pages);
  for (let i = 0; i < rawPages.length; i++) {
    if (!object(rawPages[i])) throw new HarError(`Page ${i + 1} must be an object.`);
    if (typeof rawPages[i].id === 'string') {
      if (pagesById.has(rawPages[i].id)) throw new HarError('Page IDs must be unique.');
      pagesById.set(rawPages[i].id, `page-${i + 1}`);
    }
  }
  let baseline = Infinity;
  const dateValue = (value) => typeof value === 'string' ? Date.parse(value) : NaN;
  for (const record of [...rawPages, ...input.log.entries]) {
    const time = dateValue(record.startedDateTime);
    if (Number.isFinite(time) && time < baseline) baseline = time;
  }
  if (!Number.isFinite(baseline)) baseline = 0;
  const timestamp = (value) => {
    const date = dateValue(value);
    let delta = date - baseline;
    if (!Number.isFinite(delta) || delta < 0 || delta > MAX_TRACE_MS) {
      warn('invalidDate');
      delta = 0;
    }
    replaced.timestamps++;
    return new Date(EPOCH + delta).toISOString();
  };
  extras(input, ['log']);
  extras(input.log, ['version', 'creator', 'pages', 'entries']);
  // Original creator/browser metadata is deliberately not copied.
  if (own(input.log, 'creator')) removed.metadataFields++;
  const pages = rawPages.map((page, i) => {
    extras(page, ['startedDateTime', 'id', 'title', 'pageTimings']);
    extras(page.pageTimings, ['onContentLoad', 'onLoad']);
    replaced.pageLabels += 2;
    const pt = object(page.pageTimings) ? page.pageTimings : {};
    return {
      startedDateTime: timestamp(page.startedDateTime),
      id: `page-${i + 1}`,
      title: `Page ${i + 1}`,
      pageTimings: { onContentLoad: elapsed(pt.onContentLoad, -1), onLoad: elapsed(pt.onLoad, -1) },
    };
  });
  const entries = input.log.entries.map((entry) => {
    const req = entry.request;
    const res = entry.response;
    const content = object(res.content) ? res.content : {};
    const rawTimings = object(entry.timings) ? entry.timings : {};
    extras(entry, ['startedDateTime', 'time', 'request', 'response', 'cache', 'timings', 'pageref']);
    extras(req, ['method', 'url', 'httpVersion', 'cookies', 'headers', 'queryString', 'headersSize', 'bodySize', 'postData']);
    extras(res, ['status', 'statusText', 'httpVersion', 'cookies', 'headers', 'content', 'redirectURL', 'headersSize', 'bodySize']);
    extras(content, ['size', 'mimeType', 'compression', 'text', 'encoding']);
    extras(rawTimings, ['blocked', 'dns', 'connect', 'send', 'wait', 'receive', 'ssl']);
    if (object(entry.cache)) removed.metadataFields += Object.keys(entry.cache).length;
    if (res.statusText) removed.metadataFields++;
    for (const side of [req, res]) {
      removed.headers += collection(side.headers).length;
      removed.cookies += collection(side.cookies).length;
    }
    if (own(req, 'postData')) removed.bodies++;
    if (own(content, 'text')) removed.bodies++;
    const url = scrubUrl(req.url);
    const queryString = collection(req.queryString).map((param) => {
      removed.queryValues++;
      return { name: queryName(object(param) ? param.name : ''), value: 'REDACTED' };
    });
    const cleanContent = { size: numeric(content.size, 0, 0, Number.MAX_SAFE_INTEGER, true), mimeType: mime(content.mimeType) };
    if (own(content, 'compression')) cleanContent.compression = size(content.compression);
    const timings = {
      blocked: elapsed(rawTimings.blocked, -1), dns: elapsed(rawTimings.dns, -1),
      connect: elapsed(rawTimings.connect, -1), send: elapsed(rawTimings.send),
      wait: elapsed(rawTimings.wait), receive: elapsed(rawTimings.receive),
    };
    if (own(rawTimings, 'ssl')) timings.ssl = elapsed(rawTimings.ssl, -1);
    const clean = {
      startedDateTime: timestamp(entry.startedDateTime), time: elapsed(entry.time),
      request: {
        method: enumText(req.method, METHODS, 'UNKNOWN'), url,
        httpVersion: enumText(req.httpVersion, HTTP_VERSIONS, 'HTTP/1.1'),
        cookies: [], headers: [], queryString, headersSize: size(req.headersSize), bodySize: size(req.bodySize),
      },
      response: {
        status: numeric(res.status, 0, 0, 599, true), statusText: '',
        httpVersion: enumText(res.httpVersion, HTTP_VERSIONS, 'HTTP/1.1'),
        cookies: [], headers: [], content: cleanContent,
        redirectURL: typeof res.redirectURL === 'string' && res.redirectURL ? scrubUrl(res.redirectURL, req.url) : '',
        headersSize: size(res.headersSize), bodySize: size(res.bodySize),
      },
      cache: {}, timings,
    };
    if (own(entry, 'pageref')) {
      if (pagesById.has(entry.pageref)) clean.pageref = pagesById.get(entry.pageref);
      else warn('orphanPage');
    }
    return clean;
  });
  const har = { log: { version: '1.2', creator: { name: 'TraceTidy', version: VERSION }, pages, entries } };
  const report = {
    schemaVersion: 1, tool: 'TraceTidy', version: VERSION, mode,
    entriesProcessed: entries.length, removed, replaced,
    warnings: [...warningCodes].map((key) => WARNING_TEXT[key]),
    limitations: [...LIMITATIONS],
  };
  return { har, report, summary: summarize(entries) };
}

function summarize(entries) {
  const durations = entries.map((e) => e.time).sort((a, b) => a - b);
  const rows = entries.map((e, i) => ({
    index: i + 1, method: e.request.method, url: e.request.url,
    status: e.response.status, durationMs: e.time,
  }));
  const failed = rows.filter((e) => e.status === 0 || e.status >= 400);
  let first = Infinity;
  let last = -Infinity;
  let recordedBodyBytes = 0;
  let unknownBodySizes = 0;
  for (const e of entries) {
    const start = Date.parse(e.startedDateTime);
    first = Math.min(first, start);
    last = Math.max(last, start + e.time);
    if (e.response.bodySize >= 0) recordedBodyBytes += e.response.bodySize;
    else unknownBodySizes++;
  }
  return {
    totalRequests: entries.length,
    failedRequests: failed.length,
    networkFailures: rows.filter((e) => e.status === 0).length,
    httpErrors: rows.filter((e) => e.status >= 400).length,
    durationMs: entries.length ? last - first : 0,
    recordedBodyBytes, unknownBodySizes,
    medianMs: durations.length ? (durations[Math.floor((durations.length - 1) / 2)] + durations[Math.floor(durations.length / 2)]) / 2 : 0,
    p95Ms: durations.length ? durations[Math.ceil(durations.length * 0.95) - 1] : 0,
    slowest: [...rows].sort((a, b) => b.durationMs - a.durationMs || a.index - b.index).slice(0, 5),
    failures: failed.slice(0, 10),
  };
}

function markdownText(value) {
  return String(value).replace(/[\r\n\u0000-\u001f\u007f]/g, ' ').replace(/[\\`*_{}\[\]()<>|!#]/g, '\\$&');
}

/** Build a plain, non-AI debugging brief from a sanitizeHar result. */
export function toMarkdown(result) {
  const { report: r, summary: s } = result;
  const lines = [
    '# Network debugging brief', '',
    `Generated locally by TraceTidy ${VERSION}. Mode: **${r.mode}**.`, '',
    '> Review before sharing. This report retains timing, sizes, status codes, and request structure.',
    ...(r.mode === 'diagnostic' ? ['> WARNING: readable hostnames, paths, and query names are retained. They may contain sensitive data.'] : []),
    '', '## Observed capture', '',
    `- Requests: ${s.totalRequests}; HTTP errors: ${s.httpErrors}; status-zero requests: ${s.networkFailures}.`,
    `- Recorded request span: ${s.durationMs.toFixed(1)} ms (not page load time).`,
    `- Median request duration: ${s.medianMs.toFixed(1)} ms; p95: ${s.p95Ms.toFixed(1)} ms (nearest rank).`,
    `- Recorded response body bytes: ${s.recordedBodyBytes}; unknown body sizes: ${s.unknownBodySizes}.`,
    '', '## Slowest recorded requests', '',
    '| # | Method | Sanitized URL | Status | Duration (ms) |',
    '| --- | --- | --- | --- | --- |',
    ...s.slowest.map((e) => `| ${e.index} | ${e.method} | ${markdownText(e.url)} | ${e.status} | ${e.durationMs.toFixed(1)} |`),
    ...(s.slowest.length ? [] : ['| - | - | No requests | - | - |']),
    '', 'A slow request is not necessarily on the critical path. This brief does not infer root cause.',
    '', '## Failed requests (first 10)', '',
    ...s.failures.map((e) => `- Request ${e.index}: ${e.method} ${markdownText(e.url)} - status ${e.status}.`),
    ...(s.failures.length ? [] : ['No HTTP errors or status-zero requests recorded.']),
    '', 'Status 0 can mean a failed, cancelled, blocked, or incomplete request; the HAR alone may not distinguish them.',
    '', '## Data minimization', '',
    `- Removed ${r.removed.headers} header records, ${r.removed.cookies} cookie objects, and ${r.removed.bodies} body containers.`,
    `- Redacted ${r.removed.queryValues} query values across all stored copies.`,
    '- Dropped unknown metadata, credentials, URL fragments, page titles, and original timestamps.',
    ...(r.mode === 'private' ? ['- Hostnames, path segments, and query names replaced with within-file aliases.'] : ['- Hostnames, paths, and query names intentionally retained.']),
    ...r.warnings.map((w) => `- Warning: ${w}`),
    '', '## Add before filing an issue', '',
    '- Steps to reproduce:', '- Expected behavior:', '- Actual behavior:',
    '- Relevant request numbers:', '- Environment (omit personal or account identifiers):',
    '', '## Limitations', '', ...r.limitations.map((line) => `- ${line}`), '',
  ];
  return lines.join('\n');
}
