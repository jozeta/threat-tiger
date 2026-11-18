// Build from status file: a CSV / Google Sheet / JSON file (name, status, type, icon, rules, colours, groups,
// connections) builds a diagram and, optionally, becomes the live status source that colours it. Covers parsing,
// column aliases, defaults and warnings, the dialog's preview, the built layout, live colours from the sample files
// in samples/ (same origin, no approval), update from file, undo, review mode, host approval and XSS.
// Remote endpoints are faked with page.route; any other https request is aborted and recorded.
const fs = require('node:fs');
const path = require('node:path');
const { test } = require('@playwright/test');
const { expect, openApp, clickControl, openSettingsTab } = require('./helpers');

const ROOT = path.resolve(__dirname, '..');
const SAMPLE_CSV = fs.readFileSync(path.join(ROOT, 'samples/status-servers.csv'), 'utf8');
const SAMPLE_JSON = fs.readFileSync(path.join(ROOT, 'samples/status-servers.json'), 'utf8');
const SHEET_ID = '1AbCdEfGhIjKlMnOpQrStUvWxYz0123456789';
const SHARE = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/edit?usp=sharing#gid=0`;
const GVIZ = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:csv&gid=0`;
const CORS = { 'access-control-allow-origin': '*' };
// What the 6 sample servers look like with live status on.
const EXPECTED = { 'web-01': '#198754', 'web-02': '#ffc107', 'api-01': '#ffc107', 'db-01': '#20c997', 'cache-01': '#b02a37', 'backup-01': '#fd7e14' };

async function guardNetwork(page) {
  const stray = [];
  await page.route(/^https:\/\//, (route) => { stray.push(route.request().url()); return route.abort(); });
  return stray;
}
async function fake(page, pattern, reply) {
  const calls = [];
  await page.route(pattern, async (route) => {
    const req = route.request();
    calls.push({ url: req.url(), method: req.method(), headers: req.headers() });
    const r = await reply(req.url(), req);
    if (!r) return route.abort('failed');
    return route.fulfill({ status: r.status || 200, headers: r.headers || CORS, contentType: r.contentType || 'text/plain', body: r.body || '' }).catch(() => {});
  });
  return calls;
}
const emptyModel = () => ({ projectTitle: 'Status', activeUser: 'Tester', elements: [], flows: [], threats: [] });
async function open(page, m = emptyModel()) {
  await page.setViewportSize({ width: 1600, height: 1000 });
  await openApp(page, { session: m });
}
async function approve(page, hosts) {
  await page.evaluate((h) => localStorage.setItem('threat_tiger_live_approved', JSON.stringify(h)), hosts);
}
async function openDialog(page) {
  await clickControl(page, '#btn-build-from-status');
  await expect(page.locator('#modal-status-file')).toBeVisible();
}
async function previewUrl(page, url) {
  await page.fill('#status-file-url', url);
  await page.click('#btn-status-file-preview');
}
const shapesByName = (page) => page.evaluate(() => Object.fromEntries(app.state.elements.filter((e) => e.type !== 'boundary').map((e) => [e.name, e])));
const indFill = (page, id) => page.locator(`#canvas-svg g[data-id="${id}"] .live-status-ind circle`).first();

// ── Parsing ──────────────────────────────────────────────────────────────────

test('CSV, JSON (object and bare array) parse to the same items, flows and groups', async ({ page }) => {
  await open(page);
  const r = await page.evaluate(([csv, json]) => {
    const a = parseStatusFile(csv), b = parseStatusFile(json), arr = parseStatusFile(JSON.stringify(JSON.parse(json).items));
    return { a, b, arr };
  }, [SAMPLE_CSV, SAMPLE_JSON]);
  expect(r.a.format).toBe('csv');
  expect(r.b.format).toBe('json');
  expect(r.b.title).toBe('Server status');
  expect(r.a.items.map((i) => i.name)).toEqual(['web-01', 'web-02', 'api-01', 'db-01', 'cache-01', 'backup-01']);
  expect(r.b.items).toEqual(r.a.items);
  expect(r.arr.items).toEqual(r.a.items);
  expect(r.a.flows).toEqual([['web-01', 'api-01'], ['web-02', 'api-01'], ['api-01', 'db-01'], ['api-01', 'cache-01'], ['db-01', 'backup-01']]);
  expect(r.b.flows).toEqual(r.a.flows);
  expect(r.a.groups).toEqual(['DMZ', 'Internal']);
  expect(r.a.warnings).toEqual([]);
  expect(r.b.warnings).toEqual([]);
  const db = r.a.items.find((i) => i.name === 'db-01');
  expect(db).toMatchObject({ status: 'up', type: 'datastore', icon: 'bi-database-fill', ok: 'up|ok|primary', okColor: '#20c997', latency: 12, latencyMax: 200, group: 'Internal', connectsTo: ['backup-01'], description: 'Primary order database (custom ok colour)' });
  const api = r.a.items.find((i) => i.name === 'api-01');
  expect(api).toMatchObject({ type: 'process', readyNode: 'api-gateway', icon: 'bi-router-fill' });
  expect(r.a.items.find((i) => i.name === 'cache-01')).toMatchObject({ type: 'datastore', readyNode: 'cache', icon: 'bi-memory', failColor: '#b02a37' });
});

