# Cloud Stencils (feature 14) and View Menu Tabs Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:**
- Official cloud icon sets as palette stencils (AWS, Azure, Microsoft Entra, Google Cloud, Oracle Cloud, Kubernetes). Placed shapes are normal threat-model components, so threat suggestions keep working.
- ☰ menu → View gains a switch per icon set and a switch per panel tab.

**Architecture:**
- **Build (developer only):** a committed Node script, `scripts/build-stencils.mjs`, reads the downloaded vendor archives once they are extracted. It cleans every SVG and maps each icon to a component type and subtypes. It writes one plain script per set, `vendor/stencils/<set>.js`, which registers `window.TT_STENCILS[<set>]`. A script is used rather than JSON fetched with `fetch`, because `fetch` fails on `file://` and the CSP already allows `script-src 'self'`.
- **Runtime:** the palette's "Cloud stencils" section loads a set's script only when that set is opened.
- **Placing an icon** creates a normal component (`process`, `datastore`, `interactor` or `infrastructure`) carrying:
  - `stencil`, the `"<set>:<id>"` text;
  - `stencilIcon`, the cleaned SVG as a `data:image/svg+xml;base64,…` URL;
  - `stencilTags`, its subtypes.
  So a saved model renders, exports and is analysed without any pack loaded. All three fields are validated on import.

**Tech Stack:** Node 26 (build script only, no dependencies, using `node:zlib` for draw.io data), vanilla JS in `threat-tiger.html`, Playwright in Edge.

**Spec:** `docs/superpowers/specs/2026-11-09-diagramming-and-attack-paths-design.md` (section "14. Cloud stencil packs"), with these user changes made during the session:
- Oracle Cloud and Microsoft Entra were added.
- The user asked for more icons than the spec's "60–120 per pack".
- ☰ View gets per-set and per-panel-tab switches.

## Global Constraints

- **Sources:** the archives the user approved, downloaded to the scratchpad and never committed. Only the generated `vendor/stencils/*.js` and `vendor/stencils/README.md` are committed. Each is listed in `vendor/checksums.json`, and `npm run sync` must verify it.
- **Licences:** the icons are **not** under the repo's MIT licence. `vendor/stencils/README.md` names each set's source URL, version or date, and terms:
  - AWS: "customers and partners may use these toolkits and assets to create architecture diagrams".
  - Azure and Entra: "Microsoft permits the use of these icons in architectural diagrams, training materials, or documentation".
  - Google Cloud: product icons from cloud.google.com/icons.
  - Oracle: OCI Architecture Diagram Toolkit.
  - Kubernetes: Apache-2.0 or CC-BY-4.0.
  The Help & License modal gets a short paragraph saying the same. The icons are not modified beyond cleaning and minifying, as the Microsoft guidelines say "don't distort or change icon shape".
- **SVG cleaning:**
  - Drop `<script>`, `<foreignObject>`, `<!DOCTYPE>`/`<!ENTITY>`, `on*=` attributes, and `href`/`xlink:href` values that do not start with `#` or `data:image/`.
  - Drop `url(...)` values that point outside the document, and `@import`.
  - Collapse whitespace.
  - Skip any icon still larger than 60 KB.
- **Import validation:**
  - `stencil` must match `/^[a-z0-9]+:[\w.-]{1,120}$/i`.
  - `stencilIcon` must match `/^data:image\/svg\+xml;base64,[A-Za-z0-9+/=]+$/` and be at most 120 000 characters.
  - `stencilTags` must be keys of `SUBTYPE_LABELS`, at most 6.
  - Anything invalid is dropped, and the node falls back to its type's normal icon.
- **Rendering:** the icon is an `<img>` inside the node's existing card (an SVG used as an image cannot run script). The `src` goes through `esc()`.
- Single file for the app, `npm run sync`, no new unreviewed `innerHTML` (the card templates already carry reviewed comments; extend their comments), lint and full suite green, CHANGELOG, README and Help updated. No version bump, no push.

## Review Focus

