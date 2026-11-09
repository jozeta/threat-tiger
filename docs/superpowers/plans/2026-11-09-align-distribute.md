# Align and Distribute (feature 11) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When 2+ nodes are selected, a floating toolbar aligns them (left/centre/right, top/middle/bottom) or distributes them evenly (3+), as one undo step.

**Architecture:** Pure geometry helpers at script top level (`alignableBox`, `computeAlignment`) so tests can call them through `page.evaluate`; one app method `alignSelection(mode)` applies the result, re-renders and logs one undo point; a small toolbar in the canvas is shown/hidden from the existing selection refresh.

**Tech Stack:** Vanilla JS inside `threat-tiger.html`, Bootstrap 5 + Bootstrap Icons (vendored), Playwright (Edge) tests.

**Spec:** `docs/superpowers/specs/2026-11-09-diagramming-and-attack-paths-design.md` (section "11. Align and distribute")

## Global Constraints

- Single file `threat-tiger.html`; no CDN, no new dependency.
- Run `npm run sync` after every edit of the inline script (updates the CSP hash); `npm run sync -- --check` must print "threat-tiger.html is up to date."
- No new `innerHTML` sink (build the toolbar in static HTML).
- Every user action is exactly one undo step: call `this.logEvent('CHANGE', msg)` once per click, only when something moved.
- `npm run lint` clean and the full `npm test` green before the commit.
- Update CHANGELOG.md ("## Unreleased" → "### Added"), the Help modal's "Flowcharts and swimlanes" list, and README's canvas bullet. No version bump, no push.

## Review Focus

1. **Mixed sizes:** aligning a 240×80 process with an 80×70 infrastructure node and a 160×100 decision must align edges/centres using each node's real size (including type defaults when `width`/`height` are missing), not the top-left corner. Test in Task 1.
2. **Non-alignable items in the selection:** flows, boundary lines, swimlanes, text boxes and headlines in a selection are ignored, and the toolbar only counts alignable items. Test in Task 2.
3. **Distribute with overlapping or unsorted input:** nodes selected in random order, or already overlapping, must still end up sorted by position with equal gaps and the outermost two unmoved. Test in Task 1.
4. **Nothing to do:** clicking "align left" on nodes already aligned must not add an undo step. Test in Task 2.
5. **Isometric view:** alignment works on model coordinates, so it must behave the same in isometric and flat view (only rendering differs). Test in Task 2.

---

### Task 1: Geometry helpers

**Files:**
- Modify: `threat-tiger.html` (top-level helpers next to `FLOWCHART_DEFAULTS`, about line 3600)
- Test: `tests/align.spec.js` (create)

**Interfaces:**
- Produces:
  - `ALIGNABLE_TYPES`: a `Set` of `process, datastore, interactor, infrastructure, custom_image, step_activity, boundary` plus every key of `FLOWCHART_DEFAULTS`.
  - `alignableBox(e) -> {id, x, y, w, h} | null`: `null` when `e.type` is not in `ALIGNABLE_TYPES`. Size defaults when `width`/`height` are missing match the renderer (line ~9366): width `custom_image` 120, `infrastructure` 80, `step_activity` 260, otherwise 240; height `custom_image` 120, `infrastructure` 70, `step_activity` 50, otherwise 80.
  - `computeAlignment(boxes, mode) -> Map<id, {x, y}>`: `mode` is one of `left, center, right, top, middle, bottom, hspace, vspace`. It returns only the boxes whose position changes. Align modes take 2+ boxes. `hspace`/`vspace` take 3+ (fewer → empty Map). They sort by `x` (or `y`), keep the first and last, and place the others so the gaps between boxes are equal: gap = (span − sum of sizes) / (n − 1), where span = last.x + last.w − first.x. The gap may be negative when boxes overlap. Align targets: left = min x; right = max(x + w), each box gets x = target − w; center = the midpoint of the selection's bounding box, each box gets x = target − w/2; top, middle and bottom work the same way on y. Results are rounded to whole pixels.

- [ ] **Step 1: Write the failing tests** in `tests/align.spec.js` (use `openApp` and `demoSession` from `./helpers`, same pattern as `tests/cube.spec.js`):