test('column names are case-insensitive, "_", "-" and spaces are equivalent, and common aliases work', async ({ page }) => {
  await open(page);
  const r = await page.evaluate(() => parseStatusFile('Server,State,Kind,Icon,Latency (ms),Latency-Max,OK Values,OK-Colour,Fail Color,Zone,Connects To,Notes\nA,ok,DATASTORE,bi-hdd,40,30,ok|fine,#0f0,#123456,Core,B,first\nB,fine,interactor,,,,,,,Core,,second\n'));
  expect(r.warnings).toEqual([]);
  expect(r.items[0]).toMatchObject({ name: 'A', status: 'ok', type: 'datastore', icon: 'bi-hdd', latency: 40, latencyMax: 30, ok: 'ok|fine', okColor: '#00ff00', failColor: '#123456', group: 'Core', connectsTo: ['B'], description: 'first' });
  expect(r.items[1]).toMatchObject({ name: 'B', type: 'interactor', icon: 'bi-person-fill' });
  expect(r.columns).toMatchObject({ name: 'Server', status: 'State', latency: 'Latency (ms)' });
});

test('defaults: infrastructure, its icon, the standard ok / warn values and colours', async ({ page }) => {
  await open(page);
  const r = await page.evaluate(() => parseStatusFile('name,status\nsrv,up\n'));
  expect(r.items[0]).toEqual({ name: 'srv', status: 'up', type: 'infrastructure', readyNode: '', icon: 'bi-hdd-rack', ok: 'up|ok|online|healthy|200', okColor: '#198754',
    warn: 'degraded|slow|warning|maintenance', warnColor: '#ffc107', failColor: '#dc3545', latency: null, latencyMax: null, group: '', connectsTo: [], description: '' });
  const rules = await page.evaluate(() => statusFileRules(parseStatusFile('name,status,latency_max\nsrv,up,500\n').items[0]));
  expect(rules).toEqual([
    { when: 'nodata', fill: '#adb5bd', stroke: '#adb5bd', label: 'no data' },
    { when: 'eq', value: 'degraded|slow|warning|maintenance', fill: '#ffc107', stroke: '#ffc107' },
    { when: 'neq', value: 'up|ok|online|healthy|200', fill: '#dc3545', stroke: '#dc3545' },
    { when: 'latency_gt', value: '500', fill: '#ffc107', stroke: '#ffc107', label: 'slow' },
    { when: 'eq', value: 'up|ok|online|healthy|200', fill: '#198754', stroke: '#198754' },
    { when: 'else', fill: '#dc3545', stroke: '#dc3545' },
  ]);
});

test('bad colours, icons, types, missing or duplicate names and unknown connections fall back with warnings', async ({ page }) => {
  await open(page);
  const r = await page.evaluate(() => parseStatusFile([
    'name,status,type,icon,ok_color,warn_color,fail_color,latency_max,connects_to',
    'a,up,spaceship,javascript:alert(1),red,url(x),#12345,abc,b|ghost|a',
    ',up,,,,,,,',
    'a,down,,,,,,,',
    'b,up,firewall,bi bi-shield,,,,,',
  ].join('\n')));
  expect(r.items.map((i) => i.name)).toEqual(['a', 'b']);
  expect(r.items[0]).toMatchObject({ type: 'infrastructure', icon: 'bi-hdd-rack', okColor: '#198754', warnColor: '#ffc107', failColor: '#dc3545', latencyMax: null });
  expect(r.items[1]).toMatchObject({ type: 'infrastructure', readyNode: 'firewall', icon: 'bi-shield' });   // "bi bi-shield" is accepted as bi-shield
  const w = r.warnings.join('\n');
  expect(w).toMatch(/unknown type "spaceship"/i);
  expect(w).toMatch(/icon/i);
  expect(w).toMatch(/ok_color/i);
  expect(w).toMatch(/warn_color/i);
  expect(w).toMatch(/fail_color/i);
  expect(w).toMatch(/latency_max/i);
  expect(w).toMatch(/without a name/i);
  expect(w).toMatch(/duplicate name "a"/i);
  expect(w).toMatch(/"ghost"/);
  expect(r.flows).toEqual([['a', 'b']]);   // the self-connection and the unknown name are skipped
});

