// Live status: status sources (Google Sheets / CSV, JSON), direct browser checks (Web, Reachability, DNS), per-shape
// and per-flow rules that colour the drawing, host approval, the live toggle, stale data and the activity log.
// Every remote endpoint is faked with page.route; anything else on https:// is aborted and recorded, so no test
// ever reaches the real internet.
const { test } = require('@playwright/test');
const { expect, openApp, clickControl, importJson, downloadText, openSettingsTab } = require('./helpers');

const SHEET_ID = '1AbCdEfGhIjKlMnOpQrStUvWxYz0123456789';
const SHARE = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/edit?usp=sharing#gid=42`;
const GVIZ = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:csv&gid=42`;
const CORS = { 'access-control-allow-origin': '*' };
const hexRgb = (h) => { const n = parseInt(h.slice(1), 16); return `rgb(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255})`; };

/** Aborts (and records) every https request no test fake handles. Register it before the fakes (later routes win). */
async function guardNetwork(page) {
  const stray = [];
  await page.route(/^https:\/\//, (route) => { stray.push(route.request().url()); return route.abort(); });
  return stray;
}

/** A fake endpoint: `reply(url, request)` returns { status, body, headers, delay } or null for a network error. */
async function fake(page, pattern, reply) {
  const calls = [];
  await page.route(pattern, async (route) => {
    const req = route.request();
    calls.push({ url: req.url(), method: req.method(), headers: req.headers() });
    const r = await reply(req.url(), req);
    if (!r) return route.abort('failed');
    if (r.delay) await new Promise((res) => setTimeout(res, r.delay));
    return route.fulfill({ status: r.status || 200, headers: r.headers || CORS, contentType: r.contentType || 'text/plain', body: r.body || '' }).catch(() => {});
  });
  return calls;
}

const SHAPES = [
  { id: 'n-api', type: 'process', name: 'API', x: 100, y: 100, width: 240, height: 80, secProps: {} },
  { id: 'n-db', type: 'datastore', name: 'Orders DB', x: 500, y: 100, width: 240, height: 80, secProps: {} },
  { id: 'n-worker', type: 'fc_process', name: 'Worker', x: 100, y: 400, width: 160, height: 80 },
  { id: 'n-gw', type: 'infrastructure', name: 'Gateway', x: 500, y: 400, width: 80, height: 70, icon: 'bi-router', secProps: {} },
];
const FLOW = { id: 'f-1', name: 'Orders', sourceId: 'n-api', targetId: 'n-db', sourceAnchor: 'right-2', targetAnchor: 'left-2', secProps: {} };

function model(mutate) {
  const m = { projectTitle: 'Live', activeUser: 'Tester', elements: JSON.parse(JSON.stringify(SHAPES)), flows: [JSON.parse(JSON.stringify(FLOW))], threats: [] };
  if (mutate) mutate(m);
  return m;
}
const RULES3 = [
  { when: 'eq', value: 'up', fill: '#198754' },
  { when: 'eq', value: 'degraded', fill: '#ffc107' },
  { when: 'eq', value: 'down', fill: '#dc3545', icon: 'bi-x-octagon-fill', label: 'DOWN' },
];
const sheetSource = { id: 'src-sheet', name: 'Status sheet', kind: 'sheet', url: SHARE };
const check = (key, extra = {}) => ({ enabled: true, check: { kind: 'source', sourceId: 'src-sheet', key, ...extra }, rules: RULES3 });

async function open(page, m) {
  await page.setViewportSize({ width: 1600, height: 1000 });
  await openApp(page, { session: m });
}
async function approve(page, hosts) {
  await page.evaluate((h) => localStorage.setItem('threat_tiger_live_approved', JSON.stringify(h)), hosts);
}
async function liveOnAndRefresh(page) {
  await page.evaluate(async () => { app.setLiveStatus(true, { refresh: false }); await app.refreshLiveStatus({ manual: true }); });
}
const ind = (page, id) => page.locator(`#canvas-svg g[data-id="${id}"] .live-status-ind`);

// ── Pure helpers ──────────────────────────────────────────────────────────────

test('a Google Sheets share link becomes its CSV address; other https CSV addresses stay as they are', async ({ page }) => {
  await open(page, model());
  const r = await page.evaluate(([share, id]) => ({
    share: liveSheetCsvUrl(share),
    noGid: liveSheetCsvUrl(`https://docs.google.com/spreadsheets/d/${id}/edit`),
    queryGid: liveSheetCsvUrl(`https://docs.google.com/spreadsheets/d/${id}/edit?gid=7`),
    pub: liveSheetCsvUrl('https://docs.google.com/spreadsheets/d/e/2PACX-1vQabc/pub?gid=0&single=true&output=csv'),
    other: liveSheetCsvUrl('https://status.example.com/feed.csv'),
    http: liveSheetCsvUrl('http://status.example.com/feed.csv'),
    creds: liveSheetCsvUrl('https://user:pw@status.example.com/feed.csv'),
    js: liveSheetCsvUrl('javascript:alert(1)'),
  }), [SHARE, SHEET_ID]);
  expect(r.share).toBe(GVIZ);
  expect(r.noGid).toBe(`https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:csv`);
  expect(r.queryGid).toBe(`https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:csv&gid=7`);
  expect(r.pub).toBe('https://docs.google.com/spreadsheets/d/e/2PACX-1vQabc/pub?gid=0&single=true&output=csv');
  expect(r.other).toBe('https://status.example.com/feed.csv');
  expect([r.http, r.creds, r.js]).toEqual(['', '', '']);
});

