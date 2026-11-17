#!/usr/bin/env node
// Dev-only: takes the screenshots used by the Help guide (docs/help/*.png) and, with --readme, the README grid
// images (docs/images/*.png). Uses Playwright like the tests; nothing here ships with the app.
//
//   node scripts/help-shots.mjs                 # starts its own server on a free port, writes docs/help/
//   node scripts/help-shots.mjs --readme        # also writes the README images to docs/images/
//   node scripts/help-shots.mjs --only live     # only shots whose name contains "live"
//   PW_BASE_URL=http://127.0.0.1:8080 node scripts/help-shots.mjs   # use a running server instead
//   PW_CHANNEL=chrome node scripts/help-shots.mjs                    # browser channel (default: msedge)
//
// Shots of features that are not in this build (e.g. Build from status file, Test check) are skipped with a note.
// Every remote address is faked (page.route) or aborted: the script never reaches the internet.
/* global app, bootstrap -- used inside page.evaluate callbacks, which run in the app page */
import { chromium } from '@playwright/test';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { mkdirSync, readFileSync, statSync, copyFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const HELP_DIR = path.join(ROOT, 'docs/help');
const README_DIR = path.join(ROOT, 'docs/images');
const args = process.argv.slice(2);
const README = args.includes('--readme');
const ONLY = args.includes('--only') ? args[args.indexOf('--only') + 1] : '';
const DEMO = JSON.parse(readFileSync(path.join(ROOT, 'demo.json'), 'utf8'));
const SESSION_KEY = 'stride_workbench_session_manifest_v26';
const ALL_PROFILES = { active: 'shots-all', profiles: [{ id: 'shots-all', name: 'Show All', icon: 'bi-grid-3x3-gap',
  hidden: { palette: [], stencils: [], icons: [], tabs: ['tab-notes-trigger'] }, panels: { left: true, right: true, bottom: true } }] };
const panels = (left, right, bottom) => ({ active: 'shots', profiles: [{ ...ALL_PROFILES.profiles[0], id: 'shots', panels: { left, right, bottom } }] });
const CANVAS_ONLY = panels(false, false, false);

// README grid image → the help shot it is copied from.
const README_IMAGES = { 'overview.png': 'overview.png', 'profiles.png': 'settings-profiles.png', 'live-status.png': 'live-status.png',
  '3d.png': '3d-ne.png', 'attack-tree.png': 'attack-tree.png', 'legend.png': 'legend-dialog.png', 'diagrams.png': 'c4-bpmn.png', 'status-file.png': 'status-file.png' };

// ── Server ────────────────────────────────────────────────────────────────────
function freePort() {
  return new Promise((resolve, reject) => {
    const s = createServer(); s.unref(); s.on('error', reject);
    s.listen(0, '127.0.0.1', () => { const { port } = s.address(); s.close(() => resolve(port)); });
  });
}
async function startServer() {
  if (process.env.PW_BASE_URL) return { base: process.env.PW_BASE_URL.replace(/\/$/, ''), stop: () => {} };
  const port = await freePort();
  const child = spawn(process.execPath, [path.join(ROOT, 'scripts/serve.mjs')], { env: { ...process.env, PORT: String(port) }, stdio: 'ignore' });
  const base = `http://127.0.0.1:${port}`;
  for (let i = 0; i < 50; i++) {
    try { const r = await fetch(`${base}/threat-tiger.html`); if (r.ok) break; } catch { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 100));
  }
  return { base, stop: () => child.kill() };
}

// ── Models ────────────────────────────────────────────────────────────────────
const clone = (o) => JSON.parse(JSON.stringify(o));
const flow = (id, s, t, extra = {}) => ({ id, name: '', sourceId: s, targetId: t, sourceAnchor: 'right', targetAnchor: 'left', secProps: { encrypted: 'false', authenticated: 'false' }, ...extra });
const down = (id, s, t, extra = {}) => flow(id, s, t, { sourceAnchor: 'bottom', targetAnchor: 'top', ...extra });
const session = (title, elements, flows = [], extra = {}) => ({ projectTitle: title, activeUser: 'Analyst', elements, flows, threats: [], ...extra });

function demo(mutate) { const s = clone(DEMO); s.activeUser = 'Analyst'; if (mutate) mutate(s); return s; }