test('limits: at most 200 rows, text-only names and descriptions, clipped lengths; HTML and non-files are refused', async ({ page }) => {
  await open(page);
  const r = await page.evaluate(() => {
    const rows = ['name,status,description'];
    for (let i = 0; i < 230; i++) rows.push(`s${i},up,${'d'.repeat(i === 0 ? 3000 : 1)}`);
    const big = parseStatusFile(rows.join('\n'));
    const long = parseStatusFile(`name,status\n${'n'.repeat(300)},up\n`);
    let html = '', none = '', noName = '';
    try { parseStatusFile('<!doctype html><html></html>'); } catch (e) { html = e.message; }
    try { parseStatusFile('{"hello": 1}'); } catch (e) { none = e.message; }
    try { parseStatusFile('status,type\nup,process\n'); } catch (e) { noName = e.message; }
    return { n: big.items.length, w: big.warnings.join(' '), desc: big.items[0].description.length, name: long.items[0].name.length, html, none, noName };
  });
  expect(r.n).toBe(200);
  expect(r.w).toMatch(/200/);
  expect(r.desc).toBe(1000);
  expect(r.name).toBe(60);
  expect(r.html).toMatch(/web page/i);
  expect(r.none).toMatch(/items/i);
  expect(r.noName).toMatch(/name/i);
});

test('source addresses: https, same-origin paths and same-origin URLs only; relative paths are checked', async ({ page }) => {
  await open(page);
  const r = await page.evaluate(() => ({
    https: statusSourceUrl('https://status.example.com/s.csv'),
    rel: statusSourceUrl('samples/status-servers.csv'),
    relQuery: statusSourceUrl('feeds/status.json?v=2'),
    abs: statusSourceUrl('/samples/status-servers.csv'),
    sameOrigin: statusSourceUrl(location.origin + '/samples/status-servers.json'),
    dotdot: statusSourceUrl('../secret.csv'),
    dotdot2: statusSourceUrl('samples/../../x.csv'),
    proto: statusSourceUrl('//evil.example.com/x.csv'),
    js: statusSourceUrl('javascript:alert(1)'),
    data: statusSourceUrl('data:text/csv,name'),
    http: statusSourceUrl('http://status.example.com/s.csv'),
    creds: statusSourceUrl('https://u:p@status.example.com/s.csv'),
    back: statusSourceUrl('samples\\x.csv'),
    long: statusSourceUrl('a/'.repeat(200) + 'x.csv'),
    fetchRel: statusFetchUrl('samples/status-servers.csv'),
    fileErr: statusFetchUrl('samples/status-servers.csv', 'file:///Users/x/threat-tiger.html'),
  }));
  expect(r.https).toBe('https://status.example.com/s.csv');
  expect(r.rel).toBe('samples/status-servers.csv');
  expect(r.relQuery).toBe('feeds/status.json?v=2');
  expect(r.abs).toBe('/samples/status-servers.csv');
  expect(r.sameOrigin).toBe('/samples/status-servers.json');   // stored as a path, so the model works on any copy of the app
  expect([r.dotdot, r.dotdot2, r.proto, r.js, r.data, r.http, r.creds, r.back, r.long]).toEqual(['', '', '', '', '', '', '', '', '']);
  expect(r.fetchRel).toMatch(/^http:\/\/127\.0\.0\.1:\d+\/samples\/status-servers\.csv$/);
  expect(r.fileErr).toBe('');
  // A relative source in the model passes validation and needs no approval.
  const job = await page.evaluate(() => {
    app.state.statusSources = normalizeStatusSources([{ id: 's', name: 'Local', kind: 'csv', url: 'samples/status-servers.csv' }]);
    return app.liveJobFor({ name: 'web-01', liveStatus: { check: { kind: 'source', sourceId: 's', key: '' } } });
  });
  expect(job.sameOrigin).toBe(true);
  expect(job.url).toMatch(/\/samples\/status-servers\.csv$/);
});

