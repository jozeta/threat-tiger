#!/usr/bin/env node
// Keeps generated parts of threat-tiger.html in sync. Run after editing the app script or the templates:
//   npm run sync          rewrite threat-tiger.html
//   npm run sync -- --check   exit 1 if anything is out of date (used by tests and CI)
//
// It maintains:
//   1. the embedded copy of threat_templates.json (fallback for offline / file:// use)
//   2. verification of vendored files against vendor/checksums.json
//   3. the Content-Security-Policy, whose script-src contains the SHA-256 of the main inline script
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const htmlPath = path.join(root, 'threat-tiger.html');
const check = process.argv.includes('--check');

const original = readFileSync(htmlPath, 'utf8');
let html = original;

// 1. Embedded templates (minified; "</" escaped so the JSON can never close the script element).
const templates = JSON.stringify(JSON.parse(readFileSync(path.join(root, 'threat_templates.json'), 'utf8'))).replace(/<\//g, '<\\/');
html = html.replace(
  /(<script type="application\/json" id="embedded-threat-templates">)[\s\S]*?(<\/script>)/,
  (_, open, close) => open + templates + close
);

// 2. Vendored files must match vendor/checksums.json (detects accidental or malicious edits).
//    SRI attributes are not used: browsers refuse SRI for file:// pages, which would break offline use.
const pins = JSON.parse(readFileSync(path.join(root, 'vendor/checksums.json'), 'utf8'));
for (const [file, expected] of Object.entries(pins)) {
  const actual = 'sha384-' + createHash('sha384').update(readFileSync(path.join(root, file))).digest('base64');
  if (actual !== expected) { console.error(`Vendored file changed: ${file}\n  expected ${expected}\n  actual   ${actual}`); process.exit(3); }
}

// 3. CSP with the hash of the main inline script (the only <script> without src or type).
const inline = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)];
if (inline.length !== 1) { console.error(`Expected exactly 1 inline <script>, found ${inline.length}`); process.exit(2); }
const scriptHash = 'sha256-' + createHash('sha256').update(inline[0][1], 'utf8').digest('base64');
const csp = [
  "default-src 'self'",
  `script-src 'self' '${scriptHash}'`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https: http:",   // custom images may be remote (the user is asked first on import)
  "font-src 'self' data:",
  "connect-src 'self' data: blob:",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
].join('; ');
html = html.replace(/(<meta http-equiv="Content-Security-Policy" content=")[^"]*(")/, `$1${csp}$2`);

if (html === original) { console.log('threat-tiger.html is up to date.'); process.exit(0); }
if (check) { console.error('threat-tiger.html is out of date. Run: npm run sync'); process.exit(1); }
writeFileSync(htmlPath, html);
console.log('Updated threat-tiger.html (templates, CSP).');
