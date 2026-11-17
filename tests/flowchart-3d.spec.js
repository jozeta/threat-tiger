// 3D flowchart shapes: the "3D" checkbox for every flowchart shape, migration of the old cube and database shapes,
// the inherently 3D shapes (sphere, cone, pyramid, stacked layers), and drawing in the flat and both isometric views.
const { test } = require('@playwright/test');
const { expect, openApp, demoSession } = require('./helpers');

const BASE_TYPES = ['fc_process', 'fc_decision', 'fc_terminator', 'fc_data', 'fc_document', 'fc_manual_input', 'fc_preparation', 'fc_connector', 'fc_stored_data'];
const SOLID_TYPES = ['fc_sphere', 'fc_cone', 'fc_pyramid', 'fc_layers'];

async function setup(page, elements = []) {
  await page.setViewportSize({ width: 1600, height: 1000 });
  await openApp(page, { session: demoSession((s) => { s.elements = elements; s.flows = []; s.threats = []; s.mitigations = []; }) });
}
const select = (page, ids) => page.evaluate((sel) => { app.state.selectedElementIds = sel; app.state.selectedFlowId = null; app.refreshAppViewVisualWorkspace(); }, ids);
const get = (page, id) => page.evaluate((i) => JSON.parse(JSON.stringify(app.state.elements.find((e) => e.id === i))), id);
const node = (page, id) => page.locator(`#layers-nodes-group [data-id="${id}"]`).first();
const view = (page, mode) => page.evaluate((m) => app.setViewMode(m), mode);
// Screen-space bounding box (canvas pixels, after the isometric transform) of the 3D parts of a node.
const screenBox = (page, id, sel) => page.evaluate(([i, s]) => {
  const g = document.querySelector(`#layers-nodes-group [data-id="${i}"]`);
  const r = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
  g.querySelectorAll(s).forEach((el) => {
    const b = el.getBoundingClientRect();
    r.minX = Math.min(r.minX, b.left); r.minY = Math.min(r.minY, b.top); r.maxX = Math.max(r.maxX, b.right); r.maxY = Math.max(r.maxY, b.bottom);
  });
  return r;
}, [id, sel]);

test('the palette has no Database and Cube items, and offers the 3D shapes in their own group', async ({ page }) => {
  await setup(page);
  await expect(page.locator('#pal-fc-database')).toHaveCount(0);
  await expect(page.locator('#pal-fc-cube')).toHaveCount(0);
  await expect(page.locator('[data-type="fc_cube"], [data-type="fc_database"]')).toHaveCount(0);
  for (const t of SOLID_TYPES) await expect(page.locator(`#palette-fc-3d .palette-item[data-type="${t}"]`)).toHaveCount(1);
  expect(await page.evaluate(() => ['fc_cube', 'fc_database'].filter((t) => t in FLOWCHART_DEFAULTS))).toEqual([]);
  expect(await page.evaluate((s) => s.filter((t) => !(t in FLOWCHART_DEFAULTS)), SOLID_TYPES)).toEqual([]);
  await page.locator('#headingFlowchart button').click();
  for (const t of SOLID_TYPES) {
    await page.locator(`#palette-fc-3d .palette-item[data-type="${t}"]`).click();
    const id = await page.evaluate((ty) => app.state.elements.filter((e) => e.type === ty).pop().id, t);
    await expect(node(page, id).locator('[data-fc3d]').first()).toBeAttached();
  }
});

test('old cube and database shapes migrate to a 3D process and a 3D connector', async ({ page }) => {
  await setup(page, [
    { id: 'c', type: 'fc_cube', name: 'Server', notes: 'n1', x: 400, y: 300, width: 140, height: 100, fcFillColor: '#e0e7ff', fcStrokeColor: '#4f46e5', fcStrokeWidth: 3 },
    { id: 'd', type: 'fc_database', name: 'DB', notes: 'n2', x: 700, y: 300, width: 120, height: 100, fcFillColor: '#ecfccb', fcStrokeColor: '#65a30d' },
  ]);
  expect(await get(page, 'c')).toMatchObject({ type: 'fc_process', threeD: true, name: 'Server', notes: 'n1', x: 400, y: 300, width: 140, height: 100, fcFillColor: '#e0e7ff', fcStrokeColor: '#4f46e5', fcStrokeWidth: 3 });
  expect(await get(page, 'd')).toMatchObject({ type: 'fc_connector', threeD: true, name: 'DB', notes: 'n2', x: 700, y: 300, width: 120, height: 100, fcFillColor: '#ecfccb', fcStrokeColor: '#65a30d' });
  // The 3D connector is the old database cylinder: two ellipse caps and two side lines.
  await expect(node(page, 'd').locator('ellipse[data-fc3d]')).toHaveCount(2);
  await expect(node(page, 'd').locator('line[data-fc3d]')).toHaveCount(2);
  await select(page, ['c']);
  await expect(page.locator('#props-node-type option[value="fc_cube"], #props-node-type option[value="fc_database"]')).toHaveCount(0);
  await expect(page.locator('#props-node-type')).toHaveValue('fc_process');
});