// ── Dialog, preview and build ─────────────────────────────────────────────────

test('the dialog previews the sample CSV (same origin, no approval) and builds it on a new page', async ({ page }) => {
  const stray = await guardNetwork(page);
  await open(page);
  await openDialog(page);
  await expect(page.locator('#status-file-help')).toContainText('connects_to');
  await expect(page.locator('#status-file-help a[href="samples/status-servers.csv"]')).toHaveCount(1);
  await expect(page.locator('#status-file-help a[href="samples/status-servers.json"]')).toHaveCount(1);
  await expect(page.locator('#btn-status-file-build')).toBeDisabled();
  await previewUrl(page, 'samples/status-servers.csv');
  await expect(page.locator('#status-file-summary')).toHaveText('6 shapes · 5 flows · 2 groups · 0 warnings');
  await expect(page.locator('#status-file-approve')).toBeHidden();
  await expect(page.locator('#status-file-target-new')).toBeChecked();
  await expect(page.locator('#status-file-keep')).toBeChecked();
  await page.click('#btn-status-file-build');
  await expect(page.locator('#modal-status-file')).toBeHidden();
  const s = await page.evaluate(() => ({ pages: app.state.pages.length, active: app.state.activePageId, page: app.state.pages.find((p) => p.id === app.state.activePageId).name, sources: app.state.statusSources,
    zones: app.state.elements.filter((e) => e.type === 'boundary').map((z) => ({ name: z.name, x: z.x, y: z.y, w: z.width, h: z.height, pageId: z.pageId })), flows: app.state.flows.length }));
  expect(s.pages).toBe(2);
  expect(s.page).toBe('status-servers');
  expect(s.sources).toHaveLength(1);
  expect(s.sources[0]).toMatchObject({ kind: 'csv', url: 'samples/status-servers.csv', keyColumn: 'name', valueColumn: 'status', pageId: s.active });
  expect(s.flows).toBe(5);
  expect(s.zones.map((z) => z.name)).toEqual(['DMZ', 'Internal']);
  const shapes = await shapesByName(page);
  expect(Object.keys(shapes).sort()).toEqual(Object.keys(EXPECTED).sort());
  expect(shapes['web-01']).toMatchObject({ type: 'process', icon: 'bi-globe2', display: 'badge', notes: 'Public web server (node 1)', pageId: s.active });
  expect(shapes['api-01']).toMatchObject({ type: 'process', icon: 'bi-router-fill', stencilTags: ['api', 'network-device'] });
  expect(shapes['db-01']).toMatchObject({ type: 'datastore', icon: 'bi-database-fill' });
  expect(shapes['backup-01']).toMatchObject({ type: 'datastore', icon: 'bi-archive-fill' });
  // Each shape sits inside its group's zone; the zones do not overlap; shapes do not overlap.
  const zone = (n) => s.zones.find((z) => z.name === n);
  const inside = (e, z) => e.x >= z.x && e.y >= z.y && e.x + e.width <= z.x + z.w && e.y + e.height <= z.y + z.h;
  ['web-01', 'web-02'].forEach((n) => expect(inside(shapes[n], zone('DMZ'))).toBe(true));
  ['api-01', 'db-01', 'cache-01', 'backup-01'].forEach((n) => expect(inside(shapes[n], zone('Internal'))).toBe(true));
  const [a, b] = s.zones;
  expect(a.x + a.w <= b.x || b.x + b.w <= a.x || a.y + a.h <= b.y || b.y + b.h <= a.y).toBe(true);
  const list = Object.values(shapes);
  for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) {
    const p = list[i], q = list[j];
    expect(p.x + p.width <= q.x || q.x + q.width <= p.x || p.y + p.height <= q.y || q.y + q.height <= p.y).toBe(true);
  }
  // Live status rules per row: the source, the row's name, rules from its columns.
  expect(shapes['db-01'].liveStatus.enabled).toBe(true);
  expect(shapes['db-01'].liveStatus.check).toEqual({ kind: 'source', sourceId: s.sources[0].id, key: 'db-01' });
  expect(shapes['db-01'].liveStatus.rules.find((r) => r.when === 'eq' && r.value === 'up|ok|primary').fill).toBe('#20c997');
  expect(shapes['cache-01'].liveStatus.rules.at(-1)).toEqual({ when: 'else', fill: '#b02a37', stroke: '#b02a37' });
  expect(shapes['cache-01'].liveStatus.rules.some((r) => r.when === 'latency_gt')).toBe(false);   // no latency_max
  // The flows follow connects_to.
  const flows = await page.evaluate(() => app.state.flows.map((f) => [app.state.elements.find((e) => e.id === f.sourceId).name, app.state.elements.find((e) => e.id === f.targetId).name]));
  expect(flows).toEqual([['web-01', 'api-01'], ['web-02', 'api-01'], ['api-01', 'db-01'], ['api-01', 'cache-01'], ['db-01', 'backup-01']]);
  expect(stray).toEqual([]);
});

