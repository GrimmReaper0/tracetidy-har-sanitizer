# A seven-day launch experiment

The objective is useful adoption and reproducible feedback. **1,000 stars in a week is a stretch goal, not a deliverable, forecast, or promise.** No metadata guarantees discovery, and no test suite proves zero bugs.

## Positioning

**Name:** TraceTidy  
**Repository:** `tracetidy-har-sanitizer`  
**One-line pitch:** **Share the trace. Not the secrets. An offline HAR sanitizer with a waterfall and debugging briefs.**

Recommended About description:

> Offline HAR sanitizer + waterfall viewer + debugging briefs. Remove headers, cookies, bodies, and URL data locally. No uploads. Zero runtime dependencies.

Recommended topics: `har`, `har-sanitizer`, `har-viewer`, `privacy`, `offline`, `devtools`, `network-debugging`, `redaction`, `bug-report`, `javascript`.

The README uses natural search phrases rather than keyword stuffing. Use a screenshot from the fictional demo as the social preview. Never fabricate adoption badges, download counts, security endorsements, testimonials, or usage metrics.

## Show the value in 30 seconds

Open the offline app, click **Try the demo**, and show the headers/body removal count. Filter failed requests to reveal the 503, 401, and status-zero requests. Open a sanitized request. Switch to the debugging brief and download the cleaned HAR. End on the warning that metadata remains.

Do not record production traffic. Make the demo's synthetic nature visible. Do not market the redaction count as a count of actual secrets or imply that TraceTidy detects every credential.

## Day-by-day plan

| Day | Deliverable | What to learn |
| --- | --- | --- |
| 1 | Publish, confirm CI, test the public download on a separate machine, enable private vulnerability reporting | Can a first-time user succeed without help? |
| 2 | Record the short demo and publish one maker-authored launch post | Does the privacy/problem statement make sense? |
| 3 | Ask a small relevant group of developer/support peers for workflow feedback | Would they use this on support handoffs, and what is missing? |
| 4 | Fix the top reproducible friction points and add regression tests | Are failed attempts decreasing? |
| 5 | Publish a practical walkthrough using only fictional HAR data | Which use case produces repeat use? |
| 6 | Share the walkthrough in relevant communities that permit it; disclose authorship | Which audience values it without fake engagement? |
| 7 | Publish an honest first-week changelog, known issues, and next priorities | Is there evidence to continue, narrow, or change the project? |

Respect each community's rules. Avoid duplicate blasts, unsolicited bulk messages, star exchanges, bought stars, sockpuppets, or artificial discussions. Answer substantive questions and report fixes instead of repeating promotional claims.

## Draft launch post

**Title:** I built an offline HAR sanitizer that keeps the waterfall and drops the payloads

When debugging moves from a browser to a support ticket, a network capture can carry more data than the conversation needs. I built TraceTidy to create a smaller, reviewable handoff.

It is one self-contained HTML file, with no uploads or account. The default profile removes all headers, cookies, and bodies; aliases hosts, paths, and query names; and keeps timing/status metadata. There is also a CLI, a waterfall viewer, a counts-only audit, and a Markdown debugging brief.

It is deliberately not a replay tool or an anonymity guarantee. Diagnostic mode keeps readable URLs, and even private output retains request patterns and sizes. The README explains the tradeoffs.

The demo uses entirely fictional traffic. Feedback from developers and support engineers on what information a useful handoff should preserve is especially valuable.

**Repository:** https://github.com/GrimmReaper0/tracetidy-har-sanitizer

Add a live-demo URL only after a Pages deployment has actually succeeded.

## Measure, do not invent

Track observed repository visits, stars, substantive issues with reproducible examples, successful first-run feedback, and returning contributors where those metrics are available. TraceTidy intentionally has no in-app analytics, so do not claim product usage data that is not measured.
