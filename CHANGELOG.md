# Changelog

The version shown in Help & License comes from `APP_VERSION` in `threat-tiger.html`. Exported JSON files record it as `appVersion`.
Finding IDs (SEC-001, BUG-002, …) refer to the November 2026 audit report.

## Unreleased

## 1.15.1

Fixes from the November 2026 bug check, and the small issues the 1.15.0 reviews left open.

### Fixed
- **Icons from the icon sets:**
  - A placed icon drags like any other shape: press, move, release. Before, the browser's own image drag took over and the icon stuck to the pointer until the next click.
  - Icons can be dragged from the palette onto the canvas, and land where you drop them.
- **Zoom:** the zoom buttons and the mouse wheel zoom around the centre of the view instead of the canvas's top-left corner.
- **Privacy:** an imported image path starting with `//` or `/` is removed. A `//host/…` address used to load from another website without the "Load images from other websites?" question.
- **Threat templates backup:** the backup now keeps every field (ids, controls, references, ratings, conditions, your edits) and the built-ins you deleted, so restoring it in another browser gives back the same library. Before, it kept only category, title and description.
- **Pages:** shapes on an imported page that had no position (or the same position as another page) move with their page into its own area, so another page's trust zones no longer count them.
- **Data flows:**
  - Dragging a flow's end skips shapes on hidden layers and the flow's own other end, so it can no longer vanish or become a loop.
  - The Source and Destination lists in Properties show only shapes on the flow's page, without the other end.
  - A flow imported with only one bend value draws instead of disappearing.
- **Copy and paste:** Ctrl/Cmd+C and Ctrl/Cmd+V are left to the browser unless shapes are selected on the canvas and no text is, so you can copy text from the threat register, Insights and the report again.
- **Swimlanes:**
  - Dragging a swimlane leaves shapes on locked or hidden layers where they are.
  - An imported swimlane without columns or rows gets the default ones, with headers.
- **Flowchart shapes:**
  - Their suggestions cover all six STRIDE categories, like processes.
  - Properties lists their threats.
  - An imported fill or line colour that isn't a colour, or a line width that isn't a number, falls back to the shape's default instead of failing the whole import.
  - An unknown flowchart type becomes a flowchart process, so the format painter can't crash on it.
- **Threats:**
  - A `$` in a component name stays literal in suggested threat titles. `Pay $& Co` used to give "Spoofing of Pay [name] Co".
  - Undo on the "Deleted threat" message brings back that threat, even if you changed something else in the meantime.
  - The threat pop-up closes when its shape is deleted or the canvas is redrawn.
- **Renaming:** a shape whose imported id contains a quote mark can be renamed without an error.
- **Page tabs:** cancelling a page delete started from the rename box no longer leaves a stuck rename box.
- **PNG export:** a failed export brings back the grid and the selection. An image too large for the browser is reported instead of saving an empty file.
- **History:** restoring a damaged snapshot shows a message and keeps your model.
- **Clear all data:** also removes the hidden tabs, hidden icon sets, line jumps and minimap settings, and a pending save of the view can no longer write itself back.
- **Settings:** the grid size, snapping, view mode and theme settings still respond when the browser blocks storage.
- **Dev server** (`npm run serve`): refuses `.git` and `node_modules` at the top level too.
- **Attack paths:**
  - Parallel flows between the same two shapes no longer give duplicate rows. The path uses the weakest of the flows.
  - "More paths exist" now appears only when another path really exists past the limit of 200.
  - Disabling a flow on the highlighted path clears the highlight.
- **Pages:**
  - Shapes you add or paste stay on the page you are on, even far from the page's origin. Paste moves shapes by the exact distance between pages.
  - Opening an older file whose page-less shapes sit in another page's area puts them on that page.
  - Mermaid "Replace" leaves a single page. Mermaid "Add" on an empty page starts at that page's origin.
  - Opening, restoring or starting a different model forgets the remembered page views and the Back trail.
  - Zoom-to-fit on an empty page shows the page origin at 100% instead of zooming far in.
  - The page tabs work from the keyboard: one tab stop, arrow keys, Home and End, and F2 to rename. Pressing Enter after a rename now redraws the tab.
  - Drill-down ↗ badges are left out of PNG exports.
  - Page names are kept on one line, so a name with a line break can't break the Markdown report.
