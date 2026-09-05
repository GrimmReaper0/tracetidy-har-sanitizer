# Architecture and data flow

## Portable core

src/core.js has no platform imports and is shared by the Node CLI and browser worker. parseHar checks UTF-8 byte length and parses JSON with a generic error message. sanitizeHar validates the envelope, rejects over-limit collections, and constructs a new HAR. No input object is mutated. Original strings are never copied except the explicitly retained diagnostic URLs/query names and a fixed set of method/protocol/MIME values.

Within a single processing call, Maps assign host, path-segment, query-name, and page aliases. The maps are not returned. Identical segments are intentionally correlated within that capture, including across hosts. Origins with different ports receive different aliases; private output omits the original ports. Unsupported URLs become a generic placeholder origin and are then passed through the same aliasing path. Relative redirect URLs are resolved against the original request URL before sanitization.

The earliest valid page/request timestamp becomes the baseline. Output starts at 2000-01-01 UTC and retains valid relative offsets. Missing/unparseable timestamps or offsets over 366 days normalize to the synthetic epoch with a warning. Millisecond precision is used. This preserves relative timing for ordinary captures but intentionally changes out-of-range or malformed captures.

All headers are removed rather than guessing which names contain secrets. Body containers are removed without decoding their contents, so binary, compressed, multipart, and base64 bodies do not need a secret-detection algorithm. Unknown fields at each retained structure boundary are dropped wholesale. The audit never records their original names or values.

The summary is computed only from the reconstructed entries. A failure is status 0 or 400-599. The earliest request start to latest recorded completion defines request span; this is not necessarily page load time or the critical path. Median uses the middle value or mean of the two middle values; p95 uses nearest rank. Known response bodySize values are summed, unknown values counted separately. Size fields describe the original transfer/body metadata, not the sanitized serialization.

## Browser

scripts/build.mjs combines the core and worker into a local worker source string, embeds the synthetic demo and web/app.js, and inlines web/style.css into web/index.html. The exact generated script is hashed into a CSP meta tag. Function-based string replacements avoid JavaScript replacement-token interpretation; a regression test verifies the final HTML's actual script hash.

The browser passes a File or synthetic demo text to a Blob Web Worker. The worker decodes UTF-8, parses, sanitizes, and serializes output. Only sanitized results are returned for rendering. The UI retains the original File reference for deliberate profile changes; clearing or replacing the capture terminates the worker and drops app references. A generation counter prevents stale workers from replacing newer results.

The UI builds DOM elements and assigns textContent. URLs are displayed as text, not clickable links. Only the current 50-row page is rendered. CSS bars visualize start offsets and total durations, not a per-phase timing breakdown. Download filenames are fixed rather than derived from a possibly sensitive original filename. Download Blob URLs are revoked after 30 seconds.

No fetch, XMLHttpRequest, analytics, cookies, localStorage, indexedDB, service worker, remote script, or remote font is used. User-clicked source links navigate externally. On a hosted copy the initial HTML request is visible to its host; that is distinct from uploading a capture.

## CLI

The CLI accepts one regular file or stdin. It bounds incoming bytes before parsing, rejects invalid UTF-8, and avoids printing source fragments. Diagnostics go to stderr; stdout contains only the cleaned HAR unless help/version was requested.

For explicit output paths, complete files are staged next to the destination using exclusive creation and restrictive permissions. A hard link publishes each file without replacing an existing destination. If a subsequent operation fails, the CLI attempts to remove links it created and always removes staging files. It compares inode/device identities before rollback deletion. A crash can still leave a partial set of output files or temporary files; this is not an atomic multi-file transaction. Hard-link support is required. Shell redirection bypasses these safeguards and can overwrite a file before the CLI starts.

## Limits

Input: 25 MiB after UTF-8 encoding. Entry count: 25,000. Page count: 5,000. Supported optional collections: 10,000 items per field. URL length: 65,536 characters. Durations/relative date span: 366 days. Numeric sizes must be finite safe integers; content size is non-negative, and unknown header/body sizes may be -1. The sum of extremely large individually valid sizes may exceed precise JavaScript integer representation; do not treat hostile/invented size metadata as accounting data.

JSON parsing is whole-buffer, not streaming. Limits contain but do not eliminate resource-exhaustion risk. Use the CLI for captures on memory-constrained browsers. The API's input contract is JSON-parsed data, not arbitrary executable objects.

## Deployment and maintenance

The default distribution is a static file. scripts/serve.mjs binds only to 127.0.0.1, accepts GET/HEAD for the app, rejects other methods and paths, and serves no repository files. Pages deployment is optional and manually dispatched. Workflow actions are pinned to source revisions and use scoped permissions. Remote CI and deployment outcomes must be checked after publication.
