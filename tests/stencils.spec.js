// Cloud stencils: official icon sets in the palette; placed icons are normal, recognised components.
const { test } = require('@playwright/test');
const { expect, openApp, demoSession } = require('./helpers');

async function setup(page, elements) {
  await page.setViewportSize({ width: 1600, height: 1000 });
  await openApp(page, { session: demoSession((s) => { s.elements = elements; s.flows = []; s.threats = []; }) });
}
const anchorEl = { id: 'z', type: 'process', name: 'Z', x: 2000, y: 2000, width: 240, height: 80, secProps: {} };

test('opening a set loads it once, search filters, clicking adds a recognised component (one undo step)', async ({ page }) => {
  await setup(page, [anchorEl]);
  await page.evaluate(() => document.getElementById('collapseDataNodes').classList.add('show'));
  const set = page.locator('[data-stencil-set="aws"]');
  await set.locator('.stencil-set-toggle').click();
  await expect(set.locator('.stencil-item').first()).toBeVisible();
  await set.locator('.stencil-set-toggle').click(); await set.locator('.stencil-set-toggle').click();
  expect(await page.locator('script[src="vendor/stencils/aws.js"]').count()).toBe(1);
  const t0 = Date.now();
  await set.locator('input[type="search"]').fill('Amazon RDS');
  expect(Date.now() - t0).toBeLessThan(1000);
  const before = await page.evaluate(() => app.undoStack.length);
  await set.locator('.stencil-item:visible').first().click();
  const el = await page.evaluate(() => JSON.parse(JSON.stringify(app.state.elements.find((e) => e.id !== 'z'))));
  expect(el.type).toBe('datastore');
  expect(el.name).toBe('Amazon RDS');
  expect(el.stencil).toMatch(/^aws:/);
  expect(el.stencilTags).toContain('database');
  expect(el.stencilIcon).toMatch(/^data:image\/svg\+xml;base64,/);
  expect(await page.evaluate(() => app.undoStack.length)).toBe(before + 1);
  await expect(page.locator(`#layers-nodes-group [data-id="${el.id}"] img.stencil-icon`)).toHaveCount(1);
  expect(await page.evaluate((id) => [...app.subtypesOf(app.state.elements.find((e) => e.id === id))], el.id)).toContain('database');
});

test('hostile stencil fields on import are dropped or rendered inert', async ({ page }) => {
  const evilSvg = 'data:image/svg+xml;base64,' + Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" onload="window.__xss=1"><script>window.__xss=2</script></svg>').toString('base64');
  await setup(page, [
    { id: 'a', type: 'process', name: 'A', x: 0, y: 0, width: 240, height: 80, secProps: {}, stencil: 'aws:x" onmouseover="1', stencilIcon: 'javascript:alert(1)', stencilTags: ['database', 'bogus'] },
    { id: 'b', type: 'process', name: 'B', x: 400, y: 0, width: 240, height: 80, secProps: {}, stencil: 'aws:ok', stencilIcon: evilSvg },
  ]);
  const r = await page.evaluate(() => app.state.elements.map((e) => [e.stencil, e.stencilIcon, e.stencilTags]));
  expect(r[0]).toEqual([undefined, undefined, ['database']]);
  expect(r[1][1]).toMatch(/^data:image\/svg\+xml;base64,/);
  await expect(page.locator('#layers-nodes-group [data-id="b"] img.stencil-icon')).toHaveCount(1);
  await page.waitForTimeout(300);
  expect(await page.evaluate(() => window.__xss)).toBeUndefined();
});

test('a set that fails to load says so, and View can hide a set from the palette', async ({ page }) => {
  await setup(page, [anchorEl]);
  await page.route('**/vendor/stencils/gcp.js', (r) => r.abort());
  await page.evaluate(() => document.getElementById('collapseDataNodes').classList.add('show'));
  await page.locator('[data-stencil-set="gcp"] .stencil-set-toggle').click();
  await expect(page.locator('[data-stencil-set="gcp"]')).toContainText('Could not load');
  await page.click('#btn-main-menu'); await page.click('#btn-menu-view');
  await page.click('#btn-menu-stencil-gcp');
  await expect(page.locator('[data-stencil-set="gcp"]')).toBeHidden();
});