- **Layers:**
  - A swimlane layout never moves shapes on a locked layer.
  - Hidden shapes are left out of zoom-to-fit, PNG export and print.
  - Undo brings back the active layer, for example after deleting it. Switching layers on its own is still not an undo step.
  - Jumping from the threat register to a shape on a hidden layer says which layer is hidden.
  - The hide and lock buttons no longer announce a pressed state that contradicts their label.
  - A redraw while you rename a layer keeps the rename.
- **Align:**
  - When aligning moves shapes inside a swimlane, the lane's own adjustment is part of the same undo step.
  - A trust zone without a size aligns as 320 × 240, like the rest of the app.
  - The toolbar has one tab stop and works with the arrow keys, Home and End.
  - The toolbar stays above the canvas controls when they wrap onto more lines.
- **Format painter:**
  - Painting from a shape with the default look gives the target the default look.
  - Numbered steps are their own kind, so painting between a process and a step no longer records an empty undo step.
- **Line jumps:** hops bulge the same way whichever way a flow runs: up on horizontal flows, right on vertical ones.
- **Minimap:** the frame follows window and panel resizes.
- **View menu:** hiding every tab of a panel hides its content too, and showing a tab again brings it back.
- **Tests:** new tests cover:
  - the time to open and filter the Azure icon set;
  - the suggestion list for a placed cloud icon;
  - a PNG export with a cloud icon;
  - greyed disabled icons in every card style;
  - trust zones and swimlanes not being dragged while the painter is on.

## 1.15.0

Diagramming and attack-path release: pages, layers, attack paths, about 2,000 icons, and Visio-style editing tools.

### Added

