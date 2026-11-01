// SEC-004 / ARCH-006: generated parts of the page (CSP hash, SRI, embedded templates) must be current,
// and the app must not depend on any external host.
const { test } = require('@playwright/test');
const { execFileSync } = require('node:child_process');
const path = require('node:path');
const { expect, openApp, trackPageErrors } = require('./helpers');

test('npm run sync has been run (CSP hash, SRI and embedded templates are current)', () => {
  // Throws (fails the test) when the check exits non-zero.
  execFileSync(process.execPath, [path.join(__dirname, '..', 'scripts', 'sync.mjs'), '--check'], { stdio: 'pipe' });
});

test('the app loads no resources from other hosts', async ({ page }) => {
  const external = [];
  page.on('request', (req) => { const u = new URL(req.url()); if (!['127.0.0.1', 'localhost'].includes(u.hostname) && !u.protocol.startsWith('data') && !u.protocol.startsWith('blob')) external.push(req.url()); });
  await openApp(page);
  await page.waitForLoadState('networkidle');
  expect(external).toEqual([]);
});

test('the Content-Security-Policy blocks injected inline scripts but not the app', async ({ page }) => {
  const errors = trackPageErrors(page);
  const violations = [];
  await page.exposeFunction('__reportCsp', (v) => violations.push(v));
  await page.addInitScript(() => document.addEventListener('securitypolicyviolation', (e) => window.__reportCsp(e.violatedDirective)));
  await openApp(page);
  await page.evaluate(() => { const d = document.createElement('div'); d.innerHTML = '<img src=x onerror="window.__cspBypass = 1">'; document.body.appendChild(d); });
  await page.waitForTimeout(300);
  expect(await page.evaluate(() => window.__cspBypass)).toBeUndefined();
  expect(violations.some((v) => v.startsWith('script-src'))).toBe(true);
  expect(errors).toEqual([]);
});

test('works offline from file:// with embedded templates', async ({ page }) => {
  const errors = trackPageErrors(page);
  const fileUrl = 'file://' + path.resolve(__dirname, '..', 'threat-tiger.html');
  await page.goto(fileUrl);
  await page.waitForFunction(() => window.app && window.app.state);
  await page.waitForTimeout(500);
  const r = await page.evaluate(() => ({
    templates: app.threatSuggestions.process.length,
    iconsFont: getComputedStyle(document.querySelector('.bi'), '::before').fontFamily,
    iconsLoaded: [...document.fonts].some((f) => f.family === 'bootstrap-icons' && f.status === 'loaded'),
    bootstrap: typeof window.bootstrap,
  }));
  expect(r.templates).toBeGreaterThan(0);
  expect(r.iconsFont).toContain('bootstrap-icons');
  expect(r.iconsLoaded).toBe(true);
  expect(r.bootstrap).toBe('object');
  expect(errors).toEqual([]);
});