test('the normaliser keeps only boolean threeD values, and only on flowchart shapes', async ({ page }) => {
  await setup(page);
  const r = await page.evaluate(() => {
    const ctx = { warn() {} };
    const n = (extra) => normalizeElement({ id: 'x', type: 'fc_process', name: 'X', ...extra }, ctx);
    return {
      t: n({ threeD: true }).threeD, f: n({ threeD: false }).threeD,
      s: 'threeD' in n({ threeD: 'true' }), num: 'threeD' in n({ threeD: 1 }), obj: 'threeD' in n({ threeD: { a: 1 } }),
      lane: 'threeD' in normalizeElement({ id: 'l', type: 'swimlane', name: 'L', threeD: true }, ctx),
      proc: 'threeD' in normalizeElement({ id: 'p', type: 'process', name: 'P', threeD: true }, ctx),
    };
  });
  expect(r).toEqual({ t: true, f: false, s: false, num: false, obj: false, lane: false, proc: false });
});

test('Mermaid: a cylinder imports as a 3D connector and a 3D connector exports as a cylinder', async ({ page }) => {
  await setup(page);
  const nodes = await page.evaluate(() => {
    const g = parseMermaidFlowchart('flowchart TD\n  A[(Orders DB)] --> B@{ shape: cyl, label: "Cache" }\n  B --> C((Hub))');
    return Object.fromEntries([...g.nodes].map(([k, v]) => [k, { type: v.type, threeD: !!v.threeD }]));
  });
  expect(nodes).toEqual({ A: { type: 'fc_connector', threeD: true }, B: { type: 'fc_connector', threeD: true }, C: { type: 'fc_connector', threeD: false } });
  await page.evaluate(() => app.importMermaidFlowchart('flowchart TD\n  A[(Orders DB)] --> C((Hub))', 'replace'));
  const els = await page.evaluate(() => app.state.elements.map((e) => ({ name: e.name, type: e.type, threeD: !!e.threeD })));
  expect(els).toEqual([{ name: 'Orders DB', type: 'fc_connector', threeD: true }, { name: 'Hub', type: 'fc_connector', threeD: false }]);
  const text = await page.evaluate(() => app.buildMermaidDiagram());
  expect(text).toMatch(/\[\("Orders DB"\)\]/);
  expect(text).toMatch(/\(\("Hub"\)\)/);
});

test('the 3D checkbox shows for every flowchart shape, not for swimlanes or the always-3D shapes', async ({ page }) => {
  const els = [...BASE_TYPES, ...SOLID_TYPES].map((t, i) => ({ id: `n${i}`, type: t, name: t, x: (i % 5) * 220, y: Math.floor(i / 5) * 200, width: 160, height: 90 }));
  els.push({ id: 'lane', type: 'swimlane', name: 'Lanes', x: 0, y: 700, columns: ['A'], rows: ['R'] });
  await setup(page, els);
  for (let i = 0; i < BASE_TYPES.length; i++) {
    await select(page, [`n${i}`]);
    await expect(page.locator('#props-fc-3d'), BASE_TYPES[i]).toBeVisible();
    await expect(page.locator('#props-fc-3d')).not.toBeChecked();
  }
  for (let i = BASE_TYPES.length; i < els.length - 1; i++) {
    await select(page, [`n${i}`]);
    await expect(page.locator('#props-fc-3d'), els[i].type).toBeHidden();
  }
  await select(page, ['lane']);
  await expect(page.locator('#props-fc-3d')).toBeHidden();
});

test('toggling 3D redraws every shape with walls, is one undo step and is logged', async ({ page }) => {
  const els = BASE_TYPES.map((t, i) => ({ id: `n${i}`, type: t, name: t, x: (i % 5) * 220, y: Math.floor(i / 5) * 200, width: 160, height: 90 }));
  await setup(page, els);
  for (let i = 0; i < BASE_TYPES.length; i++) {
    const id = `n${i}`;
    await select(page, [id]);
    await expect(node(page, id).locator('[data-fc3d]')).toHaveCount(0);
    const undo = await page.evaluate(() => app.undoStack.length);
    const log = await page.evaluate(() => app.state.activityLog.length);
    await page.locator('#props-fc-3d').check();
    expect((await get(page, id)).threeD, BASE_TYPES[i]).toBe(true);
    expect(await page.evaluate(() => app.undoStack.length)).toBe(undo + 1);
    expect(await page.evaluate(() => app.state.activityLog.length)).toBe(log + 1);
    expect(await page.evaluate(() => app.state.activityLog[0].message)).toContain('3D');
    if (BASE_TYPES[i] === 'fc_connector') await expect(node(page, id).locator('ellipse[data-fc3d]')).toHaveCount(2);
    else {
      expect(await node(page, id).locator('[data-fc3d="wall"]').count(), BASE_TYPES[i]).toBeGreaterThan(1);
      await expect(node(page, id).locator('[data-fc3d="cap"]')).toHaveCount(1);
    }
  }
  await page.evaluate(() => app.undo());
  expect((await get(page, `n${BASE_TYPES.length - 1}`)).threeD).toBeFalsy();
  await expect(node(page, `n${BASE_TYPES.length - 1}`).locator('[data-fc3d]')).toHaveCount(0);
  // Unticking removes the flag again.
  await select(page, ['n0']);
  await expect(page.locator('#props-fc-3d')).toBeChecked();
  await page.locator('#props-fc-3d').uncheck();
  expect('threeD' in (await get(page, 'n0'))).toBe(false);
});

