// 1.20 palette visuals: one search box for Data Nodes & Icons, ready-made nodes as coloured icons, threat actor and
// crown jewel as circle badges, smaller attack-tree gates, and Architecture & Process palette rows like the others.
const { test } = require('@playwright/test');
const H = require('./helpers');
const { expect } = H;

const EMPTY = { projectTitle: 'T', activeUser: 'Tester', flows: [], threats: [], elements: [] };
const hex = (h) => { const n = parseInt(h.slice(1), 16); return `rgb(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255})`; };

async function openDataNodes(page) {
  await page.click('#headingDataNodes button');
  await expect(page.locator('#collapseDataNodes')).toHaveClass(/show/);
}
const nodeG = (page, id) => page.locator(`#layers-nodes-group [data-id="${id}"]`);

// ── Data Nodes & Icons search ────────────────────────────────────────────────
test('one search box sits directly under the Data Nodes & Icons heading; the icon sets have none of their own', async ({ page }) => {
  await H.openApp(page, { session: EMPTY });
  await openDataNodes(page);
  const box = page.locator('#data-nodes-search');
  await expect(box).toBeVisible();
  expect(await box.getAttribute('type')).toBe('search');
  expect(await box.evaluate((el) => el.getAttribute('aria-label') || (el.labels[0] && el.labels[0].textContent) || '')).toMatch(/search/i);
  // The first control in the section, before every palette item.
  expect(await page.evaluate(() => {
    const body = document.querySelector('#collapseDataNodes .accordion-body');
    const first = body.querySelector('input, .palette-item, button');
    return first && first.id;
  })).toBe('data-nodes-search');
  // Opening a set shows its icons but no search box inside the set.
  const set = page.locator('[data-stencil-set="aws"]');
  await set.locator('.stencil-set-toggle').click();
  await expect(set.locator('.stencil-item').first()).toBeVisible();
  await expect(page.locator('#stencil-sets input')).toHaveCount(0);
  await expect(page.locator('#collapseDataNodes input[type="search"]')).toHaveCount(1);
});

test('searching finds fixed items, ready-made nodes and icons in every visible set; hidden sets are skipped; Esc clears', async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 1000 });
  await H.openApp(page, { session: EMPTY });
  await page.evaluate(() => app.setStencilSetHidden('gcp', true));
  await openDataNodes(page);
  const box = page.locator('#data-nodes-search');
  await box.fill('firewall');
  const status = page.locator('#data-nodes-search-status');
  await expect(status).toContainText(/\d+ match/);
  // Ready-made firewall shown (its box opened), unrelated ready-made nodes hidden.
  await expect(page.locator('#palette-ready-nodes [data-ready-node="firewall"]')).toBeVisible();
  await expect(page.locator('#palette-ready-nodes [data-ready-node="waf"]')).toBeVisible();   // "Web Application Firewall"
  await expect(page.locator('#palette-ready-nodes [data-ready-node="cache"]')).toBeHidden();
  await expect(page.locator('#pal-custom-image')).toBeHidden();
  // Visible sets were loaded and their matches shown; the hidden set was not loaded at all.
  await expect(page.locator('[data-stencil-set="azure"] .stencil-item:visible').first()).toBeVisible();
  const visible = await page.locator('#stencil-sets .stencil-item:visible').evaluateAll((els) => els.map((e) => e.dataset.search));
  expect(visible.length).toBeGreaterThan(0);
  for (const s of visible) expect(s).toContain('firewall');
  expect(await page.locator('script[src="vendor/stencils/gcp.js"]').count()).toBe(0);
  await expect(page.locator('[data-stencil-set="gcp"]')).toBeHidden();
  const n = Number((await status.textContent()).match(/(\d+) match/)[1]);
  expect(n).toBe(await page.locator('#collapseDataNodes .stencil-item:visible, #collapseDataNodes .palette-item:visible').count());
  // Matching an item in the fixed list.
  await box.fill('infrastructure');
  await expect(page.locator('#pal-infrastructure')).toBeVisible();
  // Nothing found: an empty state.
  await box.fill('zzqqxxnothing');
  await expect(status).toContainText(/no icons match/i);
  await expect(page.locator('#collapseDataNodes .stencil-item:visible, #collapseDataNodes .palette-item:visible')).toHaveCount(0);
  // Esc clears and restores everything (the sets the search opened close again).
  await box.press('Escape');
  await expect(box).toHaveValue('');
  await expect(page.locator('#pal-custom-image')).toBeVisible();
  await expect(page.locator('#data-nodes-search-status')).toHaveText('');
  await expect(page.locator('[data-stencil-set="azure"] .stencil-set-body')).toBeHidden();
});

