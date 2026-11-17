// Architecture & process diagram shapes: C4 (c4_), UML (uml_), BPMN light (bpmn_) and ERD (erd_).
// Palette, outlines (light and dark canvas), multi-line compartments, import/export, flows, PNG export,
// which of them count as model components (threats and suggestions), and hiding the sub-groups.
const { test } = require('@playwright/test');
const { expect, openApp, demoSession, importJson, downloadText, clickControl, trackPageErrors } = require('./helpers');

const GROUPS = {
  c4: ['c4_person', 'c4_system', 'c4_container', 'c4_component', 'c4_external'],
  uml: ['uml_actor', 'uml_usecase', 'uml_note', 'uml_package', 'uml_class'],
  bpmn: ['bpmn_start', 'bpmn_intermediate', 'bpmn_end', 'bpmn_task', 'bpmn_gateway_exclusive', 'bpmn_gateway_parallel', 'bpmn_gateway_inclusive', 'bpmn_data_object'],
  erd: ['erd_entity'],
};
const ALL = Object.values(GROUPS).flat();
const palId = (t) => `#pal-dg-${t.replace(/_/g, '-')}`;
// The parts that make each outline recognisable (data-dg-part on the drawn elements).
const PARTS = {
  c4_person: ['head', 'body'], c4_system: ['box'], c4_container: ['box'], c4_component: ['box'], c4_external: ['box'],
  uml_actor: ['head', 'figure'], uml_usecase: ['ellipse'], uml_note: ['page', 'fold'], uml_package: ['tab', 'body'], uml_class: ['box', 'divider', 'divider'],
  bpmn_start: ['ring'], bpmn_intermediate: ['ring', 'inner-ring'], bpmn_end: ['ring'], bpmn_task: ['box'],
  bpmn_gateway_exclusive: ['diamond', 'marker-x'], bpmn_gateway_parallel: ['diamond', 'marker-plus'], bpmn_gateway_inclusive: ['diamond', 'marker-o'],
  bpmn_data_object: ['page', 'fold'], erd_entity: ['box', 'header'],
};
// Components get STRIDE threats and suggestions; notation shapes do not.
const COMPONENTS = ['c4_person', 'c4_system', 'c4_container', 'c4_component', 'c4_external'];

async function setup(page, elements = [], flows = []) {
  await page.setViewportSize({ width: 1600, height: 1000 });
  await openApp(page, { session: demoSession((s) => { s.elements = elements; s.flows = flows; s.threats = []; s.mitigations = []; }) });
}
const shape = (type, i, extra = {}) => ({ id: `s-${type}`, type, name: `Name${i}`, x: 100 + (i % 5) * 260, y: 100 + Math.floor(i / 5) * 240, ...extra });
async function oneOfEach(page, extra = {}) {
  const defs = await page.evaluate(() => JSON.parse(JSON.stringify(DIAGRAM_SHAPES)));
  return ALL.map((t, i) => shape(t, i, { width: defs[t].w, height: defs[t].h, ...(extra[t] || {}) }));
}
const openSection = async (page) => {
  const btn = page.locator('#headingOtherDiagrams button');
  if ((await btn.getAttribute('aria-expanded')) !== 'true') await btn.click();
  await expect(page.locator('#collapseOtherDiagrams')).toHaveClass(/show/);
};

test('every sub-group lists its shapes, and each palette item adds its type with its default size and colours', async ({ page }) => {
  const errors = trackPageErrors(page);
  await setup(page);
  await openSection(page);
  for (const [group, types] of Object.entries(GROUPS)) {
    await expect(page.locator(`#palette-${group} .palette-item`)).toHaveCount(types.length);
    for (const t of types) await expect(page.locator(`#palette-${group} ${palId(t)}`)).toHaveAttribute('data-type', t);
  }
  for (const t of ALL) {
    const item = page.locator(palId(t));
    await item.scrollIntoViewIfNeeded();
    await item.click();
    const n = await page.evaluate((t) => { const e = app.state.elements.filter((x) => x.type === t).pop(); return e && JSON.parse(JSON.stringify(e)); }, t);
    const d = await page.evaluate((t) => DIAGRAM_SHAPES[t], t);
    expect(n, t).toMatchObject({ type: t, name: d.name, width: d.w, height: d.h, fcFillColor: d.fill, fcStrokeColor: d.stroke });
    await expect(page.locator(`#layers-nodes-group [data-id="${n.id}"] [data-dg-shape="${t}"]`)).toHaveCount(1);
  }
  expect(errors).toEqual([]);
});