- The canvas zoom and position (and each page's view) are remembered between reloads
- Pages: split a model over pages with tabs at the top-left of the canvas (add with +, double-click to rename; while renaming, the × in the tab corner deletes the page with its shapes after a confirmation; move the selection to another page); one threat register, one set of insights and attack paths for all pages; the register names each component's page and jumping to a component opens its page. A shape can link to a detail page (↗ badge, ◀ back). Each page is stored in its own area of the canvas, so older versions show the pages side by side. PNG and Mermaid export the current page; the Markdown report has a diagram per page
- Attack paths: Insights lists routes from entry points (external entities, and components outside every trust zone when zones exist) to crown jewels, shortest first and ranked by risk (unencrypted and unauthenticated hops, open threats on the way, shorter routes), with the reasons shown; pick a start or target; click a path to highlight it on the canvas. The Markdown report lists the top 10
- Icon sets in the palette under Data Nodes & Icons, loaded per set when opened, with search: Devices & security (201 Microsoft Fluent symbols: servers, racks, clients and devices, apps and web, cloud, data, security, incident response, code and DevOps), Security & DevOps brands (133 Simple Icons: pentest, incident response and SIEM, threat intel, network security, DevSecOps, identity, OS, code), Tech & OS logos (656 Devicon: Linux, Windows, Apple, languages, tools), AWS (303), Azure (643), Microsoft Entra (7), Google Cloud (252) and Kubernetes (39). On the canvas they show as the icon with the name underneath. A placed icon is a normal component of the right kind (database, secrets store, network device, CI/CD, threat actor…), so threat suggestions work; its icon is saved in the model and checked on import; Properties hide Type, the icon picker and Security Controls for them. Hide sets in ☰ → View. Icons stay under their owners' terms (`vendor/stencils/README.md`)
- ☰ menu → View: expands in place to show or hide the minimap, line jumps, each panel (left, right, bottom), in step with the panels' own handles, and each panel tab (remembered)
- Layers: add, rename, hide, lock and delete layers; new shapes go to the active layer; move the selection to a layer; hidden layers still count in the analysis
- Line jumps: where two flows cross, the later one hops over the other (☰ menu → View to switch off); flow Properties explain bend points and can clear them
- Format painter: copy a shape's colours, line width or font size onto other shapes of the same kind; double-click to paint several
- Minimap: an overview of the whole diagram in the canvas corner; click or drag to move the view. Hidden by default: turn it on from ☰ menu → View → Show minimap
- Align and distribute: with two or more shapes selected, a toolbar lines up their left/centre/right or top/middle/bottom edges, or spaces three or more evenly; one undo step
- Flowchart shape **Cube (3D box)** under Flowchart Diagram Items, next to the cylinder: shaded top and right faces, the label centred on the front face, anchors on the visible faces. It works with the Type dropdown and quick add, and exports to Mermaid as a rounded box

### Changed

- Swimlane colour themes are much softer: yellow, green, blue and red are now dim, low-saturation tints (the light versions have a pale title bar with dark text), and black is softer. All header text keeps at least 4.5:1 contrast

## 1.14.0

### Added
- Swimlanes: drag the border on the right of a column or below a row to resize it (snaps to 20 px, down to 100 px). The size you set is that cell's minimum: it still grows if its nodes need more room, and later cells and their nodes move along. Double-click a border to go back to the automatic size. Each resize is one undo step; manual sizes are saved in the model and checked on import.
- Swimlanes: colour themes. Pick one in the properties panel: default, yellow, green, blue, red, grey or black, each in a light and a strong variant. A chosen theme keeps its colours on the dark canvas, is saved in the model, shows in SVG/PNG exports, and is one undo step. Unknown themes in imported models fall back to the default.
- Type dropdown in the properties panel for components and flowchart shapes: switch between process, data store, external entity, infrastructure and the ten flowchart shapes. The shape changes in place; name, notes, centre position, flows and threats stay. Security switches the new type also has keep their value, the rest get the new type's defaults; a customised icon is kept between threat-modelling types. One undo step.
- Model checks: a threat whose STRIDE category does not usually apply to its component type (for example Spoofing on a data store, Elevation of Privilege on an external entity) is flagged (`MC-STRIDE-FIT`).
- Flowchart quick add: hover one of a flowchart node's connection points to see a faded preview of a new node and line in that direction; click to add them. The new node has the same type, size and colours, and moves aside if the spot is taken. Dragging from a connection point still draws a connection. One undo step.
- Import Mermaid flowcharts (menu → Import Mermaid flowchart…): paste the text or choose a `.mmd`/`.md` file. `flowchart`/`graph` in any direction (TD, LR, BT, RL); nodes become flowchart shapes (rectangle, rounded, stadium, diamond, hexagon, cylinder, circle, parallelogram, trapezoid, flag and the `@{ shape: … }` syntax), subgraphs (also nested) become trust zones, edge labels become flow names, dotted edges stay dashed and `<-->` stays two-way. The diagram is laid out automatically in layers, with every zone in its own band so zones never cover other nodes; loops enter from the side. If the model is not empty you are asked each time whether to add the diagram next to it or replace it; either way it is one undo step. The text is parsed, never run: labels become plain text, `click` actions, links and styling are ignored, and size limits apply (500 nodes, 2,000 connections, 100 subgraphs).

### Fixed
- Mitigations: pressing Delete while the mitigation editor was still opening did nothing (the confirmation never appeared); it now waits until the editor is open, then asks.
- Swimlanes: a dragged node is dropped into the cell under it, using the real column and row sizes (it used to land in the neighbouring cell once a cell had grown, so more than two nodes rarely fitted in one cell). The target cell is highlighted while dragging. Each cell grows to hold all its nodes with padding on every side, and nodes in later columns and rows move along with their cell. Deleting a column or row also removes its stored size.

### Changed
- Animations and transitions respect the system's "Reduce motion" setting
- ESLint (flat config, with the no-unsanitized rule) as a dev-only tool; CI runs `npm run lint`
- CI workflow: lint and the existing tests on every push
- SEC-DOM-2 review of all 25 `innerHTML` sinks in the app: none was exploitable (every model value is escaped with `esc()`, validated with `safeColor`/`safeIcon`/`sanitizeTemplate`, or a number); each now carries a `reviewed:` comment with the reason. Hardening: security switch labels only come from the app's own list (a `toString` key no longer shows a function's text), and a template's suggested likelihood/impact is escaped in its tooltip too
- XSS suite: a new test puts payloads in attribute, style and SVG contexts (colours, icons, font sizes, swimlane cells, switch keys, mitigations, templates) and checks that no element or attribute was injected, since the CSP alone would hide injected markup from the "never executes" tests

## 1.13.1

### Fixed
- The printed report no longer shows the main menu in the top-right corner: the menu closes before printing starts, and menus, notifications and dialogs are hidden on paper.

### Added
- The printed report includes **mitigations**: each threat lists its linked mitigations with status and owner ("Mitigations (1/2 done)"). A **Mitigations** section on its own page lists every mitigation with its status, owner, the threats it covers and its ticket link. The report also prints when a model has mitigations but no threats yet.

## 1.13.0