test('a flat 3D process is the old cube: front face, top and right walls, label and anchors on the visible faces', async ({ page }) => {
  await setup(page, [{ id: 'c', type: 'fc_process', threeD: true, name: 'Server', x: 400, y: 300, width: 140, height: 100, fcFillColor: '#e0e7ff', fcStrokeColor: '#4f46e5' }]);
  const g = node(page, 'c');
  await expect(g.locator('[data-fc3d="cap"]')).toHaveAttribute('points', '0,20 120,20 120,100 0,100');
  await expect(g.locator('[data-fc3d="wall"]')).toHaveCount(2);   // top and right
  const walls = await g.locator('[data-fc3d="wall"]').evaluateAll((els) => els.map((e) => e.getAttribute('points')).sort());
  expect(walls).toEqual(['0,20 120,20 140,0 20,0', '120,20 120,100 140,80 140,0'].sort());
  const lbl = g.locator('text.fc-shape-label');
  await expect(lbl).toHaveAttribute('x', '60');
  await expect(lbl).toHaveAttribute('y', '60');
  expect(await page.evaluate(() => app.getFcAnchorPoints('fc_process', 140, 100, true))).toEqual([
    { id: 'top', cx: 70, cy: 10 }, { id: 'bottom', cx: 60, cy: 100 },
    { id: 'left', cx: 0, cy: 60 }, { id: 'right', cx: 130, cy: 50 },
  ]);
  // Not 3D: the plain anchors.
  expect((await page.evaluate(() => app.getFcAnchorPoints('fc_process', 140, 100, false)))[0]).toEqual({ id: 'top', cx: 70, cy: 0 });
});

test('isometric: the top face rises above the footprint, NE and NW differ, and switching views redraws at once', async ({ page }) => {
  await setup(page, [{ id: 'c', type: 'fc_process', threeD: true, name: 'Server', x: 400, y: 300, width: 160, height: 120 }]);
  const flatWalls = await node(page, 'c').locator('[data-fc3d="wall"]').evaluateAll((els) => els.map((e) => e.getAttribute('points')).join('|'));
  await view(page, 'ne-isometric');
  const g = node(page, 'c');
  await expect(g.locator('[data-fc3d="cap"]')).toHaveCount(1);
  // Iso: the footprint is the full shape, the top face is the footprint moved screen-up.
  const neWalls = await g.locator('[data-fc3d="wall"]').evaluateAll((els) => els.map((e) => e.getAttribute('points')).join('|'));
  expect(neWalls).not.toBe(flatWalls);
  const neCap = await screenBox(page, 'c', '[data-fc3d="cap"]');
  const neAll = await screenBox(page, 'c', '[data-fc3d]');
  expect(neCap.minY).toBeLessThan(neAll.maxY - 20);
  expect(neAll.maxY - neCap.maxY).toBeGreaterThan(20);   // the walls hang below the top face
  // Anchors stay on the footprint in iso.
  expect(await page.evaluate(() => app.getFcAnchorPoints('fc_process', 160, 120, true)[0])).toEqual({ id: 'top', cx: 80, cy: 0 });
  // The top face is directly above (screen) the footprint centre.
  const centre = await page.evaluate(() => { const p = app.projectCoordinates(480, 360); return p; });
  const capCentreModel = await page.evaluate(() => {
    const cap = document.querySelector('#layers-nodes-group [data-id="c"] [data-fc3d="cap"]');
    const pts = cap.getAttribute('points').split(' ').map((s) => s.split(',').map(Number));
    const cx = pts.reduce((a, p) => a + p[0], 0) / pts.length, cy = pts.reduce((a, p) => a + p[1], 0) / pts.length;
    return app.projectCoordinates(400 + cx, 300 + cy);
  });
  expect(Math.abs(capCentreModel.x - centre.x)).toBeLessThan(1);
  expect(capCentreModel.y).toBeLessThan(centre.y - 20);
  await view(page, 'nw-isometric');
  const nwWalls = await g.locator('[data-fc3d="wall"]').evaluateAll((els) => els.map((e) => e.getAttribute('points')).join('|'));
  expect(nwWalls).not.toBe(neWalls);
  const nwCentre = await page.evaluate(() => app.projectCoordinates(480, 360));
  const nwCap = await page.evaluate(() => {
    const cap = document.querySelector('#layers-nodes-group [data-id="c"] [data-fc3d="cap"]');
    const pts = cap.getAttribute('points').split(' ').map((s) => s.split(',').map(Number));
    const cx = pts.reduce((a, p) => a + p[0], 0) / pts.length, cy = pts.reduce((a, p) => a + p[1], 0) / pts.length;
    return app.projectCoordinates(400 + cx, 300 + cy);
  });
  expect(Math.abs(nwCap.x - nwCentre.x)).toBeLessThan(1);
  expect(nwCap.y).toBeLessThan(nwCentre.y - 20);
  await view(page, 'flat');
  expect(await node(page, 'c').locator('[data-fc3d="wall"]').evaluateAll((els) => els.map((e) => e.getAttribute('points')).join('|'))).toBe(flatWalls);
});