test('palette items are keyboard buttons with a preview and a hover popover, and can be dragged onto the canvas', async ({ page }) => {
  await setup(page);
  await openSection(page);
  const item = page.locator(palId('uml_class'));
  await expect(item).toHaveAttribute('tabindex', '0');
  await expect(item).toHaveAttribute('role', 'button');
  await expect(item).toHaveAttribute('draggable', 'true');
  await expect(item.locator('svg [data-dg-shape="uml_class"]')).toHaveCount(1);
  // Keyboard: Enter adds the shape.
  await item.focus();
  await page.keyboard.press('Enter');
  expect(await page.evaluate(() => app.state.elements.filter((e) => e.type === 'uml_class').length)).toBe(1);
  // Hover popover.
  await page.locator(palId('bpmn_gateway_parallel')).hover();
  const pop = page.locator(`${palId('bpmn_gateway_parallel')} + .palette-popover-panel`);
  await expect(pop).toBeVisible();
  await expect(pop).toContainText('Parallel gateway');
  // Drag and drop onto the canvas adds it where it was dropped.
  const dt = await page.evaluateHandle(() => new DataTransfer());
  await page.locator(palId('erd_entity')).dispatchEvent('dragstart', { dataTransfer: dt });
  const box = await page.locator('#canvas-svg').boundingBox();
  await page.locator('#canvas-svg').dispatchEvent('drop', { dataTransfer: dt, clientX: box.x + 400, clientY: box.y + 300 });
  expect(await page.evaluate(() => app.state.elements.filter((e) => e.type === 'erd_entity').length)).toBe(1);
});

test('review mode blocks adding a diagram shape from the palette', async ({ page }) => {
  await setup(page);
  await page.evaluate(() => { app.state.reviewMode = true; app.refreshAppViewVisualWorkspace(); });
  await openSection(page);
  await page.locator(palId('c4_container')).click();
  expect(await page.evaluate(() => app.state.elements.length)).toBe(0);
});

for (const theme of ['light', 'dark']) {
  test(`each shape draws its distinctive outline on a ${theme} canvas`, async ({ page }) => {
    await setup(page);
    const els = await oneOfEach(page);
    await page.evaluate(([els, theme]) => {
      app.state.elements = els; if (app.canvasTheme !== theme) app.toggleCanvasTheme(); app.refreshAppViewVisualWorkspace();
    }, [els, theme]);
    for (const t of ALL) {
      const g = page.locator(`#layers-nodes-group [data-id="s-${t}"] [data-dg-shape="${t}"]`);
      await expect(g, t).toHaveCount(1);
      const parts = await g.evaluate((n) => [...n.querySelectorAll('[data-dg-part]')].map((p) => p.dataset.dgPart));
      for (const p of new Set(PARTS[t])) expect(parts.filter((x) => x === p).length, `${t} ${p}`).toBe(PARTS[t].filter((x) => x === p).length);
    }
    // Event rings: start thin, end thick.
    const sw = (t) => page.locator(`[data-id="s-${t}"] [data-dg-part="ring"]`).getAttribute('stroke-width').then(Number);
    expect(await sw('bpmn_end')).toBeGreaterThan(2 * (await sw('bpmn_start')));
    // The name is on the shape; labels drawn beside the shape stay readable on the canvas colour.
    for (const [i, t] of ALL.entries()) await expect(page.locator(`[data-id="s-${t}"] text`, { hasText: `Name${i}` }), t).toHaveCount(1);
    const outside = await page.locator('[data-id="s-bpmn_start"] text[data-dg-text="outside"]').evaluate((n) => getComputedStyle(n).fill);
    const actorStroke = await page.locator('[data-id="s-uml_actor"] [data-dg-part="figure"]').evaluate((n) => getComputedStyle(n).stroke);
    const lum = (rgb) => { const [r, g, b] = rgb.match(/\d+/g).map(Number); return 0.299 * r + 0.587 * g + 0.114 * b; };
    if (theme === 'dark') { expect(lum(outside)).toBeGreaterThan(150); expect(lum(actorStroke)).toBeGreaterThan(150); }
    else { expect(lum(outside)).toBeLessThan(100); expect(lum(actorStroke)).toBeLessThan(100); }
  });
}