1. **Hostile imported stencil fields:** a `stencilIcon` that is `javascript:…`, `data:text/html…`, or base64 SVG holding `<script>`, plus a `stencil` id with quotes and `stencilTags` with unknown tags. The first two are dropped. The script-SVG is harmless as an `<img>` and must not run. Unknown tags are dropped. Test in Task 3 and the XSS suite.
2. **Pack loading fails or is slow (`file://`, a missing file):** the palette says "Could not load <set>" and nothing throws. A second open does not add a second `<script>`. Test in Task 3.
3. **Hiding the active tab:** hiding the Properties tab while it is shown switches to the next visible tab. Hiding every tab of a panel leaves the panel empty but usable, and turning a tab back on restores it. Test in Task 1.
4. **Type and subtype mapping:** a database icon (Amazon RDS, Azure SQL, Cloud SQL) becomes a `datastore` recognised as `database`, a key store (KMS, Key Vault, Secret Manager) gets `secrets`, and a load balancer or firewall becomes `infrastructure` with `network-device`. Threat suggestions for the placed node then include the database or secrets templates. Test in Task 2 (generated data) and Task 3 (suggestions).
5. **Size:** loading the largest set takes under 1 s, and searching 700 icons filters within one frame. Test in Task 3.

---

### Task 1: View menu: a switch per panel tab

**Files:** Modify `threat-tiger.html`:
- the View list: add a "Panel tabs" sub-header and items;
- `setupViewMenu` and `syncViewMenu`;
- a new `setTabVisible(tabId, visible)`.

Test: `tests/view-menu.spec.js`.

**Interfaces — Produces:**
- `PANEL_TABS = [['tab-props-trigger', 'Properties'], ['tab-suggest-trigger', 'Threat Templates'], ['tab-layers-trigger', 'Layers'], [<bottom tab trigger ids>, 'Active Threat Register' | 'Mitigations' | 'Insights' | 'Activity Log']]`. Look up the bottom tab trigger ids with `grep -n 'data-bs-toggle="tab"' threat-tiger.html`.
- Menu items `#btn-menu-tab-<triggerId>`, each a `menuitemcheckbox`.
- `app.hiddenTabs`: a `Set`, stored in `localStorage.hidden_tabs` as a JSON array (wrapped in try/catch).
- `setTabVisible(triggerId, visible)`:
  - Hides the trigger's parent `<li>` by adding `d-none`.
  - If the hidden tab was active, shows the first visible sibling with `bootstrap.Tab.getOrCreateInstance(el).show()`.
  - Stores the setting and calls `syncViewMenu()`.

- [ ] **Step 1: Failing test:**

```js
test('View → panel tabs hides a tab; hiding the active one switches to the next; it is remembered', async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 1000 });
  await openApp(page, { session: demoSession() });
  await openView(page);
  const item = page.locator('#btn-menu-tab-tab-props-trigger');
  await expect(item).toHaveAttribute('aria-checked', 'true');
  await item.click();
  await expect(page.locator('#tab-props-trigger')).toBeHidden();
  await expect(page.locator('#tab-suggest-trigger')).toHaveClass(/active/);
  await page.reload();
  await expect(page.locator('#tab-props-trigger')).toBeHidden();
  await openView(page);
  await page.locator('#btn-menu-tab-tab-props-trigger').click();
  await expect(page.locator('#tab-props-trigger')).toBeVisible();
});
```

- [ ] **Step 2:** Run it and expect a FAIL. **Step 3:** Implement, then run `npm run sync`. **Step 4:** Run it and expect a PASS, plus `tests/a11y.spec.js`.
- [ ] **Step 5: Commit** "View menu: show or hide each panel tab", with a CHANGELOG line and a Help line ("☰ → View → Panel tabs").

### Task 2: Build script and generated packs

**Files:** Create `scripts/build-stencils.mjs`, `vendor/stencils/{aws,azure,entra,gcp,oci,k8s}.js` (generated) and `vendor/stencils/README.md`. Modify `vendor/checksums.json` (through the sync script if it can add entries, otherwise by hand with sha256). Test: `tests/stencils-build.spec.js`, a Node-side Playwright test with no browser that loads each generated file in a `vm` context.

