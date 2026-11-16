// Regression tests for the November 2026 bug check, group B: keyboard, mouse, dialogs, undo steps and touch.
const { test } = require('@playwright/test');
const H = require('./helpers');
const C = require('./cov-helpers');
const { expect } = H;

const P = (id, type, name, x, y, extra = {}) => Object.assign({ id, type, name, x, y, width: 120, height: 60, secProps: {} }, extra);
const sess = (elements, flows = [], extra = {}) => Object.assign({ projectTitle: 'T', activeUser: 'Tester', elements, flows, threats: [] }, extra);
const twoWithFlow = (flowExtra = {}) => sess([P('a', 'process', 'A', 100, 200), P('b', 'process', 'B', 600, 200)],
  [Object.assign({ id: 'f', sourceId: 'a', targetId: 'b', name: 'F', sourceAnchor: 'right', targetAnchor: 'left' }, flowExtra)]);
const steps = (page) => page.evaluate(() => app.undoStack.length);
const toasts = (page) => page.locator('#app-toast-container .toast').count();

/** Screen point at fraction t along the drawn path of flow id. */
const flowPoint = (page, id, t = 0.5) => page.evaluate(([id, t]) => {
  const p = [...document.querySelectorAll(`#layers-flows-paths-group [data-flow-id="${id}"]`)].find((e) => e.getTotalLength) ||
    document.querySelector(`#layers-flows-paths-group [data-flow-id="${id}"] path`);
  const pt = p.getPointAtLength(p.getTotalLength() * t), m = p.getScreenCTM();
  return { x: pt.x * m.a + pt.y * m.c + m.e, y: pt.x * m.b + pt.y * m.d + m.f };
}, [id, t]);

/** Centre of the interactive handle (circle/rect) with the given fill colour. */
const handleAt = (page, fill) => page.evaluate((fill) => {
  const h = [...app.dom.svg.querySelectorAll('circle, rect')].find((c) => c.getAttribute('fill') === fill);
  const r = h.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
}, fill);

const pan = (page) => page.evaluate(() => [app.panX, app.panY]);

async function rightDrag(page, from, dx, dy) {
  await page.mouse.move(from.x, from.y);
  await page.mouse.down({ button: 'right' });
  await page.mouse.move(from.x + dx, from.y + dy, { steps: 5 });
  await page.mouse.up({ button: 'right' });
}

test.describe('#2 and #14: canvas shortcuts only act when the canvas has focus', () => {
  test('Delete and Backspace on a page tab, layer row or panel button keep the selection', async ({ page }) => {
    await H.openApp(page, { session: sess([P('a', 'process', 'A', 100, 200)]) });
    await page.evaluate(() => app.handleElementSelectionEvent('a'));
    for (const sel of ['.page-tab', '#props-btn-send-back', '#tab-layers-trigger', '#layers-panel .layer-name']) {
      if (sel.startsWith('#layers-panel')) await page.click('#tab-layers-trigger');
      await page.evaluate((s) => document.querySelector(s).focus(), sel);
      expect(await page.evaluate((s) => document.activeElement === document.querySelector(s), sel), sel).toBe(true);
      await page.keyboard.press('Backspace');
      await page.keyboard.press('Delete');
      expect(await page.evaluate(() => app.state.elements.length), sel).toBe(1);
    }
    // With the canvas (body) focused, Delete still removes the shape.
    await page.evaluate(() => document.activeElement.blur());
    await page.keyboard.press('Delete');
    await expect.poll(() => page.evaluate(() => app.state.elements.length)).toBe(0);
  });

  test('arrow keys on a page tab or layer row do not move the selected shape', async ({ page }) => {
    await H.openApp(page, { session: sess([P('a', 'process', 'A', 100, 200)]) });
    await page.evaluate(() => app.handleElementSelectionEvent('a'));
    for (const sel of ['.page-tab', '#layers-panel .layer-name']) {
      if (sel.startsWith('#layers-panel')) await page.click('#tab-layers-trigger');
      await page.evaluate((s) => document.querySelector(s).focus(), sel);
      expect(await page.evaluate((s) => document.activeElement === document.querySelector(s), sel), sel).toBe(true);
      for (const k of ['ArrowRight', 'ArrowDown']) await page.keyboard.press(k);
      expect(await page.evaluate(() => { const e = app.state.elements[0]; return [e.x, e.y]; }), sel).toEqual([100, 200]);
    }
    // The canvas still moves the selection with the arrows.
    await page.evaluate(() => document.activeElement.blur());
    await page.keyboard.press('ArrowRight');
    expect(await page.evaluate(() => app.state.elements[0].x)).toBeGreaterThan(100);
  });

  test('in review mode, Delete and arrows on a panel button show no toast', async ({ page }) => {
    await H.openApp(page, { session: sess([P('a', 'process', 'A', 100, 200)]) });
    await page.evaluate(() => { app.handleElementSelectionEvent('a'); app.state.reviewMode = true; });
    const before = await toasts(page);
    await page.evaluate(() => document.querySelector('.page-tab').focus());
    await page.keyboard.press('Delete');
    await page.keyboard.press('ArrowRight');
    await page.waitForTimeout(200);
    expect(await toasts(page)).toBe(before);
    expect(await page.evaluate(() => [app.state.elements.length, app.state.elements[0].x])).toEqual([1, 100]);
  });
});