test('picking an icon replaces the stencil image; changing the type drops the stencil kinds', async ({ page }) => {
  await setup(page, [{ id: 's', type: 'datastore', name: 'Orders', x: 0, y: 0, width: 240, height: 80, secProps: {}, stencil: 'aws:Amazon-RDS', stencilIcon: 'data:image/svg+xml;base64,PHN2Zy8+', stencilTags: ['database'] }]);
  await page.evaluate(() => { app.state.selectedElementIds = ['s']; app.refreshAppViewVisualWorkspace(); app.changeNodeType('s', 'process'); });
  expect(await page.evaluate(() => [app.state.elements[0].stencilTags, [...app.subtypesOf(app.state.elements[0])].includes('database')])).toEqual([undefined, false]);
  await page.evaluate(() => { const sel = document.getElementById('props-input-icon'); sel.value = sel.options[1].value; sel.dispatchEvent(new Event('change')); });
  expect(await page.evaluate(() => app.state.elements[0].stencilIcon)).toBeUndefined();
  await expect(page.locator('#layers-nodes-group [data-id="s"] img.stencil-icon')).toHaveCount(0);
});

test('stencil sets live under Data Nodes & Icons; a placed stencil is just the icon with its label underneath', async ({ page }) => {
  await setup(page, [anchorEl]);
  await expect(page.locator('#collapseDataNodes #stencil-sets')).toHaveCount(1);
  await expect(page.locator('#collapseStencils')).toHaveCount(0);
  await page.evaluate(() => document.getElementById('collapseDataNodes').classList.add('show'));
  await page.locator('[data-stencil-set="k8s"] .stencil-set-toggle').click();
  await page.locator('[data-stencil-set="k8s"] .stencil-item').first().click();
  const el = await page.evaluate(() => JSON.parse(JSON.stringify(app.state.elements.find((e) => e.id !== 'z'))));
  expect([el.width, el.height]).toEqual([110, 96]);
  const node = page.locator(`#layers-nodes-group [data-id="${el.id}"]`);
  await expect(node.locator('.stencil-card img.stencil-icon')).toHaveCount(1);
  await expect(node.locator('.card-icon-stripe')).toHaveCount(0);
  const [img, label] = await Promise.all([node.locator('img.stencil-icon').boundingBox(), node.locator('.stencil-card .card-text-render-target').boundingBox()]);
  expect(label.y).toBeGreaterThan(img.y + img.height - 1);   // the label sits under the icon
});

test('Properties for a cloud icon hide Type, the graphic icon picker and Security Controls', async ({ page }) => {
  await setup(page, [
    { id: 's', type: 'datastore', name: 'Orders', x: 0, y: 0, width: 110, height: 96, secProps: { encryptedAtRest: 'false' }, stencil: 'aws:Amazon-RDS', stencilIcon: 'data:image/svg+xml;base64,PHN2Zy8+', stencilTags: ['database'] },
    { id: 'p', type: 'process', name: 'API', x: 400, y: 0, width: 240, height: 80, secProps: { runAsAdmin: 'false', loggingEnabled: 'false' } },
  ]);
  const boxes = ['#box-props-node-type', '#box-props-icon-customization', '#box-props-security'];
  await page.evaluate(() => { app.state.selectedElementIds = ['p']; app.refreshAppViewVisualWorkspace(); });
  for (const b of boxes) await expect(page.locator(b)).toBeVisible();
  await page.evaluate(() => { app.state.selectedElementIds = ['s']; app.refreshAppViewVisualWorkspace(); });
  for (const b of boxes) await expect(page.locator(b)).toBeHidden();
  await expect(page.locator('#box-props-standard-name')).toBeVisible();
});