**Interfaces:**
- **Produces:**
  - Usage: `node scripts/build-stencils.mjs <set> <extractedDir>`. It writes `vendor/stencils/<set>.js`.
  - The file registers `window.TT_STENCILS[<set>] = { title, source, version, terms, icons: [[id, name, category, type, tags[], base64Svg], …] }`.
  - The shared helpers `cleanSvg(text) -> string | null` and `classify(name, category) -> { type, tags }` are exported so the test can import them.
- `classify` rules (first match wins; the name is tested before the category):

| Pattern (case-insensitive) | type | tags |
|---|---|---|
| `\b(rds|aurora|sql|database|db\b|cloud sql|spanner|alloydb|postgres|mysql|maria|oracle db|autonomous)` | datastore | database |
| `\b(dynamo|cosmos|firestore|bigtable|documentdb|nosql|opensearch|elasticsearch|search)` | datastore | nosql |
| `\b(s3|bucket|blob|object storage|cloud storage|storage account|glacier)` | datastore | object-storage |
| `\b(cache|redis|memcache|elasticache)` | datastore | cache |
| `\b(efs|fsx|file share|files\b|filestore|netapp)` | datastore | file-share |
| `\b(kms|key vault|secret|hsm|certificate)` | datastore | secrets |
| `\b(log|cloudtrail|monitor|sentinel|siem|cloudwatch|operations)` | process | monitoring, logs |
| `\b(entra|active directory|cognito|iam|identity|sso|login|auth)` | process | identity |
| `\b(waf|firewall|shield|ddos|guardduty|defender|security|armor)` | infrastructure | security-control |
| `\b(load balancer|gateway|nat|vpn|express ?route|direct connect|front ?door|cdn|cloudfront|dns|route ?53|vpc|virtual network|vnet|subnet|network|interconnect)` | infrastructure | network-device (plus cdn, dns or vpn when the name says so) |
| `\b(api gateway|api management|apigee|endpoints)` | process | api |
| `\b(lambda|functions?|cloud run|app engine|serverless)` | process | serverless |
| `\b(kubernetes|eks|aks|gke|container|ecs|fargate|openshift|pod|deploy)` | process | container |
| `\b(sqs|sns|queue|service bus|event ?(hub|grid|bridge)|pub/?sub|kafka|mq)` | process | queue, messaging |
| `\b(ec2|virtual machine|vm\b|compute|instance)` | process | cloud-host |
| `\b(sagemaker|bedrock|openai|vertex|ai\b|machine learning|cognitive)` | process | llm |
| `\b(user|users|client|mobile|device)` | interactor | (none) |
| anything else | process | (none) |

- Per-set walkers:
  - **aws:** `Architecture-Service-Icons_*/Arch_<Category>/48/*.svg`. The name is the file name without `Arch_` and `_48`, with dashes turned into spaces.
  - **azure:** `Azure_Public_Service_Icons/Icons/<category>/*.svg`. The name is the text after `-icon-service-`.
  - **entra:** the colour SVGs only.
  - **gcp:** `Unique Icons/<Product>/**/*.svg` (one per product, preferring colour) and `Category Icons/<Category>/**/*.svg`.
  - **k8s:** every file; the name comes from Kubernetes short names (`pod`, `deploy`→"Deployment", `svc`→"Service", `ing`→"Ingress", `secret`, `cm`→"ConfigMap", `pv`/`pvc`, `netpol`→"Network Policy", `sa`→"Service Account", …). Secrets map to `secrets`, `pv`/`pvc` to `datastore`, `ing`/`svc`/`netpol` to `infrastructure` with `network-device`.
  - **oci:** `OCI Library.xml` is a draw.io `<mxlibrary>` JSON array of `{ xml, title, w, h }`. Each `xml` is base64 of raw-deflated, URI-encoded mxGraph XML. Decode it with `zlib.inflateRawSync` and `decodeURIComponent`, and take the first `image=data:image/svg+xml,<base64>` from a cell style. Entries without one are skipped.

- [ ] **Step 1: Failing test** (`tests/stencils-build.spec.js`):