```js
test('computeAlignment aligns edges and centres using each box size', async ({ page }) => {
  await setup(page);
  const r = await page.evaluate(() => {
    const boxes = [{ id: 'a', x: 100, y: 100, w: 240, h: 80 }, { id: 'b', x: 400, y: 160, w: 80, h: 70 }, { id: 'c', x: 250, y: 300, w: 160, h: 100 }];
    const o = (m) => Object.fromEntries(computeAlignment(boxes, m));
    return { left: o('left'), right: o('right'), center: o('center'), bottom: o('bottom'), middle: o('middle') };
  });
  expect(r.left).toEqual({ b: { x: 100, y: 160 }, c: { x: 100, y: 300 } });
  expect(r.right).toEqual({ a: { x: 240, y: 100 }, c: { x: 320, y: 300 } });   // max right edge 480
  expect(r.center).toEqual({ a: { x: 170, y: 100 }, b: { x: 250, y: 160 }, c: { x: 210, y: 300 } }); // centre 290
  expect(r.bottom).toEqual({ a: { x: 100, y: 320 }, b: { x: 400, y: 330 } });  // bottom 400
  expect(r.middle).toEqual({ a: { x: 100, y: 210 }, b: { x: 400, y: 215 }, c: { x: 250, y: 200 } }); // middle 250
});

test('computeAlignment distributes unsorted, overlapping boxes with equal gaps and fixed ends', async ({ page }) => {
  await setup(page);
  const r = await page.evaluate(() => {
    const boxes = [{ id: 'z', x: 600, y: 0, w: 100, h: 50 }, { id: 'a', x: 0, y: 0, w: 100, h: 50 }, { id: 'm', x: 80, y: 0, w: 200, h: 50 }];
    return { h: Object.fromEntries(computeAlignment(boxes, 'hspace')), two: computeAlignment(boxes.slice(0, 2), 'hspace').size };
  });
  expect(r.h).toEqual({ m: { x: 250, y: 0 } });   // gap = (700 - 400) / 2 = 150
  expect(r.two).toBe(0);
});

test('alignableBox uses type default sizes and ignores non-alignable types', async ({ page }) => {
  await setup(page);
  const r = await page.evaluate(() => [
    alignableBox({ id: 'i', type: 'infrastructure', x: 1, y: 2 }),
    alignableBox({ id: 'f', type: 'fc_cube', x: 0, y: 0, width: 140, height: 100 }),
    alignableBox({ id: 's', type: 'swimlane', x: 0, y: 0 }),
    alignableBox({ id: 't', type: 'textbox', x: 0, y: 0 }),
  ]);
  expect(r).toEqual([{ id: 'i', x: 1, y: 2, w: 80, h: 70 }, { id: 'f', x: 0, y: 0, w: 140, h: 100 }, null, null]);
});
```

- [ ] **Step 2: Run the tests to see them fail**

Run: `npx playwright test tests/align.spec.js`
Expected: FAIL with "computeAlignment is not defined"

- [ ] **Step 3: Implement `ALIGNABLE_TYPES`, `alignableBox(e)` and `computeAlignment(boxes, mode)`** as top-level `const`/`function` declarations so the tests can reach them as globals; then run `npm run sync`.

- [ ] **Step 4: Run the tests to see them pass**

Run: `npx playwright test tests/align.spec.js`
Expected: 3 passed

### Task 2: Toolbar, `alignSelection`, docs, commit

**Files:**
- Modify: `threat-tiger.html`: toolbar HTML next to the canvas toolbar (about line 2270); a method on the app class; show/hide the toolbar from `updatePropertiesInspectorView()` (about line 9935), which runs on every selection change; the Help modal list.
- Modify: `CHANGELOG.md`, `README.md`
- Test: `tests/align.spec.js`

**Interfaces:**
- Consumes: `alignableBox`, `computeAlignment` (Task 1).
- Produces:
  - `#align-toolbar`: a `div` with buttons `[data-align="left|center|right|top|middle|bottom|hspace|vspace"]`, each with a `title`, an `aria-label` and a Bootstrap icon (`bi-align-start`, `bi-align-center`, `bi-align-end`, `bi-align-top`, `bi-align-middle`, `bi-align-bottom`, `bi-distribute-horizontal`, `bi-distribute-vertical`). The toolbar is absolutely positioned bottom-left directly above the existing canvas toolbar, uses the same `bg-white p-1 rounded shadow-sm border` look, and is hidden (`d-none`) unless 2+ alignable elements are selected. The two distribute buttons are `disabled` unless 3+ are selected.
  - `app.alignSelection(mode) -> number`: applies `computeAlignment` to the alignable selected elements and moves them. It returns the number of elements moved. When that number is above 0 it re-renders (`refreshAppViewVisualWorkspace()`) and calls `logEvent('CHANGE', 'Aligned N elements (<mode>)')` exactly once.
  - Moving a trust zone (`boundary`) moves only the zone itself, not its contents. Zone membership is geometric and recomputed on render.