test('C4 shapes show the kind and technology line; class and ERD compartments render the given lines with PK/FK markers', async ({ page }) => {
  await setup(page);
  const els = await oneOfEach(page, {
    c4_container: { c4Technology: 'Node.js', c4Description: 'Serves the API' },
    c4_component: { c4Technology: 'Spring' },
    uml_class: { umlAttributes: '- id: int\n- name: string', umlOperations: '+ save(): void\n+ load(id): User' },
    erd_entity: { erdRows: 'PK id\nFK user_id\ncreated_at' },
  });
  await page.evaluate((els) => { app.state.elements = els; app.refreshAppViewVisualWorkspace(); }, els);
  await expect(page.locator('[data-id="s-c4_container"] text', { hasText: '[Container: Node.js]' })).toHaveCount(1);
  await expect(page.locator('[data-id="s-c4_container"] text', { hasText: 'Serves the API' })).toHaveCount(1);
  await expect(page.locator('[data-id="s-c4_component"] text', { hasText: '[Component: Spring]' })).toHaveCount(1);
  await expect(page.locator('[data-id="s-c4_person"] text', { hasText: '[Person]' })).toHaveCount(1);
  await expect(page.locator('[data-id="s-c4_system"] text', { hasText: '[Software System]' })).toHaveCount(1);
  expect(await page.locator('[data-id="s-uml_class"] text[data-dg-text="attr"]').allTextContents()).toEqual(['- id: int', '- name: string']);
  expect(await page.locator('[data-id="s-uml_class"] text[data-dg-text="op"]').allTextContents()).toEqual(['+ save(): void', '+ load(id): User']);
  expect(await page.locator('[data-id="s-erd_entity"] text[data-dg-text="row"]').allTextContents()).toEqual(['id', 'user_id', 'created_at']);
  expect(await page.locator('[data-id="s-erd_entity"] text[data-erd-key]').evaluateAll((n) => n.map((x) => x.dataset.erdKey + ':' + x.textContent))).toEqual(['PK:PK', 'FK:FK']);
});

test('the Properties panel edits the multi-line fields, grows the shape to fit, and caps their length', async ({ page }) => {
  await setup(page, [shape('uml_class', 0, { width: 200, height: 120, umlAttributes: '', umlOperations: '' }), shape('erd_entity', 1, { width: 200, height: 100, erdRows: '' }), shape('c4_container', 2, { width: 200, height: 120 })]);
  await page.evaluate(() => app.handleElementSelectionEvent('s-uml_class'));
  await expect(page.locator('#box-props-diagram')).toBeVisible();
  await expect(page.locator('#props-dg-umlAttributes')).toBeVisible();
  await expect(page.locator('#props-dg-erdRows')).toBeHidden();
  await page.locator('#props-dg-umlAttributes').fill(Array.from({ length: 12 }, (_, i) => `- f${i}: int`).join('\n'));
  await page.locator('#props-dg-umlAttributes').blur();
  const n = await page.evaluate(() => JSON.parse(JSON.stringify(app.state.elements.find((e) => e.id === 's-uml_class'))));
  expect(n.umlAttributes.split('\n')).toHaveLength(12);
  expect(n.height).toBeGreaterThan(120);
  await expect(page.locator('[data-id="s-uml_class"] text[data-dg-text="attr"]')).toHaveCount(12);
  // One undo step brings the old text back.
  await page.evaluate(() => app.undo());
  expect(await page.evaluate(() => app.state.elements.find((e) => e.id === 's-uml_class').umlAttributes)).toBe('');
  await page.evaluate(() => app.handleElementSelectionEvent('s-erd_entity'));
  await expect(page.locator('#props-dg-erdRows')).toHaveAttribute('maxlength', '2000');
  await page.evaluate(() => app.handleElementSelectionEvent('s-c4_container'));
  await expect(page.locator('#props-dg-c4Technology')).toBeVisible();
  await page.locator('#props-dg-c4Technology').fill('Go');
  await page.locator('#props-dg-c4Technology').blur();
  await expect(page.locator('[data-id="s-c4_container"] text', { hasText: '[Container: Go]' })).toHaveCount(1);
});