test('every 3D shape draws in the flat and both isometric views without errors', async ({ page }) => {
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const els = [...BASE_TYPES.map((t, i) => ({ id: `n${i}`, type: t, threeD: true })), ...SOLID_TYPES.map((t, i) => ({ id: `s${i}`, type: t }))]
    .map((e, i) => ({ ...e, name: e.type, x: (i % 5) * 240, y: Math.floor(i / 5) * 220, width: 160, height: 100 }));
  await setup(page, els);
  for (const mode of ['flat', 'ne-isometric', 'nw-isometric']) {
    await view(page, mode);
    for (const e of els) {
      expect(await node(page, e.id).locator('[data-fc3d]').count(), `${e.type} in ${mode}`).toBeGreaterThan(0);
      // No NaN coordinates anywhere in the drawing.
      const bad = await node(page, e.id).evaluate((g) => [...g.querySelectorAll('*')].some((n) => [...n.attributes].some((a) => /NaN|Infinity/.test(a.value))));
      expect(bad, `${e.type} in ${mode}`).toBe(false);
      await expect(node(page, e.id).locator('text.fc-shape-label')).toHaveText(e.type);
    }
  }
  expect(errors).toEqual([]);
});

test('clicking a visible wall of a 3D shape selects it', async ({ page }) => {
  await setup(page, [{ id: 'c', type: 'fc_process', threeD: true, name: 'Server', x: 400, y: 300, width: 160, height: 120 }]);
  await view(page, 'ne-isometric');
  await page.evaluate(() => { app.state.selectedElementIds = []; app.refreshAppViewVisualWorkspace(); });
  const wall = node(page, 'c').locator('[data-fc3d="wall"]').first();
  await wall.click({ force: true });
  expect(await page.evaluate(() => app.state.selectedElementIds)).toEqual(['c']);
});

test('the exported image contains the 3D faces', async ({ page }) => {
  await setup(page, [{ id: 'c', type: 'fc_process', threeD: true, name: 'Server', x: 400, y: 300, width: 160, height: 120 }, { id: 's', type: 'fc_sphere', name: 'Ball', x: 700, y: 300, width: 100, height: 100 }]);
  await page.evaluate(() => {
    window.__svgOut = [];
    const orig = XMLSerializer.prototype.serializeToString;
    XMLSerializer.prototype.serializeToString = function (n) { const s = orig.call(this, n); window.__svgOut.push(s); return s; };
  });
  await page.evaluate(() => app.exportCanvasAsPng().catch(() => {}));
  await page.waitForFunction(() => window.__svgOut.some((s) => s.includes('canvas-svg') || s.includes('data-fc3d')));
  const svg = await page.evaluate(() => window.__svgOut.find((s) => s.includes('data-fc3d')) || '');
  expect(svg).toContain('data-fc3d="wall"');
  expect(svg).toContain('data-fc3d="cap"');
  expect(svg).toContain('radialGradient');
});

test('review mode blocks toggling 3D', async ({ page }) => {
  await setup(page, [{ id: 'c', type: 'fc_process', name: 'Server', x: 400, y: 300, width: 160, height: 120 }]);
  await page.evaluate(() => app.toggleReviewMode(true));
  await select(page, ['c']);
  await expect(page.locator('#props-fc-3d')).toBeDisabled();
  await page.evaluate(() => { const c = document.getElementById('props-fc-3d'); c.disabled = false; c.click(); });
  expect('threeD' in (await get(page, 'c'))).toBe(false);
  await expect(page.locator('#props-fc-3d')).not.toBeChecked();
});

test('quick add and the format painter carry the 3D look', async ({ page }) => {
  await setup(page, [
    { id: 'a', type: 'fc_process', threeD: true, name: 'A', x: 400, y: 300, width: 160, height: 80 },
    { id: 'b', type: 'fc_decision', name: 'B', x: 100, y: 100, width: 160, height: 100 },
  ]);
  const id = await page.evaluate(() => app.quickAddFlowchartNode('a', 'right'));
  expect((await get(page, id)).threeD).toBe(true);
  await select(page, ['a']);
  await page.click('#btn-format-painter');
  await node(page, 'b').click();
  expect((await get(page, 'b')).threeD).toBe(true);
});

test('dark canvas: 3D shapes still draw their faces', async ({ page }) => {
  await setup(page, [{ id: 'c', type: 'fc_process', threeD: true, name: 'Server', x: 400, y: 300, width: 160, height: 120 }]);
  await page.evaluate(() => { app.canvasTheme = 'dark'; app.applyCanvasTheme(); app.refreshAppViewVisualWorkspace(); });
  await expect(node(page, 'c').locator('[data-fc3d="wall"]')).toHaveCount(2);
});

test('swimlane drawing is unchanged (same element structure in every view)', async ({ page }) => {
  await setup(page, [{ id: 'lane', type: 'swimlane', name: 'Lanes', x: 0, y: 0, width: 760, height: 515, columns: ['Team A', 'Team B'], rows: ['Plan', 'Do'] }]);
  const shape = () => page.evaluate(() => {
    const g = document.querySelector('[data-id="lane"]');
    return [...g.querySelectorAll('*')].map((n) => n.tagName).join(',');
  });
  const flat = await shape();
  // Recorded on the commit before 3D shapes existed.
  expect(flat).toBe('rect,path,text,rect,path,text,line,text,text,line,text,line,line,rect,title,rect,title,rect,title,rect,title');
  await view(page, 'ne-isometric');
  expect(await shape()).toBe(flat);
  await view(page, 'nw-isometric');
  expect(await shape()).toBe(flat);
  expect(await page.evaluate(() => document.querySelectorAll('[data-id="lane"] [data-fc3d]').length)).toBe(0);
});

