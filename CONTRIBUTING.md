# Contributing to TraceTidy

Use Node.js 22+ for the CLI, build, and core tests. There is no runtime dependency installation step. Optional browser tests use Python 3.10+ and the pinned Playwright version in requirements-dev.txt.

```sh
npm run verify
python -m pip install -r requirements-dev.txt
python -m playwright install chromium
npm run test:browser
```

## Changes we can review effectively

Start with a concrete debugging or accessibility problem. Make a focused change and add a regression test. Explain exactly which data the output retains before and after your change. Do not add dependencies, network calls, storage, or new retained fields without discussing the tradeoff first.

Update web/ source rather than editing dist/index.html by hand; run npm run build and commit the regenerated distribution. Builds are deterministic. Keep assertions about privacy narrow and testable. Avoid naming any processed capture or original value in logs, errors, audits, or analytics.

Use only invented fixtures. Do not scrub a production trace and assume it is suitable for committing: subtle retained metadata can still disclose information. Start from the synthetic demo or write a minimal artificial HAR instead.

## Structure and testing

Core and CLI tests use Node's built-in test runner. The browser suite is in tests/browser and uses unittest plus Playwright. It supports Chromium, Firefox, and WebKit, and HTTP, file, or document transport. State exactly what you tested. Document transport tests functionality/CSP but not browser navigation or hosting.

The release-manifest.json describes the prepared release. After reviewed source and documentation changes, regenerate it with node scripts/manifest.mjs. Never use that command to legitimize unreviewed added captures. Review the manifest diff before publication.

## Good first contributions

Add a fictional HAR variant for a real exporter behavior; improve a screen-reader label or focus flow; add a regression for normalization; or improve a concise example. Retention changes and browser compatibility fixes need tests, not just screenshots.

Open security concerns through the process in SECURITY.md. Follow CODE_OF_CONDUCT.md. Tests reduce risk; they do not justify claiming that the project is bug-free.
