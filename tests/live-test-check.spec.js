// Live status → Properties → Test check: runs one item's check now (also with live status off), lists every value
// the reply has, shows which rule matches, and adds pre-filled rules from the values. Remote endpoints are faked
// with page.route; any other https request is aborted and recorded, so no test reaches the real internet.
const { test } = require('@playwright/test');
const { expect, openApp } = require('./helpers');

const CORS = { 'access-control-allow-origin': '*' };
async function guardNetwork(page) {
  const stray = [];
  await page.route(/^https:\/\//, (route) => { stray.push(route.request().url()); return route.abort(); });
  return stray;
}
async function fake(page, pattern, reply) {
  const calls = [];
  await page.route(pattern, async (route) => {
    const req = route.request();
    calls.push({ url: req.url(), method: req.method() });
    const r = await reply(req.url(), req);
    if (!r) return route.abort('failed');
    return route.fulfill({ status: r.status || 200, headers: r.headers || CORS, contentType: r.contentType || 'text/plain', body: r.body || '' }).catch(() => {});
  });
  return calls;
}
function model(liveStatus, sources = []) {
  return { projectTitle: 'Test check', activeUser: 'Tester', statusSources: sources, threats: [], flows: [],
    elements: [{ id: 'n1', type: 'process', name: 'web-02', x: 100, y: 100, width: 240, height: 80, secProps: {}, liveStatus }] };
}
async function open(page, m) {
  await page.setViewportSize({ width: 1600, height: 1000 });
  await openApp(page, { session: m });
  await page.evaluate(() => app.handleElementSelectionEvent('n1'));
}
async function approve(page, hosts) {
  await page.evaluate((h) => localStorage.setItem('threat_tiger_live_approved', JSON.stringify(h)), hosts);
}
const rows = (page) => page.locator('#live-test-result .live-test-row').evaluateAll((lis) => Object.fromEntries(lis.map((li) => [li.dataset.label, li.querySelector('.live-test-value').textContent])));
const addFor = (page, label) => page.locator(`#live-test-result .live-test-row[data-label="${label}"] .live-test-add-rule`);
const rules = (page) => page.evaluate(() => app.state.elements[0].liveStatus.rules);

test('web check (readable): state, HTTP status, redirect, latency and time; works with live status off; + adds a rule', async ({ page }) => {
  const stray = await guardNetwork(page);
  const calls = await fake(page, 'https://api.example.test/health', () => ({ status: 503, body: 'no' }));
  await open(page, model({ enabled: true, check: { kind: 'http', key: 'https://api.example.test/health' }, rules: [{ when: 'eq', value: 'up', fill: '#198754' }] }));
  await approve(page, ['api.example.test']);
  expect(await page.evaluate(() => app.liveOn)).toBe(false);
  await page.click('#btn-live-test-check');
  await expect(page.locator('#live-test-result')).toContainText('HTTP status');
  const r = await rows(page);
  expect(r).toMatchObject({ State: 'down', 'HTTP status': '503', Redirect: 'no' });
  expect(r.Latency).toMatch(/^\d+ ms$/);
  expect(r['Checked at']).toBeTruthy();
  expect(calls).toHaveLength(1);
  await expect(page.locator('#live-test-result .live-test-match')).toContainText('No rule matches');
  const undoBefore = await page.evaluate(() => app.undoStack.length);
  await expect(addFor(page, 'HTTP status')).toHaveAttribute('aria-label', 'Add a rule for HTTP status = 503');
  await addFor(page, 'HTTP status').click();
  expect((await rules(page)).at(-1)).toEqual({ when: 'eq', value: '503', fill: '#dc3545', stroke: '#dc3545' });
  expect(await page.evaluate(() => app.undoStack.length)).toBe(undoBefore + 1);
  await expect(page.locator('#live-test-result .live-test-match')).toContainText('Rule 2 matches now: equals 503');
  await addFor(page, 'Latency').click();
  const lat = (await rules(page)).at(-1);
  expect(lat).toMatchObject({ when: 'latency_gt', fill: '#ffc107', label: 'slow' });
  expect(Number(lat.value)).toBeGreaterThanOrEqual(0);
  expect(stray).toEqual([]);
});

test('web check without CORS: up, and the status code is reported as not readable', async ({ page }) => {
  const stray = await guardNetwork(page);
  // Playwright's fulfil would make a cors-mode reply readable, so the cors-mode request (it has an Origin header) fails like a CORS refusal.
  await fake(page, 'https://nocors.example.test/', (url, req) => (req.headers().origin ? null : { status: 200, headers: {}, body: 'hi' }));
  await open(page, model({ enabled: true, check: { kind: 'http', key: 'https://nocors.example.test/' }, rules: [] }));
  await approve(page, ['nocors.example.test']);
  await page.click('#btn-live-test-check');
  await expect(page.locator('#live-test-result')).toContainText('HTTP status');
  const r = await rows(page);
  expect(r.State).toBe('up');
  expect(r['HTTP status']).toMatch(/not readable.*CORS/);
  expect(r.Redirect).toBeUndefined();
  await addFor(page, 'State').click();
  expect((await rules(page)).at(-1)).toEqual({ when: 'eq', value: 'up', fill: '#198754', stroke: '#198754' });
  await expect(page.locator('#live-test-result .live-test-match')).toContainText('Rule 1 matches now: equals up');
  expect(stray).toEqual([]);
});

test('DNS check: the result, every A record, the provider and latency', async ({ page }) => {
  const stray = await guardNetwork(page);
  await fake(page, /^https:\/\/cloudflare-dns\.com\/dns-query/, () => ({ contentType: 'application/dns-json', body: JSON.stringify({ Status: 0, Answer: [{ type: 5, data: 'alias.example.com.' }, { type: 1, data: '192.0.2.1' }, { type: 1, data: '192.0.2.2' }] }) }));
  await open(page, model({ enabled: true, check: { kind: 'dns', key: 'example.com', dnsProvider: 'cloudflare' }, rules: [] }));
  await approve(page, ['cloudflare-dns.com/example.com']);
  await page.click('#btn-live-test-check');
  await expect(page.locator('#live-test-result')).toContainText('Result');
  const r = await rows(page);
  expect(r).toMatchObject({ Result: 'resolves', 'IP addresses (A records)': '192.0.2.1, 192.0.2.2', Provider: 'Cloudflare' });
  await addFor(page, 'Result').click();
  expect((await rules(page)).at(-1)).toEqual({ when: 'eq', value: 'resolves', fill: '#198754', stroke: '#198754' });
  expect(stray).toEqual([]);
});

test('source check: the matched row with every column, the value and latency; a rule for another column comes with a note', async ({ page }) => {
  const stray = await guardNetwork(page);
  await open(page, model({ enabled: true, check: { kind: 'source', sourceId: 'loc', key: '' }, rules: [{ when: 'eq', value: 'down', fill: '#dc3545' }] },
    [{ id: 'loc', name: 'Servers', kind: 'csv', url: 'samples/status-servers.csv', keyColumn: 'name', valueColumn: 'status' }]));
  await page.click('#btn-live-test-check');   // same origin: no approval needed
  await expect(page.locator('#live-test-result')).toContainText('Row found');
  const r = await rows(page);
  expect(r).toMatchObject({ Source: 'Servers (CSV)', Key: 'web-02', 'Row found': 'yes', 'Value (status)': 'up', 'Latency (from the row)': '950 ms',
    type: 'process', icon: 'bi-globe2', latency: '950', latency_max: '500', group: 'DMZ', connects_to: 'api-01', description: 'Public web server (node 2); slower than its latency limit' });
  expect(r.name).toBeUndefined();   // the key column is shown as "Key"
  await expect(page.locator('#live-test-result .live-test-match')).toContainText('No rule matches');
  await addFor(page, 'Value (status)').click();
  await expect(page.locator('#live-test-result .live-test-match')).toContainText('Rule 2 matches now: equals up');
  await addFor(page, 'Latency (from the row)').click();
  expect((await rules(page)).at(-1)).toMatchObject({ when: 'latency_gt', value: '950' });
  await addFor(page, 'group').click();
  expect((await rules(page)).at(-1)).toEqual({ when: 'eq', value: 'DMZ', fill: '#0d6efd', stroke: '#0d6efd' });
  await expect(page.locator('#live-test-result')).toContainText('Rules compare the value column');
  // A missing row: "no", and the + adds a "no data" rule.
  await page.evaluate(() => { app.state.elements[0].liveStatus.check.key = 'nope'; });
  await page.click('#btn-live-test-check');
  await expect(page.locator('#live-test-result')).toContainText('nothing for "nope"');
  expect(stray).toEqual([]);
});

test('a host that is not allowed yet asks first and runs the test after approval', async ({ page }) => {
  const stray = await guardNetwork(page);
  const calls = await fake(page, 'https://api.example.test/health', () => ({ status: 200 }));
  await open(page, model({ enabled: true, check: { kind: 'http', key: 'https://api.example.test/health' }, rules: [] }));
  await page.click('#btn-live-test-check');
  await expect(page.locator('#live-approve-box')).toBeVisible();
  await expect(page.locator('#live-approve-hosts')).toContainText('api.example.test');
  expect(calls).toHaveLength(0);
  await page.click('#btn-live-approve');
  await expect.poll(() => calls.length).toBe(1);
  await page.evaluate(() => bootstrap.Modal.getOrCreateInstance(document.getElementById('modal-settings')).hide());
  await expect(page.locator('#modal-settings')).toBeHidden();
  await expect(page.locator('#live-test-result')).toContainText('HTTP status');
  expect((await rows(page))['HTTP status']).toBe('200');
  expect(stray).toEqual([]);
});

test('values and column names from the reply are shown as text only', async ({ page }) => {
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const stray = await guardNetwork(page);
  const P = '<img src=x onerror=alert(1) data-injected="1">';
  await fake(page, 'https://feed.example.test/s.json', () => ({ contentType: 'application/json', body: JSON.stringify([{ name: 'web-02', status: P, [P]: P, nested: { a: P } }]) }));
  await open(page, model({ enabled: true, check: { kind: 'source', sourceId: 'j', key: '' }, rules: [{ when: 'eq', value: P, fill: '#198754', icon: 'bi-check', label: P }] },
    [{ id: 'j', name: P, kind: 'json', url: 'https://feed.example.test/s.json' }]));
  await approve(page, ['feed.example.test']);
  await page.click('#btn-live-test-check');
  await expect(page.locator('#live-test-result')).toContainText('Row found');
  const r = await rows(page);
  expect(r['Value (status)']).toBe(P);
  expect(r[P.slice(0, 60)]).toBe(P);
  await expect(page.locator('#live-test-result .live-test-match')).toContainText('Rule 1 matches now');
  const injected = await page.evaluate(() => [...document.querySelectorAll('*')].filter((el) => [...el.attributes].some((a) => a.name === 'data-injected' || a.name.startsWith('on'))).length);
  expect(injected).toBe(0);
  expect(errors).toEqual([]);
  expect(stray).toEqual([]);
});