const ATTACK_TREE = session('Attack tree', [
  { id: 'goal', type: 'at_goal', name: 'Read customer data', x: 470, y: 40, width: 220, height: 70 },
  { id: 'or', type: 'at_or', name: 'OR', x: 550, y: 170, width: 60, height: 60 },
  { id: 'phish', type: 'at_step', name: 'Phish an administrator', x: 220, y: 300, width: 220, height: 90, atTactic: 'TA0001', atTechnique: 'T1566.001' },
  { id: 'and', type: 'at_and', name: 'AND', x: 730, y: 310, width: 60, height: 60 },
  { id: 'backup', type: 'at_step', name: 'Find exposed backup', x: 560, y: 450, width: 200, height: 90, atTactic: 'TA0007', atTechnique: 'T1530' },
  { id: 'crack', type: 'at_step', name: 'Crack the backup password', x: 800, y: 450, width: 220, height: 90, atTactic: 'TA0006', atTechnique: 'T1110' },
  { id: 'mfa', type: 'at_countermeasure', name: 'Phishing-resistant MFA', x: 200, y: 470, width: 200, height: 70 },
  { id: 'entry', type: 'at_entry', name: 'Mailbox of an admin', x: 220, y: 160, width: 200, height: 70 },
  { id: 'ok', type: 'at_condition', name: 'Backup decrypted', x: 1060, y: 300, width: 180, height: 70, atOutcome: 'success' },
], [
  down('f1', 'goal', 'or'), flow('f2', 'or', 'phish', { sourceAnchor: 'left', targetAnchor: 'top' }), flow('f3', 'or', 'and', { sourceAnchor: 'right', targetAnchor: 'top' }),
  flow('f4', 'and', 'backup', { sourceAnchor: 'bottom', targetAnchor: 'top' }), flow('f5', 'and', 'crack', { sourceAnchor: 'bottom', targetAnchor: 'top' }),
  flow('f6', 'mfa', 'phish', { sourceAnchor: 'top', targetAnchor: 'bottom', isDashed: true, color: 'green' }), down('f7', 'entry', 'phish'),
  flow('f8', 'crack', 'ok', { sourceAnchor: 'right', targetAnchor: 'bottom' }),
]);

const DIAGRAMS = session('C4 and BPMN', [
  { id: 'cust', type: 'c4_person', name: 'Customer', x: 60, y: 60, width: 160, height: 150, c4Description: 'Buys products online' },
  { id: 'spa', type: 'c4_container', name: 'Web app', x: 300, y: 70, width: 200, height: 120, c4Technology: 'React', c4Description: 'Shop front' },
  { id: 'api', type: 'c4_container', name: 'Orders API', x: 300, y: 260, width: 200, height: 120, c4Technology: 'Node.js', c4Description: 'Takes orders' },
  { id: 'pay', type: 'c4_external', name: 'Payment provider', x: 60, y: 260, width: 200, height: 120, c4Description: 'Card payments' },
  { id: 'db', type: 'erd_entity', name: 'Order', x: 300, y: 440, width: 200, height: 110, erdRows: 'PK id\nFK customer_id\ntotal\ncreated_at' },
  { id: 's', type: 'bpmn_start', name: 'Order placed', x: 640, y: 120, width: 50, height: 50 },
  { id: 't1', type: 'bpmn_task', name: 'Check stock', x: 740, y: 105, width: 150, height: 80 },
  { id: 'g', type: 'bpmn_gateway_exclusive', name: 'In stock?', x: 950, y: 115, width: 60, height: 60 },
  { id: 't2', type: 'bpmn_task', name: 'Ship order', x: 1070, y: 40, width: 150, height: 80 },
  { id: 't3', type: 'bpmn_task', name: 'Back-order', x: 1070, y: 200, width: 150, height: 80 },
  { id: 'e', type: 'bpmn_end', name: 'Done', x: 1280, y: 55, width: 50, height: 50 },
  { id: 'cls', type: 'uml_class', name: 'OrderService', x: 700, y: 330, width: 220, height: 130, umlAttributes: '- repo: OrderRepo', umlOperations: '+ place(order)\n+ cancel(id)' },
  { id: 'note', type: 'uml_note', name: 'Orders over 1,000 EUR need review', x: 980, y: 340, width: 200, height: 90 },
], [
  flow('c1', 'cust', 'spa', { name: 'Uses' }), down('c2', 'spa', 'api', { name: 'JSON/HTTPS' }), flow('c3', 'api', 'pay', { sourceAnchor: 'left', targetAnchor: 'right', name: 'Charges' }), down('c4', 'api', 'db'),
  flow('b1', 's', 't1'), flow('b2', 't1', 'g'), flow('b3', 'g', 't2', { sourceAnchor: 'top', targetAnchor: 'left', name: 'yes' }), flow('b4', 'g', 't3', { sourceAnchor: 'bottom', targetAnchor: 'left', name: 'no' }), flow('b5', 't2', 'e'),
]);