// ── Ready-made nodes: icon only, in the preview colour ───────────────────────
test('every ready-made node is added icon-only, in its palette preview colour, keeping its type and subtypes', async ({ page }) => {
  const errors = H.trackPageErrors(page);
  await H.openApp(page, { session: EMPTY });
  await openDataNodes(page);
  await page.click('#palette-ready-nodes .ready-nodes-toggle');
  const ids = await page.evaluate(() => READY_NODES.map((n) => n.id));
  for (const id of ids) {
    const r = await page.evaluate((rid) => {
      const n = READY_NODES.find((x) => x.id === rid);
      const elId = app.addReadyNode(rid);
      const e = app.state.elements.find((x) => x.id === elId);
      const preview = getComputedStyle(document.querySelector(`#palette-ready-nodes [data-ready-node="${rid}"] > .bi`)).color;
      return { elId, type: e.type, want: n.type, display: e.display, tags: e.stencilTags, subtypes: n.subtypes, iconColor: e.iconColor, preview };
    }, id);
    expect(r.type, id).toBe(r.want);
    expect(r.display, id).toBe('icon');
    expect(r.tags, id).toEqual(r.subtypes);
    const g = nodeG(page, r.elId);
    await expect(g.locator('.card-infrastructure-borderless'), id).toHaveCount(1);
    await expect(g.locator('.card-icon-stripe'), id).toHaveCount(0);
    const color = await g.locator('.card-infrastructure-borderless > i.bi').evaluate((i) => getComputedStyle(i).color);
    expect(color, id).toBe(r.preview);
    await page.waitForTimeout(2);
  }
  expect(errors).toEqual([]);
});

test('Properties switches a component between icon only and card (one undo step each)', async ({ page }) => {
  await H.openApp(page, { session: EMPTY });
  const id = await page.evaluate(() => app.addReadyNode('siem'));
  await expect(page.locator('#props-node-display')).toBeVisible();
  await expect(page.locator('#props-node-display')).toHaveValue('icon');
  const undo0 = await page.evaluate(() => app.undoStack.length);
  await page.selectOption('#props-node-display', 'card');
  expect(await page.evaluate((i) => app.state.elements.find((e) => e.id === i).display, id)).toBe('card');
  await expect(nodeG(page, id).locator('.card-icon-stripe')).toHaveCount(1);
  expect(await page.evaluate(() => app.undoStack.length)).toBe(undo0 + 1);
  await page.selectOption('#props-node-display', 'icon');
  await expect(nodeG(page, id).locator('.card-icon-stripe')).toHaveCount(0);
  await expect(nodeG(page, id).locator('.card-infrastructure-borderless')).toHaveCount(1);
  // A plain process can be switched to icon only too.
  const p = await page.evaluate(() => app.instantiateNewCanvasElementNode('process'));
  await expect(page.locator('#props-node-display')).toHaveValue('card');
  await page.selectOption('#props-node-display', 'icon');
  await expect(nodeG(page, p).locator('.card-infrastructure-borderless')).toHaveCount(1);
});

test('changing the type keeps an icon-only look between components and drops it for drawn shapes', async ({ page }) => {
  await H.openApp(page, { session: EMPTY });
  const r = await page.evaluate(() => {
    const id = app.addReadyNode('siem'), e = () => app.state.elements.find((x) => x.id === id);
    app.changeNodeType(id, 'process');
    const a = { type: e().type, display: e().display, w: e().width, color: e().iconColor };
    app.changeNodeType(id, 'fc_process');
    return [a, { type: e().type, display: e().display }];
  });
  expect(r[0]).toEqual({ type: 'process', display: 'icon', w: 100, color: '#0d6efd' });
  expect(r[1]).toEqual({ type: 'fc_process', display: undefined });
});

test('an icon-only data store keeps threat and crown-jewel markers and flows attach to it', async ({ page }) => {
  await H.openApp(page, { session: EMPTY });
  const { a, b } = await page.evaluate(() => {
    const a = app.addReadyNode('siem', 300, 300), b = app.addReadyNode('firewall', 600, 300);
    const e = app.state.elements.find((x) => x.id === a); e.secProps.isCrownJewel = 'true';
    app.state.threats.push({ id: 'T-1', title: 'x', category: 'Tampering', status: 'Open', elementId: a, likelihood: 3, impact: 3 });
    app.state.flows.push({ id: 'f1', sourceId: b, targetId: a, name: 'logs', sourceAnchor: 'right', targetAnchor: 'left', secProps: {} });
    app.refreshAppViewVisualWorkspace();
    return { a, b };
  });
  await expect(nodeG(page, a).locator('.threat-bug-badge')).toHaveCount(1);
  await expect(nodeG(page, a).locator('.fa-crown')).toHaveCount(1);
  await expect(page.locator('#canvas-svg [data-flow-id="f1"]').first()).toBeAttached();
  expect(b).toBeTruthy();
});