test('the 3D checkbox is only for flowchart shapes: attack-tree and diagram shapes never offer it', async ({ page }) => {
  const types = ['at_step', 'at_and', 'c4_container', 'uml_class', 'bpmn_task', 'erd_entity'];
  await setup(page, types.map((t, i) => ({ id: `o${i}`, type: t, name: t, x: i * 240, y: 0, width: 180, height: 90 })));
  for (let i = 0; i < types.length; i++) {
    await select(page, [`o${i}`]);
    await expect(page.locator('#box-props-flowchart'), types[i]).toBeVisible();
    await expect(page.locator('#props-fc-3d'), types[i]).toBeHidden();
  }
  // and a forged threeD on them is dropped on load
  await page.evaluate(() => { const m = JSON.parse(JSON.stringify(app.state)); m.elements[0].threeD = true; app.importWorkspaceJsonText(JSON.stringify(m), 'x.json'); });
  await expect.poll(() => page.evaluate(() => 'threeD' in (app.state.elements.find(e => e.type === 'at_step') || {}))).toBe(false);
});

// ── 1.19.x: 3D height, stacked-layer count and thickness, softer solids, legible labels, the flat 3D decision ──
// Screen offset (model → canvas projection) between a node's footprint centre and the centre of one of its caps.
const capLift = (page, id, idx = -1) => page.evaluate(([i, k]) => {
  const el = app.state.elements.find((e) => e.id === i);
  const caps = [...document.querySelectorAll(`#layers-nodes-group [data-id="${i}"] [data-fc3d="cap"]`)];
  const cap = caps[k < 0 ? caps.length + k : k];
  const pts = cap.getAttribute('points').split(' ').map((s) => s.split(',').map(Number));
  const cx = pts.reduce((a, p) => a + p[0], 0) / pts.length, cy = pts.reduce((a, p) => a + p[1], 0) / pts.length;
  const a = app.projectCoordinates(el.x + el.width / 2, el.y + el.height / 2), b = app.projectCoordinates(el.x + cx, el.y + cy);
  return a.y - b.y;
}, [id, idx]);
const capPoints = (page, id) => node(page, id).locator('[data-fc3d="cap"]').evaluateAll((els) => els.map((e) => e.getAttribute('points')));

test('the 3D height control shows for 3D shapes, cones and pyramids; the layer controls only for stacked layers', async ({ page }) => {
  await setup(page, [
    { id: 'p3', type: 'fc_process', threeD: true, name: 'P3', x: 0, y: 0, width: 160, height: 100 },
    { id: 'p2', type: 'fc_process', name: 'P2', x: 200, y: 0, width: 160, height: 100 },
    { id: 'co', type: 'fc_cone', name: 'Co', x: 400, y: 0, width: 160, height: 100 },
    { id: 'py', type: 'fc_pyramid', name: 'Py', x: 600, y: 0, width: 160, height: 100 },
    { id: 'sp', type: 'fc_sphere', name: 'Sp', x: 800, y: 0, width: 100, height: 100 },
    { id: 'la', type: 'fc_layers', name: 'La', x: 0, y: 200, width: 160, height: 100 },
    { id: 'at', type: 'at_step', name: 'At', x: 200, y: 200, width: 160, height: 80 },
  ]);
  for (const [id, height, layers] of [['p3', true, false], ['p2', false, false], ['co', true, false], ['py', true, false], ['sp', false, false], ['la', false, true], ['at', false, false]]) {
    await select(page, [id]);
    await (height ? expect(page.locator('#props-fc-depth3d'), id).toBeVisible() : expect(page.locator('#props-fc-depth3d'), id).toBeHidden());
    await (layers ? expect(page.locator('#props-fc-layer-count'), id).toBeVisible() : expect(page.locator('#props-fc-layer-count'), id).toBeHidden());
    await (layers ? expect(page.locator('#props-fc-layer-thickness'), id).toBeVisible() : expect(page.locator('#props-fc-layer-thickness'), id).toBeHidden());
  }
  // Ticking 3D shows the height control at once.
  await select(page, ['p2']);
  await page.locator('#props-fc-3d').check();
  await expect(page.locator('#props-fc-depth3d')).toBeVisible();
});

test('the 3D height drives the isometric top face and the flat depth proportionally', async ({ page }) => {
  await setup(page, [{ id: 'c', type: 'fc_process', threeD: true, name: 'Server', x: 400, y: 300, width: 140, height: 100 }]);
  const setDepth = (v) => page.evaluate(([val]) => { const e = app.state.elements[0]; if (val === null) delete e.depth3d; else e.depth3d = val; app.refreshAppViewVisualWorkspace(); }, [v]);
  // Automatic: iso height 50, flat depth 20 (the old cube).
  await expect(node(page, 'c').locator('[data-fc3d="cap"]')).toHaveAttribute('points', '0,20 120,20 120,100 0,100');
  await setDepth(25);
  await expect(node(page, 'c').locator('[data-fc3d="cap"]')).toHaveAttribute('points', '0,10 130,10 130,100 0,100');
  await setDepth(100);
  await expect(node(page, 'c').locator('[data-fc3d="cap"]')).toHaveAttribute('points', '0,40 100,40 100,100 0,100');
  // Flat depth is clamped, so the front face never collapses.
  await setDepth(400);
  const pts = (await capPoints(page, 'c'))[0].split(' ').map((s) => s.split(',').map(Number));
  expect(pts[1][0]).toBeGreaterThanOrEqual(140 * 0.5);
  expect(pts[2][1] - pts[1][1]).toBeGreaterThanOrEqual(100 * 0.5);
  for (const mode of ['ne-isometric', 'nw-isometric']) {
    await view(page, mode);
    await setDepth(null);
    expect(await capLift(page, 'c')).toBeCloseTo(50, 0);
    await setDepth(30);
    expect(await capLift(page, 'c')).toBeCloseTo(30, 0);
    await setDepth(120);
    expect(await capLift(page, 'c')).toBeCloseTo(120, 0);
  }
  // Labels and anchors follow the height.
  await setDepth(120);
  await view(page, 'flat');
  const a = await page.evaluate(() => app.getFcAnchorPoints('fc_process', 140, 100, true, app.state.elements[0]));
  expect(a.find((p) => p.id === 'left').cy).toBeGreaterThan(60);
});

