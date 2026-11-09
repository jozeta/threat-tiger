# Minimap and Format Painter (feature 17) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A toggleable overview map in the canvas's bottom-right corner (click or drag in it to pan), and a format painter that copies a node's look (never its name, type or security settings) onto other nodes.

**Architecture:** The minimap is an inline `<svg id="minimap">` that draws each element's box projected with the app's existing `projectCoordinates(x, y)`, so it matches flat and isometric views. It also draws a viewport rectangle computed from `panX`, `panY` and `zoomScale`. It is redrawn at the end of `renderSvgDiagramElements()` and its viewport is updated in `applySvgViewportTransformations()`. The format painter is a style-only copy driven by a top-level `paintableStyle(src, dst)` helper and an app state `formatPainter = { sourceId, sticky }`. It hooks into `handleElementSelectionEvent(id)`, which every node click and keyboard selection goes through.

**Tech Stack:** Vanilla JS inside `threat-tiger.html`, Bootstrap 5 and Bootstrap Icons (vendored), Playwright tests in Edge.

**Spec:** `docs/superpowers/specs/2026-11-09-diagramming-and-attack-paths-design.md` (section "17. Minimap and format painter")

## Global Constraints

- Single file; no new dependency; `npm run sync` after every inline-script edit; `npm run sync -- --check` clean.
- No new `innerHTML` sink: build the minimap with `document.createElementNS`.
- Each paint is exactly one undo step (`logEvent('CHANGE', …)` once). Panning from the minimap is a view change and gets no undo step.
- The minimap on/off setting is stored in `localStorage` under `minimap_visible` (default on), wrapped in try/catch like the other view settings.
- Lint clean, full `npm test` green, CHANGELOG ("### Added"), the Help modal list and README updated, all in the task that adds the feature. No version bump, no push.

## Review Focus

1. **Empty model:** the minimap is hidden with no elements, and showing it again after adding one must not throw (the bounding box of nothing). Test in Task 1.
2. **Isometric view:** the minimap boxes and the viewport rectangle use the same projection as the canvas, so clicking a node's spot in the minimap centres that node. Test in Task 1.
3. **Painting across kinds:** flowchart colours never land on a process, and an icon colour never lands on a flowchart shape. Incompatible keys are skipped, and a paint that changes nothing adds no undo step. Test in Task 2.
4. **Painting onto the source or with nothing selected:** clicking the source node itself does nothing and keeps the painter armed. The painter button is disabled unless exactly one paintable element is selected. Test in Task 2.
5. **Escape and sticky mode:** a double-click keeps the painter on across several nodes; Esc or clicking the button again turns it off; Esc while painting must not also clear the selection in the same key press. Test in Task 2.

---

### Task 1: Minimap

**Files:**
- Modify: `threat-tiger.html`:
  - markup: an `<svg id="minimap">` inside the canvas container, absolutely positioned bottom-right, about 200×140 px, the same white/border/shadow look as the canvas toolbar, and dark-canvas aware through CSS variables;
  - a toggle button `#btn-canvas-minimap` (icon `bi-map`) in the canvas toolbar next to `#btn-canvas-zoom-reset`;
  - CSS;
  - the methods below.
- Test: `tests/minimap.spec.js` (create)

**Interfaces:**
- Produces:
  - `app.minimapVisible`: a boolean, initialised from `localStorage.minimap_visible` (`'false'` means off; anything else means on).
  - `app.renderMinimap()`: rebuilds the minimap contents. The SVG gets class `d-none` when `!minimapVisible` or there are no elements. Each element (except `boundary_line`) becomes a `<polygon class="minimap-item" data-id>`: the 4 projected corners of its box, using `alignableBox` sizes where available and `width`/`height` otherwise, skipping elements with no size. A `<rect class="minimap-viewport">` shows the visible canvas area. The minimap's viewBox is the content bounding box from `getIsometricBoundingBox()` plus 5 % padding.
  - `app.updateMinimapViewport()`: repositions only `.minimap-viewport`. The visible area in content coordinates is x = −panX/zoomScale, y = −panY/zoomScale, width = svgWidth/zoomScale, height = svgHeight/zoomScale.
  - `app.panMinimapTo(cx, cy)`: centres the canvas on content point (cx, cy), with panX = svgWidth/2 − cx·zoomScale (and the same for y), then calls `applySvgViewportTransformations()`. Mousedown and mousemove (while the button is held) on the minimap convert the pointer to content coordinates (`getScreenCTM().inverse()`) and call it.
  - `app.toggleMinimap()`: flips `minimapVisible`, stores it, re-renders the minimap, and sets `aria-pressed` on `#btn-canvas-minimap`.

