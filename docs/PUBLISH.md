# Publishing and release operations

TraceTidy is designed so publication is deliberate and auditable. The repository is public at `GrimmReaper0/tracetidy-har-sanitizer`; normal development should happen through reviewed commits or pull requests, with CI passing before promotion.

## Pre-release checklist

```sh
npm run verify
npm run test:coverage
npm run test:types
python -m pip install -r requirements-dev.txt
python -m playwright install chromium
npm run test:browser
npm run benchmark
node scripts/manifest.mjs
```

Review the generated `release-manifest.json`, the README privacy claims, the diff of `dist/index.html`, and the fictional `examples/demo.har`. Never add a production capture to the repository.

## Generated artifacts

`npm run build` deterministically generates:

- `dist/index.html` — the self-contained browser distribution.
- `examples/demo.har` — the synthetic demo capture.

The build embeds the worker, core sanitizer, styles, and demo, then calculates the shipped inline script's CSP hash. CI rebuilds these files and rejects a diff.

`node scripts/manifest.mjs` records SHA-256 hashes for release files. The manifest is an integrity aid relative to the reviewed manifest; it is not a signature or authenticity guarantee.

## Repository metadata

Recommended description:

> Offline HAR sanitizer + waterfall viewer + debugging briefs. Remove headers, cookies, bodies, and URL data locally. No uploads. Zero runtime dependencies.

Recommended topics: `har`, `har-sanitizer`, `har-viewer`, `privacy`, `offline`, `devtools`, `network-debugging`, `redaction`, `bug-report`, `javascript`.

Only set a homepage after a real Pages deployment succeeds. Use a screenshot generated from the fictional demo for the repository social preview.

## GitHub Pages

Pages is deliberately opt-in. The included `.github/workflows/pages.yml` uses GitHub's Pages actions and first runs `npm run verify`. In repository settings, choose **Pages → Build and deployment → GitHub Actions**, then manually dispatch the Pages workflow.

Do not advertise a live-demo URL until the deployment workflow completes successfully. A hosted page still makes an ordinary initial request to its host; capture processing itself has no upload/API path.

## npm packaging

The package metadata is ready for local packing and installation:

```sh
npm pack --ignore-scripts
npm install --global ./tracetidy-har-sanitizer-1.0.0.tgz --ignore-scripts
tracetidy --version
```

Publishing to an npm registry is a separate maintainer decision and is not implied by the repository version number. Verify ownership, package naming, provenance settings, and the tarball contents before any registry publication.

## Security settings after launch

Enable private vulnerability reporting in the repository Security settings. Consider branch protection/rulesets after the initial CI matrix has demonstrated that it works on the public repository. Keep GitHub Actions dependencies pinned and use least-privilege workflow permissions.

Do not claim a release is bug-free, anonymous, certified, or safe to share without review. Tests and coverage establish executed behavior, not universal correctness.

## Recovery

If a generated-file check fails, rebuild from reviewed source rather than hand-editing `dist/index.html`. If CI uncovers a platform-specific defect, reproduce it with synthetic data, add a regression test, and document the affected environment.

If Pages fails, leave the repository release usable through the downloadable offline HTML and CLI while diagnosing the deployment. Do not replace working privacy safeguards merely to satisfy a hosting constraint.