test('CSV parsing handles quotes, quoted commas, doubled quotes, line breaks in quotes and CRLF', async ({ page }) => {
  await open(page, model());
  const rows = await page.evaluate(() => parseCsv('\uFEFFName,Status,Note\r\n"API, public",up,"says ""hi"""\r\nDB,down,"two\nlines"\nEmpty,,\n'));
  expect(rows).toEqual([['Name', 'Status', 'Note'], ['API, public', 'up', 'says "hi"'], ['DB', 'down', 'two\nlines'], ['Empty', '', '']]);
});

test('sheet lookup: the row whose key column equals the name, then the column to its right or a chosen column', async ({ page }) => {
  await open(page, model());
  const r = await page.evaluate(() => {
    const rows = parseCsv('Service,Status,Latency,Owner\nAPI,up,120,Ann\n  orders db ,degraded,640,Bo\nGateway,down,,Cy\n');
    return {
      right: liveCsvLookup(rows, 'api', {}),
      trimmed: liveCsvLookup(rows, 'Orders DB', {}),
      byHeader: liveCsvLookup(rows, 'API', { valueColumn: 'owner' }),
      byLetter: liveCsvLookup(rows, 'API', { valueColumn: 'C' }),
      byNumber: liveCsvLookup(rows, 'API', { valueColumn: '4' }),
      keyCol: liveCsvLookup(rows, 'Bo', { keyColumn: 'Owner', valueColumn: 'Service' }),
      missing: liveCsvLookup(rows, 'Nope', {}),
      header: liveCsvLookup(rows, 'Service', {}),
    };
  });
  expect(r.right).toMatchObject({ found: true, value: 'up', latency: 120 });
  expect(r.trimmed).toMatchObject({ found: true, value: 'degraded', latency: 640 });
  expect(r.byHeader.value).toBe('Ann');
  expect(r.byLetter.value).toBe('120');
  expect(r.byNumber.value).toBe('Ann');
  expect(r.keyCol.value).toBe('orders db');
  expect(r.missing.found).toBe(false);
  expect(r.header.found).toBe(false);   // the first row is the header row
});

test('JSON lookup: an array of objects, an object map, nested objects and a dotted path', async ({ page }) => {
  await open(page, model());
  const r = await page.evaluate(() => ({
    arr: liveJsonLookup([{ name: 'API', status: 'up', latency: 120 }, { name: 'DB', status: 'down' }], 'api', {}),
    fields: liveJsonLookup([{ host: 'API', state: 'green' }], 'API', { keyField: 'host', valueField: 'state' }),
    map: liveJsonLookup({ API: 'up', DB: 'down' }, 'db', {}),
    mapObj: liveJsonLookup({ API: { status: 'degraded', latencyMs: 900 } }, 'API', {}),
    path: liveJsonLookup({ data: { services: [{ name: 'API', status: 'up' }] } }, 'API', { path: 'data.services' }),
    badPath: liveJsonLookup({ data: {} }, 'API', { path: 'data.services' }),
    num: liveJsonLookup([{ name: 'API', status: 503 }], 'API', {}),
    missing: liveJsonLookup([{ name: 'API', status: 'up' }], 'Nope', {}),
    proto: liveJsonLookup(JSON.parse('{"__proto__": {"status": "up"}}'), '__proto__', {}),
  }));
  expect(r.arr).toMatchObject({ found: true, value: 'up', latency: 120 });
  expect(r.fields.value).toBe('green');
  expect(r.map.value).toBe('down');
  expect(r.mapObj).toMatchObject({ value: 'degraded', latency: 900 });
  expect(r.path.value).toBe('up');
  expect(r.badPath.found).toBe(false);
  expect(r.num.value).toBe('503');
  expect(r.missing.found).toBe(false);
  expect(r.proto.value).toBe('up');
});

test('rules: equals, not equals, contains, numbers, latency, no data and anything else; the first match wins', async ({ page }) => {
  await open(page, model());
  const r = await page.evaluate(() => {
    const at = Date.now();
    const m = (rules, res) => { const x = liveMatchRule(rules, res); return x ? x.label : null; };
    const R = [
      { when: 'nodata', label: 'none' },
      { when: 'eq', value: 'up|ok', label: 'green' },
      { when: 'contains', value: 'degr', label: 'amber' },
      { when: 'gt', value: '90', label: 'hot' },
      { when: 'lt', value: '10', label: 'cold' },
      { when: 'else', label: 'other' },
    ];
    return {
      up: m(R, { value: 'UP ', at }), ok: m(R, { value: 'ok', at }), degr: m(R, { value: 'Degraded', at }),
      hot: m(R, { value: '95 %', at }), cold: m(R, { value: '3', at }), other: m(R, { value: 'weird', at }),
      empty: m(R, { value: '', at }), error: m(R, { value: '', error: 'HTTP 500', at }), none: m(R, null),
      neq: m([{ when: 'neq', value: 'up', label: 'not up' }], { value: 'down', at }),
      neqUp: m([{ when: 'neq', value: 'up', label: 'not up' }], { value: 'up', at }),
      latGt: m([{ when: 'latency_gt', value: '500', label: 'slow' }, { when: 'else', label: 'fast' }], { value: 'up', latency: 900, at }),
      latLt: m([{ when: 'latency_lt', value: '100', label: 'quick' }], { value: 'up', latency: 40, at }),
      latErr: m([{ when: 'latency_gt', value: '500', label: 'slow' }], { value: 'down', latency: 8000, error: 'timeout', at }),
      firstWins: m([{ when: 'eq', value: 'up', label: 'a' }, { when: 'eq', value: 'up', label: 'b' }], { value: 'up', at }),
      state: m([{ when: 'eq', value: 'up', label: 'up by state' }], { value: '204', state: 'up', at }),
      noMatch: m([{ when: 'eq', value: 'up', label: 'x' }], { value: 'down', at }),
    };
  });
  expect(r).toEqual({ up: 'green', ok: 'green', degr: 'amber', hot: 'hot', cold: 'cold', other: 'other', empty: 'none', error: 'none', none: 'none',
    neq: 'not up', neqUp: null, latGt: 'slow', latLt: 'quick', latErr: null, firstWins: 'a', state: 'up by state', noMatch: null });
});