```js
const { test, expect } = require('@playwright/test');
test('cleanSvg strips scripts, handlers, outside links and doctypes', async () => {
  const { cleanSvg } = await import('../scripts/build-stencils.mjs');
  const out = cleanSvg('<!DOCTYPE svg [<!ENTITY x "y">]><svg onload="a()"><script>b()</script><a href="https://evil"><rect/></a><use href="#i"/><foreignObject><p/></foreignObject></svg>');
  expect(out).not.toMatch(/script|onload|DOCTYPE|ENTITY|https:\/\/evil|foreignObject/i);
  expect(out).toContain('href="#i"');
});
test('classify maps databases, secrets, network and users', async () => {
  const { classify } = await import('../scripts/build-stencils.mjs');
  expect(classify('Amazon RDS', 'Database')).toEqual({ type: 'datastore', tags: ['database'] });
  expect(classify('Key Vaults', 'security')).toEqual({ type: 'datastore', tags: ['secrets'] });
  expect(classify('Application Load Balancer', 'Networking')).toEqual({ type: 'infrastructure', tags: ['network-device'] });
  expect(classify('Users', 'General')).toEqual({ type: 'interactor', tags: [] });
});
test('every generated pack loads, has icons, and every icon is clean', async () => {
  const fs = require('node:fs'), vm = require('node:vm');
  for (const set of ['aws', 'azure', 'entra', 'gcp', 'oci', 'k8s']) {
    const ctx = { window: {} }; vm.runInNewContext(fs.readFileSync(`vendor/stencils/${set}.js`, 'utf8'), ctx);
    const pack = ctx.window.TT_STENCILS[set];
    expect(pack.icons.length, set).toBeGreaterThan(set === 'entra' ? 5 : 30);
    for (const [id, name, , type, tags, b64] of pack.icons) {
      expect(id).toMatch(/^[\w.-]{1,120}$/);
      expect(['process', 'datastore', 'interactor', 'infrastructure']).toContain(type);
      const svg = Buffer.from(b64, 'base64').toString('utf8');
      expect(svg, `${set}:${name}`).not.toMatch(/<script|\son\w+=|<foreignObject|<!DOCTYPE/i);
    }
  }
});
```

- [ ] **Step 2:** Run `npx playwright test tests/stencils-build.spec.js` and expect a FAIL (no script). **Step 3:** Implement the script. Then unzip each archive into its own scratch folder, run the script once per set, write `vendor/stencils/README.md`, and add the checksums. **Step 4:** Run it and expect 3 passed; also run `npm run sync -- --check`. Record each set's icon count and file size in the ledger.
- [ ] **Step 5: Commit** "Stencil packs: build script, AWS, Azure, Entra, Google Cloud, Oracle Cloud and Kubernetes icons (vendored, terms in vendor/stencils/README.md)".

### Task 3: Palette, placed nodes, import validation, View switches, docs

**Files:** Modify `threat-tiger.html`:
- the palette accordion "Cloud stencils";
- `normalizeElement`;
- the node card templates (process/datastore/interactor and infrastructure);
- `subtypesOf`;
- the View menu.

Also modify `tests/xss.spec.js`, `CHANGELOG.md` and `README.md`. Test: `tests/stencils.spec.js`.

**Interfaces:**
- **Consumes:** the Task 2 file format.
- **Produces:**
  - `STENCIL_SETS = [['aws', 'AWS'], ['azure', 'Azure'], ['entra', 'Microsoft Entra'], ['gcp', 'Google Cloud'], ['oci', 'Oracle Cloud'], ['k8s', 'Kubernetes']]`.
  - `app.loadStencilSet(id) -> Promise<pack>`:
    - Adds `<script src="vendor/stencils/<id>.js">` once per set and caches the promise.
    - Rejects on `error`, or when the set did not register.
    - On rejection the cache entry is cleared so a retry is possible.
  - Palette: `#stencil-sets` holds one collapsible group per set that is not hidden. Opening a group loads the set and shows a search `<input>` and a grid of `.stencil-item[data-stencil="<set>:<id>"]` buttons (an `<img>` plus the name as title and `aria-label`), all built with `createElement`.
  - Clicking or pressing Enter on an item calls `app.addStencilNode(set, icon)`. It creates an element of the icon's `type` through the existing `instantiateNewCanvasElementNode(type)`, then sets `name`, `stencil`, `stencilIcon = 'data:image/svg+xml;base64,' + b64` and `stencilTags`, re-renders, and leaves one undo step.
  - `safeStencilIcon(v) -> string`: `''` unless `v` matches the import rule.
  - `normalizeElement` applies the import rules (Global Constraints).
  - `subtypesOf` adds `stencilTags`.
  - Cards: when `safeStencilIcon(node.stencilIcon)` is set, the `<i class="bi …">` icon is replaced by `<img class="stencil-icon" src="${esc(url)}" alt="">` (CSS sizes it the same way).
  - View menu "Icon sets" sub-header with `#btn-menu-stencil-<id>` switches. They are stored as `localStorage.hidden_stencil_sets`, and hide that set's group in the palette. They have no effect on nodes already on the canvas.
  - The Help & License paragraph about icon terms, linking `vendor/stencils/README.md`.