test('with live status on, the diagram built from samples/status-servers.csv shows the 6 sample states', async ({ page }) => {
  const stray = await guardNetwork(page);
  await open(page);
  await openDialog(page);
  await previewUrl(page, 'samples/status-servers.csv');
  await expect(page.locator('#status-file-summary')).toContainText('6 shapes');
  await page.click('#btn-status-file-build');
  await page.evaluate(async () => { app.setLiveStatus(true, { refresh: false }); await app.refreshLiveStatus({ manual: true }); });
  await expect(page.locator('#modal-settings')).toBeHidden();   // same origin: nothing to approve
  const shapes = await shapesByName(page);
  for (const [name, colour] of Object.entries(EXPECTED)) {
    await expect(indFill(page, shapes[name].id), name).toHaveAttribute('fill', colour);
  }
  await expect(page.locator(`#canvas-svg g[data-id="${shapes['web-02'].id}"] .live-status-label`)).toHaveText('slow');
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('threat_tiger_live_approved') || '[]'))).toEqual([]);
  expect(stray).toEqual([]);
});

test('the sample JSON builds the same diagram and colours', async ({ page }) => {
  const stray = await guardNetwork(page);
  await open(page);
  await openDialog(page);
  await previewUrl(page, 'samples/status-servers.json');
  await expect(page.locator('#status-file-summary')).toHaveText('6 shapes · 5 flows · 2 groups · 0 warnings');
  await page.click('#btn-status-file-build');
  const src = await page.evaluate(() => app.state.statusSources[0]);
  expect(src).toMatchObject({ kind: 'json', url: 'samples/status-servers.json', path: 'items', keyField: 'name', valueField: 'status' });
  expect(await page.evaluate(() => app.state.pages.find((p) => p.id === app.state.activePageId).name)).toBe('Server status');
  await page.evaluate(async () => { app.setLiveStatus(true, { refresh: false }); await app.refreshLiveStatus({ manual: true }); });
  const shapes = await shapesByName(page);
  for (const [name, colour] of Object.entries(EXPECTED)) await expect(indFill(page, shapes[name].id), name).toHaveAttribute('fill', colour);
  expect(stray).toEqual([]);
});