test('the normaliser keeps valid sources and checks and drops bad addresses, kinds, rules, colours and icons', async ({ page }) => {
  await open(page, model());
  const r = await page.evaluate(() => {
    const { session } = normalizeSession({
      statusSources: [
        { id: 'ok', name: 'Sheet', kind: 'sheet', url: 'https://docs.google.com/spreadsheets/d/abcdefghijk/edit', intervalSec: 5, token: 'x' },
        { id: 'js', name: 'JSON', kind: 'json', url: 'https://status.example.com/s.json', keyField: 'host', valueField: 'state', path: 'data.items', intervalSec: 120 },
        { id: 'http', kind: 'json', url: 'http://status.example.com/s.json' },
        { id: 'cred', kind: 'json', url: 'https://u:p@status.example.com/s.json' },
        { id: 'scheme', kind: 'sheet', url: 'javascript:alert(1)' },
        { id: 'kind', kind: 'xml', url: 'https://status.example.com/s.xml' },
        { id: 'long', kind: 'json', url: 'https://example.com/' + 'a'.repeat(3000) },
        { id: 'bad id!', kind: 'json', url: 'https://example.com/a.json' },
        { id: 'ok', kind: 'json', url: 'https://example.com/dup.json' },
      ],
      elements: [
        { id: 'a', type: 'process', name: 'A', x: 0, y: 0, liveStatus: { enabled: true, check: { kind: 'source', sourceId: 'ok', key: ' API ' }, extra: 1,
          rules: [
            { when: 'eq', value: 'up', fill: '#0F0', stroke: 'red', icon: 'bi-check', label: 'x'.repeat(200) },
            { when: 'drop table', value: 'x', fill: '#000000' },
            { when: 'nodata', value: 'ignored', fill: 'url(javascript:1)', icon: 'bi-x" onerror="1' },
            ...Array.from({ length: 30 }, () => ({ when: 'else', fill: '#123456' })),
          ] } },
        { id: 'b', type: 'process', name: 'B', x: 0, y: 0, liveStatus: 'yes' },
        { id: 'c', type: 'process', name: 'C', x: 0, y: 0, liveStatus: { enabled: 'true', check: { kind: 'ftp' } } },
        { id: 'd', type: 'process', name: 'D', x: 0, y: 0, liveStatus: { enabled: true, check: { kind: 'dns', key: 'example.com', dnsProvider: 'evil' } } },
      ],
      flows: [{ id: 'f', sourceId: 'a', targetId: 'b', liveStatus: { enabled: true, check: { kind: 'http', key: 'https://api.example.com/health' }, rules: [{ when: 'latency_gt', value: '500', stroke: '#dc3545' }] } }],
    });
    return { sources: session.statusSources, a: session.elements[0].liveStatus, b: session.elements[1].liveStatus, c: session.elements[2].liveStatus, d: session.elements[3].liveStatus, f: session.flows[0].liveStatus };
  });
  expect(r.sources.map((s) => s.id)).toEqual(['ok', 'js']);
  expect(r.sources[0]).toEqual({ id: 'ok', name: 'Sheet', kind: 'sheet', url: 'https://docs.google.com/spreadsheets/d/abcdefghijk/edit', keyColumn: '', valueColumn: '', intervalSec: 10 });
  expect(r.sources[1]).toEqual({ id: 'js', name: 'JSON', kind: 'json', url: 'https://status.example.com/s.json', keyField: 'host', valueField: 'state', path: 'data.items', intervalSec: 120 });
  expect(r.a.enabled).toBe(true);
  expect(r.a.check).toEqual({ kind: 'source', sourceId: 'ok', key: 'API' });
  expect(r.a.extra).toBeUndefined();
  expect(r.a.rules).toHaveLength(20);
  expect(r.a.rules[0]).toEqual({ when: 'eq', value: 'up', fill: '#00ff00', icon: 'bi-check', label: 'x'.repeat(60) });   // 'red' is not a hex colour
  expect(r.a.rules[1]).toEqual({ when: 'nodata' });   // the unknown condition is dropped; no value, colour or icon survives
  expect(r.b).toBeUndefined();
  expect(r.c).toEqual({ enabled: false, check: { kind: 'source', sourceId: '', key: '' }, rules: [] });
  expect(r.d.check).toEqual({ kind: 'dns', key: 'example.com', dnsProvider: 'cloudflare' });
  expect(r.f.rules).toEqual([{ when: 'latency_gt', value: '500', stroke: '#dc3545' }]);
});

// ── Properties ───────────────────────────────────────────────────────────────