const THREE_D = session('3D shapes', [
  { id: 'web', type: 'fc_process', name: 'Web tier', x: 80, y: 80, width: 160, height: 90, threeD: true, fcFillColor: '#dbeafe', fcStrokeColor: '#1d4ed8' },
  { id: 'db', type: 'fc_connector', name: 'Database', x: 380, y: 80, width: 120, height: 110, threeD: true, fcFillColor: '#fef3c7', fcStrokeColor: '#b45309' },
  { id: 'dec', type: 'fc_decision', name: 'Healthy?', x: 620, y: 80, width: 150, height: 100, threeD: true, fcFillColor: '#dcfce7', fcStrokeColor: '#15803d' },
  { id: 'sph', type: 'fc_sphere', name: 'Cache', x: 80, y: 300, width: 110, height: 110 },
  { id: 'cone', type: 'fc_cone', name: 'Edge', x: 280, y: 300, width: 110, height: 120 },
  { id: 'pyr', type: 'fc_pyramid', name: 'Archive', x: 480, y: 300, width: 120, height: 120 },
  { id: 'lay', type: 'fc_layers', name: 'Storage', x: 680, y: 300, width: 140, height: 120, layerCount: 4 },
], [flow('d1', 'web', 'db'), flow('d2', 'db', 'dec')]);

const LIVE_RULES = [
  { when: 'eq', value: 'down|error', fill: '#dc3545', stroke: '#dc3545', icon: 'bi-x-octagon-fill', label: 'down' },
  { when: 'nodata', fill: '#dc3545', stroke: '#dc3545', label: 'no data' },
  { when: 'eq', value: 'degraded|slow', fill: '#ffc107', stroke: '#ffc107', label: 'degraded' },
  { when: 'latency_gt', value: '500', fill: '#ffc107', stroke: '#ffc107', label: 'slow' },
  { when: 'else', fill: '#198754', stroke: '#198754' },
];
const live = (key = '') => ({ enabled: true, check: { kind: 'source', sourceId: 'src-feed', key }, rules: LIVE_RULES });
const LIVE = session('Production status', [
  { id: 'zone', type: 'boundary', name: 'Production', x: 300, y: 40, width: 760, height: 420 },
  { id: 'users', type: 'interactor', name: 'Customers', x: 40, y: 200, width: 200, height: 80, icon: 'bi-people-fill', secProps: {} },
  { id: 'web', type: 'process', name: 'Web shop', x: 340, y: 110, width: 220, height: 80, icon: 'bi-window', secProps: {}, liveStatus: live() },
  { id: 'api', type: 'process', name: 'Checkout API', x: 340, y: 300, width: 220, height: 80, icon: 'bi-braces', secProps: {}, liveStatus: live() },
  { id: 'db', type: 'datastore', name: 'Orders DB', x: 780, y: 110, width: 220, height: 80, secProps: {}, liveStatus: live() },
  { id: 'pay', type: 'process', name: 'Payments', x: 780, y: 300, width: 220, height: 80, icon: 'bi-credit-card', secProps: {}, liveStatus: live() },
], [
  flow('l1', 'users', 'web', { name: 'HTTPS' }), down('l2', 'web', 'api'), flow('l3', 'web', 'db', { name: 'SQL' }), flow('l4', 'api', 'pay', { name: 'Charge' }),
], { statusSources: [{ id: 'src-feed', name: 'Status feed', kind: 'json', url: 'https://status.example.com/services.json' }] });
const LIVE_FEED = [{ name: 'Web shop', status: 'up', latency: 120 }, { name: 'Checkout API', status: 'degraded', latency: 640 },
  { name: 'Orders DB', status: 'up', latency: 35 }, { name: 'Payments', status: 'down' }];