test.describe('#17: a drag whose mouseup is lost still ends', () => {
  test('window blur ends a shape drag as one undo step', async ({ page }) => {
    await H.openApp(page, { session: sess([P('a', 'process', 'A', 100, 200)]) });
    await page.evaluate(() => app.resetUndoHistory());
    const c = await C.nodeCentre(page, 'a');
    await page.mouse.move(c.x, c.y); await page.mouse.down();
    await page.mouse.move(c.x + 40, c.y + 40, { steps: 4 });
    await page.evaluate(() => window.dispatchEvent(new Event('blur')));
    const r = await page.evaluate(() => ({ dragging: app.isDraggingElements, x: app.state.elements[0].x }));
    expect(r.dragging).toBe(false);
    expect(r.x).toBeGreaterThan(100);
    expect(await steps(page)).toBe(1);
    await page.mouse.move(c.x + 300, c.y + 200, { steps: 3 });
    await page.mouse.up();
    expect(await page.evaluate(() => app.state.elements[0].x)).toBe(r.x);
  });

  test('a mousemove with no button pressed ends the drag', async ({ page }) => {
    await H.openApp(page, { session: sess([P('a', 'process', 'A', 100, 200)]) });
    await page.evaluate(() => app.resetUndoHistory());
    const c = await C.nodeCentre(page, 'a');
    await page.mouse.move(c.x, c.y); await page.mouse.down();
    await page.mouse.move(c.x + 40, c.y + 40, { steps: 4 });
    const before = await page.evaluate(() => app.state.elements[0].x);
    await page.evaluate(([x, y]) => window.dispatchEvent(new MouseEvent('mousemove', { clientX: x, clientY: y, buttons: 0, bubbles: true })), [c.x + 300, c.y + 200]);
    const r = await page.evaluate(() => ({ dragging: app.isDraggingElements, x: app.state.elements[0].x }));
    await page.mouse.up();
    expect(r).toEqual({ dragging: false, x: before });
    expect(await steps(page)).toBe(1);
  });

  test('blur ends drawing a connection and a resize', async ({ page }) => {
    await H.openApp(page, { session: sess([P('a', 'process', 'A', 100, 200), P('b', 'process', 'B', 600, 200)]) });
    await page.evaluate(() => { app.isDrawingPhantomWire = true; app.phantomWireSourceId = 'a'; app.phantomWireSourceAnchor = 'right'; app.resizingElementId = null; });
    await page.evaluate(() => window.dispatchEvent(new Event('blur')));
    expect(await page.evaluate(() => app.isDrawingPhantomWire)).toBe(false);
  });
});