test('the Status check box is off by default; checking it reveals the options and default rules, unchecking hides them', async ({ page }) => {
  await open(page, model((m) => { m.statusSources = [sheetSource]; }));
  await page.evaluate(() => app.handleElementSelectionEvent('n-api'));
  await expect(page.locator('#box-props-live-status')).toBeVisible();
  await expect(page.locator('#props-live-enabled')).not.toBeChecked();
  await expect(page.locator('#props-live-details')).toBeHidden();
  await page.locator('#props-live-enabled').check();
  await expect(page.locator('#props-live-details')).toBeVisible();
  const st = await page.evaluate(() => app.state.elements.find((e) => e.id === 'n-api').liveStatus);
  expect(st.enabled).toBe(true);
  expect(st.check).toMatchObject({ kind: 'source', sourceId: 'src-sheet', key: '' });
  expect(st.rules.length).toBeGreaterThanOrEqual(3);
  expect(st.rules.some((x) => x.fill === '#198754')).toBe(true);
  await expect(page.locator('#props-live-rules .live-rule-row')).toHaveCount(st.rules.length);
  // Add, reorder and delete rules.
  const n = st.rules.length;
  await page.click('#btn-live-add-rule');
  await expect(page.locator('#props-live-rules .live-rule-row')).toHaveCount(n + 1);
  const last = page.locator('#props-live-rules .live-rule-row').last();
  await last.locator('.live-rule-when').selectOption('contains');
  await last.locator('.live-rule-value').fill('maint');
  await last.locator('.live-rule-value').press('Tab');
  await last.locator('.live-rule-label').fill('Maintenance');
  await last.locator('.live-rule-label').press('Tab');
  await last.locator('.live-rule-up').click();
  let rules = await page.evaluate(() => app.state.elements.find((e) => e.id === 'n-api').liveStatus.rules);
  expect(rules[n - 1]).toMatchObject({ when: 'contains', value: 'maint', label: 'Maintenance' });
  await page.locator('#props-live-rules .live-rule-row').nth(n - 1).locator('.live-rule-delete').click();
  rules = await page.evaluate(() => app.state.elements.find((e) => e.id === 'n-api').liveStatus.rules);
  expect(rules).toHaveLength(n);
  expect(rules.some((x) => x.label === 'Maintenance')).toBe(false);
  // Unchecking: nothing else shows; the rules stay in the model for later.
  await page.locator('#props-live-enabled').uncheck();
  await expect(page.locator('#props-live-details')).toBeHidden();
  expect(await page.evaluate(() => app.state.elements.find((e) => e.id === 'n-api').liveStatus.enabled)).toBe(false);
});

test('flows, flowchart shapes and icon nodes have a Status check too; trust zones and text do not', async ({ page }) => {
  await open(page, model((m) => {
    m.elements.push({ id: 'z', type: 'boundary', name: 'Zone', x: 0, y: 800, width: 300, height: 200 });
    m.elements.push({ id: 't', type: 'textbox', name: 'Note', x: 400, y: 800, width: 200, height: 60 });
  }));
  for (const id of ['n-worker', 'n-gw']) {
    await page.evaluate((x) => app.handleElementSelectionEvent(x), id);
    await expect(page.locator('#box-props-live-status')).toBeVisible();
  }
  await page.evaluate(() => app.handleFlowSelectionEvent('f-1'));
  await expect(page.locator('#box-props-live-status')).toBeVisible();
  await page.locator('#props-live-enabled').check();
  const kinds = await page.locator('#props-live-kind option').evaluateAll((o) => o.map((x) => x.value));
  expect(kinds).toEqual(expect.arrayContaining(['http', 'reach', 'dns']));
  await expect(page.locator('#props-live-rules .live-rule-fill')).toHaveCount(0);    // a line has a colour, no fill
  await expect(page.locator('#props-live-rules .live-rule-stroke').first()).toBeVisible();
  for (const id of ['z', 't']) {
    await page.evaluate((x) => app.handleElementSelectionEvent(x), id);
    await expect(page.locator('#box-props-live-status')).toBeHidden();
  }
});

// ── Sources, approval, colours ──────────────────────────────────────────────────

