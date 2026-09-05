# TraceTidy

### Share the trace. Not the secrets.

**An offline HAR sanitizer, network waterfall viewer, and debugging-brief generator.**

Remove headers, cookies, bodies, and URL data before handing a browser capture to a teammate, support ticket, or debugging assistant. Review what remains, then export a cleaned HAR or a ready-to-edit issue brief.

**Local processing. One self-contained HTML file. Zero runtime dependencies. MIT licensed.**

![TraceTidy displaying its fictional demo capture, redaction counts, and network waterfall](docs/screenshot.png)

## Try it in a minute

**Browser:** download `dist/index.html` from this repository and open the saved file in a modern browser. Click **Try the demo** for 12 fictional requests. No account, API key, build step, or internet connection is needed to process captures.

Some managed browsers prohibit opening local HTML or creating workers. Use the local server or CLI in that case:

```sh
# Node.js 22 or newer
npm start
# Open the localhost address printed in the terminal.
```

**Command line:** run directly from a checkout or extracted source archive:

```sh
node bin/tracetidy.js examples/demo.har -o demo.cleaned.har

# A cleaned capture, a counts-only audit, and an issue-ready brief
node bin/tracetidy.js capture.har -o capture.cleaned.har \
  --report capture.audit.json --markdown capture.brief.md
```

No `npm install` is necessary to run the CLI, build the app, or run Node tests. Installation from an npm registry is not assumed. To add the CLI to your own PATH:

```sh
npm install --global . --ignore-scripts
tracetidy --help
```

## Why it exists

