# Changelog

The version shown in Help & License comes from `APP_VERSION` in `threat-tiger.html`. Exported JSON files record it as `appVersion`.
Finding IDs (SEC-001, BUG-002, …) refer to the November 2026 audit report.

## 1.9.1 — unreleased (branch `audit-fixes`)

### Changed
- The **Component Subtype Graphic Icon** dropdown lists icons with tailored threat suggestions first, in a group "With tailored threat suggestions", each labelled with what it unlocks (e.g. "Object storage bucket — object storage bucket threats"). Choosing one of these makes the matching threats appear under "Relevant for this …" in Threat Templates.

### Fixed
- Icon recognition matched look-alike names ("bi-windows" counted as a web app, "bi-braces-asterisk" as NoSQL); entries now match only the icon and its variants.
- Icons reused with different meanings per component type are recognised correctly (e.g. the CPU icon is an IoT device for external entities, a host for infrastructure; the archive icon is object storage for data stores; the globe-2 icon is a DNS server, not a web app). Several original icons that were not recognised (cache, queue, time-series and graph databases, admin shells, partner API clients, wearables) now are.

## 1.9.0 — unreleased (branch `audit-fixes`)

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

## 1.8.0 — unreleased (branch `audit-fixes`)

### Changed
- **All 58 built-in threat templates reworded** in plain, technically accurate language: each says what the attacker does, what it leads to, and typical controls. Component types, STRIDE categories and `[name]` placeholders are unchanged. Some were corrected (e.g. "TLS session resumption key leakage" is now "Recorded traffic can be decrypted later (no forward secrecy)").
- Unmodified copies of the old templates stored in a browser are replaced automatically; templates you edited are kept.
- **Help text rewritten**: what threat modeling is, what STRIDE's six categories mean in one sentence each, and how to use Threat Templates, security switches, the register and Insights together. The logo now scrolls with the help text instead of taking up a third of the dialog.

### Not changed
- No module split (ARCH-001): the app stays one editable file; tests and `npm run sync` cover the main maintenance risks.

## 1.7.0 — unreleased (branch `audit-fixes`, Stage 6 part 1)

### Security / deployment
- **Docker image rebuilt** (SEC-007): built from the local files instead of cloning GitHub at build time; base image `nginxinc/nginx-unprivileged:1.30.5-alpine` pinned by digest; runs as a non-root user with read-only content; no git in the image; `.dockerignore` sends only the app files; health check. `deploy/nginx.conf` adds security headers (CSP `frame-ancestors 'none'`, `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`, `Permissions-Policy`, `Cross-Origin-Opener-Policy`), hides dot-files and sets cache rules. Verified by building the image and running the browser test suite against the container. `dockerfile` renamed to `Dockerfile`.
- **Clear all data in this browser** (☰ menu) removes the model, History snapshots, template changes and preferences (SEC-006).
- The activity log states that it is a convenience history, not a tamper-proof audit trail (SEC-008).

### Documentation
- README rewritten for the current feature set, offline use, data/privacy notes, keyboard shortcuts, Docker and development workflow.
- Tests can target a running deployment: `PW_BASE_URL=http://127.0.0.1:8080 npm test`.

## 1.6.0 — unreleased (branch `audit-fixes`)

### Accessibility (UI-003)
- Every component, trust zone and data flow is a keyboard stop with a spoken name (e.g. "Data store: MsSQL, 2 threats", "Data flow HTTPS from Admin Client to Webfront").
- Keyboard: **Tab** moves between items, **Enter/Space** selects, **arrow keys** move the selection (Shift = 5× larger steps; a burst of key presses is one undo step), **Delete** removes, **Escape** deselects. Focus stays on the item when the canvas re-renders and is clearly outlined.
- Palette items and template cards can be activated with Enter/Space; icon-only buttons have accessible names; the canvas has a description of the keyboard controls for screen readers.

### Responsive layout (UI-008)
- Below 1100 px wide the Properties panel collapses automatically, below 760 px the palette too (they re-open when the window widens; your own toggles are respected otherwise).
- Header and register filters wrap on narrow screens, the canvas toolbar wraps, and the page never scrolls sideways (checked down to 390 px).
- Minimum zoom lowered from 40% to 15% so zoom-to-fit shows large diagrams on small screens.

