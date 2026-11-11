// Coverage: a performance budget for a large model through the real UI, and pre-deploy tooling checks
// (repo lint, the inline app script under the same lint rules, one version number everywhere).
const { test } = require('@playwright/test');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const C = require('./cov-helpers');
const { expect } = C;

const ESLINT = C.ROOT + '/node_modules/.bin/eslint';
const slack = process.env.CI ? 3 : 1;

/** 400 components in 4 zones, 600 flows, 1200 threats, 60 mitigations. */
function largeModel() {
  const elements = [], flows = [], threats = [], mitigations = [];
  for (let z = 0; z < 4; z++) elements.push({ id: 'z' + z, type: 'boundary', name: 'Zone ' + z, x: z * 2700 - 20, y: -20, width: 2640, height: 2100 });
  for (let i = 0; i < 400; i++) {
    const type = ['process', 'datastore', 'interactor', 'process'][i % 4];
    elements.push({ id: 'n' + i, type, name: `${type} ${i}`, x: (i % 40) * 270, y: Math.floor(i / 40) * 200, width: 220, height: 80, secProps: { handlesSensitiveData: i % 7 ? 'false' : 'true', isCrownJewel: i === 399 ? 'true' : 'false' } });
  }
  for (let i = 0; i < 600; i++) {
    const s = i % 400, t = (i * 7 + 1) % 400;
    if (s === t) continue;
    flows.push({ id: 'f' + i, name: 'flow ' + i, sourceId: 'n' + s, targetId: 'n' + t, sourceAnchor: 'right', targetAnchor: 'left', points: [], secProps: { encrypted: i % 3 ? 'true' : 'false', authenticated: 'false' } });
  }
  for (let i = 0; i < 60; i++) mitigations.push({ id: 'mi-' + String(i + 1).padStart(3, '0'), title: 'Mitigation ' + i, status: ['Proposed', 'Implemented', 'Verified'][i % 3] });
  const cats = ['Spoofing', 'Tampering', 'Repudiation', 'Information Disclosure', 'Denial of Service', 'Elevation of Privilege'];
  for (let i = 0; i < 1200; i++) threats.push({ id: 'th-' + String(i + 1).padStart(4, '0'), title: 'Threat ' + i, category: cats[i % 6], elementId: 'n' + (i % 400), status: ['Open / Unmitigated', 'Partially mitigated', 'Mitigated / Resolved'][i % 3], likelihood: String(1 + (i % 5)), impact: String(1 + ((i * 3) % 5)), mitigationIds: i % 2 ? ['mi-' + String((i % 60) + 1).padStart(3, '0')] : [] });
  return { projectTitle: 'Large', activeUser: 'Perf', elements, flows, threats, mitigations };
}

test('performance: a large model imports, renders, fits, and shows Insights, the register and a Markdown report within budget', async ({ page }) => {
  test.setTimeout(90000);
  const errors = C.trackAllErrors(page);
  await C.emptyApp(page);
  const text = JSON.stringify(largeModel());
  const time = async (fn) => { const t = Date.now(); await fn(); return Date.now() - t; };
  const r = {};
  r.import = await time(async () => {
    const [chooser] = await Promise.all([page.waitForEvent('filechooser'), C.clickControl(page, '#btn-import')]);
    await chooser.setFiles({ name: 'large.json', mimeType: 'application/json', buffer: Buffer.from(text) });
    await page.waitForFunction(() => app.state.elements.length === 404 && document.querySelectorAll('#layers-nodes-group > [data-id]').length >= 400);
  });
  expect(await page.evaluate(() => [app.state.flows.length, app.state.threats.length, app.state.mitigations.length])).toEqual([600, 1200, 60]);
  r.fit = await time(async () => { await page.click('#btn-canvas-zoom-reset'); await page.evaluate(() => new Promise(requestAnimationFrame)); });
  r.insights = await time(async () => { await page.click('#tab-insights-trigger'); await expect(page.locator('#insights-content .insight-tile').first()).toBeVisible(); });
  await expect(page.locator('#insights-content')).toContainText('1200');
  r.register = await time(async () => { await page.click('#tab-register-trigger'); await page.selectOption('#filter-threat-severity', 'Critical'); await expect((await C.registerRows(page)).first()).toBeVisible(); });
  r.select = await time(async () => { await page.evaluate(() => app.handleElementSelectionEvent('n10')); await page.click('#tab-suggest-trigger'); await expect(page.locator('#box-threat-suggestions-list .template-card').first()).toBeVisible(); });
  r.markdown = await time(async () => { const md = await C.downloadText(page, '#btn-export-markdown'); expect(md).toContain('th-1200'); });
  r.undoDelete = await time(async () => {
    await page.locator('#canvas-svg').focus();
    await page.evaluate(() => { app.state.selectedElementIds = ['n5']; app.applySelectionRemoval(app.planSelectionRemoval()); });
    await page.click('#btn-undo');
    await page.waitForFunction(() => app.state.elements.some((e) => e.id === 'n5'));
  });
  console.log('[cov-perf]', JSON.stringify(r));
  expect(r.import).toBeLessThan(6000 * slack);
  expect(r.fit).toBeLessThan(1500 * slack);
  expect(r.insights).toBeLessThan(4000 * slack);
  expect(r.register).toBeLessThan(2000 * slack);
  expect(r.select).toBeLessThan(2000 * slack);
  expect(r.markdown).toBeLessThan(4000 * slack);
  expect(r.undoDelete).toBeLessThan(3000 * slack);
  expect(errors).toEqual([]);
});