// ── Deferred minors (1.15.1) ──
test('a disabled shape with a cloud icon is greyed in every card style', async ({ page }) => {
  const icon = 'data:image/svg+xml;base64,' + Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><rect width="10" height="10" fill="#f90"/></svg>').toString('base64');
  await setup(page, [
    { id: 'i', type: 'infrastructure', name: 'Infra', x: 0, y: 0, width: 80, height: 70, isDisabled: true, stencilIcon: icon, secProps: {} },
    { id: 'p', type: 'process', name: 'Proc', x: 300, y: 0, width: 240, height: 80, isDisabled: true, stencilIcon: icon, secProps: {} },
    anchorEl,
  ]);
  for (const id of ['i', 'p']) {
    const f = await page.locator(`#layers-nodes-group [data-id="${id}"] img.stencil-icon`).first().evaluate((n) => getComputedStyle(n).filter);
    expect([id, f]).toEqual([id, 'grayscale(1)']);
  }
});

test('the largest set (Azure) opens and filters quickly', async ({ page }) => {
  await setup(page, [anchorEl]);
  await page.evaluate(() => document.getElementById('collapseDataNodes').classList.add('show'));
  const set = page.locator('[data-stencil-set="azure"]');
  const t0 = Date.now();
  await set.locator('.stencil-set-toggle').click();
  await expect(set.locator('.stencil-item').first()).toBeVisible();
  expect(Date.now() - t0).toBeLessThan(3000);
  expect(await set.locator('.stencil-item').count()).toBeGreaterThan(500);
  const t1 = Date.now();
  await set.locator('input[type="search"]').fill('Key Vault');
  await expect(set.locator('.stencil-item:visible').first()).toBeVisible();
  expect(Date.now() - t1).toBeLessThan(1000);
});

test('a placed cloud database icon gets database threats in the suggestion list', async ({ page }) => {
  await setup(page, [anchorEl]);
  await page.waitForFunction(() => app.threatSuggestions.process.length);
  await page.evaluate(() => document.getElementById('collapseDataNodes').classList.add('show'));
  const set = page.locator('[data-stencil-set="aws"]');
  await set.locator('.stencil-set-toggle').click();
  await set.locator('input[type="search"]').fill('Amazon RDS');
  await set.locator('.stencil-item:visible').first().click();
  await page.click('button[data-bs-target="#tab-panel-suggest"]');
  await expect(page.locator('#suggest-subtype-hint')).toContainText(/database/i);
  await expect(page.locator('#tab-panel-suggest .template-card').first()).toBeVisible();
  const reasons = await page.evaluate(() => app.evaluateRules(app.state.elements.find((e) => e.id !== 'z')).map((f) => f.reason).join(' | '));
  expect(reasons).toMatch(/database/i);
});

test('a PNG export includes the cloud icon image', async ({ page }) => {
  const icon = 'data:image/svg+xml;base64,' + Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><rect width="10" height="10" fill="#f90"/></svg>').toString('base64');
  await setup(page, [{ id: 'p', type: 'process', name: 'Proc', x: 0, y: 0, width: 240, height: 80, stencilIcon: icon, secProps: {} }, anchorEl]);
  const svg = await page.evaluate(async () => {
    let captured = '';
    const orig = XMLSerializer.prototype.serializeToString;
    XMLSerializer.prototype.serializeToString = function (n) { const s = orig.call(this, n); if (n && n.id === 'canvas-svg') captured = s; return s; };
    app.downloadBlob = () => {};
    try { await app.exportCanvasAsPng(); } catch (e) { /* the canvas step may fail headless */ }
    XMLSerializer.prototype.serializeToString = orig;
    return captured;
  });
  expect(svg).toContain('class="stencil-icon"');
  expect(svg).toContain(icon.slice(0, 60));
});