- [ ] **Step 1: Failing tests** (`tests/stencils.spec.js`):

```js
test('opening a set loads it once, search filters, clicking adds a recognised component (one undo step)', async ({ page }) => {
  await setup(page, []);
  await page.evaluate(() => document.getElementById('collapseStencils').classList.add('show'));
  await page.click('[data-stencil-set="aws"] .stencil-set-toggle');
  await expect(page.locator('[data-stencil-set="aws"] .stencil-item').first()).toBeVisible();
  await page.click('[data-stencil-set="aws"] .stencil-set-toggle'); await page.click('[data-stencil-set="aws"] .stencil-set-toggle');
  expect(await page.locator('script[src="vendor/stencils/aws.js"]').count()).toBe(1);
  const t0 = Date.now();
  await page.fill('[data-stencil-set="aws"] input[type="search"]', 'RDS');
  expect(Date.now() - t0).toBeLessThan(1000);
  const item = page.locator('[data-stencil-set="aws"] .stencil-item:visible').first();
  await item.click();
  const el = await page.evaluate(() => JSON.parse(JSON.stringify(app.state.elements[0])));
  expect(el.type).toBe('datastore');
  expect(el.stencil).toMatch(/^aws:/);
  expect(el.stencilTags).toContain('database');
  expect(el.stencilIcon).toMatch(/^data:image\/svg\+xml;base64,/);
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
  await page.waitForTimeout(300);
  expect(await page.evaluate(() => window.__xss)).toBeUndefined();
});

test('a set that fails to load says so, and View can hide a set from the palette', async ({ page }) => {
  await setup(page, []);
  await page.route('**/vendor/stencils/gcp.js', (r) => r.abort());
  await page.evaluate(() => document.getElementById('collapseStencils').classList.add('show'));
  await page.click('[data-stencil-set="gcp"] .stencil-set-toggle');
  await expect(page.locator('[data-stencil-set="gcp"]')).toContainText('Could not load');
  await page.click('#btn-main-menu'); await page.click('#btn-menu-view');
  await page.click('#btn-menu-stencil-gcp');
  await expect(page.locator('[data-stencil-set="gcp"]')).toBeHidden();
});
```

Add to `tests/xss.spec.js`'s poisoned model a node with `stencil: P('stencil')[1]` and an evil `stencilIcon`.

- [ ] **Step 2:** Run it and expect 3 failed. **Step 3:** Implement, then run `npm run sync`. **Step 4:** Run it and expect a PASS, plus `tests/xss.spec.js` and `tests/import.spec.js`.
- [ ] **Step 5: Docs.**
  - Help list: "**Cloud stencils:** official AWS, Azure, Microsoft Entra, Google Cloud, Oracle Cloud and Kubernetes icons in the palette (loaded when you open a set; search by name). A placed icon is a normal component (data store, process, …) so threat suggestions work; hide sets you don't use in ☰ → View."
  - The licence paragraph.
  - README canvas bullet: add "official cloud icons (AWS, Azure, Google Cloud, Oracle, Kubernetes)", with a link to `vendor/stencils/README.md`.
  - CHANGELOG `### Added`.
  - CLAUDE.md: note that 1z.nu must also copy `vendor/stencils/`, and how to rebuild a pack.
- [ ] **Step 6: Verify.** Run `npm run sync -- --check && npm run lint && npm test`; expect all green.
- [ ] **Step 7: Commit** "Cloud stencils in the palette; View → icon sets".