test('fields survive save, reload, JSON export and import; imported fields are length-limited text', async ({ page }) => {
  await setup(page);
  const els = await oneOfEach(page, {
    c4_container: { c4Technology: 'Node.js', c4Description: 'Serves the API' },
    uml_class: { umlAttributes: '- id: int', umlOperations: '+ save(): void' },
    erd_entity: { erdRows: 'PK id\nFK user_id' },
  });
  await page.evaluate((els) => { app.state.elements = els; app.saveSessionToLocalStorage(); }, els);
  await page.reload(); await page.waitForFunction(() => window.app && window.app.state);
  const pick = () => page.evaluate(() => Object.fromEntries(app.state.elements.map((e) => [e.type, [e.c4Technology, e.c4Description, e.umlAttributes, e.umlOperations, e.erdRows]])));
  const before = await pick();
  expect(before.c4_container).toEqual(['Node.js', 'Serves the API', undefined, undefined, undefined]);
  expect(before.erd_entity[4]).toBe('PK id\nFK user_id');
  expect(Object.keys(before).sort()).toEqual([...ALL].sort());
  const json = JSON.parse(await downloadText(page, '#btn-export'));
  await setup(page);
  await importJson(page, JSON.stringify(json));
  expect(await pick()).toEqual(before);
  // Hostile values: oversized, non-string and too many lines.
  const bad = JSON.parse(JSON.stringify(json));
  const cls = bad.elements.find((e) => e.type === 'uml_class'), erd = bad.elements.find((e) => e.type === 'erd_entity'), c4 = bad.elements.find((e) => e.type === 'c4_container');
  cls.umlAttributes = 'x'.repeat(50000); cls.umlOperations = { evil: 1 };
  erd.erdRows = Array.from({ length: 500 }, (_, i) => `r${i}`).join('\n');
  c4.c4Technology = 'a\nb' + 'y'.repeat(500);
  await importJson(page, JSON.stringify(bad));
  const got = await page.evaluate(() => Object.fromEntries(app.state.elements.map((e) => [e.type, e])));
  expect(got.uml_class.umlAttributes.length).toBeLessThanOrEqual(2000);
  expect(got.uml_class.umlOperations).toBeUndefined();
  expect(got.erd_entity.erdRows.split('\n').length).toBeLessThanOrEqual(60);
  expect(got.c4_container.c4Technology).toBe('a');
});