- [ ] **Step 1: Write the failing tests** in `tests/minimap.spec.js` (setup like `tests/align.spec.js`):

```js
test('minimap shows one item per element and a viewport; hidden when empty; toggle persists', async ({ page }) => {
  await setup(page, [
    { id: 'a', type: 'process', name: 'A', x: 0, y: 0, width: 240, height: 80, secProps: {} },
    { id: 'b', type: 'datastore', name: 'B', x: 2000, y: 1200, width: 240, height: 80, secProps: {} },
  ]);
  const map = page.locator('#minimap');
  await expect(map).toBeVisible();
  await expect(map.locator('.minimap-item')).toHaveCount(2);
  await expect(map.locator('.minimap-viewport')).toHaveCount(1);
  await page.click('#btn-canvas-minimap');
  await expect(map).toBeHidden();
  await expect(page.locator('#btn-canvas-minimap')).toHaveAttribute('aria-pressed', 'false');
  expect(await page.evaluate(() => localStorage.getItem('minimap_visible'))).toBe('false');
  await page.click('#btn-canvas-minimap');
  await page.evaluate(() => { app.state.elements = []; app.refreshAppViewVisualWorkspace(); });
  await expect(map).toBeHidden();
  await page.evaluate(() => { app.state.elements = [{ id: 'c', type: 'process', name: 'C', x: 0, y: 0, width: 240, height: 80, secProps: {} }]; app.refreshAppViewVisualWorkspace(); });
  await expect(map.locator('.minimap-item')).toHaveCount(1);
});

for (const mode of ['flat', 'ne-isometric']) {
  test(`clicking a node's spot in the minimap centres it (${mode})`, async ({ page }) => {
    await setup(page, [
      { id: 'a', type: 'process', name: 'A', x: 0, y: 0, width: 240, height: 80, secProps: {} },
      { id: 'b', type: 'datastore', name: 'B', x: 3000, y: 2000, width: 240, height: 80, secProps: {} },
    ]);
    await page.evaluate((m) => app.setViewMode(m), mode);
    await page.locator('#minimap .minimap-item[data-id="b"]').click();
    const off = await page.evaluate(() => {
      const r = document.querySelector('#layers-nodes-group [data-id="b"]').getBoundingClientRect();
      const c = document.getElementById('canvas-svg').getBoundingClientRect();
      return [Math.abs(r.x + r.width / 2 - (c.x + c.width / 2)), Math.abs(r.y + r.height / 2 - (c.y + c.height / 2))];
    });
    expect(off[0]).toBeLessThan(60);
    expect(off[1]).toBeLessThan(60);
    expect(await page.evaluate(() => app.undoStack.length)).toBe(0);
  });
}
```

- [ ] **Step 2: Run to see them fail.** Run: `npx playwright test tests/minimap.spec.js`. Expected: 3 failed (`#minimap` not found).
- [ ] **Step 3: Implement** the markup, CSS, `renderMinimap`, `updateMinimapViewport`, `panMinimapTo`, `toggleMinimap` and the button wiring. Call `renderMinimap()` at the end of `renderSvgDiagramElements()` and `updateMinimapViewport()` at the end of `applySvgViewportTransformations()`. Then run `npm run sync`.
- [ ] **Step 4: Run to see them pass.** Run: `npx playwright test tests/minimap.spec.js`. Expected: 3 passed.
- [ ] **Step 5: Docs.**
  - Help list: "**Minimap:** the map in the bottom-right corner shows the whole diagram; click or drag in it to move the view. Turn it on or off with the map button."
  - README canvas bullet: add "a minimap".
  - CHANGELOG `### Added`: "Minimap: an overview of the whole diagram in the canvas corner; click or drag to move the view; can be switched off".