test.describe('#18: style and swimlane edits are their own undo steps', () => {
  test('flowchart fill, stroke and width each log one step', async ({ page }) => {
    await H.openApp(page, { session: sess([{ id: 'q', type: 'fc_process', name: 'Step', x: 0, y: 200, width: 160, height: 70 }]) });
    await C.clickNode(page, 'q');
    await page.evaluate(() => app.resetUndoHistory());
    const log0 = await page.evaluate(() => app.state.activityLog.length);
    await page.locator('#props-fc-fill-grid .color-swatch-btn[data-color="#dcfce7"]').click();
    expect(await steps(page)).toBe(1);
    await page.locator('#props-fc-stroke-grid .color-swatch-btn[data-color="#dc2626"]').click();
    expect(await steps(page)).toBe(2);
    await page.locator('#props-fc-stroke-width').fill('5');
    expect(await steps(page)).toBe(3);
    await page.locator('#props-fc-fill-custom').evaluate((el) => { el.value = '#123456'; el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); });
    expect(await steps(page)).toBe(4);
    await page.locator('#props-fc-stroke-custom').evaluate((el) => { el.value = '#654321'; el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); });
    expect(await steps(page)).toBe(5);
    expect(await page.evaluate(() => app.state.activityLog.length)).toBe(log0 + 5);
    await page.click('#btn-undo');
    const q = await page.evaluate(() => app.state.elements[0]);
    expect([q.fcFillColor, q.fcStrokeColor, q.fcStrokeWidth]).toEqual(['#123456', '#dc2626', 5]);
  });

  test('swimlane headline, column and row renames and added columns and rows are one step each', async ({ page }) => {
    await C.emptyApp(page);
    const id = await C.addFromPalette(page, 'pal-swimlane');
    await page.evaluate(() => app.resetUndoHistory());
    const log0 = await page.evaluate(() => app.state.activityLog.length);
    await page.fill('#props-swimlane-headline', 'Renamed lane');
    await page.locator('#props-swimlane-headline').press('Tab');
    expect(await steps(page)).toBe(1);
    await page.click('#props-swimlane-add-col');
    expect(await steps(page)).toBe(2);
    await page.click('#props-swimlane-add-row');
    expect(await steps(page)).toBe(3);
    await page.locator('#props-swimlane-cols-list .col-rename-input').first().fill('First col');
    await page.locator('#props-swimlane-cols-list .col-rename-input').first().press('Tab');
    expect(await steps(page)).toBe(4);
    await page.locator('#props-swimlane-rows-list .row-rename-input').first().fill('First row');
    await page.locator('#props-swimlane-rows-list .row-rename-input').first().press('Tab');
    expect(await steps(page)).toBe(5);
    expect(await page.evaluate(() => app.state.activityLog.length)).toBe(log0 + 5);
    const s = await page.evaluate((id) => app.state.elements.find((e) => e.id === id), id);
    expect([s.name, s.columns[0], s.rows[0]]).toEqual(['Renamed lane', 'First col', 'First row']);
  });
});

test('#25: a disabled data flow shows the Disabled switch and can be re-enabled', async ({ page }) => {
  await H.openApp(page, { session: twoWithFlow({ isDisabled: true }) });
  await page.evaluate(() => app.handleFlowSelectionEvent('f'));
  await expect(page.locator('#box-props-status-state')).toBeVisible();
  await expect(page.locator('#props-input-disabled')).toBeChecked();
  await page.locator('#props-input-disabled').uncheck();
  expect(await page.evaluate(() => app.state.flows[0].isDisabled)).toBe(false);
});

