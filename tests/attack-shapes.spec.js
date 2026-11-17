// Palette "Attack Paths & Trees": an attacker and a crown-jewel preset (ordinary components that take part in
// Insights → Attack paths) and attack-tree / attack-flow shapes (at_*) that are drawn and connected but are not
// parts of the modelled system: no threat suggestions, no coverage, not data-flow components for attack paths.
const { test } = require('@playwright/test');
const H = require('./helpers');
const { expect } = H;

const AT_TYPES = ['at_entry', 'at_step', 'at_asset', 'at_condition', 'at_and', 'at_or', 'at_goal', 'at_countermeasure', 'at_choke'];
const PAL = {
  'pal-at-attacker': 'interactor', 'pal-at-crown-jewel': 'datastore', 'pal-at-entry': 'at_entry', 'pal-at-step': 'at_step',
  'pal-at-asset': 'at_asset', 'pal-at-condition': 'at_condition', 'pal-at-and': 'at_and', 'pal-at-or': 'at_or',
  'pal-at-goal': 'at_goal', 'pal-at-countermeasure': 'at_countermeasure', 'pal-at-choke': 'at_choke',
};

const empty = (elements = [], flows = []) => ({ projectTitle: 'T', activeUser: 'Tester', elements, flows, threats: [] });
const at = (id, type, x, y, extra = {}) => ({ id, type, name: id.toUpperCase(), x, y, width: 160, height: 80, ...extra });

async function setup(page, session = empty()) {
  await page.setViewportSize({ width: 1600, height: 1000 });
  await H.openApp(page, { session });
}
async function openSection(page) {
  const btn = page.locator('#headingAttackPaths button');
  if ((await btn.getAttribute('aria-expanded')) !== 'true') await btn.click();
  await expect(page.locator('#collapseAttackPaths')).toHaveClass(/show/);
}
const types = (page) => page.evaluate(() => app.state.elements.map((e) => e.type));

test('every palette item adds its shape by click; the presets are an attacker and a crown jewel', async ({ page }) => {
  await setup(page);
  await openSection(page);
  for (const [id, type] of Object.entries(PAL)) {
    const before = (await types(page)).length;
    await page.click(`#${id}`);
    const after = await types(page);
    expect(after.length, id).toBe(before + 1);
    expect(after[after.length - 1], id).toBe(type);
  }
  const els = await page.evaluate(() => JSON.parse(JSON.stringify(app.state.elements)));
  const attacker = els.find((e) => e.type === 'interactor'), jewel = els.find((e) => e.type === 'datastore');
  expect(attacker.icon).toBe('bi-incognito');
  expect(jewel.secProps.isCrownJewel).toBe('true');
  for (const t of AT_TYPES) {
    const e = els.find((x) => x.type === t);
    expect(e.width, t).toBeGreaterThan(0); expect(e.height, t).toBeGreaterThan(0);
    expect(e.fcFillColor, t).toMatch(/^#[0-9a-f]{6}$/); expect(e.secProps, t).toBeUndefined();
  }
});

test('palette items are keyboard buttons with a hover popover, and can be dragged onto the canvas', async ({ page }) => {
  await setup(page);
  await openSection(page);
  const item = page.locator('#pal-at-and');
  await expect(item).toHaveAttribute('tabindex', '0');
  await expect(item).toHaveAttribute('role', 'button');
  await item.focus();
  await page.keyboard.press('Enter');
  expect(await types(page)).toEqual(['at_and']);
  await page.locator('#pal-at-or').hover();
  await expect(page.locator('#pal-at-or').locator('xpath=..').locator('.palette-popover-panel')).toBeVisible();
  // Drag and drop: a shape and a preset (the preset keeps its preset fields).
  for (const id of ['pal-at-goal', 'pal-at-crown-jewel']) {
    await page.evaluate((pid) => {
      const src = document.getElementById(pid), dt = new DataTransfer();
      src.dispatchEvent(new DragEvent('dragstart', { bubbles: true, cancelable: true, dataTransfer: dt }));
      const r = app.dom.svg.getBoundingClientRect(), x = r.left + 400, y = r.top + 300;
      app.dom.svg.dispatchEvent(new DragEvent('dragover', { bubbles: true, cancelable: true, dataTransfer: dt, clientX: x, clientY: y }));
      app.dom.svg.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: dt, clientX: x, clientY: y }));
    }, id);
  }
  const els = await page.evaluate(() => JSON.parse(JSON.stringify(app.state.elements)));
  expect(els.map((e) => e.type)).toEqual(['at_and', 'at_goal', 'datastore']);
  expect(els[2].secProps.isCrownJewel).toBe('true');
});

