# Design: diagramming upgrades and attack paths (Threat Tiger 1.15 – 1.21)

Date: 2026-11-09. Status: draft for approval (builder check done; answers folded in).

## Why

Threat Tiger is good at the *threat* side (STRIDE register, 601-threat library, suggestions, boundary
analysis) but the *diagram* side still feels thinner than Visio or draw.io, which is what most users
come from. Larger models also lack a way to answer the question attackers ask: "how do I get from the
internet to the crown jewels?". This set of seven features closes both gaps:

| # | Feature | Theme |
|---|---------|-------|
| 11 | Align and distribute | Visio-style editing |
| 17 | Minimap and format painter | Visio-style editing |
| 15 | Connector line jumps (+ discoverable bend points) | Visio-style editing |
| 12 | Layers | Visio-style editing |
| 14 | Cloud stencil packs (AWS, Azure, GCP, Kubernetes) | Visio-style diagramming |
| 7 | Attack paths | Attack path modelling |
| 16 | Pages with drill-down | C4-style structure |

Success: a user coming from Visio finds the editing tools they reach for; a reviewer can see and
rank routes from entry points to crown jewels; big systems can be split over several pages without
splitting the threat model.

## How it ships (decided by the user)

- **One feature at a time**, in the order of the table above (cheapest first, pages last because it
  touches everything). Each one is built, tested (Playwright), documented (CHANGELOG, README, Help
  modal where relevant) and committed separately on `main`.
- **No push and no version bump without the user's say-so.** When asked, each shipped feature can
  become its own minor version (1.15.0, 1.16.0, …).
- Project rules apply throughout: single file `threat-tiger.html`, vendored assets only, `npm run
  sync` after every inline-script edit, imported data is untrusted (sanitise in `normalizeElement` /
  `normalizeFlow`, extend `tests/xss.spec.js` for every new text field), no new `innerHTML` sink
  without a reviewed `eslint-disable` comment, every new model field round-trips through JSON export
  and import, every user action is one undo step (`logEvent`).

## Goals, non-goals, anti-goals

Goals: the seven features below, each usable on its own.

Benchmarks: "the 500-node model" means the existing chain in `tests/perf.spec.js`; the dense
attack-path model is new (see 7).

Non-goals (this round): automatic orthogonal routing around nodes; attack trees; per-page threat
registers; flows between pages; collaborative editing; `.vsdx` / draw.io export.