test('flows connect the new shapes, from an anchor drag and as elbow connectors around another shape', async ({ page }) => {
  await setup(page, [
    shape('c4_container', 0, { x: 100, y: 300, width: 200, height: 120 }),
    shape('erd_entity', 1, { x: 700, y: 300, width: 200, height: 100 }),
    shape('bpmn_gateway_exclusive', 2, { x: 430, y: 320, width: 60, height: 60 }),
  ]);
  // Drag from the container's right anchor onto the gateway.
  const src = page.locator('#layers-nodes-group [data-id="s-c4_container"] [data-anchor-id="right"]');
  await page.locator('#layers-nodes-group [data-id="s-c4_container"]').first().hover();
  const a = await src.boundingBox();
  const b = await page.locator('#layers-nodes-group [data-id="s-bpmn_gateway_exclusive"] [data-dg-part="diamond"]').boundingBox();
  await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2);
  await page.mouse.down();
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2, { steps: 8 });
  await page.mouse.up();
  const f = await page.evaluate(() => app.state.flows.map((x) => [x.sourceId, x.targetId]));
  expect(f).toEqual([['s-c4_container', 's-bpmn_gateway_exclusive']]);
  // An elbow flow from the container to the ERD table goes around the gateway in between.
  await page.evaluate(() => {
    app.state.flows = [{ id: 'f1', name: 'f', sourceId: 's-c4_container', targetId: 's-erd_entity', sourceAnchor: 'right', targetAnchor: 'left', points: [], secProps: {}, curveStyle: 'orthogonal' }];
    app.lineJumps = false; app.refreshAppViewVisualWorkspace();
  });
  const pts = await page.evaluate(() => {
    const d = document.querySelector('#layers-flows-paths-group [data-flow-id="f1"] path.flow-line').getAttribute('d');
    const n = d.replace(/[ML]/g, ' ').trim().split(/\s+/).map(Number); const out = [];
    for (let i = 0; i < n.length; i += 2) out.push([n[i], n[i + 1]]);
    return out;
  });
  expect(pts[0]).toEqual([300, 360]);
  // The line ends at the arrowhead's base, short of the left anchor (700, 350) by the arrow length.
  const end = pts[pts.length - 1], arr = await page.evaluate(() => app.flowArrowLength(app.state.flows[0]));
  expect(end).toEqual([700 - arr, 350]);
  const r = { x: 430, y: 320, width: 60, height: 60 };
  const crosses = pts.slice(1).some((q, i) => { const p = pts[i];
    return Math.min(p[0], q[0]) < r.x + r.width - 0.5 && Math.max(p[0], q[0]) > r.x + 0.5 && Math.min(p[1], q[1]) < r.y + r.height - 0.5 && Math.max(p[1], q[1]) > r.y + 0.5; });
  expect(crosses).toBe(false);
});

test('Save as PNG draws every diagram shape into the exported image', async ({ page }) => {
  await setup(page);
  const els = await oneOfEach(page);
  await page.evaluate((els) => { app.state.elements = els; app.refreshAppViewVisualWorkspace(); }, els);
  await page.evaluate(() => {
    window.__svgOut = [];
    const orig = XMLSerializer.prototype.serializeToString;
    XMLSerializer.prototype.serializeToString = function (n) { const s = orig.call(this, n); window.__svgOut.push(s); return s; };
  });
  const [download] = await Promise.all([page.waitForEvent('download'), page.click('#btn-canvas-save-png')]);
  expect(download.suggestedFilename()).toMatch(/\.png$/);
  const svg = await page.evaluate(() => window.__svgOut.find((s) => s.includes('canvas-transform-group')) || '');
  for (const t of ALL) expect(svg, t).toContain(`data-dg-shape="${t}"`);
});

test('C4 shapes are model components with threat suggestions; UML, BPMN and ERD shapes are not', async ({ page }) => {
  await setup(page);
  const els = await oneOfEach(page);
  await page.evaluate((els) => { app.state.elements = els; app.refreshAppViewVisualWorkspace(); }, els);
  const comps = await page.evaluate(() => app.modelComponents().map((e) => e.type));
  expect(comps.sort()).toEqual([...COMPONENTS].sort());
  await page.click('#tab-suggest-trigger');
  for (const t of ALL) {
    await page.evaluate((t) => app.handleElementSelectionEvent(`s-${t}`), t);
    if (COMPONENTS.includes(t)) {
      await expect(page.locator('#suggest-view-content'), t).toBeVisible();
      await expect(page.locator('#box-threat-suggestions-list .template-card').first(), t).toBeVisible();
      await expect(page.locator('#box-props-threats'), t).toBeAttached();
      expect(await page.locator('#box-props-threats').evaluate((n) => n.classList.contains('d-none')), t).toBe(false);
    } else {
      await expect(page.locator('#suggest-view-empty'), t).toBeVisible();
      await expect(page.locator('#suggest-view-content'), t).toBeHidden();
      expect(await page.locator('#box-props-threats').evaluate((n) => n.classList.contains('d-none')), t).toBe(true);
    }
  }
  // A person and an external system use the external-entity library; containers use the process library.
  expect(await page.evaluate(() => ['c4_person', 'c4_external', 'c4_container', 'c4_system', 'c4_component'].map((t) => app.libraryKeyFor({ type: t }))))
    .toEqual(['interactor', 'interactor', 'process', 'process', 'process']);
});