- [ ] **Step 1: Write the failing UI tests** (append to `tests/align.spec.js`):

```js
test('toolbar shows for 2+ alignable nodes, aligns in one undo step, ignores flows and swimlanes', async ({ page }) => {
  await setup(page, [
    { id: 'a', type: 'process', name: 'A', x: 100, y: 100, width: 240, height: 80, secProps: {} },
    { id: 'b', type: 'datastore', name: 'B', x: 400, y: 260, width: 240, height: 80, secProps: {} },
    { id: 'c', type: 'fc_decision', name: 'C', x: 700, y: 180, width: 160, height: 100 },
    { id: 's', type: 'swimlane', name: 'S', x: 0, y: 600, columns: ['A'], rows: ['R'] },
  ]);
  const bar = page.locator('#align-toolbar');
  await select(page, ['a']);                       await expect(bar).toBeHidden();
  await select(page, ['a', 's']);                  await expect(bar).toBeHidden();      // swimlane does not count
  await select(page, ['a', 'b']);                  await expect(bar).toBeVisible();
  await expect(bar.locator('[data-align="hspace"]')).toBeDisabled();
  await select(page, ['a', 'b', 'c', 's']);
  await expect(bar.locator('[data-align="hspace"]')).toBeEnabled();
  await bar.locator('[data-align="top"]').click();
  expect(await ys(page)).toEqual({ a: 100, b: 100, c: 100, s: 600 });
  await page.click('#btn-undo');
  expect(await ys(page)).toEqual({ a: 100, b: 260, c: 180, s: 600 });
});

test('aligning already-aligned nodes adds no undo step; works the same in isometric view', async ({ page }) => {
  await setup(page, [
    { id: 'a', type: 'process', name: 'A', x: 100, y: 100, width: 240, height: 80, secProps: {} },
    { id: 'b', type: 'process', name: 'B', x: 100, y: 300, width: 240, height: 80, secProps: {} },
  ]);
  await page.evaluate(() => app.setViewMode('ne-isometric'));
  await select(page, ['a', 'b']);
  const before = await page.evaluate(() => app.undoStack.length);
  expect(await page.evaluate(() => app.alignSelection('left'))).toBe(0);
  expect(await page.evaluate(() => app.undoStack.length)).toBe(before);
  expect(await page.evaluate(() => app.alignSelection('right'))).toBe(0);  // equal widths: nothing moves
});
```

Helpers inside the spec: `select(page, ids)` sets `app.state.selectedElementIds = ids` and calls `app.refreshAppViewVisualWorkspace()`. `ys(page)` returns `{id: y}` for all elements.

- [ ] **Step 2: Run to see them fail**

Run: `npx playwright test tests/align.spec.js`
Expected: the 2 new tests fail (`#align-toolbar` not found).

- [ ] **Step 3: Add the toolbar HTML, `alignSelection(mode)`, the button wiring (in the app's setup, next to the `btn-canvas-zoom-reset` listener at about line 6045) and the show/hide plus enable logic in `updatePropertiesInspectorView()`**. Then run `npm run sync`.

- [ ] **Step 4: Run to see them pass**

Run: `npx playwright test tests/align.spec.js`
Expected: 5 passed

- [ ] **Step 5: Docs.** In the Help modal's "Flowcharts and swimlanes" list, add "**Align and distribute:** select two or more shapes to line them up or space them evenly from the small toolbar above the canvas controls." In README's canvas bullet, add "align and distribute". In CHANGELOG under `## Unreleased`, `### Added`, add "Align and distribute: with two or more shapes selected, a toolbar lines up their left/centre/right or top/middle/bottom edges, or spaces three or more evenly; one undo step".

- [ ] **Step 6: Full verification**

Run: `npm run sync -- --check && npm run lint && npm test`
Expected: "threat-tiger.html is up to date.", no lint output, all tests passed (151 + 5 = 156).

- [ ] **Step 7: Commit**

```bash
git add threat-tiger.html tests/align.spec.js CHANGELOG.md README.md
git commit -m "Align and distribute selected shapes"
```