test.describe('#26 and #36: dialogs', () => {
  test('closing a dialog returns focus to the control that opened it', async ({ page }) => {
    await H.openApp(page, { session: H.demoSession() });
    await page.click('#btn-open-session-meta');
    const sel = 'btn-open-session-meta';
    await C.modalReady(page, 'modal-session-context');
    await page.keyboard.press('Escape');
    await C.noModal(page);
    await expect.poll(() => page.evaluate(() => document.activeElement && document.activeElement.id)).toBe(sel);
  });

  test('Escape that closes a dialog keeps the canvas selection, so a panel opener stays visible and gets focus back', async ({ page }) => {
    await H.openApp(page, { session: H.demoSession() });
    const id = await page.evaluate(() => { const e = app.state.elements.find((x) => x.type === 'process'); app.handleElementSelectionEvent(e.id); return e.id; });
    await page.click('#tab-suggest-trigger');
    await page.click('#btn-add-template');
    await C.modalReady(page, 'modal-edit-template');
    await page.keyboard.press('Escape');
    await C.noModal(page);
    expect(await C.selected(page)).toEqual([id]);
    await expect.poll(() => page.evaluate(() => document.activeElement && document.activeElement.id)).toBe('btn-add-template');
  });

  test('a dialog whose opener is gone gives focus to the main menu button', async ({ page }) => {
    await H.openApp(page, { session: H.demoSession() });
    await page.evaluate(() => { const b = document.createElement('button'); b.id = 'tmp-opener'; document.body.appendChild(b); b.focus(); bootstrap.Modal.getOrCreateInstance(document.getElementById('modal-help')).show(); });
    await C.modalReady(page, 'modal-help');
    await page.evaluate(() => document.getElementById('tmp-opener').remove());
    await page.keyboard.press('Escape');
    await C.noModal(page);
    await expect.poll(() => page.evaluate(() => document.activeElement && document.activeElement.id)).toBe('btn-main-menu');
  });

  test('the threat, template and Session dialogs are named by their titles', async ({ page }) => {
    await H.openApp(page);
    for (const id of ['modal-edit-threat', 'modal-edit-template', 'modal-session-context']) {
      const name = await page.evaluate((id) => { const m = document.getElementById(id); const t = document.getElementById(m.getAttribute('aria-labelledby') || ''); return t && t.closest('.modal') === m ? t.textContent.trim() : ''; }, id);
      expect(name, id).not.toBe('');
    }
  });
});