// ── Threat actor and crown jewel: circle badges ──────────────────────────────
for (const [key, fill, stroke, iconColor] of [['attacker', '#fee2e2', '#b91c1c', '#7f1d1d'], ['crown-jewel', '#fef9c3', '#ca8a04', '#854d0e']]) {
  test(`the ${key} preset is a circle badge with the right colours and a centred icon`, async ({ page }) => {
    await H.openApp(page, { session: EMPTY });
    const id = await page.evaluate((k) => app.addAttackPreset(k), key);
    const el = await page.evaluate((i) => JSON.parse(JSON.stringify(app.state.elements.find((e) => e.id === i))), id);
    expect(el.display).toBe('badge');
    expect([el.badgeFill, el.badgeStroke, el.iconColor]).toEqual([fill, stroke, iconColor]);
    const circle = nodeG(page, id).locator('.node-badge-circle');
    await expect(circle).toHaveCount(1);
    const r = await circle.evaluate((c) => {
      const cs = getComputedStyle(c), i = c.querySelector('i.bi'), cb = c.getBoundingClientRect(), ib = i.getBoundingClientRect();
      const label = c.parentElement.querySelector('.card-text-render-target').getBoundingClientRect();
      return { bg: cs.backgroundColor, border: cs.borderTopColor, radius: cs.borderTopLeftRadius, w: cb.width, h: cb.height,
        icon: getComputedStyle(i).color, dx: (ib.left + ib.width / 2) - (cb.left + cb.width / 2), dy: (ib.top + ib.height / 2) - (cb.top + cb.height / 2), below: label.top >= cb.bottom - 1 };
    });
    expect(r.bg).toBe(hex(fill));
    expect(r.border).toBe(hex(stroke));
    expect(r.icon).toBe(hex(iconColor));
    expect(r.radius).toBe('50%');
    expect(Math.abs(r.w - r.h)).toBeLessThan(1);
    expect(Math.abs(r.dx)).toBeLessThan(2.5);
    expect(Math.abs(r.dy)).toBeLessThan(2.5);
    expect(r.below).toBe(true);
    await expect(nodeG(page, id).locator('.card-icon-stripe')).toHaveCount(0);
  });
}

test('badge colours are editable in Properties', async ({ page }) => {
  await H.openApp(page, { session: EMPTY });
  const id = await page.evaluate(() => app.addAttackPreset('attacker'));
  await expect(page.locator('#props-node-display')).toHaveValue('badge');
  await expect(page.locator('#props-badge-fill')).toBeVisible();
  await page.locator('#props-badge-fill').evaluate((i) => { i.value = '#123456'; i.dispatchEvent(new Event('change', { bubbles: true })); });
  await page.locator('#props-badge-stroke').evaluate((i) => { i.value = '#654321'; i.dispatchEvent(new Event('change', { bubbles: true })); });
  const el = await page.evaluate((i) => app.state.elements.find((e) => e.id === i), id);
  expect([el.badgeFill, el.badgeStroke]).toEqual(['#123456', '#654321']);
  expect(await nodeG(page, id).locator('.node-badge-circle').evaluate((c) => getComputedStyle(c).backgroundColor)).toBe('rgb(18, 52, 86)');
});

// ── Attack-tree shapes: smaller defaults ─────────────────────────────────────
test('condition, AND / OR gates, countermeasure and choke point are added at smaller default sizes', async ({ page }) => {
  await H.openApp(page, { session: EMPTY });
  const sizes = await page.evaluate(() => ['at_condition', 'at_and', 'at_or', 'at_countermeasure', 'at_choke'].map((t) => {
    const id = app.instantiateNewCanvasElementNode(t);
    const e = app.state.elements.find((x) => x.id === id);
    return [t, e.width, e.height];
  }));
  const old = { at_condition: [180, 70], at_and: [90, 80], at_or: [90, 80], at_countermeasure: [170, 90], at_choke: [130, 80] };
  for (const [t, w, h] of sizes) {
    expect(w * h, t).toBeLessThan(old[t][0] * old[t][1] * 0.75);
  }
  // The names still fit inside the shapes.
  const fits = await page.evaluate(() => [...document.querySelectorAll('#layers-nodes-group .fc-shape-label')].map((t) => {
    const g = t.closest('[data-id]'), e = app.state.elements.find((x) => x.id === g.dataset.id);
    return [e.type, t.getBBox().width <= e.width - 4];
  }));
  for (const [t, ok] of fits) expect(ok, t).toBe(true);
});

test('existing attack shapes keep their stored sizes', async ({ page }) => {
  await H.openApp(page, { session: { ...EMPTY, elements: [{ id: 'g', type: 'at_and', name: 'AND', x: 0, y: 0, width: 90, height: 80 }] } });
  expect(await page.evaluate(() => [app.state.elements[0].width, app.state.elements[0].height])).toEqual([90, 80]);
});