- [ ] **Step 6: Full verification.** Run: `npm run sync -- --check && npm run lint && npm test`. Expected: up to date, lint clean, 160 passed.
- [ ] **Step 7: Commit** `threat-tiger.html tests/minimap.spec.js CHANGELOG.md README.md` with the message "Minimap: overview of the diagram, click or drag to pan".

### Task 2: Format painter

**Files:**
- Modify: `threat-tiger.html`:
  - a top-level helper next to `alignableBox`;
  - a button `#btn-format-painter` (icon `bi-brush`) in the canvas toolbar;
  - a CSS class `painting` on `#canvas-svg` while the painter is armed (`cursor: copy`);
  - the methods below.
- Test: `tests/format-painter.spec.js` (create)

**Interfaces:**
- Produces:
  - `STYLE_FAMILIES = { flowchart: ['fcFillColor', 'fcStrokeColor', 'fcStrokeWidth'], component: ['iconColor', 'circleColor'], text: ['fontSize'] }`.
  - `styleFamily(e) -> 'flowchart' | 'component' | 'text' | null`:
    - `flowchart` for `fc_*` types;
    - `component` for `process`, `datastore`, `interactor`, `infrastructure`, `custom_image` and `step_activity`;
    - `text` for `textbox` and `headline`;
    - `null` otherwise (zones, swimlanes, boundary lines).
  - `paintableStyle(src, dst) -> object`: the keys of the source's family that the source defines, copied only when `styleFamily(dst) === styleFamily(src)`; otherwise `{}`.
  - `app.formatPainter`: `null`, or `{ sourceId, sticky }`.
  - `app.armFormatPainter(sticky)`: needs exactly one selected element with a non-null family, otherwise it does nothing. It adds `.painting` and sets `aria-pressed="true"`.
  - `app.disarmFormatPainter()`: clears the painter, removes the class and sets `aria-pressed="false"`.
  - `app.paintFormatOnto(id) -> boolean`: applies `paintableStyle`. It logs `'Copied the look of "<src>" to "<dst>"'` once, and only when a value changed. It returns whether anything changed.
  - Behaviour:
    - Click the button: arm a one-shot painter. Double-click: arm a sticky one (detect with `ev.detail >= 2`). Click while armed: disarm.
    - In `handleElementSelectionEvent(id)`: when the painter is armed and `id !== sourceId`, call `paintFormatOnto(id)`, disarm unless sticky, keep the selection on the source, and return. When `id === sourceId`, do nothing and stay armed.
    - Esc while the painter is armed only disarms. Handle it before the existing Escape branch (about line 7157) and return.
    - The button is disabled unless exactly one element with a non-null family is selected and no painter is armed. Update this in `updateAlignToolbar()`'s caller, `updatePropertiesInspectorView()`.

- [ ] **Step 1: Write the failing tests** in `tests/format-painter.spec.js`:

```js
const els = [
  { id: 'f1', type: 'fc_process', name: 'Styled', x: 0, y: 0, width: 160, height: 80, fcFillColor: '#fee2e2', fcStrokeColor: '#dc2626', fcStrokeWidth: 4 },
  { id: 'f2', type: 'fc_decision', name: 'Plain', x: 300, y: 0, width: 160, height: 100, fcFillColor: '#ffffff', fcStrokeColor: '#000000', fcStrokeWidth: 2 },
  { id: 'f3', type: 'fc_cube', name: 'Plain 2', x: 600, y: 0, width: 140, height: 100, fcFillColor: '#ffffff', fcStrokeColor: '#000000', fcStrokeWidth: 2 },
  { id: 'p', type: 'process', name: 'API', x: 0, y: 300, width: 240, height: 80, iconColor: '#2563eb', secProps: { encrypted: 'true' } },
];
const get = (page, id) => page.evaluate((i) => JSON.parse(JSON.stringify(app.state.elements.find((e) => e.id === i))), id);
const clickNode = (page, id) => page.locator(`#layers-nodes-group [data-id="${id}"]`).first().click();