test('the Type dropdown offers the diagram shapes in their own groups and switches between them', async ({ page }) => {
  await setup(page, [shape('bpmn_task', 0, { width: 160, height: 80 })]);
  await page.evaluate(() => app.handleElementSelectionEvent('s-bpmn_task'));
  const groups = await page.locator('#props-node-type optgroup').evaluateAll((g) => g.map((x) => x.label));
  expect(groups).toEqual(['Threat modelling', 'Flowchart', 'C4 model', 'UML', 'BPMN', 'Entity-relationship']);
  expect(await page.locator('#props-node-type optgroup[label="Flowchart"] option').evaluateAll((o) => o.every((x) => x.value.startsWith('fc_')))).toBe(true);
  await page.locator('#props-node-type').selectOption('bpmn_gateway_inclusive');
  expect(await page.evaluate(() => app.state.elements[0].type)).toBe('bpmn_gateway_inclusive');
  await expect(page.locator('[data-id="s-bpmn_task"] [data-dg-part="marker-o"]')).toHaveCount(1);
});

test('a shape with threats is not offered, and cannot be changed to, a notation type', async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 1000 });
  await openApp(page, { session: demoSession((s) => {
    s.elements = [shape('c4_container', 0, { width: 200, height: 120 })]; s.flows = []; s.mitigations = [];
    s.threats = [{ id: 'th-001', title: 'T', category: 'Spoofing', elementId: 's-c4_container', status: 'Open / Unmitigated', likelihood: '3', impact: '3', desc: '' }];
  }) });
  await page.evaluate(() => app.handleElementSelectionEvent('s-c4_container'));
  const groups = await page.locator('#props-node-type optgroup').evaluateAll((g) => g.map((x) => x.label));
  expect(groups).toEqual(['Threat modelling', 'Flowchart', 'C4 model']);
  expect(await page.evaluate(() => app.changeNodeType('s-c4_container', 'uml_note'))).toBe(false);
  expect(await page.evaluate(() => app.changeNodeType('s-c4_container', 'c4_system'))).toBe(true);
  expect(await page.evaluate(() => app.state.threats[0].elementId)).toBe('s-c4_container');
});

test('hiding a diagram sub-group in Settings hides it in the palette', async ({ page }) => {
  await setup(page);
  for (const g of Object.keys(GROUPS)) {
    await clickControl(page, '#btn-settings');
    await expect(page.locator('#modal-settings')).toBeVisible();
    await page.locator(`#settings-palette-groups input[data-palette-group="${g}"]`).uncheck();
    expect(await page.locator(`#palette-${g}`).evaluate((n) => n.classList.contains('d-none'))).toBe(true);
    await page.locator(`#settings-palette-groups input[data-palette-group="${g}"]`).check();
    expect(await page.locator(`#palette-${g}`).evaluate((n) => n.classList.contains('d-none'))).toBe(false);
    await page.keyboard.press('Escape');
    await expect(page.locator('#modal-settings')).toBeHidden();
  }
});

test('format painter copies colours between diagram shapes', async ({ page }) => {
  await setup(page, [shape('uml_note', 0, { width: 160, height: 90, fcFillColor: '#dbeafe', fcStrokeColor: '#1d4ed8' }), shape('uml_usecase', 1, { width: 180, height: 80 })]);
  const out = await page.evaluate(() => paintableStyle(app.state.elements[0], app.state.elements[1]));
  expect(out).toMatchObject({ fcFillColor: '#dbeafe', fcStrokeColor: '#1d4ed8' });
});