test('review mode blocks adding from the palette', async ({ page }) => {
  await setup(page, { ...empty(), reviewMode: true });
  await openSection(page);
  await page.click('#pal-at-step');
  await page.click('#pal-at-attacker');
  expect(await types(page)).toEqual([]);
});

test('each shape draws its own outline in light and dark, and flows connect them', async ({ page }) => {
  const els = AT_TYPES.map((t, i) => at(`n${i}`, t, 100 + (i % 3) * 260, 100 + Math.floor(i / 3) * 200));
  await setup(page, empty(els));
  for (const theme of ['light', 'dark']) {
    await page.evaluate((th) => { if (app.canvasTheme !== th) app.toggleCanvasTheme(); }, theme);
    for (const [i, t] of AT_TYPES.entries()) {
      await expect(page.locator(`#layers-nodes-group [data-id="n${i}"] [data-at-shape="${t}"]`), `${t} ${theme}`).toHaveCount(1);
    }
    // Labels stay dark on the pale fills in the dark theme too.
    const fill = await page.locator('#layers-nodes-group [data-id="n1"] text.fc-shape-label').evaluate((t) => getComputedStyle(t).fill);
    expect(fill, theme).toBe('rgb(15, 23, 42)');
  }
  // The gates are drawn as logic gates (a path, not a box).
  expect(await page.locator('[data-id="n4"] [data-at-shape="at_and"]').evaluate((e) => e.tagName)).toBe('path');
  expect(await page.locator('[data-id="n5"] [data-at-shape="at_or"]').evaluate((e) => e.tagName)).toBe('path');
  // Connect step (n1) to the OR gate (n5) by dragging from an anchor.
  await page.evaluate(() => { if (app.canvasTheme !== 'light') app.toggleCanvasTheme(); });
  const src = page.locator('#layers-nodes-group [data-id="n1"]');
  await src.hover();
  const dot = src.locator('[data-anchor-id="bottom"]');
  const a = await dot.boundingBox();
  const b = await page.locator('#layers-nodes-group [data-id="n5"] [data-at-shape]').boundingBox();
  await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2);
  await page.mouse.down();
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2, { steps: 8 });
  await page.mouse.up();
  const flows = await page.evaluate(() => app.state.flows.map((f) => [f.sourceId, f.targetId]));
  expect(flows).toEqual([['n1', 'n5']]);
  await expect(page.locator('#canvas-svg [data-flow-id]').first()).toBeAttached();
});

test('attack-tree shapes get no threat suggestions and are not model components; attacker → … → crown jewel is an attack path', async ({ page }) => {
  await setup(page, empty([
    { id: 'u', type: 'interactor', name: 'Attacker', x: 0, y: 0, width: 240, height: 80, icon: 'bi-incognito', secProps: {} },
    { id: 'w', type: 'process', name: 'Web', x: 400, y: 0, width: 240, height: 80, secProps: {} },
    { id: 'd', type: 'datastore', name: 'Jewel', x: 800, y: 0, width: 240, height: 80, secProps: { isCrownJewel: 'true' } },
    at('s', 'at_step', 400, 300), at('g', 'at_and', 800, 300),
  ], [
    { id: 'f1', name: 'req', sourceId: 'u', targetId: 'w', secProps: {} },
    { id: 'f2', name: 'sql', sourceId: 'w', targetId: 'd', secProps: {} },
    { id: 'f3', name: '', sourceId: 'u', targetId: 's', secProps: {} },      // attack-tree links
    { id: 'f4', name: '', sourceId: 's', targetId: 'd', secProps: {} },
    { id: 'f5', name: '', sourceId: 's', targetId: 'g', secProps: {} },
  ]));
  const r = await page.evaluate(() => {
    const paths = computeAttackPaths(app.attackPathModel());
    const findings = app.evaluateAllRules();
    return {
      components: app.modelComponents().map((e) => e.id),
      paths: paths.paths.map((p) => p.nodes.join('>')),
      stepRules: app.evaluateRules(app.state.elements.find((e) => e.id === 's')).length,
      linkRules: app.evaluateRules(app.state.flows.find((f) => f.id === 'f3')).length,
      findingIds: [...new Set(findings.map((f) => f.item.id))],
    };
  });
  expect(r.components).toEqual(['u', 'w', 'd']);
  expect(r.paths).toEqual(['u>w>d']);                 // never through the attack step
  expect(r.stepRules).toBe(0);
  expect(r.linkRules).toBe(0);
  for (const id of ['s', 'g', 'f3', 'f4', 'f5']) expect(r.findingIds).not.toContain(id);
  // The Properties panel offers no suggestions or linked threats for an attack step.
  await page.evaluate(() => app.handleElementSelectionEvent('s'));
  await expect(page.locator('#suggest-view-empty')).not.toHaveClass(/d-none/);
  await expect(page.locator('#box-props-threats')).toHaveClass(/d-none/);
  // Insights: the attack path is listed; at_ shapes and their links are not counted as uncovered.
  await page.click('#tab-insights-trigger');
  await expect(page.locator('#insights-attack-paths .attack-path-row').first()).toContainText('Attacker → Web → Jewel');
  // "Without threats" counts the three components and two data flows, not the at_ shapes or their links.
  const tile = page.locator('#insights-content .insight-tile', { hasText: 'Without threats' });
  await expect(tile.locator('.fs-4')).toHaveText('5');
});