### Threat library: 244 → 601 threats
- **Baseline threats per component type** now appear in Insights from the model's structure, without any switches being set. New condition keys `type` (component type at a flow end) and `zoned` (inside a trust boundary or not), and `{}` meaning "any flow" (e.g. `inbound: {}`). Generic threats such as injection, secrets in code, over-privileged identities, unpatched hosts and flat networks now trigger where they apply. New baselines include shared static credentials between services, missing timeouts, rules enforced only in the client, direct writes to data stores by external entities, sensitive data leaving its zone, stored injection via flows into data stores, and unauthenticated service-to-service calls.
- **Every icon in the "Component Subtype Graphic Icon" lists now brings tailored threats** for that component type (only four decorative icons excepted). There are 27 new kinds of component, recognised from icon and name: configuration files, blockchain/ledger, removable media, local disks, packages and build artifacts, scheduled jobs, AI/ML compute, kiosks, workstations, application code, scripts, test/staging environments, integrations, monitoring, analytics/data warehouses, security controls, open/unencrypted components, biometrics, threat actors, bots, documents, health data, executables, social/chat platforms, CMS, online shops and QR codes.
- 100 threats now carry a real, publicly documented incident (26 new; see `docs/threat-templates.md`).
- OWASP Automated Threats (OAT), PCI DSS and HIPAA references link to their sources.

### Changed
- **Insights** lists threats recognised from the icon or name ("recognised as: …") as well as model-triggered ones, which come first. New **filters** by component, STRIDE category and reason; **Add N shown** adds only what the filters show. Lists over 150 rows are capped until **Show all**.
- The **icon picker** groups tailored icons per kind of component instead of one long list.
- Suggested names gained new entries for the new kinds; a few name icons changed so the icon and name agree (ETL pipeline, data warehouse, VPN gateway).
- The **Markdown report** lists model-triggered findings one by one and summarises the recognised ones per component.

### Fixed
- Deleting a mitigation from its editor occasionally left the confirmation dialog half-open; tab contents are now rendered before the tab fades in.

## 1.12.0

### Added — reusable mitigations (FEAT-003)
- **Mitigations tab**: each mitigation has a title, description, status (Proposed, In progress, Implemented, Verified, Not applicable), owner and ticket link, and can cover **many threats**; a threat can have several mitigations.
- **Threat dialog**: link existing mitigations (search by title/id), type a new one, or turn the template's **suggested controls** into mitigations with one click ("Add all as mitigations"); controls that match an existing mitigation reuse it instead of creating a duplicate. Saving is one undo step.
- **Register** shows coverage per threat ("1/2 done"); **Insights** shows "Mitigations done" and "Open threats without a mitigation"; new model checks: mitigation not linked to any threat, threat marked mitigated although none of its mitigations is implemented, and threat still open although all its mitigations are implemented.
- **Markdown report** lists all mitigations and the mitigations per threat; **CSV** gains a Mitigations column; JSON export (including the git variant) contains them. Imported mitigations are validated (status, http(s) ticket links only, duplicate ids renumbered, links to unknown mitigations removed).
- The free-text "Mitigation notes" field on a threat remains for details.

## 1.11.1

### Changed
- The CPU icon ("Artificial Intelligence Inference Model Pipeline" in the original list) no longer marks a process as an AI/LLM service; AI threats now come from the name (LLM, chatbot, RAG, AI…) or the AI icon (stars). The suggested name "Recommendation engine" uses a neutral icon.

## 1.11.0

### Threat library: 148 → 244 threats
- Filled every gap in **element type × STRIDE category**: each applicable combination now has at least 5 threats (a new test keeps it that way). Repudiation, previously 1–3 per type, now has 5–8.
- **More threats per recognised kind** of component and data flow, at least 3 each for almost all: container workloads, admin portals, mobile backends, legacy hosts, CDN, GraphQL, queues, email, file uploads, payments (including payee-detail fraud and chargeback evidence), external identity and payment providers, IoT devices, VPN, directory services, mail servers, caches, secrets stores, databases, buckets, and webhook, identity, email, remote-admin, database and messaging flows.
- One new verified example: Microsoft Teams (February 2020) outage from an expired certificate.
- Coverage table in `docs/threat-templates.md`.

## 1.10.1

### Changed
- **Insights → "Threats suggested by your model"** now behaves like the Threat Templates panel: added suggestions leave the list, each open suggestion has **Add** and **Ignore**, and a summary shows how many were added, ignored or marked not applicable.
- **Picking a suggested name also sets a matching icon** (e.g. "S3 bucket" → bucket, "Support agent" → headset, "Chatbot (LLM)" → AI icon), in the same undo step. Every suggested name has an icon, and each icon agrees with what the name is recognised as (checked by a test). Typing your own name leaves the icon unchanged.

