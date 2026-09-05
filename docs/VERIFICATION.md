# Verification snapshot

Prepared on 2026-09-05. These are measured checks, not claims of universal correctness.

## Executed local checks before publication

| Check | Result |
| --- | --- |
| Node unit/integration suite | **108 passed, 0 failed, 0 skipped** |
| Generated canary/immutability cases | **1,000 cases**, contained in five Node tests |
| Chromium browser suite | **24 passed** |
| TypeScript declaration checks | Passed with strict checking and expected-error assertions |
| Dependency-free deterministic build | Passed; exact generated script hash matches CSP |
| Syntax checks | Passed for source, worker, CLI, scripts, and Node tests |
| npm tarball | Created; installed offline into a fresh directory; CLI version and 12-request demo verified |
| Local static server | GET/HEAD, no-cache headers, method rejection, and file-isolation integration tests passed |

### Measured coverage

Node's built-in coverage run reported **100% lines, 96.55% branches, and 100% functions for `src/core.js`**. The CLI reported **95.12% line coverage**. Whole-run coverage includes test and helper files and must not be confused with core coverage.

Coverage measures execution, not correctness. It does not cover every possible capture, platform, browser version, timing race, or adversarial encoding. No claim of “bug-free” or “100% safe” is made.

## Local test environment

- Node.js v22.16.0, Linux x64.
- Chromium 144.0.7559.96 with Playwright Python 1.57.0.
- TypeScript 5.8.3 for declaration tests.
- Browser transport: **document**, loading the unchanged distribution HTML through Playwright `page.set_content` with its CSP active.

The managed local Chromium environment blocked navigation to local file and localhost URLs. Browser functionality was therefore verified using the unchanged HTML inserted into a page. Tests also put that page offline and verified processing without HTTP(S) requests. The Node server was exercised separately through HTTP integration tests.

This local snapshot does **not** validate the initial file-open/navigation experience or a deployed host. The repository's GitHub Actions matrix separately exercises localhost HTTP transport on public CI.

## Important cases exercised

Private URL aliasing; diagnostic retention warnings; removal of headers/cookies/bodies and arbitrary extension fields; duplicate/empty query parameters; URL credentials/fragments; relative and cross-origin redirects; unsupported schemes; long URLs; malformed dates/numbers/collections; page remapping; prototype-related input keys; input immutability; empty captures; UTF-8 and size limits; and generic errors without source fragments.

CLI tests cover stdin/stdout separation, multiple outputs, restrictive permissions on Linux, existing-file refusal, symlinks, duplicate paths, staging cleanup, invalid arguments, input/output paths with spaces, and installed-package execution.

Browser tests cover actual HAR/audit/Markdown downloads, file selection, reset, stale output removal after errors, profile switching, sorting, search, failure filtering, pagination, keyboard tabs, modal dismissal, clipboard failure fallback, markup-like input, multiple-file rejection, offline operation after load, and no document overflow at 360, 390, 768, and 1440 CSS pixels. These are functional/accessibility checks, not a WCAG audit or certification.

## Measured local benchmark

A synthetic 10,000-request capture was parsed, minimized, and serialized five times. Median measured pipeline time was **168.9 ms** in the local environment. Input was **12,565,481 bytes** and compact output **5,455,402 bytes**. This excludes filesystem I/O and rendering. See `benchmark.json` for all observations and `npm run benchmark` to reproduce a new local measurement.

This is not a cross-platform throughput claim or comparison with another tool.

## Reproduce

```sh
npm run verify
npm run test:coverage
npm run test:types  # TypeScript 5.8.3 must be available

python -m pip install -r requirements-dev.txt
python -m playwright install chromium
npm run test:browser
```

For a managed environment that only permits document rendering, set `TRACETIDY_TEST_TRANSPORT=document` and, when necessary, `TRACETIDY_BROWSER_EXECUTABLE` to its installed browser. Document the transport in any reported results rather than presenting it as a hosted-site test.

After publication, treat GitHub Actions as a separate verification source: configured jobs are not considered passing until their actual runs complete successfully.
