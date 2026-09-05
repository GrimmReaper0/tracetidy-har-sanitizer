# Security policy and threat model

TraceTidy reduces what a HAR discloses. It does not prove that an output is safe to publish, certify compliance, or guarantee anonymity.

## What the default profile protects

The sanitizer constructs new objects from permitted fields. It does not clone the input and then search for known secret names. All headers, cookie records, bodies, unknown extensions, cache details, comments, and original page/creator labels are dropped. Private mode substitutes hosts, path segments, and query names; all modes replace query values and remove URL credentials/fragments. HTTP methods, HTTP versions, and MIME categories use fixed accepted values rather than arbitrary strings. Missing/invalid fields are normalized and noted.

Reports contain fixed category labels and counts, not original values, unknown field names, original filenames, or alias lookup tables. The UI uses text nodes, not HTML parsing, to display retained strings. Its Content Security Policy permits the exact built inline script, local worker blobs, and inline styles, while denying connection APIs, remote assets, forms, base changes, and plugins.

The CLI bounds input, refuses existing output files/symlinks, and does not include JSON/URL parse fragments in error messages. The single HTML application has no analytics, network-fetch logic, local storage, or service worker.

## What remains and can still disclose information

Timing, order, request counts, byte sizes, protocol/MIME categories, statuses, methods, and repeated structure remain. Correlation, traffic analysis, a known dataset, or deliberately encoded numeric fields can reveal information. Alias substitution is not encryption or a formal anonymization scheme. Diagnostic mode additionally preserves hostnames, ports, paths, and query names. Treat those as potentially sensitive.

Large/deep or malicious JSON can consume resources even with a 25 MiB cap. Parsing is not streaming. Web Workers improve UI responsiveness but are not a security boundary against a compromised browser. The JavaScript API assumes JSON-parsed data: getters, proxies, or other executable object behavior are outside its input contract.

A compromised browser extension, OS, runtime, distribution file, or static host can bypass the application's protections. CSP does not protect against an attacker who can replace the HTML itself. Release-manifest hashes detect changes relative to the manifest, not authenticity if both are modified. Review source and obtain release files from a trusted location.

Clearing an in-memory capture is not secure erasure. Browser history, downloads, swap, clipboard managers, crash dumps, backups, and files produced by the CLI are beyond this tool's control. Temporary blob URLs used for downloads may remain for up to 30 seconds so the browser can start a save reliably.

HAR output is not suitable for authenticated replay, response-content analysis, exact header inspection, or full-fidelity round trips. Retained size fields describe the original capture, not the serialized cleaned file. Successful processing and a quiet audit are not a security approval.

## Reporting a vulnerability

Do not put production captures, live credentials, personal data, or confidential URLs in a public issue. Use a small synthetic reproducer.

Use GitHub's private vulnerability reporting feature when the repository's Security tab offers it. If that feature is not enabled, open a minimal, non-sensitive issue requesting a private reporting channel. Do not assume a private channel has been configured merely because this file exists. Maintainers should enable private reporting before broad promotion.

The initial maintained line is 1.x. No response-time or support-service guarantee is offered. Fixes should include a regression test and describe any effect on retained data.

## Maintainer checklist

Review source/build changes together, keep workflow dependencies pinned, use least-privilege workflow permissions, and re-run canary and browser tests whenever a new field is retained. Reject real captures in contributions. Confirm the published build matches the reviewed source. Do not label a release bug-free or claim that testing proves anonymity.