## 1.10.0

### Threat suggestions
- **Added suggestions leave the list**; a note shows how many are already in the register.
- **Ignore** button on every suggestion: hides it for that component without a reason; hidden ones are listed under "Hidden" with **Show again**, and counted as "Ignored" in Insights and the Markdown report. "Not applicable…" (with a reason) remains for recorded decisions.
- **62 more threats (148 in total)**, mostly specific to what a component is recognised as: AI/LLM services and RAG stores (OWASP LLM Top 10 2025), payments (PCI DSS), GraphQL, web (CORS, open redirect, clickjacking, WebSocket hijacking, request smuggling), identity (OAuth/OIDC per RFC 9700, SAML, help-desk social engineering, consent phishing, Kerberoasting), CI/CD (OWASP CI/CD Top 10), mobile (OWASP Mobile Top 10 2024), IoT, Kubernetes (OWASP K8s Top 10), edge/VPN appliances, DNS, CDN, cloud keys and snapshots, queues, secrets stores, logs, search, file shares and email. New verified examples include tj-actions/changed-files 2025, CircleCI 2023, MGM Resorts 2023, Ivanti 2024, Citrix Bleed 2023 and the 2018 GitHub memcached DDoS.
- **New recognised subtypes** from icon and name: AI / LLM, payment, GraphQL, DNS, CDN, VPN; data flows are additionally recognised as identity, email or database traffic (also from well-known ports).
- References link to the OWASP LLM, Mobile, CI/CD and Kubernetes projects, RFCs and PCI DSS.

### Model checks (11 new)
- External entity connected directly to a data store (DFD rule), entity-to-entity and store-to-store flows, flows that loop back to their source, duplicate flows in the same direction, default names left in place, crown jewels without threats, threats marked mitigated without a mitigation description, threats without a description, data stores that are only written or only read, inconsistent sensitive-data switches, empty trust zones, and models with no trust boundaries at all.

### Component Label autosuggest
- Clicking the **Component Label** field shows a list of typical names for the selected item's type (process, data store, external entity, infrastructure, data flow, trust zone/line); typing filters the list (arrow keys + Enter, or click). Each name shows what the threat engine will recognise it as, so picking e.g. "S3 bucket" immediately brings bucket threats. Free text still works; a pick is one undo step.

### Fixed
- Name recognition: "Authentication service" is recognised as identity; a payment service is no longer tagged as a third party; "Oracle WebLogic" (an app server) is no longer taken for a database.

## 1.9.1 (branch `audit-fixes`)

### Changed
- The **Component Subtype Graphic Icon** dropdown lists icons with tailored threat suggestions first, in a group "With tailored threat suggestions", each labelled with what it unlocks (e.g. "Object storage bucket — object storage bucket threats"). Choosing one of these makes the matching threats appear under "Relevant for this …" in Threat Templates.

### Fixed
- Icon recognition matched look-alike names ("bi-windows" counted as a web app, "bi-braces-asterisk" as NoSQL); entries now match only the icon and its variants.
- Icons reused with different meanings per component type are recognised correctly (e.g. the CPU icon is an IoT device for external entities, a host for infrastructure; the archive icon is object storage for data stores; the globe-2 icon is a DNS server, not a web app). Several original icons that were not recognised (cache, queue, time-series and graph databases, admin shells, partner API clients, wearables) now are.

## 1.9.0 (branch `audit-fixes`)

### Threat library (rewritten from research)
- **86 concrete threats** (was 58) across processes, data stores, external entities, infrastructure and data flows. Each says what the attacker does and what it leads to, lists **typical controls**, cites **CWE / CAPEC / MITRE ATT&CK / OWASP** references (clickable), suggests likelihood × impact, and — where well documented — a **real incident** (e.g. Capital One 2019, Uber 2022, Optus 2022, MOVEit 2023, Storm-0558 2023, Okta 2023, Code Spaces 2014).
- Added threats that cause most real breaches and were missing: broken object-/function-level authorization (IDOR/BOLA/BFLA), mass assignment, token validation flaws, hard-coded secrets, sensitive data in logs, over-privileged service identities, public storage buckets, internet-exposed databases, ransomware deleting backups, MFA fatigue, credential stuffing, vendor access, cloud metadata credential theft, exposed management interfaces, lateral movement, webhook signature checks, TLS validation disabled, denial-of-wallet, and more.
- Removed or merged: duplicates (SQL / command injection twice), threats on the wrong element (XSS on external entities), obsolete ones (TLS renegotiation DoS), out-of-scope ones (BGP hijacking), and text without a concrete attack or control. Curation notes and sources: `docs/threat-templates.md`.

