// Shared helpers for the cov-*.spec.js coverage suites (UI-driven: palette clicks, mouse drags, real buttons).
const fs = require('node:fs');
const H = require('./helpers');
const { expect } = H;

const ROOT = require('node:path').resolve(__dirname, '..');
const PKG = JSON.parse(fs.readFileSync(ROOT + '/package.json', 'utf8'));

/** Collects page errors and console errors. */
function trackAllErrors(page) {
  const errors = [];
  page.on('pageerror', (err) => errors.push('pageerror: ' + err.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  return errors;
}

/** An empty model, flat view, zoom 1. */
async function emptyApp(page, extra = {}) {
  await H.openApp(page, { session: Object.assign({ projectTitle: 'Coverage', activeUser: 'Tester', elements: [], flows: [], threats: [] }, extra) });
  await page.waitForFunction(() => (window.app.threatSuggestions.process || []).length > 10);
  // A stored model without components is replaced by a new one on load, so set the title afterwards.
  await page.evaluate(() => { app.state.projectTitle = 'Coverage'; app.saveSessionToLocalStorage(); app.refreshAppViewVisualWorkspace(); app.resetUndoHistory(); });
}

const selected = (page) => page.evaluate(() => [...app.state.selectedElementIds]);
const model = (page) => page.evaluate(() => JSON.parse(JSON.stringify({ elements: app.state.elements, flows: app.state.flows, threats: app.state.threats, mitigations: app.state.mitigations || [] })));

/** Clicks a palette item (opening its accordion section first) and returns the id of the new, selected shape. */
async function addFromPalette(page, palId) {
  const item = page.locator('#' + palId);
  if (!(await item.isVisible())) {
    const section = await item.evaluate((el) => el.closest('.accordion-collapse').id);
    await page.click(`button[data-bs-target="#${section}"]`);
    await expect(item).toBeVisible();
  }
  const before = await page.evaluate(() => app.state.elements.length);
  await item.click();
  await expect.poll(() => page.evaluate(() => app.state.elements.length)).toBe(before + 1);
  const [id] = await selected(page);
  return id;
}

/** Screen position of a canvas-space point. */
const toClient = (page, x, y) => page.evaluate(([x, y]) => {
  const a = window.app, r = a.dom.svg.getBoundingClientRect();
  return { x: r.left + a.panX + x * a.zoomScale, y: r.top + a.panY + y * a.zoomScale };
}, [x, y]);

const nodeCentre = async (page, id) => {
  const e = await page.evaluate((i) => { const e = app.state.elements.find((x) => x.id === i); return { x: e.x + (e.width || 240) / 2, y: e.y + (e.height || 80) / 2 }; }, id);
  return toClient(page, e.x, e.y);
};

/** Drags a shape with the mouse by (dx, dy) canvas pixels (zoom 1). */
async function dragNode(page, id, dx, dy) {
  const c = await nodeCentre(page, id);
  await page.mouse.move(c.x, c.y);
  await page.mouse.down();
  await page.mouse.move(c.x + dx / 2, c.y + dy / 2, { steps: 5 });
  await page.mouse.move(c.x + dx, c.y + dy, { steps: 5 });
  await page.mouse.up();
}

/** Draws a data flow with the mouse from an anchor of src to the centre of dst; returns the new flow id. */
async function connect(page, src, dst, anchor = 'right') {
  const before = await page.evaluate(() => app.state.flows.length);
  await page.locator(`#layers-nodes-group [data-id="${src}"]`).first().hover();
  const dot = page.locator(`#layers-nodes-group [data-id="${src}"] [data-anchor-id="${anchor}"]`);
  const b = await dot.boundingBox();
  const t = await nodeCentre(page, dst);
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
  await page.mouse.down();
  await page.mouse.move((b.x + t.x) / 2, (b.y + t.y) / 2, { steps: 5 });
  await page.mouse.move(t.x, t.y, { steps: 5 });
  await page.mouse.up();
  await expect.poll(() => page.evaluate(() => app.state.flows.length)).toBe(before + 1);
  return page.evaluate(() => app.state.flows[app.state.flows.length - 1].id);
}

/** Selects a shape by clicking it on the canvas. */
async function clickNode(page, id) {
  const c = await nodeCentre(page, id);
  await page.mouse.click(c.x, c.y);
  await expect.poll(() => selected(page)).toEqual([id]);
}

/** Renames the selected shape or flow through Properties (commits on Tab). */
async function rename(page, name) {
  await page.fill('#props-input-name', name);
  await page.locator('#props-input-name').press('Tab');
}

async function downloadFile(page, trigger) {
  const [download] = await Promise.all([page.waitForEvent('download'), trigger()]);
  return { name: download.suggestedFilename(), buffer: fs.readFileSync(await download.path()) };
}

/** Waits until no Bootstrap modal is open or animating. */
const noModal = (page) => page.waitForFunction(() => !document.querySelector('.modal.show, .modal-backdrop, .modal[style*="display: block"]'));

/** Waits until a dialog is fully shown with keyboard focus inside it. */
const modalReady = (page, id) => page.waitForFunction((i) => {
  const m = document.getElementById(i), inst = m && window.bootstrap.Modal.getInstance(m);
  return m && m.classList.contains('show') && inst && !inst._isTransitioning && m.contains(document.activeElement);
}, id);

module.exports = { modalReady, ...H, H, ROOT, PKG, trackAllErrors, emptyApp, selected, model, addFromPalette, toClient, nodeCentre, dragNode, connect, clickNode, rename, downloadFile, noModal };