// ── Architecture & Process Diagrams palette ──────────────────────────────────
test('diagram palette items use the same row style, preview size and label as the flowchart items', async ({ page }) => {
  await H.openApp(page, { session: EMPTY });
  const r = await page.evaluate(() => {
    const ref = document.getElementById('pal-fc-process'), refSvg = ref.querySelector('svg');
    const items = [...document.querySelectorAll('#palette-diagrams-body .palette-item')];
    return {
      count: items.length, total: Object.keys(DIAGRAM_SHAPES).length,
      grids: document.querySelectorAll('#palette-diagrams-body .palette-grid-2, #palette-diagrams-body .palette-item-compact').length,
      refClass: ref.className, refSvg: [refSvg.getAttribute('width'), refSvg.getAttribute('height'), refSvg.getAttribute('class')],
      items: items.map((i) => { const s = i.querySelector('svg'), l = i.querySelector('.fw-semibold.small');
        return { id: i.id, cls: i.className, svg: [s.getAttribute('width'), s.getAttribute('height'), s.getAttribute('class')], label: l && l.textContent,
          strokes: [...s.querySelectorAll('[stroke-width]')].map((p) => Number(p.getAttribute('stroke-width')) * (s.querySelector('g').transform.baseVal.consolidate() ? s.querySelector('g').transform.baseVal.consolidate().matrix.a : 1)).filter((x) => x > 0) }; }),
    };
  });
  expect(r.count).toBe(r.total);
  expect(r.grids).toBe(0);
  for (const it of r.items) {
    expect(it.cls, it.id).toBe(r.refClass);
    expect(it.svg, it.id).toEqual(r.refSvg.map((v, i) => (i === 2 ? 'me-3 flex-shrink-0' : v)));
    expect(it.label, it.id).toBeTruthy();
    // Outline weight like the other palette previews (about 1.8 px on screen; a BPMN start event is thin by definition).
    expect(Math.max(...it.strokes), it.id).toBeGreaterThan(1.05);
  }
});

// ── Model validation ─────────────────────────────────────────────────────────
test('the importer keeps valid display options and badge colours and drops anything else', async ({ page }) => {
  await H.openApp(page, { session: EMPTY });
  const out = await page.evaluate(() => {
    const { session } = normalizeSession({ elements: [
      { id: 'a', type: 'process', name: 'A', display: 'icon', iconColor: '#0d6efd' },
      { id: 'b', type: 'interactor', name: 'B', display: 'badge', badgeFill: '#fee2e2', badgeStroke: 'red;" onx="1', iconColor: '#7f1d1d' },
      { id: 'c', type: 'datastore', name: 'C', display: '<b>', badgeFill: 'url(javascript:1)' },
      { id: 'd', type: 'fc_process', name: 'D', display: 'badge', badgeFill: '#fff' },
      { id: 'e', type: 'infrastructure', name: 'E', display: 'card' },
    ] });
    const by = (id) => session.elements.find((x) => x.id === id);
    return ['a', 'b', 'c', 'd', 'e'].map((id) => { const e = by(id); return [e.display, e.badgeFill, e.badgeStroke]; });
  });
  expect(out).toEqual([
    ['icon', undefined, undefined],
    ['badge', '#fee2e2', undefined],
    [undefined, undefined, undefined],
    [undefined, undefined, undefined],
    ['card', undefined, undefined],
  ]);
});

test('Save as PNG draws icon-only and badge components; the display survives a save and reload', async ({ page }) => {
  await H.openApp(page, { session: EMPTY });
  await page.evaluate(() => { app.addReadyNode('siem', 200, 200); app.addAttackPreset('attacker', 500, 200); });
  await page.evaluate(() => {
    window.__svgOut = [];
    const orig = XMLSerializer.prototype.serializeToString;
    XMLSerializer.prototype.serializeToString = function (n) { const s = orig.call(this, n); window.__svgOut.push(s); return s; };
  });
  const [download] = await Promise.all([page.waitForEvent('download'), page.click('#btn-canvas-save-png')]);
  expect(download.suggestedFilename()).toMatch(/\.png$/);
  const svg = await page.evaluate(() => window.__svgOut.find((s) => s.includes('canvas-transform-group')) || '');
  expect(svg).toContain('class="node-badge-circle"');
  expect(svg).toContain('.node-badge-circle {');   // its CSS goes with it
  expect(svg).toContain('card-infrastructure-borderless');
  await page.reload();
  await page.waitForFunction(() => window.app && window.app.state);
  expect(await page.evaluate(() => app.state.elements.map((e) => e.display).sort())).toEqual(['badge', 'icon']);
});