test('one-shot painter copies flowchart look only, one undo step, then turns off', async ({ page }) => {
  await setup(page, els);
  await select(page, ['f1']);
  await page.click('#btn-format-painter');
  await expect(page.locator('#btn-format-painter')).toHaveAttribute('aria-pressed', 'true');
  const before = await page.evaluate(() => app.undoStack.length);
  await clickNode(page, 'f2');
  expect(await get(page, 'f2')).toMatchObject({ name: 'Plain', type: 'fc_decision', width: 160, height: 100, fcFillColor: '#fee2e2', fcStrokeColor: '#dc2626', fcStrokeWidth: 4 });
  expect(await page.evaluate(() => app.undoStack.length)).toBe(before + 1);
  expect(await page.evaluate(() => app.formatPainter)).toBeNull();
  await clickNode(page, 'f3');
  expect((await get(page, 'f3')).fcFillColor).toBe('#ffffff');
});

test('painting across kinds changes nothing and adds no undo step; clicking the source keeps it armed', async ({ page }) => {
  await setup(page, els);
  await select(page, ['f1']);
  await page.click('#btn-format-painter');
  await clickNode(page, 'f1');
  expect(await page.evaluate(() => app.formatPainter && app.formatPainter.sourceId)).toBe('f1');
  const before = await page.evaluate(() => app.undoStack.length);
  await clickNode(page, 'p');
  const p = await get(page, 'p');
  expect(p.fcFillColor).toBeUndefined();
  expect(p.iconColor).toBe('#2563eb');
  expect(p.secProps.encrypted).toBe('true');
  expect(await page.evaluate(() => app.undoStack.length)).toBe(before);
});

test('double-click keeps the painter on until Esc; Esc does not also clear the selection', async ({ page }) => {
  await setup(page, els);
  await select(page, ['f1']);
  await page.dblclick('#btn-format-painter');
  await clickNode(page, 'f2');
  await clickNode(page, 'f3');
  expect((await get(page, 'f3')).fcFillColor).toBe('#fee2e2');
  await page.keyboard.press('Escape');
  expect(await page.evaluate(() => app.formatPainter)).toBeNull();
  expect(await page.evaluate(() => app.state.selectedElementIds)).toEqual(['f1']);
  await select(page, ['f1', 'f2']);
  await expect(page.locator('#btn-format-painter')).toBeDisabled();
});
```

Copy the `setup` and `select` helpers from `tests/align.spec.js`.

- [ ] **Step 2: Run to see them fail.** Run: `npx playwright test tests/format-painter.spec.js`. Expected: 3 failed (`#btn-format-painter` not found).
- [ ] **Step 3: Implement** the helpers, the button, the CSS, the methods, the hook in `handleElementSelectionEvent`, the Esc branch and the enable logic. Then run `npm run sync`.
- [ ] **Step 4: Run to see them pass.** Run: `npx playwright test tests/format-painter.spec.js`. Expected: 3 passed.
- [ ] **Step 5: Docs.**
  - Help list: "**Format painter:** select a shape, click the brush, then click another shape of the same kind to copy its colours (not its name, type or security settings). Double-click the brush to paint several; Esc stops."
  - README canvas bullet: add "a format painter".
  - CHANGELOG `### Added`: "Format painter: copy a shape's colours, line width or font size onto other shapes of the same kind; double-click to paint several".
- [ ] **Step 6: Full verification.** Run: `npm run sync -- --check && npm run lint && npm test`. Expected: up to date, lint clean, 163 passed.
- [ ] **Step 7: Commit** `threat-tiger.html tests/format-painter.spec.js CHANGELOG.md README.md` with the message "Format painter: copy a shape's look onto shapes of the same kind".