## 1.5.2 — unreleased (branch `audit-fixes`)

### Changed
- **Trust zones are grabbed by their border or name label** (12 px band along the edge). Clicking or dragging inside a zone now reaches the canvas, so you can box-select the components inside it.

### Fixed
- Box selection selected every zone or swimlane the box touched; containers are now selected only when the box fully encloses them.
- Box selection used a default 240×80 box at a trust boundary line's start point instead of the line's real extent.

## 1.5.1 — unreleased (branch `audit-fixes`)

### Fixed
- **Typed text was lost when clicking the canvas.** Component and data-flow fields (name, notes, ports, text, etc.) save when the field loses focus, but a click on the canvas re-rendered the Properties panel before the browser moved focus, discarding the typed text — only Tab worked. Fields are now saved at the start of any click (and when the page is hidden or closed), and the click itself still selects what was clicked.

## 1.5.0 — unreleased (branch `audit-fixes`, Stage 5)

### Added
- **Trust-boundary detection** (FEAT-006): data flows that cross a trust zone edge or a (curved) trust boundary line are detected live and labelled "crosses boundary" on the canvas.
- **Rule-based threat suggestions** (FEAT-002): 17 rules (`THREAT_RULES` in `threat-tiger.html`) combine security switches (encrypted, authenticated, MFA, VPN, runs as admin, logging, PII, credentials, encryption at rest, audit logging, crown jewel) with boundary crossings. Matching threats appear under **"Triggered by this model"** in Threat Templates with the reason, suggested likelihood/impact and controls; add one (through the threat dialog) or **Add all** (one undoable step). Added threats remember their rule id, so they are not suggested twice.
- **Insights tab** (FEAT-004): summary tiles, open-risk heat map (likelihood × impact), all rule suggestions with Add / Add all, STRIDE coverage per component, data flows crossing boundaries, and model checks — every item links to the canvas.
- **Model checks** (FEAT-005): unconnected components, duplicate names, unnamed flows, threats linked to missing components, threats needing review, processes/data stores outside every trust zone.
- **Export Markdown report** (FEAT-008): summary, risk table, embedded Mermaid diagram (renders on GitHub/GitLab), threats grouped by component with descriptions and mitigations, data flows, components, and open findings.
- **Export JSON for git** (FEAT-009): deterministic output (sorted keys, whole-pixel coordinates, no activity log), so moving one component changes two lines in a diff. The normal export includes `appVersion`/`schemaVersion` and keeps the activity log.

## 1.4.0 — unreleased (branch `audit-fixes`)

### Changed
- The top-right buttons are now in a **hamburger menu** (Model: Import, Export, History · Reports & diagrams: Print report, Export Mermaid diagram · Help & License, Reset canvas).
- **Print report** moved from the canvas toolbar into the menu (same behaviour: prints the diagram and threat report).

### Added
- **Export Mermaid diagram** (`.mmd`): components with shapes by type, trust zones as subgraphs, data flows with labels, ports, encryption and threat counts; components with threats and crown jewels are highlighted. Verified to parse and render with Mermaid 11.4 and 11.17.
- **~100 more icons** for components and infrastructure nodes, grouped as Servers & compute, Code & development, Web & network, Infrastructure & cloud, Databases & storage, Security & identity, People & clients.

### Fixed
- **Selecting overlapping items**: invisible geometry no longer steals clicks — connection dots only respond on the hovered/selected component, data-flow label holders only respond on the visible label, badge holders only on the badge, and data-flow lines have a 14 px invisible click area. Measured on the demo: clicks along lines landing on something else went from 61 to 10 (the rest hit the line's own label).
- An infrastructure icon (`bi-cloud-arrow-right-fill`) that does not exist in Bootstrap Icons and rendered blank; existing models are mapped to `bi-cloud-arrow-up-fill`.

## 1.3.0 — unreleased (branch `audit-fixes`, Stage 4)

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

## 1.2.0 — unreleased (branch `audit-fixes`, Stage 3)

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

## 1.1.0 — unreleased (branch `audit-fixes`, Stage 2)

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