A useful debugging handoff does not always need the original payload. [Chrome's HAR export documentation](https://developer.chrome.com/docs/devtools/network/reference/#save-all-as-har) describes its sanitized export as excluding sensitive headers such as cookies and authorization. TraceTidy offers a more aggressively minimized, inspectable handoff: drop *all* headers and bodies, optionally alias URLs, and retain the timing/status evidence needed to discuss a failure.

TraceTidy does **not** try to identify every secret using regular expressions. It constructs a new HAR from a small set of allowed fields. Unknown browser extensions and metadata are not copied. This trades debugging fidelity for less disclosure.

### Three artifacts from one capture

| Artifact | Useful for |
| --- | --- |
| Cleaned `.har` | Inspecting request order, timings, sizes, methods, status codes, and relationships |
| Counts-only `.audit.json` | Reviewing which categories were removed or replaced, without original values |
| Debugging `.md` brief | Starting an issue with slowest requests, failures, observed statistics, and reproduction prompts |

The browser includes filtering, failure-only views, sorting, pagination, sanitized request details, and a waterfall. Large captures are processed in a Web Worker rather than on the UI thread. Only 50 request rows are rendered per page.

## Privacy profiles

| Field | Private (default) | Diagnostic (explicit opt-in) |
| --- | --- | --- |
| Request and response headers | Removed, including names | Removed, including names |
| Cookie objects | Removed | Removed |
| Request bodies, response bodies, form parameters, filenames | Removed | Removed |
| Query **values**, in URLs and HAR query arrays | Replaced with `REDACTED` | Replaced with `REDACTED` |
| Hostnames, ports, path segments, query **names** | Replaced with within-file aliases; ports removed | **Preserved: may contain sensitive data** |
| URL credentials and fragments | Removed | Removed |
| Redirect targets | Same URL policy; relative targets resolved first | Same URL policy |
| Original capture timestamps | Shifted to a synthetic epoch | Shifted to a synthetic epoch |
| Page titles and IDs | Generic labels, references remapped | Generic labels, references remapped |
| Server IP fields, connection IDs, cache details, initiators, comments, unknown extensions | Removed | Removed |
| Methods, status codes, timings, byte counts, recognized MIME/HTTP versions | Preserved or normalized | Preserved or normalized |

```text
Input (fictional):
https://alice:demo-password@api.example.test/users/alice?token=demo-token#private

Private:
https://host-1.invalid/p1/p2?q1=REDACTED

Diagnostic:
https://api.example.test/users/alice?token=REDACTED
```

**Minimized does not mean anonymous.** Timing, request counts, sizes, status, MIME categories, and repeated structure remain. These can identify activity. Diagnostic mode also retains readable URLs, including potentially sensitive hostnames, paths, and query names. Always review the export before sharing it.

No alias lookup table is exported. Aliases are stable only within each processing operation, not cryptographic anonymization. All raw text remains local to the browser/CLI process; clearing the app releases its references but does not promise secure memory erasure. Downloads and clipboard contents are outside the app's memory lifecycle.

## CLI examples

```sh
# Default private profile; output is clean JSON on stdout
node bin/tracetidy.js capture.har > capture.cleaned.har

# Redact payloads but keep readable URLs: review them carefully
node bin/tracetidy.js capture.har --mode diagnostic -o readable.cleaned.har

# Read UTF-8 HAR JSON from stdin; diagnostics stay on stderr
cat capture.har | node bin/tracetidy.js - --compact > compact.cleaned.har

# No summary on stderr (errors are still reported)
node bin/tracetidy.js capture.har --quiet -o quiet.cleaned.har
```

Existing output files and symlinks are refused. There is intentionally no `--force`. Writes are staged, then linked without replacing an existing destination. On supported systems new output files use owner-only permissions. The output filesystem must support hard links; common local filesystems do, but some removable/network filesystems do not. Use stdout redirection on those systems, noting that **shell redirection can overwrite a file before TraceTidy runs**.

Exit codes: `0` success, `1` I/O failure, `2` invalid arguments, input, or an existing destination. Multi-file publication is best-effort transactional, not atomic across a crash. See [architecture and limits](docs/ARCHITECTURE.md).

## JavaScript API

```js
import { readFile } from 'node:fs/promises';
import { parseHar, sanitizeHar, toMarkdown } from './src/core.js';

const input = parseHar(await readFile('capture.har', 'utf8'));
const result = sanitizeHar(input, { mode: 'private' });

console.log(result.summary.totalRequests);
console.log(result.report.removed.headers);
// result.har is the minimized HAR. Input is not mutated.
const issueDraft = toMarkdown(result);
```

The ESM entry point includes TypeScript declarations. `parseHar` applies the byte limit and avoids exposing JSON snippets in errors. `sanitizeHar` accepts JSON-parsed data, not arbitrary objects with getters or proxies. `toMarkdown` expects the result of `sanitizeHar`, not an unprocessed capture.

## Limits and deliberate non-features

- Maximum input: **25 MiB**, **25,000 requests**, **5,000 pages**, and **10,000 items per supported optional collection**. Oversized input is rejected, not silently truncated. URLs longer than 65,536 characters and unsupported schemes are replaced.
- Only HTTP(S) and WebSocket URLs are retained as URLs. Other schemes, including data/file URLs, are replaced. Durations/relative timestamp spans beyond 366 days and malformed numeric fields are normalized with audit warnings.
- This is not a replay tool, secret-scanning certificate, packet analyzer, or full-fidelity HAR editor. All bodies and headers are removed even when they would be useful to debug an authentication, cookie, caching, GraphQL, or CORS problem.
- The brief reports observations, not root cause. Status 0 can represent different failure/cancellation conditions. Request span is not page load time. p95 uses the nearest-rank definition.

Audit counts are **operations, not unique secrets**. A value may occur both in a URL and a HAR query array. Unknown metadata is counted at each discarded field boundary, not recursively. Do not use the count as a security score.

## Develop and verify

```sh
npm run build          # deterministic, dependency-free single-file build
npm run check          # syntax checks
npm test               # core, CLI, build, server, and publisher dry-run tests
npm run test:coverage  # Node's built-in coverage report
npm run test:types     # optional: requires TypeScript 5.8.3 on PATH
npm run benchmark      # synthetic 10,000-request benchmark
npm run verify         # build + check + Node tests
```

Optional real-browser tests:

```sh
python -m pip install -r requirements-dev.txt
python -m playwright install chromium
npm run test:browser
```

The browser test suite defaults to a temporary local HTTP server. It also supports `TRACETIDY_TEST_TRANSPORT=file` or `document`, and `TRACETIDY_BROWSER=firefox` or `webkit` when those engines are installed. Document transport inserts the unchanged distribution HTML and honors its CSP; it does not test URL navigation.

GitHub Actions is configured for Node 22/24 on Linux, Windows, and macOS, plus Chromium, Firefox, and WebKit on Linux. **A configured matrix is not a claim that every platform has passed.** See [the actual verification snapshot](docs/VERIFICATION.md) for what was executed for this release.

## Repository map

```text
src/          Portable sanitization engine + TypeScript declarations
bin/          CLI with stdin/stdout support and no-clobber file output
web/          Accessible interface, styles, and worker source
dist/        Generated self-contained app (no remote assets)
examples/     Fictional, reproducible demo capture
scripts/      Build, local server, benchmark, manifest, publishing helper
tests/        Node tests and optional Playwright browser tests
docs/         Threat model, verification, launch, and publishing guides
.github/      Pinned CI/Pages workflows and contribution templates
```

## Publish or self-host

The source archive includes an account-checked helper to create a **new public** repository, stage only manifest-listed release files, push, and apply topics. It must be run on a machine with an authenticated GitHub CLI; it does not embed credentials.

```sh
gh auth login --web --git-protocol https --scopes workflow
node scripts/publish.mjs --dry-run
node scripts/publish.mjs --pages
```

The prepared default owner is `GrimmReaper0`. The script refuses another signed-in identity, an existing target repository, or an existing `origin` remote. See [publishing instructions and recovery](docs/PUBLISH.md). Pages is optional and opt-in; the app can also be served by any static host. Hosted-page requests go to that host, but capture processing has no upload/API path.

## Contribute

Useful contributions include synthetic browser-specific fixtures, missing regression tests, accessibility fixes, and clearer explanations of retained data. Read [CONTRIBUTING.md](CONTRIBUTING.md) and the [security policy](SECURITY.md). **Never attach a real customer or production HAR to an issue.**

A star is appreciated when the project is useful. More importantly, report a reproducible problem using fictional data.

## License

[MIT](LICENSE). Copyright (c) 2026 GrimmReaper0. No claim of affiliation with browser vendors or GitHub.