test('a Google Sheet share link is read as its CSV export after the host is approved in the dialog', async ({ page }) => {
  const stray = await guardNetwork(page);
  const calls = await fake(page, /^https:\/\/docs\.google\.com\//, () => ({ body: SAMPLE_CSV, contentType: 'text/csv' }));
  await open(page);
  await openDialog(page);
  await previewUrl(page, SHARE);
  await expect(page.locator('#status-file-approve')).toBeVisible();
  await expect(page.locator('#status-file-approve')).toContainText('docs.google.com');
  expect(calls).toHaveLength(0);
  await page.click('#btn-status-file-approve');
  await expect(page.locator('#status-file-summary')).toHaveText('6 shapes · 5 flows · 2 groups · 0 warnings');
  expect(calls).toHaveLength(1);
  expect(calls[0].url).toBe(GVIZ);
  expect(calls[0].headers.cookie).toBeUndefined();
  await page.click('#btn-status-file-build');
  const src = await page.evaluate(() => app.state.statusSources[0]);
  expect(src).toMatchObject({ kind: 'sheet', url: SHARE });
  // The live status check uses the same address (already approved).
  await page.evaluate(async () => { app.setLiveStatus(true, { refresh: false }); await app.refreshLiveStatus({ manual: true }); });
  const shapes = await shapesByName(page);
  await expect(indFill(page, shapes['cache-01'].id)).toHaveAttribute('fill', '#b02a37');
  expect(calls.every((c) => c.url === GVIZ)).toBe(true);
  expect(stray).toEqual([]);
});

test('an https file needs approval; "Not now" sends nothing; a redirect is not followed', async ({ page }) => {
  const stray = await guardNetwork(page);
  const calls = await fake(page, 'https://status.example.test/moved.csv', () => ({ status: 302, headers: { ...CORS, location: 'https://elsewhere.example.test/x.csv' } }));
  await open(page);
  await openDialog(page);
  await previewUrl(page, 'https://status.example.test/moved.csv');
  await expect(page.locator('#status-file-approve')).toContainText('status.example.test');
  await page.click('#btn-status-file-approve-cancel');
  await expect(page.locator('#status-file-approve')).toBeHidden();
  expect(calls).toHaveLength(0);
  await page.click('#btn-status-file-preview');
  await page.click('#btn-status-file-approve');
  await expect(page.locator('#status-file-error')).toContainText(/redirect/i);
  expect(calls).toHaveLength(1);
  expect(stray).toEqual([]);   // elsewhere.example.test was never contacted
  await page.fill('#status-file-url', 'http://status.example.test/x.csv');
  await page.click('#btn-status-file-preview');
  await expect(page.locator('#status-file-error')).toContainText(/https/i);
});

test('a local file builds the diagram without a status source', async ({ page }) => {
  await open(page, { ...emptyModel(), elements: [{ id: 'old', type: 'process', name: 'Existing', x: 100, y: 100, width: 240, height: 80, secProps: {} }] });
  await openDialog(page);
  const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.click('#btn-status-file-choose')]);
  await chooser.setFiles({ name: 'servers.csv', mimeType: 'text/csv', buffer: Buffer.from(SAMPLE_CSV) });
  await expect(page.locator('#status-file-summary')).toHaveText('6 shapes · 5 flows · 2 groups · 0 warnings');
  await expect(page.locator('#status-file-keep')).toBeDisabled();
  await page.check('#status-file-target-this');
  await page.click('#btn-status-file-build');
  const s = await page.evaluate(() => ({ pages: app.state.pages.length, sources: app.state.statusSources.length, els: app.state.elements.map((e) => ({ name: e.name, x: e.x, live: !!e.liveStatus })) }));
  expect(s.pages).toBe(1);
  expect(s.sources).toBe(0);
  expect(s.els).toHaveLength(9);
  expect(s.els.filter((e) => e.name !== 'Existing').every((e) => e.x >= 100 + 240 && !e.live)).toBe(true);   // to the right of the existing shape
});

test('the preview lists warnings and the build is one undo step', async ({ page }) => {
  await open(page);
  await openDialog(page);
  const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.click('#btn-status-file-choose')]);
  await chooser.setFiles({ name: 'bad.csv', mimeType: 'text/csv', buffer: Buffer.from('name,status,type,ok_color\na,up,rocket,#zzz\na,down,,\n') });
  await expect(page.locator('#status-file-summary')).toHaveText('1 shape · 0 flows · 0 groups · 3 warnings');
  await expect(page.locator('#status-file-warnings li')).toHaveCount(3);
  await page.click('#btn-status-file-build');
  expect(await page.evaluate(() => app.state.elements.length)).toBe(1);
  expect(await page.evaluate(() => app.state.pages.length)).toBe(2);
  await page.evaluate(() => app.undo());
  expect(await page.evaluate(() => ({ els: app.state.elements.length, pages: app.state.pages.length }))).toEqual({ els: 0, pages: 1 });
});

test('review mode blocks building and updating', async ({ page }) => {
  await open(page, { ...emptyModel(), reviewMode: true });
  await openDialog(page);
  await previewUrl(page, 'samples/status-servers.csv');
  await expect(page.locator('#status-file-summary')).toContainText('6 shapes');
  await page.click('#btn-status-file-build');
  await expect(page.locator('#status-file-error')).toContainText(/review mode/i);
  expect(await page.evaluate(() => app.state.elements.length)).toBe(0);
});

// ── Update from file ──────────────────────────────────────────────────────────