const QUICK = session('Quick add', [
  { id: 'start', type: 'fc_terminator', name: 'Order received', x: 80, y: 120, width: 160, height: 70, fcFillColor: '#dcfce7', fcStrokeColor: '#15803d' },
  { id: 'check', type: 'fc_process', name: 'Validate order', x: 330, y: 115, width: 170, height: 80, fcFillColor: '#dbeafe', fcStrokeColor: '#1d4ed8' },
], [flow('q1', 'start', 'check')]);

// ── Browser helpers ───────────────────────────────────────────────────────────
let BASE = '';
const written = [];
async function newPage(browser, { width = 1280, height = 800 } = {}) {
  const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 1, acceptDownloads: false });
  const page = await context.newPage();
  // Nothing leaves the machine: https requests are aborted unless a shot fakes them.
  await page.route(/^https?:\/\/(?!127\.0\.0\.1|localhost)/, (route) => route.abort());
  return page;
}
async function openApp(page, { model = null, profiles = ALL_PROFILES } = {}) {
  await page.addInitScript(([key, value, prof]) => {
    if (sessionStorage.getItem('__shots')) return;
    sessionStorage.setItem('__shots', '1');
    localStorage.clear();
    localStorage.setItem('license_accepted', 'true');
    localStorage.setItem('threat_tiger_welcome_seen', 'true');
    if (value) localStorage.setItem(key, value);
    if (prof) {
      localStorage.setItem('view_profiles', JSON.stringify({ version: 3, profiles: prof.profiles }));
      localStorage.setItem('active_view_profile', prof.active);
    }
  }, [SESSION_KEY, model ? JSON.stringify(model) : null, profiles]);
  await page.goto(`${BASE}/threat-tiger.html`);
  await page.waitForFunction(() => window.app && window.app.state);
  await page.waitForTimeout(400);
}
/** Clicks a control in the ☰ menu (opening the menu and flyouts first). */
async function menu(page, selector) {
  if (!(await page.locator(selector).isVisible())) {
    if ((await page.locator('#btn-main-menu').getAttribute('aria-expanded')) !== 'true') await page.click('#btn-main-menu');
    const triggers = await page.locator(selector).evaluate((el) => {
      const ids = [];
      for (let m = el.closest('.submenu'); m; m = m.parentElement.closest('.submenu')) { const t = document.querySelector(`[aria-controls="${m.id}"]`); if (t) ids.unshift('#' + t.id); }
      return ids;
    });
    for (const t of triggers) if ((await page.locator(t).getAttribute('aria-expanded')) !== 'true') await page.click(t);
  }
  await page.click(selector);
}
/** Canvas-only pictures: no panels (profile), and the canvas toolbar hidden. */
const hideToolbar = (page) => page.addStyleTag({ content: 'div:has(> #btn-undo) { display: none !important; }' });
/** Zoom to fit, then (optionally) a little further out so nothing touches the edges. */
const fit = async (page, shrink = 1) => {
  await page.evaluate(() => document.getElementById('btn-canvas-zoom-reset').click()); await page.waitForTimeout(250);
  if (shrink !== 1) { await page.evaluate((k) => app.zoomAroundViewCentre(app.zoomScale * k), shrink); await page.waitForTimeout(150); }
};
const select = (page, id) => page.evaluate((i) => { app.handleElementSelectionEvent(i); }, id);
const selectFlow = (page, id) => page.evaluate((i) => { app.handleFlowSelectionEvent(i); }, id);
const modalShown = (page, id) => page.waitForFunction((i) => { const m = document.getElementById(i); const inst = m && bootstrap.Modal.getInstance(m); return m && m.classList.contains('show') && inst && !inst._isTransitioning; }, id);
const bottomHeight = (page, px) => page.evaluate((h) => { document.documentElement.style.setProperty('--bottom-height', `${h}px`); window.dispatchEvent(new Event('resize')); }, px);