test('the step tactic and technique and the condition outcome are edited in Properties, shown on the shape and survive export/import', async ({ page }) => {
  await setup(page, empty([at('s', 'at_step', 200, 200), at('c', 'at_condition', 600, 200)]));
  await page.evaluate(() => app.handleElementSelectionEvent('s'));
  const box = page.locator('#box-props-attack');
  await expect(box).toBeVisible();
  const opts = await page.locator('#props-at-tactic option').evaluateAll((os) => os.map((o) => o.textContent));
  expect(opts).toEqual(['None', 'Reconnaissance', 'Resource Development', 'Initial Access', 'Execution', 'Persistence', 'Privilege Escalation',
    'Defense Evasion', 'Credential Access', 'Discovery', 'Lateral Movement', 'Collection', 'Command and Control', 'Exfiltration', 'Impact']);
  await page.locator('#props-at-tactic').selectOption({ label: 'Initial Access' });
  await page.locator('#props-at-technique').fill('T1566.001');
  await page.locator('#props-at-technique').press('Enter');
  await page.locator('#props-at-technique').blur();
  let s = await page.evaluate(() => JSON.parse(JSON.stringify(app.state.elements.find((e) => e.id === 's'))));
  expect(s.atTactic).toBe('TA0001');
  expect(s.atTechnique).toBe('T1566.001');
  await expect(page.locator('[data-id="s"] text.at-shape-tag')).toHaveText('Initial Access · T1566.001');
  // An invalid technique ID is rejected and the stored one stays.
  await page.locator('#props-at-technique').fill('X1566; drop');
  await page.locator('#props-at-technique').blur();
  await expect(page.locator('#props-at-technique')).toHaveClass(/is-invalid/);
  expect(await page.evaluate(() => app.state.elements.find((e) => e.id === 's').atTechnique)).toBe('T1566.001');
  // A condition has an outcome, not a tactic.
  await page.evaluate(() => app.handleElementSelectionEvent('c'));
  await expect(page.locator('#props-at-tactic')).toBeHidden();
  await page.locator('#props-at-outcome').selectOption('fail');
  expect(await page.evaluate(() => app.state.elements.find((e) => e.id === 'c').atOutcome)).toBe('fail');
  await expect(page.locator('[data-id="c"] text.at-shape-tag')).toContainText('Fail');
  // A plain AND gate has no attack fields at all.
  // Export, then import into a fresh model.
  const json = await H.downloadText(page, '#btn-export');
  const data = JSON.parse(json);
  expect(data.elements.find((e) => e.id === 's')).toMatchObject({ atTactic: 'TA0001', atTechnique: 'T1566.001' });
  await page.evaluate(() => { app.state.elements = []; app.refreshAppViewVisualWorkspace(); });
  await H.importJson(page, json);
  s = await page.evaluate(() => JSON.parse(JSON.stringify(app.state.elements.find((e) => e.id === 's'))));
  expect(s).toMatchObject({ type: 'at_step', atTactic: 'TA0001', atTechnique: 'T1566.001' });
  expect(await page.evaluate(() => app.state.elements.find((e) => e.id === 'c').atOutcome)).toBe('fail');
  // ...and a reload keeps them too.
  await page.reload(); await page.waitForFunction(() => window.app && window.app.state);
  expect(await page.evaluate(() => app.state.elements.find((e) => e.id === 's').atTechnique)).toBe('T1566.001');
});