test('update from file adds and updates rows, keeps moved shapes in place and asks before deleting', async ({ page }) => {
  const stray = await guardNetwork(page);
  let body = SAMPLE_CSV;
  await fake(page, 'https://status.example.test/servers.csv', () => ({ body, contentType: 'text/csv' }));
  await open(page);
  await approve(page, ['status.example.test']);
  await openDialog(page);
  await previewUrl(page, 'https://status.example.test/servers.csv');
  await expect(page.locator('#status-file-summary')).toContainText('6 shapes');
  await expect(page.locator('#btn-status-file-update')).toBeDisabled();   // nothing built from it yet
  await page.click('#btn-status-file-build');
  // The user moves web-01.
  const before = await shapesByName(page);
  await page.evaluate((id) => { const e = app.state.elements.find((x) => x.id === id); e.x += 37; e.y += 11; app.logEvent('CHANGE', 'moved'); }, before['web-01'].id);
  // The file changes: api-01 is now a load balancer with new notes, cache-01 is gone, new-01 joins Internal and web-01 also talks to new-01.
  body = SAMPLE_CSV.split('\n').filter((l) => !l.startsWith('cache-01'))
    .map((l) => l.startsWith('api-01') ? 'api-01,degraded,load-balancer,,310,800,,,,,,Internal,db-01,Balanced API' : l)
    .map((l) => l.startsWith('web-01') ? 'web-01,up,process,bi-globe2,45,500,,,,,,DMZ,api-01|new-01,Public web server (node 1)' : l)
    .join('\n') + 'new-01,up,,,,,,,,,,Internal,,Brand new\n';
  // Settings → Live status → Update from file opens the dialog for that source.
  await openSettingsTab(page, 'live');
  await page.locator('#live-sources-list .live-source-row .live-source-update').click();
  await expect(page.locator('#modal-status-file')).toBeVisible();
  await expect(page.locator('#status-file-url')).toHaveValue('https://status.example.test/servers.csv');
  await expect(page.locator('#status-file-summary')).toContainText('6 shapes');
  await expect(page.locator('#status-file-update-box')).toContainText('1 new');
  await expect(page.locator('#status-file-update-box')).toContainText('cache-01');
  await expect(page.locator('#status-file-delete-missing')).not.toBeChecked();
  await page.click('#btn-status-file-update');
  await expect(page.locator('#modal-status-file')).toBeHidden();
  let after = await shapesByName(page);
  expect(after['web-01'].x).toBe(before['web-01'].x + 37);
  expect(after['web-01'].y).toBe(before['web-01'].y + 11);
  ['web-02', 'db-01', 'backup-01'].forEach((n) => expect([after[n].x, after[n].y]).toEqual([before[n].x, before[n].y]));
  expect(after['api-01']).toMatchObject({ id: before['api-01'].id, type: 'infrastructure', icon: 'bi-signpost-split', notes: 'Balanced API' });
  expect(after['cache-01']).toBeTruthy();   // kept: not deleted without asking
  expect(after['new-01']).toMatchObject({ type: 'infrastructure', notes: 'Brand new' });
  expect(after['new-01'].liveStatus.check.key).toBe('new-01');
  const zone = await page.evaluate(() => app.state.elements.find((e) => e.type === 'boundary' && e.name === 'Internal'));
  const n = after['new-01'];
  expect(n.x >= zone.x && n.y >= zone.y && n.x + n.width <= zone.x + zone.width && n.y + n.height <= zone.y + zone.height).toBe(true);
  const names = () => page.evaluate(() => app.state.flows.map((f) => `${app.state.elements.find((e) => e.id === f.sourceId).name}>${app.state.elements.find((e) => e.id === f.targetId).name}`).sort());
  expect(await names()).toEqual(['api-01>cache-01', 'api-01>db-01', 'db-01>backup-01', 'web-01>api-01', 'web-01>new-01', 'web-02>api-01']);   // flows are added, never removed
  // One undo step brings the previous state back.
  await page.evaluate(() => app.undo());
  after = await shapesByName(page);
  expect(after['new-01']).toBeUndefined();
  expect(after['api-01'].type).toBe('process');
  await page.evaluate(() => app.redo());
  // Again, now deleting the missing row.
  await openDialog(page);
  await previewUrl(page, 'https://status.example.test/servers.csv');
  await expect(page.locator('#status-file-update-box')).toContainText('cache-01');
  await page.check('#status-file-delete-missing');
  await page.click('#btn-status-file-update');
  after = await shapesByName(page);
  expect(after['cache-01']).toBeUndefined();
  expect(await names()).not.toContain('api-01>cache-01');
  expect(stray).toEqual([]);
});

// ── Settings → Live status: kinds ───────────────────────────────────────────

