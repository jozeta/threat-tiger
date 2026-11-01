# Vendored front-end assets

Threat Tiger loads everything from this folder so it works offline and does not depend on any CDN (audit findings SEC-004, ARCH-006).
Files are unmodified copies of the official releases.

| Package | Version | Source | License |
|---|---|---|---|
| Bootstrap (CSS + JS bundle) | 5.3.2 | https://cdn.jsdelivr.net/npm/bootstrap@5.3.2/dist/ | MIT |
| Bootstrap Icons (CSS + woff2/woff) | 1.13.2 | https://cdn.jsdelivr.net/npm/bootstrap-icons@1.13.2/font/ | MIT |
| Font Awesome Free (CSS + woff2) | 6.5.1 | https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.1/ | Icons CC BY 4.0, fonts SIL OFL 1.1, code MIT |

`checksums.json` pins a sha384 hash for every file here; `npm run sync -- --check` (also run by the tests) fails if any file changes. The Bootstrap bundle's hash (`sha384-C6RzsynM9kWDrMNeT87bh95OGNyZPhcTNXj1NW7RuBCsyN/o0jlpcV8Qyq46cDfL`) matches the hash published by Bootstrap for 5.3.2.

Only `.woff2`/`.woff` font files are included; the `.ttf` fallbacks referenced by Font Awesome's CSS are omitted (all supported browsers use woff2).

## Upgrading
1. Download the new files into a new versioned folder (e.g. `bootstrap-5.3.8/`).
2. Update the `<link>`/`<script>` paths in `threat-tiger.html` and the font paths in `getEmbeddedStylesheetsCssText()`.
3. Regenerate `checksums.json` for the new files, run `npm run sync` (updates the CSP hash) and `npm test`.