/** Saves a PNG of the page, a locator or a clip, cropped to at most maxHeight. */
async function save(page, name, target = null, { maxHeight = 900, pad = 0 } = {}) {
  const file = path.join(HELP_DIR, `${name}.png`);
  let clip = null;
  if (target && typeof target === 'object' && 'x' in target) clip = target;
  else if (target) {
    const loc = typeof target === 'string' ? page.locator(target).first() : target;
    await loc.scrollIntoViewIfNeeded().catch(() => {});
    const b = await loc.boundingBox();
    if (!b) throw new Error(`${name}: nothing to capture`);
    const vp = page.viewportSize();
    const x = Math.max(0, b.x - pad), y = Math.max(0, b.y - pad);
    clip = { x, y, width: Math.min(vp.width - x, b.width + 2 * pad), height: Math.min(vp.height - y, b.height + 2 * pad) };
  }
  if (clip) clip.height = Math.min(clip.height, maxHeight);
  await page.screenshot({ path: file, clip: clip || undefined, animations: 'disabled', caret: 'hide' });
  const kb = Math.round(statSync(file).size / 1024);
  written.push([name, kb]);
  console.log(`  docs/help/${name}.png  ${kb} KB`);
}

// ── Shots ─────────────────────────────────────────────────────────────────────
const SHOTS = {
  async overview(browser) {
    const page = await newPage(browser);
    await openApp(page, { model: demo() });
    await fit(page); await select(page, 'el-1781201164369');
    await save(page, 'overview');
  },
  async menu(browser) {
    const page = await newPage(browser, { width: 1280, height: 900 });
    await openApp(page, { model: demo() });
    await page.click('#btn-main-menu');
    await page.waitForTimeout(250);
    await save(page, 'menu', page.locator('#btn-main-menu + .dropdown-menu'), { pad: 6 });
  },
  async profiles(browser) {
    const page = await newPage(browser);
    await openApp(page, { model: demo(), profiles: null });
    await page.click('#btn-view-profile');
    await page.waitForTimeout(250);
    await save(page, 'profiles', '#menu-view-profiles', { pad: 6 });
  },
  async 'settings-profiles'(browser) {
    const page = await newPage(browser, { width: 1280, height: 1100 });
    await openApp(page, { model: demo(), profiles: null });
    await menu(page, '#btn-settings'); await modalShown(page, 'modal-settings');
    await save(page, 'settings-profiles', '#settings-profiles', { pad: 8, maxHeight: 700 });
  },
  async palette(browser) {
    const page = await newPage(browser, { width: 1280, height: 1600 });
    await openApp(page, { model: demo() });
    await page.evaluate(() => { const b = document.getElementById('session-meta-body'); if (b) b.style.display = 'none'; });
    for (const [group, name] of [['threat', 'palette-threat'], ['attack', 'palette-attack'], ['text', 'palette-text'], ['data-nodes', 'palette-data-nodes'], ['flowchart', 'palette-flowchart'], ['diagrams', 'palette-diagrams']]) {
      if (ONLY && !name.includes(ONLY) && !'palette'.includes(ONLY)) continue;
      await page.evaluate((g) => {
        document.querySelectorAll('#paletteAccordion > .accordion-item > .accordion-collapse').forEach((c) => {
          const want = c.parentElement.dataset.paletteGroup === g;
          c.classList.toggle('show', want);
          const btn = c.parentElement.querySelector('.accordion-button'); if (btn) { btn.classList.toggle('collapsed', !want); btn.setAttribute('aria-expanded', String(want)); }
        });
      }, group);
      await page.waitForTimeout(300);
      await save(page, name, page.locator(`#paletteAccordion > [data-palette-group="${group}"]`), { pad: 2, maxHeight: 760 });
    }
  },
  async properties(browser) {
    const page = await newPage(browser, { width: 1280, height: 1400 });
    await openApp(page, { model: demo((s) => { const w = s.elements.find((e) => e.id === 'el-1781201164369'); w.secProps = { ...w.secProps, loggingEnabled: 'true', handlesSensitiveData: 'true' }; }) });
    await select(page, 'el-1781201164369'); await page.click('#tab-props-trigger'); await page.waitForTimeout(250);
    await save(page, 'properties-component', '.sidebar-right', { maxHeight: 820 });
    const flowId = await page.evaluate(() => app.state.flows[0].id);
    await selectFlow(page, flowId); await page.waitForTimeout(250);
    await save(page, 'properties-flow', '.sidebar-right', { maxHeight: 820 });
  },
  async templates(browser) {
    const page = await newPage(browser, { width: 1280, height: 1200 });
    await openApp(page, { model: demo() });
    await page.waitForFunction(() => app.threatSuggestions && app.threatSuggestions.process && app.threatSuggestions.process.length);
    await select(page, 'el-1781201164369'); await page.click('#tab-suggest-trigger'); await page.waitForTimeout(500);
    await save(page, 'templates', '.sidebar-right', { maxHeight: 820 });
  },
  async register(browser) {
    const page = await newPage(browser, { width: 1280, height: 1000 });
    await openApp(page, { model: demo() });
    await bottomHeight(page, 330);
    await page.click('#tab-register-trigger'); await page.waitForTimeout(300);
    await save(page, 'register', '.bottom-panel');
    await bottomHeight(page, 560);
    await page.click('#tab-insights-trigger'); await page.waitForTimeout(500);
    await save(page, 'insights', '.bottom-panel');
  },
  async 'attack-paths'(browser) {
    const page = await newPage(browser, { width: 1280, height: 860 });
    await openApp(page, { model: demo((s) => { const db = s.elements.find((e) => e.id === 'el-1781201175713'); db.secProps = { ...db.secProps, isCrownJewel: 'true' }; }), profiles: panels(false, false, true) }); await hideToolbar(page);
    await bottomHeight(page, 330);
    await page.click('#tab-insights-trigger'); await page.waitForTimeout(500);
    await page.evaluate(() => { const h = [...document.querySelectorAll('#insights-content *')].find((e) => /^Attack paths/.test(e.textContent.trim()) && e.children.length === 0); if (h) h.scrollIntoView(); });
    const row = page.locator('#insights-content [data-path-key], #insights-content .attack-path-row, #insights-content button:has-text("→")').first();
    if (await row.count()) await row.click().catch(() => {});
    await page.waitForTimeout(300);
    await fit(page);
    await save(page, 'attack-paths');
  },
  async legend(browser) {
    const page = await newPage(browser, { width: 1280, height: 1000 });
    await openApp(page, { model: demo() });
    await menu(page, '#btn-menu-title-block'); await modalShown(page, 'modal-legend');
    await page.evaluate(() => { document.querySelectorAll('#modal-legend .form-switch input[type=checkbox]').forEach((c) => { if (!c.checked) c.click(); }); });
    await page.waitForTimeout(250);
    await save(page, 'legend-dialog', '#modal-legend .modal-content', { maxHeight: 820 });
  },
  async 'attack-tree'(browser) {
    const page = await newPage(browser, { width: 1100, height: 600 });
    await openApp(page, { model: ATTACK_TREE, profiles: CANVAS_ONLY }); await hideToolbar(page);
    await page.evaluate(() => app.clearActiveSelectionPointers());
    await fit(page, 0.92);
    await save(page, 'attack-tree', '.workspace-wrapper');
  },
  async 'c4-bpmn'(browser) {
    const page = await newPage(browser, { width: 1200, height: 600 });
    await openApp(page, { model: DIAGRAMS, profiles: CANVAS_ONLY }); await hideToolbar(page);
    await page.evaluate(() => app.clearActiveSelectionPointers());
    await fit(page, 0.92);
    await save(page, 'c4-bpmn', '.workspace-wrapper');
  },
  async '3d'(browser) {
    const page = await newPage(browser, { width: 900, height: 560 });
    await openApp(page, { model: THREE_D, profiles: CANVAS_ONLY }); await hideToolbar(page);
    await page.evaluate(() => app.clearActiveSelectionPointers());
    await fit(page, 0.92);
    await save(page, '3d-flat', '.workspace-wrapper');
    await page.evaluate(() => app.setViewMode('ne-isometric')); await page.waitForTimeout(300); await fit(page, 0.92);
    await save(page, '3d-ne', '.workspace-wrapper');
  },
  async 'quick-add'(browser) {
    const page = await newPage(browser, { width: 900, height: 420 });
    await openApp(page, { model: QUICK, profiles: CANVAS_ONLY }); await hideToolbar(page);
    await page.evaluate(() => { app.zoomScale = 1; app.panX = -20; app.panY = 0; app.applySvgViewportTransformations(); app.clearActiveSelectionPointers(); });
    await page.locator('#layers-nodes-group [data-id="check"]').first().hover();
    await page.locator('#layers-nodes-group [data-id="check"] [data-anchor-id="right"]').hover();
    await page.waitForTimeout(300);
    await save(page, 'quick-add', '.workspace-wrapper', { maxHeight: 260 });
  },
  async live(browser) {
    const page = await newPage(browser, { width: 1280, height: 1300 });
    await page.route('https://status.example.com/services.json', (r) => r.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(LIVE_FEED) }));
    await openApp(page, { model: LIVE, profiles: panels(false, true, false) }); await hideToolbar(page);
    await page.evaluate(() => localStorage.setItem('threat_tiger_live_approved', JSON.stringify(['status.example.com'])));
    await page.evaluate(async () => { app.setLiveStatus(true, { refresh: false }); await app.refreshLiveStatus({ manual: true }); app.clearActiveSelectionPointers(); });
    await page.setViewportSize({ width: 1460, height: 600 });
    await page.waitForTimeout(300); await fit(page, 0.95);
    await save(page, 'live-status', { x: 0, y: 56, width: 1100, height: 544 });
    await page.setViewportSize({ width: 1280, height: 1300 });
    await select(page, 'api'); await page.click('#tab-props-trigger');
    await page.evaluate(() => document.getElementById('box-props-live-status').scrollIntoView());
    await page.waitForTimeout(300);
    await save(page, 'live-properties', '#box-props-live-status', { pad: 6, maxHeight: 820 });
    if (await page.locator('#btn-live-test-check').count()) {
      await page.click('#btn-live-test-check'); await page.waitForTimeout(800);
      await save(page, 'live-test', '#box-props-live-status', { pad: 6, maxHeight: 900 });
    } else console.log('  (skipped live-test: #btn-live-test-check is not in this build)');
    await menu(page, '#btn-settings'); await modalShown(page, 'modal-settings');
    await save(page, 'live-settings', '#settings-live', { pad: 8, maxHeight: 700 });
  },
  async history(browser) {
    const page = await newPage(browser, { width: 1280, height: 800 });
    await openApp(page, { model: demo() });
    await page.evaluate(async () => { await app.takeSnapshot('Before import', true); await app.takeSnapshot('Autosave', true); });
    await page.waitForTimeout(300);
    await menu(page, '#btn-snapshots'); await modalShown(page, 'modal-snapshots'); await page.waitForTimeout(300);
    await save(page, 'history', '#modal-snapshots .modal-content');
  },
  async 'status-file'(browser) {
    const page = await newPage(browser, { width: 1280, height: 1000 });
    await openApp(page, { model: demo() });
    if (!(await page.locator('#btn-build-from-status').count())) { console.log('  (skipped status-file: #btn-build-from-status is not in this build)'); return; }
    await menu(page, '#btn-build-from-status');
    await page.waitForTimeout(500);
    const input = page.locator('.modal.show input[type="url"], .modal.show input[type="text"]').first();
    if (await input.count()) { await input.fill('samples/status-servers.csv'); }
    const preview = page.locator('.modal.show button:has-text("Preview")').first();
    if (await preview.count()) { await preview.click(); await page.waitForTimeout(800); }
    await save(page, 'status-file', '.modal.show .modal-content', { maxHeight: 820 });
  },
};

