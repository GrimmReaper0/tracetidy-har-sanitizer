export type Mode = 'private' | 'diagnostic';
export interface HarEntry {
  startedDateTime: string;
  time: number;
  pageref?: string;
  request: {
    method: string; url: string; httpVersion: string;
    headers: never[]; cookies: never[];
    queryString: { name: string; value: 'REDACTED' }[];
    headersSize: number; bodySize: number;
  };
  response: {
    status: number; statusText: ''; httpVersion: string;
    headers: never[]; cookies: never[];
    content: { size: number; mimeType: string; compression?: number };
    redirectURL: string; headersSize: number; bodySize: number;
  };
  cache: Record<string, never>;
  timings: { blocked: number; dns: number; connect: number; send: number; wait: number; receive: number; ssl?: number };
}
export interface Har {
  log: {
    version: '1.2'; creator: { name: 'TraceTidy'; version: string };
    pages: { startedDateTime: string; id: string; title: string; pageTimings: { onContentLoad: number; onLoad: number } }[];
    entries: HarEntry[];
  };
}
export interface AuditReport {
  schemaVersion: 1; tool: 'TraceTidy'; version: string; mode: Mode;
  entriesProcessed: number;
  removed: { headers: number; cookies: number; bodies: number; queryValues: number; urlCredentials: number; fragments: number; metadataFields: number };
  replaced: { hosts: number; pathSegments: number; queryNames: number; timestamps: number; pageLabels: number };
  warnings: string[]; limitations: string[];
}
export interface RequestSummary { index: number; method: string; url: string; status: number; durationMs: number }
export interface Summary {
  totalRequests: number; failedRequests: number; networkFailures: number; httpErrors: number;
  durationMs: number; recordedBodyBytes: number; unknownBodySizes: number; medianMs: number; p95Ms: number;
  slowest: RequestSummary[]; failures: RequestSummary[];
}
export interface SanitizeResult { har: Har; report: AuditReport; summary: Summary }
export declare const VERSION: string;
export declare const MAX_INPUT_BYTES: number;
export declare const MAX_ENTRIES: number;
export declare const MAX_PAGES: number;
export declare class HarError extends Error { code: string; constructor(message: string, code?: string) }
export declare function parseHar(text: string): unknown;
export declare function sanitizeHar(input: unknown, options?: { mode?: Mode }): SanitizeResult;
export declare function toMarkdown(result: SanitizeResult): string;