test('a Google Sheet colours nodes by the value right of their name, after the host is approved', async ({ page }) => {
  const stray = await guardNetwork(page);
  const sheet = await fake(page, /^https:\/\/docs\.google\.com\//, () => ({ body: 'Service,Status\nAPI,up\nOrders DB,degraded\nWorker,down\nGateway,down\n', contentType: 'text/csv' }));
  await open(page, model((m) => {
    m.statusSources = [sheetSource];
    m.elements.forEach((e) => { e.liveStatus = check(''); });   // key: the shape's name
  }));
  // Live status is off: nothing is requested.
  await page.evaluate(() => app.refreshLiveStatus({ manual: true }));
  expect(sheet).toHaveLength(0);
  await expect(ind(page, 'n-api')).toHaveCount(0);
  // Turning it on asks for approval first (Settings → Live status), still without a request.
  await clickControl(page, '#btn-menu-live-status');
  await expect(page.locator('#modal-settings')).toBeVisible();
  await expect(page.locator('#live-approve-box')).toBeVisible();
  await expect(page.locator('#live-approve-hosts')).toContainText('docs.google.com');
  expect(sheet).toHaveLength(0);
  await expect(ind(page, 'n-api')).toHaveAttribute('data-live-state', 'pending');
  await page.click('#btn-live-approve');
  await expect.poll(() => sheet.length).toBe(1);
  expect(sheet[0].url).toBe(GVIZ);
  expect(sheet[0].method).toBe('GET');
  await expect(page.locator('#live-approve-box')).toBeHidden();
  await expect(page.locator('#live-sources-list')).toContainText(/OK|rows/i);
  await page.keyboard.press('Escape');
  // Card: the icon stripe takes the fill colour.
  await expect(page.locator('g[data-id="n-api"] .card-icon-stripe')).toHaveCSS('background-color', hexRgb('#198754'));
  await expect(page.locator('g[data-id="n-db"] .card-icon-stripe')).toHaveCSS('background-color', hexRgb('#ffc107'));
  // Flowchart shape: its fill.
  expect(await page.locator('g[data-id="n-worker"] [fill="#dc3545"]').count()).toBeGreaterThan(0);
  // Icon node: red icon, and the rule's icon replaces its own.
  await expect(page.locator('g[data-id="n-gw"] i.bi-x-octagon-fill')).toHaveCount(1);
  await expect(page.locator('g[data-id="n-gw"] i.bi-router')).toHaveCount(0);
  await expect(page.locator('g[data-id="n-gw"] .live-status-label')).toHaveText('DOWN');
  await expect(ind(page, 'n-api')).toHaveAttribute('data-live-state', 'match');
  await expect(ind(page, 'n-api').locator('title')).toContainText('up');
  // The stored shapes did not change.
  const stored = await page.evaluate(() => app.state.elements.map((e) => [e.icon || '', e.fcFillColor || '']));
  expect(stored).toEqual([['', ''], ['', ''], ['', ''], ['bi-router', '']]);
  // Approval is remembered: another refresh needs no question.
  await page.evaluate(() => app.refreshLiveStatus({ manual: true }));
  expect(sheet).toHaveLength(2);   // one request per cycle for all four shapes
  expect(stray).toEqual([]);
});

test('a JSON feed with latency colours a flow red when the latency is too high', async ({ page }) => {
  const stray = await guardNetwork(page);
  let latency = 900;
  await fake(page, 'https://status.example.com/services.json', () => ({ contentType: 'application/json', body: JSON.stringify({ data: { services: [{ name: 'Orders', status: 'up', latency }] } }) }));
  await open(page, model((m) => {
    m.statusSources = [{ id: 'src-json', name: 'Feed', kind: 'json', url: 'https://status.example.com/services.json', path: 'data.services' }];
    m.flows[0].liveStatus = { enabled: true, check: { kind: 'source', sourceId: 'src-json', key: '' }, rules: [
      { when: 'latency_gt', value: '800', stroke: '#dc3545', label: 'slow' },
      { when: 'latency_gt', value: '300', stroke: '#ffc107' },
      { when: 'else', stroke: '#198754' },
    ] };
  }));
  await approve(page, ['status.example.com']);
  await liveOnAndRefresh(page);
  await expect(page.locator('g[data-flow-id="f-1"] path.flow-line')).toHaveAttribute('stroke', '#dc3545');
  await expect(page.locator('g[data-flow-id="f-1"] .live-status-label')).toHaveText('slow');
  latency = 120;
  await page.evaluate(() => app.refreshLiveStatus({ manual: true }));
  await expect(page.locator('g[data-flow-id="f-1"] path.flow-line')).toHaveAttribute('stroke', '#198754');
  expect(await page.evaluate(() => app.state.flows[0].color)).toBeUndefined();
  expect(stray).toEqual([]);
});

test('unchecking Status check or turning live status off removes the overlay', async ({ page }) => {
  await guardNetwork(page);
  await fake(page, /^https:\/\/docs\.google\.com\//, () => ({ body: 'S,V\nAPI,down\n' }));
  await open(page, model((m) => { m.statusSources = [sheetSource]; m.elements[0].liveStatus = check(''); }));
  await approve(page, ['docs.google.com']);
  await liveOnAndRefresh(page);
  await expect(page.locator('g[data-id="n-api"] .card-icon-stripe')).toHaveCSS('background-color', hexRgb('#dc3545'));
  await page.evaluate(() => app.handleElementSelectionEvent('n-api'));
  await page.locator('#props-live-enabled').uncheck();
  await expect(ind(page, 'n-api')).toHaveCount(0);
  await expect(page.locator('g[data-id="n-api"] .card-icon-stripe')).not.toHaveCSS('background-color', hexRgb('#dc3545'));
  await page.locator('#props-live-enabled').check();
  await expect(page.locator('g[data-id="n-api"] .card-icon-stripe')).toHaveCSS('background-color', hexRgb('#dc3545'));
  await page.evaluate(() => app.setLiveStatus(false));
  await expect(ind(page, 'n-api')).toHaveCount(0);
  await expect(page.locator('g[data-id="n-api"] .card-icon-stripe')).not.toHaveCSS('background-color', hexRgb('#dc3545'));
});

test('a source can be added, tested and removed in Settings → Live status', async ({ page }) => {
  const stray = await guardNetwork(page);
  const calls = await fake(page, 'https://status.example.com/s.json', () => ({ contentType: 'application/json', body: '[{"name":"API","status":"up"}]' }));
  await open(page, model());
  await openSettingsTab(page, 'live');
  await expect(page.locator('#settings-live')).toBeVisible();
  await page.click('#btn-live-add-source');
  await page.fill('#live-src-name', 'Feed');
  await page.selectOption('#live-src-kind', 'json');
  await page.fill('#live-src-url', 'http://status.example.com/s.json');
  await page.click('#btn-live-src-save');
  await expect(page.locator('#live-src-error')).toContainText(/https/i);
  await page.fill('#live-src-url', 'https://status.example.com/s.json');
  await page.click('#btn-live-src-save');
  await expect(page.locator('#live-sources-list .live-source-row')).toHaveCount(1);
  const src = await page.evaluate(() => app.state.statusSources);
  expect(src).toHaveLength(1);
  expect(src[0]).toMatchObject({ name: 'Feed', kind: 'json', url: 'https://status.example.com/s.json' });
  // Test: asks for approval first.
  await page.locator('#live-sources-list .live-source-row .live-source-test').click();
  await expect(page.locator('#live-approve-box')).toBeVisible();
  expect(calls).toHaveLength(0);
  await page.click('#btn-live-approve');
  await expect(page.locator('#live-sources-list .live-source-row')).toContainText(/1 (item|row)/);
  expect(calls).toHaveLength(1);
  await page.locator('#live-sources-list .live-source-row .live-source-remove').click();
  await expect(page.locator('#live-sources-list .live-source-row')).toHaveCount(0);
  expect(await page.evaluate(() => app.state.statusSources)).toEqual([]);
  expect(stray).toEqual([]);
});

test('an imported model never contacts a host that was not approved in this browser', async ({ page }) => {
  const stray = await guardNetwork(page);
  const evil = await fake(page, /^https:\/\/(tracker|evil)\.example\.net\//, () => ({ body: '[]' }));
  await open(page, model());
  await page.evaluate(() => app.setLiveStatus(true));
  const forged = model((m) => {
    m.statusSources = [{ id: 's', name: 'Feed', kind: 'json', url: 'https://tracker.example.net/pixel.json' }];
    m.elements[0].liveStatus = { enabled: true, check: { kind: 'source', sourceId: 's', key: 'API' }, rules: RULES3 };
    m.elements[1].liveStatus = { enabled: true, check: { kind: 'http', key: 'https://evil.example.net/ping' }, rules: RULES3 };
    m.elements[2].liveStatus = { enabled: true, check: { kind: 'dns', key: 'secret-host.example.net', dnsProvider: 'google' }, rules: RULES3 };
  });
  await importJson(page, JSON.stringify(forged));
  await page.evaluate(() => app.refreshLiveStatus());   // a timed refresh
  await page.waitForTimeout(300);
  expect(evil).toEqual([]);
  expect(stray).toEqual([]);
  await expect(ind(page, 'n-api')).toHaveAttribute('data-live-state', 'pending');
  await expect(ind(page, 'n-api').locator('title')).toContainText(/approv/i);
  // Approvals are not part of the model.
  const json = await downloadText(page, '#btn-export');
  expect(json).not.toContain('approved');
});

test('the live status switch is off by default and remembered in this browser', async ({ page }) => {
  await open(page, model());
  expect(await page.evaluate(() => app.liveOn)).toBe(false);
  await page.click('#btn-main-menu');
  await page.click('#btn-menu-view');
  await expect(page.locator('#btn-menu-live-status')).toHaveAttribute('aria-checked', 'false');
  await page.keyboard.press('Escape');
  await page.evaluate(() => app.setLiveStatus(true));
  await page.reload();
  await page.waitForFunction(() => window.app && window.app.state);
  expect(await page.evaluate(() => app.liveOn)).toBe(true);
  await expect(page.locator('#btn-menu-live-status')).toHaveAttribute('aria-checked', 'true');
  await openSettingsTab(page, 'live');
  await expect(page.locator('#live-status-toggle')).toBeChecked();
  await page.locator('#live-status-toggle').uncheck();
  expect(await page.evaluate(() => [app.liveOn, localStorage.getItem('threat_tiger_live_status')])).toEqual([false, 'off']);
  // The interval: at least 10 s, 60 s by default.
  await expect(page.locator('#live-status-interval')).toHaveValue('60');
  await page.fill('#live-status-interval', '3');
  await page.locator('#live-status-interval').press('Tab');
  expect(await page.evaluate(() => app.liveIntervalSec())).toBe(10);
});

// ── Direct checks ───────────────────────────────────────────────────────────────

const webRules = () => [
  { when: 'gt', value: '399', fill: '#dc3545', label: 'error' },   // before "down": a 503 is also in state down
  { when: 'eq', value: 'down', fill: '#dc3545', label: 'down' },
  { when: 'eq', value: 'up', fill: '#198754', label: 'up' },
];

test('Web check: a readable reply gives its status code; without CORS only reachability; a timeout is down', async ({ page }) => {
  const stray = await guardNetwork(page);
  await fake(page, 'https://cors.example.com/health', () => ({ status: 200, body: 'ok' }));
  await fake(page, 'https://broken.example.com/health', () => ({ status: 503, body: 'no' }));
  // A server without CORS: the page cannot read a cors-mode reply (Playwright's fulfil would make it readable, so the
  // cors-mode request, which carries an Origin header, fails the way a CORS refusal looks to the page); a no-cors request gets an opaque reply.
  const opaque = await fake(page, 'https://nocors.example.com/', (url, req) => (req.headers().origin ? null : { status: 200, body: 'hi', headers: {} }));
  await fake(page, 'https://slow.example.com/', () => ({ status: 200, body: 'late', delay: 1500 }));
  await open(page, model((m) => {
    m.elements[0].liveStatus = { enabled: true, check: { kind: 'http', key: 'https://cors.example.com/health' }, rules: webRules() };
    m.elements[1].liveStatus = { enabled: true, check: { kind: 'http', key: 'https://broken.example.com/health' }, rules: webRules() };
    m.elements[2].liveStatus = { enabled: true, check: { kind: 'http', key: 'nocors.example.com' }, rules: webRules() };
    m.elements[3].liveStatus = { enabled: true, check: { kind: 'http', key: 'https://slow.example.com/' }, rules: webRules() };
  }));
  await approve(page, ['cors.example.com', 'broken.example.com', 'nocors.example.com', 'slow.example.com']);
  await page.evaluate(() => { app.liveTimeoutMs = 400; });
  await liveOnAndRefresh(page);
  const res = await page.evaluate(() => Object.fromEntries(['n-api', 'n-db', 'n-worker', 'n-gw'].map((id) => { const r = app.liveResultFor(app.liveItemById(id)); return [id, r && { value: r.value, state: r.state, cors: r.cors, error: r.error || '' }]; })));
  expect(res['n-api']).toMatchObject({ value: '200', state: 'up', cors: true });
  expect(res['n-db']).toMatchObject({ value: '503', state: 'down', cors: true });
  expect(res['n-worker']).toMatchObject({ value: 'up', state: 'up', cors: false });
  expect(res['n-gw']).toMatchObject({ value: 'down', state: 'down' });
  expect(res['n-gw'].error).toMatch(/time/i);
  await expect(page.locator('g[data-id="n-api"] .live-status-label')).toHaveText('up');      // "equals up" matches the state of a 200
  await expect(page.locator('g[data-id="n-db"] .live-status-label')).toHaveText('error');
  await expect(page.locator('g[data-id="n-worker"] .live-status-label')).toHaveText('up');
  await expect(page.locator('g[data-id="n-gw"] .live-status-label')).toHaveText('down');
  await expect(ind(page, 'n-worker').locator('title')).toContainText(/reachab/i);
  expect(opaque.length).toBeGreaterThanOrEqual(1);
  expect(opaque.every((c) => c.url === 'https://nocors.example.com/')).toBe(true);
  // The Properties panel explains the limit.
  await page.evaluate(() => app.handleElementSelectionEvent('n-worker'));
  await expect(page.locator('#props-live-note')).toContainText(/CORS/);
  expect(stray).toEqual([]);
});

test('Reachability sends a HEAD request and reports up with its round-trip time, or down', async ({ page }) => {
  const stray = await guardNetwork(page);
  const ok = await fake(page, 'https://up.example.com/', () => ({ status: 204, headers: {} }));
  await fake(page, 'https://gone.example.com/', () => null);
  await open(page, model((m) => {
    m.elements[0].liveStatus = { enabled: true, check: { kind: 'reach', key: 'up.example.com' }, rules: webRules() };
    m.elements[1].liveStatus = { enabled: true, check: { kind: 'reach', key: 'https://gone.example.com' }, rules: webRules() };
  }));
  await approve(page, ['up.example.com', 'gone.example.com']);
  await liveOnAndRefresh(page);
  expect(ok[0].method).toBe('HEAD');
  const r = await page.evaluate(() => [app.liveResultFor(app.liveItemById('n-api')), app.liveResultFor(app.liveItemById('n-db'))]);
  expect(r[0].value).toBe('up');
  expect(Number.isFinite(r[0].latency)).toBe(true);
  expect(r[1].value).toBe('down');
  await expect(page.locator('g[data-id="n-api"] .live-status-label')).toHaveText('up');
  await expect(page.locator('g[data-id="n-db"] .live-status-label')).toHaveText('down');
  expect(stray).toEqual([]);
});

test('DNS check: resolves or NXDOMAIN through DNS-over-HTTPS, Cloudflare or Google', async ({ page }) => {
  const stray = await guardNetwork(page);
  const answer = (url) => {
    const name = new URL(url).searchParams.get('name');
    return name === 'api.example.com'
      ? { contentType: 'application/dns-json', body: JSON.stringify({ Status: 0, Answer: [{ name, type: 5, data: 'edge.example.com.' }, { name, type: 1, data: '203.0.113.7' }] }) }
      : { contentType: 'application/dns-json', body: JSON.stringify({ Status: 3 }) };
  };
  const cf = await fake(page, /^https:\/\/cloudflare-dns\.com\/dns-query/, answer);
  const gg = await fake(page, /^https:\/\/dns\.google\/resolve/, answer);
  const rules = [{ when: 'eq', value: 'resolves', fill: '#198754', label: 'ok' }, { when: 'eq', value: 'nxdomain', fill: '#dc3545', label: 'nx' }];
  await open(page, model((m) => {
    m.elements[0].liveStatus = { enabled: true, check: { kind: 'dns', key: 'api.example.com', dnsProvider: 'cloudflare' }, rules };
    m.elements[1].liveStatus = { enabled: true, check: { kind: 'dns', key: 'https://missing.example.com/x', dnsProvider: 'google' }, rules };
  }));
  await approve(page, ['cloudflare-dns.com/api.example.com', 'dns.google/missing.example.com']);   // per provider AND looked-up name
  await liveOnAndRefresh(page);
  expect(cf).toHaveLength(1);
  expect(cf[0].url).toBe('https://cloudflare-dns.com/dns-query?name=api.example.com&type=A');
  expect(cf[0].headers.accept).toBe('application/dns-json');
  expect(gg[0].url).toBe('https://dns.google/resolve?name=missing.example.com&type=A');
  const r = await page.evaluate(() => [app.liveResultFor(app.liveItemById('n-api')), app.liveResultFor(app.liveItemById('n-db'))]);
  expect(r[0]).toMatchObject({ value: 'resolves', ip: '203.0.113.7' });
  expect(r[1].value).toBe('nxdomain');
  await expect(page.locator('g[data-id="n-api"] .live-status-label')).toHaveText('ok');
  await expect(page.locator('g[data-id="n-db"] .live-status-label')).toHaveText('nx');
  await page.evaluate(() => app.handleElementSelectionEvent('n-db'));
  await expect(page.locator('#props-live-note')).toContainText(/Google/);
  expect(stray).toEqual([]);
});

// ── Stale data, model hygiene, activity log ───────────────────────────────────

test('stale data turns the indicator grey and removes the colours', async ({ page }) => {
  await guardNetwork(page);
  await fake(page, /^https:\/\/docs\.google\.com\//, () => ({ body: 'S,V\nAPI,up\n' }));
  await open(page, model((m) => { m.statusSources = [sheetSource]; m.elements[0].liveStatus = check(''); }));
  await approve(page, ['docs.google.com']);
  await liveOnAndRefresh(page);
  await expect(page.locator('g[data-id="n-api"] .card-icon-stripe')).toHaveCSS('background-color', hexRgb('#198754'));
  await page.evaluate(() => { app.live.sourceData.get('src-sheet').at = Date.now() - 10 * 60 * 1000; app.renderSvgDiagramElements(); });
  await expect(ind(page, 'n-api')).toHaveAttribute('data-live-state', 'stale');
  await expect(ind(page, 'n-api').locator('title')).toContainText(/stale|old/i);
  await expect(page.locator('g[data-id="n-api"] .live-status-stale')).toHaveCount(1);
  await expect(page.locator('g[data-id="n-api"] .card-icon-stripe')).not.toHaveCSS('background-color', hexRgb('#198754'));
});

test('results never go into the model, its exports or undo', async ({ page }) => {
  await guardNetwork(page);
  await fake(page, /^https:\/\/docs\.google\.com\//, () => ({ body: 'S,V,Note\nAPI,degraded,zz-live-marker\n' }));
  await open(page, model((m) => { m.statusSources = [sheetSource]; m.elements[0].liveStatus = check(''); }));
  await approve(page, ['docs.google.com']);
  const before = await page.evaluate(() => [app.serializeModel(), app.undoStack.length]);
  await liveOnAndRefresh(page);
  await expect(page.locator('g[data-id="n-api"] .card-icon-stripe')).toHaveCSS('background-color', hexRgb('#ffc107'));
  const after = await page.evaluate(() => [app.serializeModel(), app.undoStack.length, localStorage.getItem('stride_workbench_session_manifest_v26') || '']);
  expect(after[0]).toBe(before[0]);
  expect(after[1]).toBe(before[1]);
  expect(after[2]).not.toContain('zz-live-marker');
  const json = await downloadText(page, '#btn-export');
  const m = JSON.parse(json);
  expect(m.statusSources).toEqual([expect.objectContaining({ id: 'src-sheet', url: SHARE })]);
  expect(m.elements[0].liveStatus.rules).toEqual(RULES3);
  expect(json).not.toContain('zz-live-marker');
});

test('the activity log records a status change only when the matched state changes', async ({ page }) => {
  await guardNetwork(page);
  let value = 'up';
  await fake(page, /^https:\/\/docs\.google\.com\//, () => ({ body: `S,V\nAPI,${value}\n` }));
  await open(page, model((m) => { m.statusSources = [sheetSource]; m.elements[0].liveStatus = check(''); }));
  await approve(page, ['docs.google.com']);
  const count = () => page.evaluate(() => app.state.activityLog.filter((l) => l.type === 'STATUS').length);
  await liveOnAndRefresh(page);
  await page.evaluate(() => app.refreshLiveStatus({ manual: true }));
  expect(await count()).toBe(0);   // the first result is no change
  value = 'down';
  await page.evaluate(() => app.refreshLiveStatus({ manual: true }));
  expect(await count()).toBe(1);
  const entry = await page.evaluate(() => app.state.activityLog.find((l) => l.type === 'STATUS').message);
  expect(entry).toContain('API');
  expect(entry).toMatch(/up.*DOWN|up.*down/);
  await page.evaluate(() => app.refreshLiveStatus({ manual: true }));
  expect(await count()).toBe(1);
});

test('approvals are kept under a key that "Clear all data" removes', async ({ page }) => {
  await open(page, model());
  await page.evaluate(() => app.approveLiveHosts(['status.example.com']));
  expect(await page.evaluate(() => Object.keys(localStorage).filter((k) => k.includes('live')))).toEqual(['threat_tiger_live_approved']);
  await openSettingsTab(page, 'live');
  await expect(page.locator('#live-approved-list')).toContainText('status.example.com');
  await page.locator('#settings-live details summary').click();
  await page.click('#btn-live-forget-approvals');
  expect(await page.evaluate(() => localStorage.getItem('threat_tiger_live_approved'))).toBe('[]');
});


// ── Security review follow-ups ────────────────────────────────────────────────

test('DNS approval is per looked-up name: allowing one name through a provider does not allow another', async ({ page }) => {
  const stray = await guardNetwork(page);
  const cf = await fake(page, /^https:\/\/cloudflare-dns\.com\/dns-query/, () => ({ contentType: 'application/dns-json', body: JSON.stringify({ Status: 3 }) }));
  const rules = [{ when: 'else', fill: '#198754' }];
  await open(page, model((m) => {
    m.elements[0].liveStatus = { enabled: true, check: { kind: 'dns', key: 'allowed.example.com', dnsProvider: 'cloudflare' }, rules };
    m.elements[1].liveStatus = { enabled: true, check: { kind: 'dns', key: 'internal.corp.example', dnsProvider: 'cloudflare' }, rules };
  }));
  await approve(page, ['cloudflare-dns.com/allowed.example.com']);
  await page.evaluate(async () => { app.setLiveStatus(true, { refresh: false }); await app.refreshLiveStatus(); });   // a timed refresh: never asks
  expect(cf.map(c => new URL(c.url).searchParams.get('name'))).toEqual(['allowed.example.com']);
  expect(stray).toEqual([]);
});

test('a redirect is never followed to another host: sources report it, direct checks count the answer as up', async ({ page }) => {
  const stray = await guardNetwork(page);
  const json = await fake(page, /^https:\/\/status\.example\.com\/feed\.json/, () => ({ status: 302, headers: { ...CORS, location: 'https://evil.example.net/collect' } }));
  const web = await fake(page, /^https:\/\/www\.example\.com\//, () => ({ status: 301, headers: { ...CORS, location: 'https://evil.example.net/x' } }));
  const evil = await fake(page, /^https:\/\/evil\.example\.net\//, () => ({ body: '[]' }));
  await open(page, model((m) => {
    m.statusSources = [{ id: 'src-json', name: 'Feed', kind: 'json', url: 'https://status.example.com/feed.json' }];
    m.elements[0].liveStatus = { enabled: true, check: { kind: 'source', sourceId: 'src-json', key: 'API' }, rules: [{ when: 'nodata', fill: '#dc3545' }] };
    m.elements[1].liveStatus = { enabled: true, check: { kind: 'http', key: 'https://www.example.com/' }, rules: [{ when: 'eq', value: 'up', fill: '#198754' }] };
  }));
  await approve(page, ['status.example.com', 'www.example.com']);
  await liveOnAndRefresh(page);
  expect(json.length).toBeGreaterThan(0);
  expect(web.length).toBeGreaterThan(0);
  expect(evil).toHaveLength(0);                                   // the other host was never contacted
  const r = await page.evaluate(() => [app.liveResultFor(app.liveItemById('n-api')), app.liveResultFor(app.liveItemById('n-db'))]);
  expect(r[0].error).toMatch(/redirect/i);
  expect(r[1]).toMatchObject({ state: 'up' });
  expect(stray).toEqual([]);
});