test('the 3D height control: slider and number, one undo step per change, Auto clears it', async ({ page }) => {
  await setup(page, [{ id: 'c', type: 'fc_cone', name: 'Cone', x: 400, y: 300, width: 160, height: 100 }]);
  await select(page, ['c']);
  const undo0 = await page.evaluate(() => app.undoStack.length);
  // A drag: several input events, one change.
  await page.evaluate(() => {
    const r = document.getElementById('props-fc-depth3d');
    for (const v of [100, 120, 150]) { r.value = String(v); r.dispatchEvent(new Event('input', { bubbles: true })); }
    r.dispatchEvent(new Event('change', { bubbles: true }));
  });
  expect((await get(page, 'c')).depth3d).toBe(150);
  expect(await page.evaluate(() => app.undoStack.length)).toBe(undo0 + 1);
  await expect(page.locator('#props-fc-depth3d-num')).toHaveValue('150');
  // The number box, clamped.
  await page.locator('#props-fc-depth3d-num').fill('9999');
  await page.locator('#props-fc-depth3d-num').press('Enter');
  expect((await get(page, 'c')).depth3d).toBe(400);
  expect(await page.evaluate(() => app.undoStack.length)).toBe(undo0 + 2);
  // Auto removes the field.
  await page.locator('#props-fc-depth3d-auto').click();
  expect('depth3d' in (await get(page, 'c'))).toBe(false);
  expect(await page.evaluate(() => app.undoStack.length)).toBe(undo0 + 3);
  await page.evaluate(() => app.undo());
  expect((await get(page, 'c')).depth3d).toBe(400);
});

test('review mode blocks the 3D height and the layer controls', async ({ page }) => {
  await setup(page, [
    { id: 'c', type: 'fc_process', threeD: true, name: 'Server', x: 400, y: 300, width: 160, height: 120 },
    { id: 'l', type: 'fc_layers', name: 'Stack', x: 700, y: 300, width: 160, height: 120 },
  ]);
  await page.evaluate(() => app.toggleReviewMode(true));
  await select(page, ['c']);
  await expect(page.locator('#props-fc-depth3d')).toBeDisabled();
  await expect(page.locator('#props-fc-depth3d-num')).toBeDisabled();
  await page.evaluate(() => {
    const r = document.getElementById('props-fc-depth3d'); r.disabled = false; r.value = '200';
    r.dispatchEvent(new Event('input', { bubbles: true })); r.dispatchEvent(new Event('change', { bubbles: true }));
  });
  expect('depth3d' in (await get(page, 'c'))).toBe(false);
  await select(page, ['l']);
  await expect(page.locator('#props-fc-layer-count')).toBeDisabled();
  await expect(page.locator('#props-fc-layer-thickness')).toBeDisabled();
  await page.evaluate(() => {
    for (const [id, v] of [['props-fc-layer-count', '7'], ['props-fc-layer-thickness', '30']]) {
      const r = document.getElementById(id); r.disabled = false; r.value = v;
      r.dispatchEvent(new Event('input', { bubbles: true })); r.dispatchEvent(new Event('change', { bubbles: true }));
    }
  });
  const l = await get(page, 'l');
  expect('layerCount' in l || 'layerThickness' in l).toBe(false);
});

test('the format painter and quick add carry the 3D height and the layer settings', async ({ page }) => {
  await setup(page, [
    { id: 'a', type: 'fc_layers', name: 'A', x: 400, y: 300, width: 160, height: 100, depth3d: 140, layerCount: 5, layerThickness: 12 },
    { id: 'b', type: 'fc_layers', name: 'B', x: 100, y: 100, width: 160, height: 100 },
    { id: 'c', type: 'fc_process', threeD: true, name: 'C', x: 100, y: 400, width: 160, height: 100, depth3d: 33 },
  ]);
  await select(page, ['a']);
  await page.click('#btn-format-painter');
  await node(page, 'b').click();
  expect(await get(page, 'b')).toMatchObject({ depth3d: 140, layerCount: 5, layerThickness: 12 });
  // A source on automatic height gives the target the automatic height too.
  await page.evaluate(() => { delete app.state.elements.find((e) => e.id === 'b').depth3d; });
  await select(page, ['b']);
  await page.click('#btn-format-painter');
  await node(page, 'a').click();
  expect('depth3d' in (await get(page, 'a'))).toBe(false);
  const id = await page.evaluate(() => app.quickAddFlowchartNode('c', 'right'));
  expect((await get(page, id)).depth3d).toBe(33);
});

