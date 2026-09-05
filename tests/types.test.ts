import { parseHar, sanitizeHar, toMarkdown, HarError, type Har, type Mode, type AuditReport } from 'tracetidy-har-sanitizer';
const parsed: unknown = parseHar('{"log":{"entries":[]}}');
const mode: Mode = 'private';
const result = sanitizeHar(parsed, { mode });
const har: Har = result.har;
const report: AuditReport = result.report;
const brief: string = toMarkdown(result);
const count: number = report.removed.headers;
const urls: string[] = har.log.entries.map((entry) => entry.request.url);
const error: HarError = new HarError('Invalid input', 'INVALID_HAR');
void [brief, count, urls, error.code];
// @ts-expect-error Only supported privacy profiles are accepted.
sanitizeHar(parsed, { mode: 'unsafe' });
// @ts-expect-error The sanitized response does not expose response text.
result.har.log.entries[0].response.content.text;
// @ts-expect-error Parsing requires text, not an already parsed object.
parseHar({});