test('tooling: npm run lint (ESLint over the repo) is clean', () => {
  const out = execFileSync(ESLINT, ['.', '-f', 'json'], { cwd: C.ROOT, encoding: 'utf8' });
  const results = JSON.parse(out);
  const problems = results.flatMap((r) => r.messages.filter((m) => m.severity === 2).map((m) => `${r.filePath}:${m.line} ${m.ruleId}`));
  expect(problems).toEqual([]);
});

/** Lints the main inline script of threat-tiger.html (which `eslint .` never reads) with the repo config. */
function lintInlineApp() {
  const html = fs.readFileSync(C.ROOT + '/threat-tiger.html', 'utf8');
  const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)];
  const body = scripts[scripts.length - 1][1];
  const offset = html.slice(0, scripts[scripts.length - 1].index).split('\n').length;   // line of <script>
  let out;
  try { out = execFileSync(ESLINT, ['--stdin', '--stdin-filename', 'threat-tiger-inline.js', '-f', 'json'], { cwd: C.ROOT, input: '/* global bootstrap */\n' + body, encoding: 'utf8' }); }
  catch (e) { out = e.stdout; }   // eslint exits 1 when it finds errors
  return JSON.parse(out)[0].messages.map((m) => ({ line: m.line - 2 + offset, rule: m.ruleId, severity: m.severity, message: m.message }));
}

test('tooling: the inline app script has no unreviewed innerHTML/outerHTML sinks (SEC-DOM-2 checked by ESLint, not by hand)', () => {
  const msgs = lintInlineApp();
  expect(msgs.filter((m) => m.rule === null && /Parsing error/.test(m.message))).toEqual([]);
  expect(msgs.filter((m) => (m.rule || '').startsWith('no-unsanitized'))).toEqual([]);
  expect(msgs.filter((m) => ['no-eval', 'no-implied-eval', 'no-new-func'].includes(m.rule))).toEqual([]);
});

test('tooling: the inline app script has no ESLint errors (dead duplicate methods, undefined names)', () => {
  // BUG: threat-tiger.html:9263 defines ruleHelpers() and threat-tiger.html:9313 defines it again (no-dupe-class-members);
  // the first copy is dead code that silently differs (no subtypes/analysis helpers). Also threat-tiger.html:3723 has a
  // useless escape. `npm run lint` passes only because it never reads the inline script.
  test.fail();
  const errors = lintInlineApp().filter((m) => m.severity === 2);
  expect(errors).toEqual([]);
});

test('tooling: one version number in package.json, APP_VERSION, README "Current version" and the newest CHANGELOG entry', () => {
  const v = C.PKG.version;
  const html = fs.readFileSync(C.ROOT + '/threat-tiger.html', 'utf8');
  expect(html.match(/const APP_VERSION = '([^']+)'/)[1]).toBe(v);
  const readme = fs.readFileSync(C.ROOT + '/README.md', 'utf8');
  expect(readme.match(/\*\*Current version: ([\d.]+)\*\*/)[1]).toBe(v);
  const changelog = fs.readFileSync(C.ROOT + '/CHANGELOG.md', 'utf8');
  expect(changelog).toMatch(/^## Unreleased/m);
  expect(changelog.match(/^## (\d+\.\d+\.\d+)/m)[1]).toBe(v);
  expect(JSON.parse(fs.readFileSync(C.ROOT + '/package-lock.json', 'utf8')).version).toBe(v);
});
