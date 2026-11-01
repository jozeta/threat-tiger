// Shared helpers for Threat Tiger end-to-end tests.
const fs = require('node:fs');
const path = require('node:path');
const { expect } = require('@playwright/test');

const ROOT = path.resolve(__dirname, '..');
const DEMO = JSON.parse(fs.readFileSync(path.join(ROOT, 'demo.json'), 'utf8'));
const SESSION_KEY = 'stride_workbench_session_manifest_v26';

/** Collects uncaught page errors so tests can assert none happened. */
function trackPageErrors(page) {
  const errors = [];
  page.on('pageerror', (err) => errors.push(err.message));
  return errors;
}

/**
 * Opens the app in test mode: license pre-accepted, no operator prompt.
 * `session` (optional) is written to localStorage before the app boots.
 */
async function openApp(page, { session } = {}) {
  await page.addInitScript(([key, value]) => {
    // Only seed once per test so reloads keep whatever the app persisted.
    if (sessionStorage.getItem('__seeded')) return;
    sessionStorage.setItem('__seeded', '1');
    localStorage.clear();
    localStorage.setItem('license_accepted', 'true');
    if (value) localStorage.setItem(key, value);
  }, [SESSION_KEY, session ? JSON.stringify(session) : null]);
  await page.goto('/threat-tiger.html?test=true');
  await page.waitForFunction(() => window.app && window.app.state);
}

/** Deep copy of demo.json with an operator set, optionally modified. */
function demoSession(mutate) {
  const s = JSON.parse(JSON.stringify(DEMO));
  s.activeUser = 'Tester';
  if (mutate) mutate(s);
  return s;
}

/** Clicks a control; opens the main (hamburger) menu first when the control lives inside it. */
async function clickControl(page, selector) {
  const inMenu = await page.locator(`.dropdown-menu ${selector}`).count();
  if (inMenu && !(await page.locator(selector).isVisible())) await page.click('#btn-main-menu');
  await page.click(selector);
}

/** Imports a JSON string through the real "Import JSON" button and file chooser. */
async function importJson(page, text) {
  const [chooser] = await Promise.all([
    page.waitForEvent('filechooser'),
    clickControl(page, '#btn-import'),
  ]);
  await chooser.setFiles({ name: 'model.json', mimeType: 'application/json', buffer: Buffer.from(text) });
  await page.waitForTimeout(300);
}

/** Clicks a button that triggers a download and returns the downloaded text. */
async function downloadText(page, selector) {
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    clickControl(page, selector),
  ]);
  const file = await download.path();
  return fs.readFileSync(file, 'utf8');
}

/** Rows of the threat register that represent threats (excludes the empty-state row). */
async function registerRows(page) {
  return page.locator('#threat-register-tbody tr:has(td:nth-child(2))');
}

module.exports = { clickControl, DEMO, SESSION_KEY, trackPageErrors, openApp, demoSession, importJson, downloadText, registerRows, expect };