### Threat suggestions
- The 17 hard-coded rules are now **conditions inside the templates** (`when`), editable in JSON: security switches, boundary crossings, connected flows and their ends, subtypes, and `any`/`all`/`not`. 26 templates are triggered by the model; reasons are generated ("handles sensitive data; incoming flow "HTTPS" crosses "DMZ"").
- **Subtype recognition** from icon and name (API, web app, identity provider, CI/CD, S3/bucket, database, NoSQL, cache, queue, secrets, logs, administrator, partner system, mobile, IoT, cloud host, network device, …); the panel shows what a component was recognised as and ranks matching threats in a **"Relevant for this …"** section.
- **Not applicable with a reason**: decisions are stored on the component/flow (who, when, why), shown in a collapsible list with Restore, counted in Insights and listed in the Markdown report. Undoable.
- **Search** across titles, descriptions, controls and references; expandable controls and real-world example per card; references link to CWE, CAPEC, ATT&CK and OWASP.
- Threats created from a template carry the description, controls, example, references and reason; CSV export gains a References column; the Markdown report lists references per threat.
- Template editor keeps references, controls and conditions, and has fields for references and controls.
- **Built-in templates now update automatically** in browsers (matched by id) unless the user edited their copy; unmodified templates from 1.7/1.8 are replaced.

### Fixed
- Undo/redo no longer clears the selection when the selected component still exists.

## 1.8.0 (branch `audit-fixes`)

### Changed
- **All 58 built-in threat templates reworded** in plain, technically accurate language: each says what the attacker does, what it leads to, and typical controls. Component types, STRIDE categories and `[name]` placeholders are unchanged. Some were corrected (e.g. "TLS session resumption key leakage" is now "Recorded traffic can be decrypted later (no forward secrecy)").
- Unmodified copies of the old templates stored in a browser are replaced automatically; templates you edited are kept.
- **Help text rewritten**: what threat modeling is, what STRIDE's six categories mean in one sentence each, and how to use Threat Templates, security switches, the register and Insights together. The logo now scrolls with the help text instead of taking up a third of the dialog.

### Not changed
- No module split (ARCH-001): the app stays one editable file; tests and `npm run sync` cover the main maintenance risks.

## 1.7.0 (branch `audit-fixes`, Stage 6 part 1)

### Security / deployment
- **Docker image rebuilt** (SEC-007): built from the local files instead of cloning GitHub at build time; base image `nginxinc/nginx-unprivileged:1.30.5-alpine` pinned by digest; runs as a non-root user with read-only content; no git in the image; `.dockerignore` sends only the app files; health check. `deploy/nginx.conf` adds security headers (CSP `frame-ancestors 'none'`, `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`, `Permissions-Policy`, `Cross-Origin-Opener-Policy`), hides dot-files and sets cache rules. Verified by building the image and running the browser test suite against the container. `dockerfile` renamed to `Dockerfile`.
- **Clear all data in this browser** (☰ menu) removes the model, History snapshots, template changes and preferences (SEC-006).
- The activity log states that it is a convenience history, not a tamper-proof audit trail (SEC-008).

### Documentation
- README rewritten for the current feature set, offline use, data/privacy notes, keyboard shortcuts, Docker and development workflow.
- Tests can target a running deployment: `PW_BASE_URL=http://127.0.0.1:8080 npm test`.

## 1.6.0 (branch `audit-fixes`)

### Accessibility (UI-003)
- Every component, trust zone and data flow is a keyboard stop with a spoken name (e.g. "Data store: MsSQL, 2 threats", "Data flow HTTPS from Admin Client to Webfront").
- Keyboard: **Tab** moves between items, **Enter/Space** selects, **arrow keys** move the selection (Shift = 5× larger steps; a burst of key presses is one undo step), **Delete** removes, **Escape** deselects. Focus stays on the item when the canvas re-renders and is clearly outlined.
- Palette items and template cards can be activated with Enter/Space; icon-only buttons have accessible names; the canvas has a description of the keyboard controls for screen readers.