// ── Run ───────────────────────────────────────────────────────────────────────
mkdirSync(HELP_DIR, { recursive: true });
const server = await startServer();
BASE = server.base;
const browser = await chromium.launch({ channel: process.env.PW_CHANNEL || 'msedge' });
let failed = 0;
try {
  for (const [name, run] of Object.entries(SHOTS)) {
    if (ONLY && !name.includes(ONLY) && !(name === 'palette' && 'palette'.includes(ONLY.split('-')[0]))) continue;
    console.log(name);
    try { await run(browser); } catch (err) { failed++; console.error(`  FAILED ${name}: ${err.message.split('\n')[0]}`); }
  }
} finally {
  await browser.close();
  server.stop();
}
if (README) {
  mkdirSync(README_DIR, { recursive: true });
  for (const [to, from] of Object.entries(README_IMAGES)) {
    const src = path.join(HELP_DIR, from);
    try { statSync(src); copyFileSync(src, path.join(README_DIR, to)); console.log(`  docs/images/${to}  (from ${from})`); }
    catch { console.log(`  (skipped docs/images/${to}: docs/help/${from} not found)`); }
  }
}
console.log(`${written.length} screenshots written${failed ? `, ${failed} failed` : ''}.`);
process.exitCode = failed ? 1 : 0;
