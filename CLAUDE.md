# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Threat Tiger is an offline-first, client-side threat-modelling app: an architecture canvas
(processes, data stores, external entities, trust zones/boundaries), live trust-boundary
analysis, a curated library of 244 threats with ranked suggestions, a STRIDE threat register,
insights, history and many export formats. **The whole app is one file, `threat-tiger.html`**
(HTML, CSS and vanilla JS, ~11k lines), with Bootstrap, Bootstrap Icons and Font Awesome vendored
in `vendor/`. No build step, no backend. Demo on GitHub Pages; also hosted as a copy on 1z.nu.

## Commands

```sh
npm install                    # dev only: Playwright
npm test                       # Playwright end-to-end tests in installed Microsoft Edge
PW_CHANNEL=chrome npm test     # use Chrome instead
npm run serve                  # http://127.0.0.1:4173/threat-tiger.html
npm run sync                   # REQUIRED after editing the inline script or threat_templates.json
npm run sync -- --check        # exit 1 if generated parts are out of date (tests use this)
docker build -t threat-tiger . && docker run -d -p 8080:8080 threat-tiger
PW_BASE_URL=http://127.0.0.1:8080 npm test   # test the running container
```

## Things that must stay in sync (`npm run sync`)

`scripts/sync.mjs` maintains generated parts of `threat-tiger.html`:
1. the embedded copy of `threat_templates.json` (fallback for offline / `file://` use);
2. the Content-Security-Policy `script-src` hash of the main inline script, so **any edit to the
   inline script breaks the app until you run `npm run sync`**;
3. verification of vendored files against `vendor/checksums.json`.

## Layout

- `threat-tiger.html`: the app. `APP_VERSION` inside it is the version (shown in Help & License,
  written to exported JSON as `appVersion`). Bump it and add a `CHANGELOG.md` entry per release;
  keep `package.json` `version` equal.
- `threat_templates.json`: the threat library (format documented in `docs/threat-templates.md`).
- `demo.json`: the demo model.
- `tests/*.spec.js`: Playwright suites (smoke, import, XSS, a11y, perf, regressions, per-version
  and per-stage features). `tests/helpers.js` holds shared helpers.
- `Dockerfile` + `deploy/nginx.conf`: unprivileged nginx with security headers, base image pinned
  by digest, files root-owned and read-only.

## Rules

- **Data never leaves the browser.** Models live in localStorage, History in IndexedDB. No
  network requests except loading images an imported model references, and only after asking.
- **Imported models and templates are untrusted:** never render them via `innerHTML` without
  escaping; the XSS suite (`tests/xss.spec.js`) must keep passing.
- Keep it a single self-contained file with vendored assets: no CDNs, no build step.
- Finding IDs in the changelog (SEC-001, BUG-002, …) refer to the November 2026 audit report;
  add a regression test for every fixed finding.
- `1z.nu` hosts copies of `threat-tiger.html` and `threat_templates.json`. Update them after a
  release.

## App standards

This repo follows the app standards in `~/Desktop/code/tools/standards/STANDARDS.md` (rule IDs,
severities; decisions and waivers in `.claude-standards`). `claude-check --repo .` checks it.

```sh
npm ci && npm run lint   # ESLint (dev-only), incl. the no-unsanitized rule; CI runs it too
npm test                 # the tests CI runs
```

Unsafe DOM sinks are lint errors. ESLint lints the `.js`/`.mjs` files (tests and scripts); the app
itself is inline in `threat-tiger.html`, which ESLint doesn't read, so keep escaping there by hand.