### Responsive layout (UI-008)
- Below 1100 px wide the Properties panel collapses automatically, below 760 px the palette too (they re-open when the window widens; your own toggles are respected otherwise).
- Header and register filters wrap on narrow screens, the canvas toolbar wraps, and the page never scrolls sideways (checked down to 390 px).
- Minimum zoom lowered from 40% to 15% so zoom-to-fit shows large diagrams on small screens.

## 1.5.2 (branch `audit-fixes`)

### Changed
- **Trust zones are grabbed by their border or name label** (12 px band along the edge). Clicking or dragging inside a zone now reaches the canvas, so you can box-select the components inside it.

### Fixed
- Box selection selected every zone or swimlane the box touched; containers are now selected only when the box fully encloses them.
- Box selection used a default 240×80 box at a trust boundary line's start point instead of the line's real extent.

## 1.5.1 (branch `audit-fixes`)

### Fixed
- **Typed text was lost when clicking the canvas.** Component and data-flow fields (name, notes, ports, text, etc.) save when the field loses focus, but a click on the canvas re-rendered the Properties panel before the browser moved focus, discarding the typed text — only Tab worked. Fields are now saved at the start of any click (and when the page is hidden or closed), and the click itself still selects what was clicked.

## 1.5.0 (branch `audit-fixes`, Stage 5)

### Added
- **Trust-boundary detection** (FEAT-006): data flows that cross a trust zone edge or a (curved) trust boundary line are detected live and labelled "crosses boundary" on the canvas.
- **Rule-based threat suggestions** (FEAT-002): 17 rules (`THREAT_RULES` in `threat-tiger.html`) combine security switches (encrypted, authenticated, MFA, VPN, runs as admin, logging, PII, credentials, encryption at rest, audit logging, crown jewel) with boundary crossings. Matching threats appear under **"Triggered by this model"** in Threat Templates with the reason, suggested likelihood/impact and controls; add one (through the threat dialog) or **Add all** (one undoable step). Added threats remember their rule id, so they are not suggested twice.
- **Insights tab** (FEAT-004): summary tiles, open-risk heat map (likelihood × impact), all rule suggestions with Add / Add all, STRIDE coverage per component, data flows crossing boundaries, and model checks — every item links to the canvas.
- **Model checks** (FEAT-005): unconnected components, duplicate names, unnamed flows, threats linked to missing components, threats needing review, processes/data stores outside every trust zone.
- **Export Markdown report** (FEAT-008): summary, risk table, embedded Mermaid diagram (renders on GitHub/GitLab), threats grouped by component with descriptions and mitigations, data flows, components, and open findings.
- **Export JSON for git** (FEAT-009): deterministic output (sorted keys, whole-pixel coordinates, no activity log), so moving one component changes two lines in a diff. The normal export includes `appVersion`/`schemaVersion` and keeps the activity log.

## 1.4.0 (branch `audit-fixes`)

### Changed
- The top-right buttons are now in a **hamburger menu** (Model: Import, Export, History · Reports & diagrams: Print report, Export Mermaid diagram · Help & License, Reset canvas).
- **Print report** moved from the canvas toolbar into the menu (same behaviour: prints the diagram and threat report).

### Added
- **Export Mermaid diagram** (`.mmd`): components with shapes by type, trust zones as subgraphs, data flows with labels, ports, encryption and threat counts; components with threats and crown jewels are highlighted. Verified to parse and render with Mermaid 11.4 and 11.17.
- **~100 more icons** for components and infrastructure nodes, grouped as Servers & compute, Code & development, Web & network, Infrastructure & cloud, Databases & storage, Security & identity, People & clients.