test('the normaliser clamps the 3D height and the layer settings and drops junk', async ({ page }) => {
  await setup(page);
  const r = await page.evaluate(() => {
    const ctx = { warn() {} };
    const n = (extra, type = 'fc_layers') => normalizeElement({ id: 'x', type, name: 'X', ...extra }, ctx);
    const pick = (e) => ({ depth3d: e.depth3d, layerCount: e.layerCount, layerThickness: e.layerThickness });
    return {
      ok: pick(n({ depth3d: 120, layerCount: 4, layerThickness: 15 })),
      low: pick(n({ depth3d: 1, layerCount: 0, layerThickness: 0.1 })),
      high: pick(n({ depth3d: 1e9, layerCount: 99, layerThickness: 1e6 })),
      round: pick(n({ layerCount: 3.6 })),
      junk: ['depth3d', 'layerCount', 'layerThickness'].filter((k) => k in n({ depth3d: '<img src=x>', layerCount: { a: 1 }, layerThickness: [] })),
      nan: 'depth3d' in n({ depth3d: NaN }),
      other: ['depth3d', 'layerCount', 'layerThickness'].filter((k) => k in n({ depth3d: 50, layerCount: 2, layerThickness: 9 }, 'process')),
    };
  });
  expect(r.ok).toEqual({ depth3d: 120, layerCount: 4, layerThickness: 15 });
  expect(r.low).toEqual({ depth3d: 10, layerCount: 1, layerThickness: 2 });
  expect(r.high).toEqual({ depth3d: 400, layerCount: 10, layerThickness: 100 });
  expect(r.round.layerCount).toBe(4);
  expect(r.junk).toEqual([]);
  expect(r.nan).toBe(false);
  expect(r.other).toEqual([]);
});

test('stacked layers: the count sets the number of slabs and the thickness their size, flat and isometric', async ({ page }) => {
  await setup(page, [{ id: 'l', type: 'fc_layers', name: 'Stack', x: 400, y: 300, width: 160, height: 100 }]);
  const set = (o) => page.evaluate((v) => { const e = app.state.elements[0]; delete e.layerCount; delete e.layerThickness; Object.assign(e, v); app.refreshAppViewVisualWorkspace(); }, o);
  const slabHeights = async () => (await capPoints(page, 'l')).map((p) => { const ys = p.split(' ').map((s) => Number(s.split(',')[1])); return Math.max(...ys) - Math.min(...ys); });
  await expect(node(page, 'l').locator('[data-fc3d="cap"]')).toHaveCount(3);   // default
  for (const n of [1, 2, 6, 10]) { await set({ layerCount: n }); await expect(node(page, 'l').locator('[data-fc3d="cap"]'), `${n}`).toHaveCount(n); }
  // Flat: each slab's front face is as thick as asked (when it fits) …
  await set({ layerCount: 2, layerThickness: 10 });
  expect((await slabHeights()).map((v) => Math.round(v))).toEqual([10, 10]);
  await set({ layerCount: 2, layerThickness: 20 });
  expect((await slabHeights()).map((v) => Math.round(v))).toEqual([20, 20]);
  // … and the slabs shrink to fit the box when they would not.
  await set({ layerCount: 6, layerThickness: 100 });
  const hs = await slabHeights();
  expect(hs.length).toBe(6);
  expect(hs.reduce((a, b) => a + b, 0)).toBeLessThanOrEqual(100);
  for (const mode of ['ne-isometric', 'nw-isometric']) {
    await view(page, mode);
    for (const n of [2, 6]) { await set({ layerCount: n }); await expect(node(page, 'l').locator('[data-fc3d="cap"]'), `${mode} ${n}`).toHaveCount(n); }
    await set({ layerCount: 2, layerThickness: 10 });
    const t10 = await capLift(page, 'l');
    await set({ layerCount: 2, layerThickness: 20 });
    const t20 = await capLift(page, 'l');
    expect(t20 / t10, mode).toBeCloseTo(2, 1);
    await set({ layerCount: 4, layerThickness: 10 });
    expect(await capLift(page, 'l')).toBeGreaterThan(t10 * 1.8);
  }
  await view(page, 'flat');
});

test('stacked layers: the count and thickness controls, one undo step each', async ({ page }) => {
  await setup(page, [{ id: 'l', type: 'fc_layers', name: 'Stack', x: 400, y: 300, width: 160, height: 100 }]);
  await select(page, ['l']);
  await expect(page.locator('#props-fc-layer-count-num')).toHaveValue('3');
  const undo0 = await page.evaluate(() => app.undoStack.length);
  await page.locator('#props-fc-layer-count-num').fill('6');
  await page.locator('#props-fc-layer-count-num').press('Enter');
  expect((await get(page, 'l')).layerCount).toBe(6);
  await expect(node(page, 'l').locator('[data-fc3d="cap"]')).toHaveCount(6);
  expect(await page.evaluate(() => app.undoStack.length)).toBe(undo0 + 1);
  await page.evaluate(() => {
    const r = document.getElementById('props-fc-layer-thickness');
    for (const v of [6, 8, 9]) { r.value = String(v); r.dispatchEvent(new Event('input', { bubbles: true })); }
    r.dispatchEvent(new Event('change', { bubbles: true }));
  });
  expect((await get(page, 'l')).layerThickness).toBe(9);
  expect(await page.evaluate(() => app.undoStack.length)).toBe(undo0 + 2);
  await page.locator('#props-fc-layer-thickness-auto').click();
  expect('layerThickness' in (await get(page, 'l'))).toBe(false);
  await page.evaluate(() => app.undo());
  expect((await get(page, 'l')).layerThickness).toBe(9);
});