Anti-goals (would count as failure even if it works):
- Any network request at runtime (stencils must load from the app's own folder, also on `file://`).
- Hidden or locked layers, or another page, silently changing the threat analysis.
- A model saved by the new version that the old import path corrupts silently (new fields must be
  ignored safely by older versions, which they are because unknown fields are copied through).
- A noticeably slower canvas on the 500-node test model (`tests/perf.spec.js`).

## Feature designs

### 11. Align and distribute

- A small floating toolbar appears above the canvas toolbar when **2 or more nodes** are selected
  (nodes only: flows, boundary lines and swimlanes are ignored; trust zones count as nodes).
- Buttons: align left / centre / right, top / middle / bottom; distribute horizontally / vertically
  (needs 3+; equal gaps between bounding boxes, outermost nodes stay put).
- Keyboard: none in this round *(builder's call if a natural shortcut exists)*.
- One undo step per click. Locked layers (feature 12) are respected once that exists.

### 17. Minimap and format painter

**Minimap** *(placement is my call)*: a small overview (about 200×140 px) in the bottom-right corner of
the canvas, toggled from the canvas toolbar, remembered in `localStorage`. It draws simplified
rectangles for nodes and zones plus a viewport rectangle; click or drag in it to pan. Hidden when the
model is empty. Respects hidden layers and the current page.

**Format painter** (user decided: look only): a toolbar button, enabled when one node is selected.
It copies only appearance: fill and stroke colours, stroke width, font size, icon colour, and for
flowchart shapes `fcFillColor` / `fcStrokeColor` / `fcStrokeWidth`. Never name, type, size, security
switches, notes or threats. Single click applies once to the next clicked node; double-click keeps it
active until Esc or clicking the button again *(my call, mirrors Office)*. Painting only between
compatible kinds (a flowchart colour onto a flowchart node, a process icon colour onto any node with
an icon); incompatible properties are skipped silently. One undo step per paint.

### 15. Connectors

Already present: flows store `points`; clicking a selected flow line adds a bend point, dragging moves
it, clicking it without dragging removes it.

New:
- **Line jumps** (user decided): where two flow lines cross, the line drawn later gets a small
  semicircular hop (radius about 6 px) at the crossing. Computed for straight and sharp-polyline flows
  exactly; for smooth (spline) flows, by sampling the curve into a polyline *(builder's call on sample
  density; must stay fast on the 500-node model and the dense attack-path model; a canvas-wide toggle
  to switch jumps off is fine)*. Jumps are visual only and appear in PNG export.
- **Discoverability** *(my call)*: a hint in the flow's Properties panel ("Click the line to add a bend
  point; click a point to remove it") and a "Clear bend points" button there.

### 12. Layers

User decided: user-defined layers, Visio-style.

- Model: `state.layers = [{ id, name, visible, locked }]`, default one layer `{ id: 'main', name:
  'Main' }`. Every element and flow gets `layerId` (missing or unknown → `'main'`). Order of the list
  is the order in the panel only; it does not change drawing order (z-order stays as today).
- UI: a Layers panel (collapsible section in the left palette column *(my call)*): add, rename,
  delete (elements move to Main; Main cannot be deleted), show/hide, lock, and "move selection to
  layer". New elements go to the *active* layer (the highlighted row).
- **Hidden** layers are not drawn and are not selectable, but **still count** in threat analysis,
  suggestions, model checks, insights and attack paths (my guess, the user did not object: hiding is
  about the view, not the model). The register shows threats on hidden elements as usual.
- **Locked** layers are drawn but cannot be selected, moved, resized or deleted from the canvas.
- PNG export and print use what is visible. JSON export always includes everything.
- Sanitising: layer names are text (escape), ids validated, max 50 layers.

### 14. Cloud stencil packs

User decided: the official AWS, Azure, GCP and Kubernetes icons, vendored.

- **Files**: `vendor/stencils/<pack>.js`, one per pack, each a plain script that registers an object
  of `{ id, name, category, svg, type, subtype }` entries on a global (for example
  `window.TT_STENCILS.aws = [...]`). A script file (not JSON via `fetch`) because `fetch` fails on
  `file://`, while `<script src>` works and the CSP already allows `script-src 'self'`. Each file is
  listed in `vendor/checksums.json` and verified by `npm run sync`.
- **Loading**: on demand, when the user opens a pack in the palette (keeps start-up fast).
- **Subset**: the most-used services per cloud, roughly 60–120 icons per pack *(the exact list is
  the builder's call; aim for compute, storage, databases, networking, identity, security, messaging,
  monitoring, containers, serverless)*. Keep each file under about 400 KB.
- **Rendering**: an icon is drawn as `<image href="data:image/svg+xml,…">`. SVG used as an image cannot
  run scripts, and data URLs keep PNG export working (external `href`s are dropped when the SVG is
  rasterised). The SVG text is still validated when the pack is built (no `<script>`, no `on*`
  attributes, no external references).
- **Model**: a stencil node is a normal component with `stencil: '<pack>:<id>'`, and a `type`
  (process / datastore / interactor / infrastructure) plus `subtype` from the pack mapping, so threat
  suggestions work (for example AWS RDS → datastore, subtype database; API Gateway → process, subtype
  api). The user can change the type afterwards with the Type dropdown. An imported model whose
  `stencil` id is unknown falls back to the plain icon for its type (validated against the loaded
  pack; never used as a URL).
- **Palette**: a "Cloud stencils" section with the four packs, a search box, and categories.
- **Licences and download** (user decided: vendor them anyway, accepting that redistribution rights
  in a public MIT repo are not clearly granted by AWS, Microsoft and Google): icons are downloaded
  once, from the vendors' official icon pages, into the repo; each download is confirmed with the
  user at build time (file, source, size). The icons are **not** covered by the repo's MIT licence:
  `vendor/stencils/README.md` names each pack's source, version and terms, and the Help & License
  modal says so (AWS Architecture Icons, Microsoft Azure architecture icons, Google Cloud icons: use
  in architecture diagrams per their terms; Kubernetes icons: Apache-2.0). Icons are not modified
  beyond minification. 1z.nu must copy `vendor/stencils/` too (add to its update notes).

### 7. Attack paths

User decided: automatic start and end points with manual override; ranking by weak flows, open
threats and short paths.

- **Graph**: nodes are components (process, datastore, interactor, infrastructure, stencil and
  flowchart nodes); edges are flows in their direction (bidirectional flows both ways; disabled flows
  ignored). Trust zones, swimlanes and text are not nodes.
- **Entry points (auto)**: external entities (`interactor`), plus, *only when the model has at least
  one trust zone*, any component outside every zone (my call, from the builder check: without zones
  everything would be an entry). **Targets (auto)**: crown jewels (`secProps.isCrownJewel === 'true'`).
  A component is never both start and end of a path: zero-hop paths do not count, and a crown jewel
  is not an entry point even if it sits outside every zone.
- **Manual override**: in the Attack paths view the user can set one start and/or one target from
  dropdowns (or the node's context in Properties: "Attack path from here / to here" *(my call)*).
- **Paths** (my call, from the builder check): simple paths from any entry to any target, found
  shortest first (by hops), up to a hop limit (default 8), stopping after 200 paths; those are then
  ranked by score. When the search stopped early the list says "more paths exist; showing the 200
  shortest". So the top of the list is the top of the shortest 200, not a guaranteed global top 200.
  Must stay under about 200 ms on a **new dense test model** (about 150 nodes, 600 flows, several
  entries and crown jewels) as well as on the existing 500-node chain (`tests/perf.spec.js`).
- **Score** (higher = more dangerous; user chose these three):
  - each hop over a flow that is **not encrypted** adds 2, **not authenticated** adds 2;
  - each **open threat** on a component or flow on the path adds its likelihood × impact / 5; the app's
    statuses are "Open / Unmitigated" (counts fully), "Partially mitigated" (counts half, my call) and
    "Mitigated / Resolved" (does not count);
  - **shortness**: a path with fewer hops scores higher (for example + (8 − hops) × 1.5).
  Exact weights are the builder's call; they must be shown in the UI ("why this score") so the
  ranking is explainable, and documented in the Help modal.
- **UI**: a new **Attack paths** card in the Insights tab: the ranked list (start → … → target,
  score, the reasons), filters for start and target. Clicking a path highlights its nodes and flows
  on the canvas (other elements dimmed) until cleared. "Highlight" is a view state, never saved.
- **Export**: the Markdown report gets an "Attack paths" section with the top 10. *(my call)*
- Hidden layers count (see 12). Pages: paths follow flows, and flows stay within one page, so a path
  is within one page (see 16).

### 16. Pages with drill-down

User decided: one model over many pages, one threat register and one insights view; a node can link
to the page that details it.

- **Model**: `state.pages = [{ id, name }]`, default `{ id: 'p1', name: 'Page 1' }`. Every element
  gets `pageId` (missing or unknown → first page). Flows belong to the page of their ends.
- **Flows stay within one page** (my call, the user said continue): a flow cannot connect nodes on
  different pages. Pages relate only through drill-down links. Moving a node to another page moves
  its flows only if both ends move; otherwise the user is warned and the move is cancelled
  *(builder may instead offer to delete the crossing flows, with confirmation)*.
- **Drill-down**: any node may have `linkedPageId`. It shows a small "open page" badge; double-click
  or the badge opens that page. Properties shows a page picker. A breadcrumb above the canvas shows
  the trail (Page 1 › Payments service).
- **UI**: page tabs along the bottom of the canvas (add, rename, delete with confirmation, reorder by
  drag *(builder's call if reordering is cheap)*). Undo history is model-wide.
- **Analysis**: threat register, suggestions, model checks and insights cover all pages; each threat
  row and suggestion shows which page its component is on, and clicking it switches page. Trust
  boundary detection is per page (geometry only means something on one canvas).
- **Exports**: PNG = current page. Print report and Markdown = all pages, one diagram per page.
  Mermaid export = current page. JSON = everything.
- **Layers and pages are independent**: layers apply across all pages *(my call)*.
- **Separate coordinate areas** (user decided): each page is stored in its own far-apart area of the
  canvas coordinates (for example page *n* is offset by *n* × 100 000 px horizontally; builder's call
  on the exact offset, it must exceed any realistic diagram width). The new version subtracts the
  offset when showing a page, so users never see it. An older version, or a stale hosted copy,
  therefore shows the pages side by side instead of stacked, and its geometric trust-boundary
  detection never mixes pages. Moving a node to another page shifts its stored coordinates by the
  difference. Zone membership, minimap, zoom-to-fit and exports work in page-local coordinates.

## Testing

Each feature adds a Playwright spec (`tests/<feature>.spec.js`) covering its behaviour, undo, JSON
round-trip, sanitised import of hostile values for any new field (and `tests/xss.spec.js`
extended), and dark canvas where colours are involved. The full suite and `npm run lint` must pass
before each commit. Performance: the existing perf suite plus one new check for line jumps and
attack paths on the 500-node model.

## Left to the builder

Exact icons in each stencil pack; score weights for attack paths (within the stated rules); visual
details of the minimap, layer panel and page tabs (follow the existing Bootstrap look, light and
dark); keyboard shortcuts; algorithm choices, provided the performance limits hold.