test('import drops invalid tactics, techniques and outcomes; unknown at_ types become an attack step', async ({ page }) => {
  await setup(page);
  await H.importJson(page, JSON.stringify(empty([
    at('a', 'at_step', 0, 0, { atTactic: 'TA9999', atTechnique: 'T15' }),
    at('b', 'at_step', 0, 200, { atTactic: 'TA0040', atTechnique: 't1486' }),
    at('c', 'at_condition', 0, 400, { atOutcome: 'maybe' }),
    { id: 'd', type: 'at_bogus', name: 'D', x: 0, y: 600 },
  ])));
  const els = await page.evaluate(() => JSON.parse(JSON.stringify(app.state.elements)));
  const by = (id) => els.find((e) => e.id === id);
  expect(by('a').atTactic).toBeUndefined();
  expect(by('a').atTechnique).toBeUndefined();
  expect(by('b')).toMatchObject({ atTactic: 'TA0040', atTechnique: 'T1486' });
  expect(by('c').atOutcome).toBeUndefined();
  expect(by('d').type).toBe('at_step');
  expect(by('d').width).toBeGreaterThan(0);
});

test('payloads in names and attack fields inject nothing', async ({ page }) => {
  const errors = H.trackPageErrors(page);
  await setup(page);
  const INJ = '"><b data-injected="x">x</b><img src=x onerror="window.__xss=1">';
  await H.importJson(page, JSON.stringify(empty([
    at('a', 'at_step', 0, 0, { name: INJ, atTactic: INJ, atTechnique: INJ, notes: INJ }),
    at('b', 'at_condition', 300, 0, { name: INJ, atOutcome: INJ }),
    at('c', 'at_goal', 600, 0, { name: INJ, fcFillColor: `red;" data-injected="c`, fcStrokeColor: INJ }),
  ])));
  for (const id of ['a', 'b', 'c']) await page.evaluate((i) => app.handleElementSelectionEvent(i), id);
  const bad = await page.evaluate(() => [...document.querySelectorAll('*')].filter((el) => [...el.attributes].some((a) => a.name === 'data-injected' || a.name.startsWith('on'))).length);
  expect(bad).toBe(0);
  expect(await page.evaluate(() => window.__xss)).toBeUndefined();
  expect(errors).toEqual([]);
});

test('the PNG export includes the attack-tree shapes', async ({ page }) => {
  await setup(page, empty(AT_TYPES.map((t, i) => at(`n${i}`, t, 100 + i * 200, 100, t === 'at_step' ? { atTactic: 'TA0002', atTechnique: 'T1059' } : {}))));
  const captured = await page.evaluate(async () => {
    let out = '';
    const orig = XMLSerializer.prototype.serializeToString;
    XMLSerializer.prototype.serializeToString = function (n) { const s = orig.call(this, n); if (n.id === 'canvas-svg') out = s; return s; };
    const click = HTMLAnchorElement.prototype.click; HTMLAnchorElement.prototype.click = function () {};
    try { await app.exportCanvasAsPng(); } finally { XMLSerializer.prototype.serializeToString = orig; HTMLAnchorElement.prototype.click = click; }
    return out;
  });
  for (const t of AT_TYPES) expect(captured, t).toContain(`data-at-shape="${t}"`);
  expect(captured).toContain('Execution · T1059');
});

test('hiding "Attack paths & trees" in Settings hides the palette section', async ({ page }) => {
  await setup(page);
  await expect(page.locator('#palette-attack-body .palette-item')).toHaveCount(Object.keys(PAL).length);
  await H.clickControl(page, '#btn-settings');
  await page.locator('#settings-palette-groups input[data-palette-group="attack"]').uncheck();
  await expect(page.locator('#paletteAccordion [data-palette-group="attack"]')).toBeHidden();
});