test('sphere: a soft gradient shadow (no hard black ellipse); sphere, cone and pyramid labels sit on a legible backdrop', async ({ page }) => {
  await setup(page, [
    { id: 'sp', type: 'fc_sphere', name: 'Ball', x: 100, y: 100, width: 120, height: 120 },
    { id: 'co', type: 'fc_cone', name: 'Cone label', x: 400, y: 100, width: 140, height: 120 },
    { id: 'py', type: 'fc_pyramid', name: 'Pyramid label', x: 700, y: 100, width: 160, height: 120 },
  ]);
  for (const mode of ['flat', 'ne-isometric', 'nw-isometric']) {
    await view(page, mode);
    for (const id of ['sp', 'co', 'py']) {
      const g = node(page, id);
      const bd = g.locator('[data-fc3d-label="backdrop"]');
      await expect(bd, `${id} ${mode}`).toHaveCount(1);
      // The backdrop sits right behind the label and covers it.
      const [b, t] = await Promise.all([bd.boundingBox(), g.locator('text.fc-shape-label').boundingBox()]);
      expect(b.x).toBeLessThanOrEqual(t.x + 1); expect(b.x + b.width).toBeGreaterThanOrEqual(t.x + t.width - 1);
      expect(b.y).toBeLessThanOrEqual(t.y + 1); expect(b.y + b.height).toBeGreaterThanOrEqual(t.y + t.height - 1);
      if (mode !== 'flat') {
        // Iso: the solid's label is upright on screen (not sheared onto the ground).
        const m = await g.locator('text.fc-shape-label').evaluate((el) => { const c = el.getScreenCTM(); return { b: c.b / c.a, c: c.c / c.d }; });
        expect(Math.abs(m.b), `${id} ${mode}`).toBeLessThan(0.01); expect(Math.abs(m.c), `${id} ${mode}`).toBeLessThan(0.01);
      }
    }
    if (mode !== 'flat') {
      const sh = node(page, 'sp').locator('[data-fc3d="shadow"]');
      await expect(sh).toHaveCount(1);
      expect(await sh.getAttribute('fill')).toMatch(/^url\(#/);
      expect(await node(page, 'sp').locator('[data-fc3d="shadow"][fill="#000"]').count()).toBe(0);
    }
  }
  // Other 3D shapes keep their plain label.
  await setup(page, [{ id: 'c', type: 'fc_process', threeD: true, name: 'Server', x: 400, y: 300, width: 160, height: 120 }]);
  await expect(node(page, 'c').locator('[data-fc3d-label="backdrop"]')).toHaveCount(0);
});

test('cone: the body is one smooth gradient, not two hard halves', async ({ page }) => {
  await setup(page, [{ id: 'co', type: 'fc_cone', name: 'Cone', x: 400, y: 300, width: 140, height: 120 }]);
  for (const mode of ['flat', 'ne-isometric', 'nw-isometric']) {
    await view(page, mode);
    const g = node(page, 'co');
    await expect(g.locator('linearGradient'), mode).toHaveCount(1);
    const fills = await g.locator('[data-fc3d="wall"]').evaluateAll((els) => els.map((e) => e.getAttribute('fill')));
    expect(fills.filter((f) => /^url\(#/.test(f)).length, mode).toBe(1);   // the body
    expect(fills.length, mode).toBe(2);                                    // base ellipse + body
  }
});

test('a flat 3D decision is a raised tile: the diamond on top, the side walls hanging straight down', async ({ page }) => {
  await setup(page, [{ id: 'd', type: 'fc_decision', threeD: true, name: 'Ok?', x: 400, y: 300, width: 160, height: 100 }]);
  const g = node(page, 'd');
  await expect(g.locator('[data-fc3d="cap"]')).toHaveAttribute('points', '80,0 160,40 80,80 0,40');
  const walls = await g.locator('[data-fc3d="wall"]').evaluateAll((els) => els.map((e) => e.getAttribute('points').split(' ').map((s) => s.split(',').map(Number))));
  expect(walls.length).toBe(2);
  for (const w of walls) for (const [x, y] of w) { expect(x).toBeGreaterThanOrEqual(0); expect(x).toBeLessThanOrEqual(160); expect(y).toBeGreaterThanOrEqual(40); expect(y).toBeLessThanOrEqual(100); }
  await expect(g.locator('text.fc-shape-label')).toHaveAttribute('y', '40');
  await expect(g.locator('text.fc-shape-label')).toHaveAttribute('x', '80');
  expect(await page.evaluate(() => app.getFcAnchorPoints('fc_decision', 160, 100, true))).toEqual([
    { id: 'top', cx: 80, cy: 0 }, { id: 'bottom', cx: 80, cy: 100 }, { id: 'left', cx: 0, cy: 40 }, { id: 'right', cx: 160, cy: 40 },
  ]);
});