test.describe('#37 to #41: flow and line handles', () => {
  test('#37 double-clicking a data flow adds no bend point', async ({ page }) => {
    await H.openApp(page, { session: twoWithFlow() });
    const pt = await flowPoint(page, 'f', 0.5);
    await page.mouse.dblclick(pt.x, pt.y);
    await page.waitForTimeout(200);
    const r = await page.evaluate(() => ({ sel: app.state.selectedFlowId, pts: (app.state.flows[0].points || []).length }));
    expect(r).toEqual({ sel: 'f', pts: 0 });
  });

  test('#38 adding a bend point by dragging a selected flow is one undo step', async ({ page }) => {
    await H.openApp(page, { session: twoWithFlow() });
    await page.evaluate(() => { app.handleFlowSelectionEvent('f'); app.resetUndoHistory(); });
    const log0 = await page.evaluate(() => app.state.activityLog.length);
    const pt = await flowPoint(page, 'f', 0.5);
    await page.mouse.move(pt.x, pt.y); await page.mouse.down();
    await page.mouse.move(pt.x, pt.y + 80, { steps: 5 }); await page.mouse.up();
    await page.waitForTimeout(200);
    const r = await page.evaluate(() => ({ pts: (app.state.flows[0].points || []).length, steps: app.undoStack.length }));
    expect(r).toEqual({ pts: 1, steps: 1 });
    expect(await page.evaluate(() => app.state.activityLog.length)).toBe(log0 + 1);
    await page.click('#btn-undo');
    expect(await page.evaluate(() => (app.state.flows[0].points || []).length)).toBe(0);
  });

  test('#38 a click on a selected flow still adds a point as one step', async ({ page }) => {
    await H.openApp(page, { session: twoWithFlow() });
    await page.evaluate(() => { app.handleFlowSelectionEvent('f'); app.resetUndoHistory(); });
    const pt = await flowPoint(page, 'f', 0.3);
    await page.mouse.click(pt.x, pt.y);
    await page.waitForTimeout(200);
    expect(await page.evaluate(() => [(app.state.flows[0].points || []).length, app.undoStack.length])).toEqual([1, 1]);
  });

  test('#39 a boundary-line bend handle stays under the pointer while dragged', async ({ page }) => {
    await H.openApp(page, { session: sess([P('a', 'process', 'A', 100, 500), { id: 'bl', type: 'boundary_line', name: 'L', x: 200, y: 300, x2: 600, y2: 300, bendX: 0, bendY: 0, textOffset: 0.5 }]) });
    await page.evaluate(() => { app.isSnappingActive = false; app.handleElementSelectionEvent('bl'); app.refreshAppViewVisualWorkspace(); });
    const h = await handleAt(page, '#ffc107');
    await page.mouse.move(h.x + 2, h.y + 3); await page.mouse.down();
    await page.mouse.move(h.x + 2 + 30, h.y + 3 + 100, { steps: 5 });
    const h2 = await handleAt(page, '#ffc107');
    await page.mouse.up();
    // The handle keeps the grab offset it had at the press.
    expect(Math.abs(h2.x - (h.x + 30))).toBeLessThan(2);
    expect(Math.abs(h2.y - (h.y + 100))).toBeLessThan(2);
  });

  test('#40 right-button drag on flow end handles and the bend-point handle pans', async ({ page }) => {
    await H.openApp(page, { session: twoWithFlow({ points: [{ x: 400, y: 120 }] }) });
    await page.evaluate(() => app.handleFlowSelectionEvent('f'));
    const before = await page.evaluate(() => JSON.stringify(app.state.flows[0]));
    for (const fill of ['#198754', '#dc3545', '#ffc107']) {
      const p0 = await pan(page);
      const h = await handleAt(page, fill);
      await page.mouse.move(h.x, h.y); await page.mouse.down({ button: 'right' });
      expect(await page.evaluate(() => app.activeFlowDragMode || null), fill).toBe(null);
      await page.mouse.move(h.x + 60, h.y + 40, { steps: 5 }); await page.mouse.up({ button: 'right' });
      expect(await pan(page), fill).not.toEqual(p0);
    }
    expect(await page.evaluate(() => JSON.stringify(app.state.flows[0]))).toBe(before);
  });

  test('#40 right-button drag on boundary-line handles pans', async ({ page }) => {
    await H.openApp(page, { session: sess([{ id: 'bl', type: 'boundary_line', name: 'L', x: 200, y: 300, x2: 600, y2: 300, bendX: 0, bendY: 0, textOffset: 0.5 }]) });
    await page.evaluate(() => { app.handleElementSelectionEvent('bl'); app.refreshAppViewVisualWorkspace(); });
    const before = await page.evaluate(() => JSON.stringify(app.state.elements[0]));
    for (const fill of ['#0d6efd', '#dc3545', '#ffc107']) {
      const p0 = await pan(page);
      await rightDrag(page, await handleAt(page, fill), 50, 30);
      expect(await pan(page), fill).not.toEqual(p0);
      expect(await page.evaluate(() => app.activeFlowDragMode || null)).toBe(null);
    }
    expect(await page.evaluate(() => JSON.stringify(app.state.elements[0]))).toBe(before);
  });

  test('#41 Escape cancels drawing a connection', async ({ page }) => {
    await H.openApp(page, { session: sess([P('a', 'process', 'A', 100, 200), P('b', 'process', 'B', 600, 200)]) });
    await page.locator('#layers-nodes-group [data-id="a"]').first().hover();
    const dot = await page.locator('#layers-nodes-group [data-id="a"] [data-anchor-id="right"]').boundingBox();
    const t = await C.nodeCentre(page, 'b');
    await page.mouse.move(dot.x + dot.width / 2, dot.y + dot.height / 2); await page.mouse.down();
    await page.mouse.move((dot.x + t.x) / 2, t.y, { steps: 5 });
    await page.keyboard.press('Escape');
    const r = await page.evaluate(() => ({ drawing: !!app.isDrawingPhantomWire, vis: app.dom.phantomWire.getAttribute('visibility') }));
    await page.mouse.move(t.x, t.y, { steps: 5 }); await page.mouse.up();
    expect(r).toEqual({ drawing: false, vis: 'hidden' });
    expect(await page.evaluate(() => app.state.flows.length)).toBe(0);
  });

  test('#41 Escape cancels a shape drag, a resize and a bend: start positions back, no undo step', async ({ page }) => {
    await H.openApp(page, { session: twoWithFlow() });
    await page.evaluate(() => { app.resetUndoHistory(); });
    // Drag
    const c = await C.nodeCentre(page, 'a');
    await page.mouse.move(c.x, c.y); await page.mouse.down();
    await page.mouse.move(c.x + 80, c.y + 60, { steps: 4 });
    await page.keyboard.press('Escape');
    await page.mouse.move(c.x + 120, c.y + 90, { steps: 2 });
    await page.mouse.up();
    expect(await page.evaluate(() => [app.state.elements[0].x, app.state.elements[0].y, app.isDraggingElements])).toEqual([100, 200, false]);
    // Resize
    await page.evaluate(() => { app.handleElementSelectionEvent('a'); app.resetUndoHistory(); });
    const rh = await page.locator('.canvas-resize-handle').first().boundingBox();
    await page.mouse.move(rh.x + 5, rh.y + 5); await page.mouse.down();
    await page.mouse.move(rh.x + 85, rh.y + 65, { steps: 4 });
    await page.keyboard.press('Escape');
    await page.mouse.up();
    expect(await page.evaluate(() => [app.state.elements[0].width, app.state.elements[0].height, app.resizingElementId])).toEqual([120, 60, null]);
    // Bend point added by dragging a selected flow
    await page.evaluate(() => { app.handleFlowSelectionEvent('f'); app.resetUndoHistory(); });
    const pt = await flowPoint(page, 'f', 0.5);
    await page.mouse.move(pt.x, pt.y); await page.mouse.down();
    await page.mouse.move(pt.x, pt.y + 80, { steps: 5 });
    await page.keyboard.press('Escape');
    await page.mouse.up();
    expect(await page.evaluate(() => [(app.state.flows[0].points || []).length, app.activeFlowDragMode || null])).toEqual([0, null]);
    expect(await steps(page)).toBe(0);
  });
});