### Fixed
- **Selecting overlapping items**: invisible geometry no longer steals clicks — connection dots only respond on the hovered/selected component, data-flow label holders only respond on the visible label, badge holders only on the badge, and data-flow lines have a 14 px invisible click area. Measured on the demo: clicks along lines landing on something else went from 61 to 10 (the rest hit the line's own label).
- An infrastructure icon (`bi-cloud-arrow-right-fill`) that does not exist in Bootstrap Icons and rendered blank; existing models are mapped to `bi-cloud-arrow-up-fill`.

## 1.3.0 (branch `audit-fixes`, Stage 4)

### Security / offline
- Bootstrap 5.3.2, Bootstrap Icons 1.13.2 and Font Awesome 6.5.1 are bundled in `vendor/`; the app makes no requests to other hosts and works offline, including when opened directly as a file (SEC-004, ARCH-006).
- Content-Security-Policy blocks injected inline scripts (defence in depth on top of SEC-001). `npm run sync` keeps its script hash current.
- Vendored files are pinned in `vendor/checksums.json` and verified by `npm run sync -- --check` and the tests.
- Default threat templates are embedded in the page as a fallback when `threat_templates.json` cannot be fetched.

### Changed
- First visit shows Help as a dismissible welcome with "Open demo model" / "Start modeling"; no license acceptance gate (UI-001).
- Your name is set in a small dialog (click "You:" in the header) instead of a browser prompt, and remembered per browser (UI-002).
- All browser alert/confirm/prompt dialogs replaced with styled dialogs and notifications (UI-006).
- Plainer wording in the register, activity log and dialogs (UI-004); help text formatting fixed and image alt text added (UI-005).
- Help logo served as an 840 px WebP: 756 KB → 52 KB (PERF-006).

### Added
- Undo / redo for every model change (toolbar buttons, Ctrl/Cmd+Z, Ctrl/Cmd+Shift+Z, Ctrl+Y) (FEAT-001). Deleting a threat shows an Undo button.
- Clicking a threat in the register selects and centres its component on the canvas (FEAT-016).
- Register filters for STRIDE category and status, including "Not fully mitigated" and "Needs review" (UI-007).
- `npm run serve` — a small local web server (no dependencies).

## 1.2.0 (branch `audit-fixes`, Stage 3)

### Changed
- Broken threat records in loaded files are repaired instead of crashing: missing titles become "Untitled threat", unknown statuses become "Open / Unmitigated" (never mitigated), and repaired threats show a **Review** badge until edited and saved.
- Saving is batched (one write per burst of changes, flushed when the tab is hidden or closed) and the activity log adds one row instead of redrawing everything (PERF-001).
- The activity log shows the newest 200 entries with a "Show older entries" button and keeps at most 5,000 entries (PERF-003).
- Dragging redraws at most once per screen frame (PERF-004); register lookups use an index (PERF-005).
- Activity timestamps are stored in ISO 8601 (UTC) and shown in local time; older entries still display (BUG-014).

### Fixed
- Deleted or renamed built-in templates no longer reappear after reload (BUG-005).
- Register search matches component names, descriptions, mitigations, category, status and id (BUG-008).
- Theme, view and zoom changes no longer mark the model as unsaved or fill the activity log (BUG-012).
- Copy/paste includes data flows between the copied components, and repeated pastes are offset (BUG-013).
- Saving a threat without a title shows a validation message (BUG-015).

### Measured (500 components, 10,000 log entries)
- One logged action: 41 ms → 0.3 ms. Deleting 20 components: 928 ms → 72 ms. Page DOM nodes: 101,659 → 23,166.

## 1.1.0 (branch `audit-fixes`, Stage 2)

### Security
- All user-provided text (names, notes, titles, descriptions, participants, activity log, templates) is now escaped before display, so a shared model file can no longer run scripts (SEC-001).
- Icons, colours and image addresses from files are restricted to safe values (SEC-002).
- CSV cells that start with `=`, `+`, `-` or `@` are neutralised so spreadsheets do not run them as formulas (SEC-003).
- Importing a model that loads images from external websites now asks first (SEC-005).

### Fixed
- A broken or partial model file can no longer lock up the app; imports are checked and repaired, and an unreadable saved model is set aside with a download option (BUG-001, BUG-009, ARCH-002).
- CSV export no longer stops at the first `#`, and now includes likelihood, impact and mitigation (BUG-002).
- Deleting a component also deletes threats on its connected data flows (BUG-003).
- Threat suggestions only show templates for the selected component type (BUG-004).
- Saving failures (e.g. full browser storage) show a warning with an export button instead of failing silently; uploaded images are downscaled (BUG-006).
- Names containing `<`, `>` or `&` display correctly (BUG-007).
- Deleting components that have threats asks for confirmation (BUG-010).
- Risk score and severity are recomputed from likelihood × impact when loading (BUG-011).

### Added
- Version number in the header and in Help & License; exported JSON includes `appVersion` and `schemaVersion`.
- History: automatic local snapshots (kept in the browser, latest 25) with one-click restore (FEAT-018).
- Non-blocking notifications instead of browser alert boxes for import and export messages.
- Development-only test suite (`npm test`, Playwright with Microsoft Edge).

## 1.0.0
- Original release (baseline commit `f9acffe`).