test('Settings → Live status offers Google Sheet, CSV file and JSON file; a plain https CSV source works', async ({ page }) => {
  const stray = await guardNetwork(page);
  const calls = await fake(page, 'https://status.example.test/feed.csv', () => ({ body: 'host,state,latency\nAPI,down,20\n', contentType: 'text/csv' }));
  await open(page, { ...emptyModel(), elements: [{ id: 'n-api', type: 'process', name: 'API', x: 100, y: 100, width: 240, height: 80, secProps: {} }] });
  await openSettingsTab(page, 'live');
  const labels = await page.locator('#live-src-kind option').evaluateAll((o) => o.map((x) => [x.value, x.textContent]));
  expect(labels).toEqual([['sheet', 'Google Sheet'], ['csv', 'CSV file'], ['json', 'JSON file']]);
  await page.click('#btn-live-add-source');
  await page.fill('#live-src-name', 'Feed');
  await page.selectOption('#live-src-kind', 'csv');
  await page.fill('#live-src-url', 'https://status.example.test/feed.csv');
  await page.fill('#live-src-value-col', 'state');
  await page.click('#btn-live-src-save');
  await expect(page.locator('#live-sources-list .live-source-row .badge')).toHaveText('CSV');
  const src = await page.evaluate(() => app.state.statusSources[0]);
  expect(src).toMatchObject({ kind: 'csv', url: 'https://status.example.test/feed.csv', valueColumn: 'state' });
  await page.evaluate(() => bootstrap.Modal.getOrCreateInstance(document.getElementById('modal-settings')).hide());
  await expect(page.locator('#modal-settings')).toBeHidden();
  await approve(page, ['status.example.test']);
  await page.evaluate((id) => {
    app.state.elements[0].liveStatus = { enabled: true, check: { kind: 'source', sourceId: id, key: '' }, rules: [{ when: 'eq', value: 'down', fill: '#dc3545', stroke: '#dc3545' }, { when: 'else', fill: '#198754' }] };
  }, src.id);
  await page.evaluate(async () => { app.setLiveStatus(true, { refresh: false }); await app.refreshLiveStatus({ manual: true }); });
  await expect(indFill(page, 'n-api')).toHaveAttribute('fill', '#dc3545');
  expect(calls).toHaveLength(1);
  // A same-origin path is accepted in the form too, and needs no approval.
  await openSettingsTab(page, 'live');
  await page.click('#btn-live-add-source');
  await page.selectOption('#live-src-kind', 'csv');
  await page.fill('#live-src-url', 'samples/status-servers.csv');
  await page.click('#btn-live-src-save');
  await expect(page.locator('#live-sources-list .live-source-row')).toHaveCount(2);
  await page.locator('#live-sources-list .live-source-row').nth(1).locator('.live-source-test').click();
  await expect(page.locator('#live-approve-box')).toBeHidden();
  await expect(page.locator('#live-sources-list .live-source-row').nth(1)).toContainText('6 rows');
  expect(stray).toEqual([]);
});

// ── Untrusted content ─────────────────────────────────────────────────────────

test('payloads in names, descriptions, groups, icons and colours never run or inject markup', async ({ page }) => {
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('dialog', (d) => { errors.push('dialog: ' + d.message()); d.dismiss(); });
  await open(page);
  const P = '<img src=x onerror=alert(1) data-injected="1">';
  const q = (v) => `"${v.replace(/"/g, '""')}"`;
  const csv = ['name,status,type,icon,ok_color,fail_color,group,connects_to,description',
    [q(P), 'up', q(P), q('bi-x" onmouseover="alert(1)'), q('red;" data-injected="s'), q('#fff" data-injected="c'), q(P), q(P), q(P)].join(','),
    [q('"><svg onload=alert(1) data-injected=2>'), 'down', '', '', '', '', q(P), '', 'x'].join(',')].join('\n');
  await openDialog(page);
  const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.click('#btn-status-file-choose')]);
  await chooser.setFiles({ name: 'x.csv', mimeType: 'text/csv', buffer: Buffer.from(csv) });
  await expect(page.locator('#status-file-summary')).toContainText('2 shapes');
  await page.click('#btn-status-file-build');
  await page.evaluate(() => app.refreshAppViewVisualWorkspace());
  await page.waitForTimeout(300);
  const injected = await page.evaluate(() => [...document.querySelectorAll('*')].filter((el) => [...el.attributes].some((a) => a.name === 'data-injected' || a.name.startsWith('on'))).map((el) => el.outerHTML.slice(0, 120)));
  expect(injected).toEqual([]);
  expect(errors).toEqual([]);
  const els = await page.evaluate(() => app.state.elements.map((e) => ({ type: e.type, name: e.name, icon: e.icon, badgeFill: e.badgeFill })));
  expect(els.find((e) => e.type === 'boundary').name).toBe(P.slice(0, 60));
  expect(els.filter((e) => e.type !== 'boundary').every((e) => /^bi-[a-z0-9-]+$/.test(e.icon))).toBe(true);
});