test.describe('#50: touch', () => {
  test.use({ hasTouch: true });

  /** Sends real touch input through the DevTools protocol. */
  async function touch(page) {
    const cdp = await page.context().newCDPSession(page);
    const send = (type, points) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: points.map((p, i) => ({ x: p.x, y: p.y, id: p.id ?? i })) });
    return {
      async drag(from, to, n = 6) {
        await send('touchStart', [from]);
        for (let i = 1; i <= n; i++) await send('touchMove', [{ x: from.x + (to.x - from.x) * i / n, y: from.y + (to.y - from.y) * i / n }]);
        await send('touchEnd', []);
      },
      async pinch(c, d0, d1, n = 6) {
        const pts = (d) => [{ x: c.x - d / 2, y: c.y, id: 0 }, { x: c.x + d / 2, y: c.y, id: 1 }];
        await send('touchStart', [pts(d0)[0]]);
        await send('touchStart', pts(d0));
        for (let i = 1; i <= n; i++) await send('touchMove', pts(d0 + (d1 - d0) * i / n));
        await send('touchEnd', [pts(d1)[0]]);
        await send('touchEnd', []);
      },
    };
  }

  test('the canvas opts out of browser touch gestures', async ({ page }) => {
    await H.openApp(page, { session: sess([P('a', 'process', 'A', 100, 200)]) });
    expect(await page.evaluate(() => getComputedStyle(app.dom.svg).touchAction)).toBe('none');
  });

  test('a tap selects a shape; a one-finger drag on it moves it as one undo step', async ({ page }) => {
    await H.openApp(page, { session: sess([P('a', 'process', 'A', 100, 200), P('b', 'process', 'B', 600, 200)]) });
    await page.evaluate(() => { app.isSnappingActive = false; app.resetUndoHistory(); });
    const c = await C.nodeCentre(page, 'b');
    await page.touchscreen.tap(c.x, c.y);
    await expect.poll(() => C.selected(page)).toEqual(['b']);
    const t = await touch(page);
    const a = await C.nodeCentre(page, 'a');
    await t.drag(a, { x: a.x + 90, y: a.y + 50 });
    const r = await page.evaluate(() => ({ x: app.state.elements[0].x, y: app.state.elements[0].y, dragging: app.isDraggingElements }));
    expect(Math.abs(r.x - 190)).toBeLessThan(3);
    expect(Math.abs(r.y - 250)).toBeLessThan(3);
    expect(r.dragging).toBe(false);
    expect(await steps(page)).toBe(1);
  });

  test('a one-finger drag on empty canvas pans; a tap there clears the selection', async ({ page }) => {
    await H.openApp(page, { session: sess([P('a', 'process', 'A', 100, 200)]) });
    await page.evaluate(() => app.handleElementSelectionEvent('a'));
    const p0 = await pan(page);
    const e = await C.toClient(page, 800, 600);
    const t = await touch(page);
    await t.drag(e, { x: e.x - 100, y: e.y - 40 });
    const p1 = await pan(page);
    expect(Math.round(p1[0] - p0[0])).toBe(-100);
    expect(Math.round(p1[1] - p0[1])).toBe(-40);
    expect(await page.evaluate(() => [app.isPanning, app.state.elements[0].x])).toEqual([false, 100]);
    await page.touchscreen.tap(e.x - 100, e.y - 40);
    await expect.poll(() => C.selected(page)).toEqual([]);
  });

  test('a two-finger pinch zooms around the pinch centre', async ({ page }) => {
    await H.openApp(page, { session: sess([P('a', 'process', 'A', 100, 200)]) });
    const z0 = await page.evaluate(() => app.zoomScale);
    const c = await C.toClient(page, 500, 400);
    const t = await touch(page);
    await t.pinch(c, 100, 200);
    const r = await page.evaluate(([x, y]) => ({ z: app.zoomScale, pt: app.convertClientScreenCoordinatesToCanvasSpace(x, y), moved: app.state.elements[0].x }), [c.x, c.y]);
    expect(r.z).toBeGreaterThan(z0 * 1.5);
    expect(Math.abs(r.pt.x - 500)).toBeLessThan(4);
    expect(Math.abs(r.pt.y - 400)).toBeLessThan(4);
    expect(r.moved).toBe(100);
  });

  test('mouse drags still work with pointer handling in place', async ({ page }) => {
    await H.openApp(page, { session: sess([P('a', 'process', 'A', 100, 200)]) });
    await page.evaluate(() => { app.isSnappingActive = false; });
    await C.dragNode(page, 'a', 100, 60);
    expect(await page.evaluate(() => [app.state.elements[0].x, app.state.elements[0].y])).toEqual([200, 260]);
  });
});

test('Delete right after adding a shape from the palette removes it (focus is still on the palette item)', async ({ page }) => {
  await C.emptyApp(page);
  const id = await C.addFromPalette(page, 'pal-process');
  await expect(page.locator('#pal-process')).toBeFocused();
  await page.keyboard.press('Delete');
  await expect.poll(() => page.evaluate((i) => app.state.elements.some((e) => e.id === i), id)).toBe(false);
});
