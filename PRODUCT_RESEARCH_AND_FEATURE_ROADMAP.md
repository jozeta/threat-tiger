# Product Research & Feature Discovery Report

**Product:** Threat Tiger 1.15.2 · **Focus of this round:** diagramming capabilities · **Research date:** 11 November 2026
**Not committed** (kept local, per the feature-research procedure).

Scope note: Threat Tiger is a small, single-developer, single-file, offline-first app. Research is kept in proportion:
about 15 products, with official docs opened where it mattered and user feedback where it could be found. Every
claim about a competitor says whether the source was opened or only seen in search results (section 15).

---

## 1. Executive Summary

Threat Tiger already matches the "drawing" half of mainstream diagram tools far better than other threat-modelling
tools do (pages, layers, align/distribute, format painter, minimap, line jumps, ~2,000 cloud icons, swimlanes,
flowchart quick-add, Mermaid import). The gap to Visio/draw.io/Whimsical is now in **basic editing ergonomics**
(no right-click menu, no select-all, duplicate, group, z-order, find, clone-and-connect shortcut, smart guides,
auto-layout or elbow connectors) and in **migration paths** (it cannot open the files people already have:
Microsoft TMT `.tm7` and draw.io).

The bigger opportunity is the half no general diagram tool has: the diagram *knows* it is a threat model. The best
differentiators make the canvas show and use that knowledge:

1. **Lenses**: recolour the canvas by risk, STRIDE gaps, encryption/authentication, mitigation status (Visio's
   "colour by value" idea, applied to security data). Refines the earlier "risk heat map filter" suggestion.
2. **Scenarios (flow stories)**: numbered walkthroughs over existing flows ("user logs in", "admin exports data"),
   played step by step with highlighting, threats attached per step, exported as a Mermaid sequence diagram
   (IcePanel Flows, applied to STRIDE-per-interaction).
3. **Security-control shapes with effect**: a WAF, firewall or IdP placed on a path changes attack-path scores and
   suggestion coverage (ThreatModeler's idea, done transparently).
4. **Annotated diagram export**: threat markers drawn on the diagram itself, keyed to the register (Shostack:
   don't make readers look away from the diagram).
5. **Out-of-scope elements and a review mode**: both exist in Microsoft TMT / Threat Dragon or are requested there.

Recommended first batch (all low effort, high everyday value): out-of-scope elements, canvas essentials
(context menu, Ctrl+A/D, group, z-order, find, Alt+arrow clone-and-connect, shortcut sheet), review mode,
title block + legend. Then lenses and scenarios.

## 2. Existing Product Analysis

Verified in `threat-tiger.html` (13,557 lines), README and CHANGELOG on 11 November 2026.

**Diagramming that exists (do not re-suggest):** pages with drill-down links and Back; layers (hide/lock, active
layer); align and distribute; format painter; minimap; line jumps; bend points/waypoints (click line to add);
"smooth" or "sharp" flow curves; dashed and bi-directional flows; icon sets (AWS, Azure, Entra, GCP, Kubernetes,
Fluent, Simple Icons, Devicon) with palette search; flowchart shapes incl. cube; swimlanes with resizable cells and
colour themes; flowchart quick-add from connection points; node type switching; isometric views; light/dark canvas;
marquee selection; arrow-key nudging; copy/paste with flows; undo/redo; History snapshots; Mermaid flowchart import
with an automatic layered layout (zones as bands); PNG/print/Markdown/CSV/JSON/Mermaid export; attack paths with
canvas highlight; threat-count "bug" badge and crown-jewel badge on shapes; trust-boundary crossing detection;
flows can be disabled (`isDisabled`, excluded from attack paths).

**Verified absent (grep of the app, 11 Nov 2026):**

| Capability | Evidence |
|---|---|
| Right-click context menu | `contextmenu` only calls `preventDefault()` (line ~7637) |
| Select all, duplicate, group/ungroup, bring to front/send to back | Global key handler (~line 8035) handles only Z/Y/Delete/C/V; `zIndex` is only an import-validated field |
| Find on canvas | no canvas search; only palette icon search |
| Keyboard shortcut overview | none (README has a small table) |
| Clone-and-connect by keyboard | quick-add is mouse-only, flowchart shapes only |
| Smart guides / snap to other shapes | only grid snapping |
| Orthogonal (elbow) connectors / auto-routing | curve options are `smooth` and `sharp` |
| Auto-layout of an existing diagram | layout code exists only inside the Mermaid importer |
| Per-element "out of scope" | no such field; only whole flows can be disabled |
| Locked/review mode | layers can be locked, not the whole layout |
| Reusable component/pattern library | threat templates exist; component templates do not |
| Title block, legend | none (session metadata exists: scope, owner, etc., shown in the summary) |
| Tags | none (layers are the only grouping) |
| Import of `.tm7`, `.drawio`, Mermaid `architecture-beta` | none |
| SVG export | none (previously suggested) |

**Strengths:** privacy-by-design, no install, large curated threat library tied to the model, attack paths,
unusually complete drawing toolset for a threat-modelling tool, strong a11y/XSS test culture.
**Limitations:** one 13.5k-line file (every feature raises merge and CSP-hash cost), browser storage only, no
collaboration, editing ergonomics behind draw.io/Visio, no way in from other tools except Mermaid.

## 3. Market and Competitive Landscape

| Product | Type | Relevance to this round |
|---|---|---|
| Microsoft Visio | commercial desktop/web diagramming | data graphics (colour by value, icon sets, callouts), containers |
| draw.io / diagrams.net | free diagramming | tags, layouts, layout containers, clone-and-connect, waypoints; de-facto file format |
| Lucidchart | SaaS diagramming | conditional formatting, data linking (docs pages 404'd; not verified) |
| Figma / FigJam | design / whiteboard | components and instances |
| Miro | whiteboard | connector complaints, mind maps |
| Excalidraw (+) | open-source whiteboard | frames as slides, laser pointer, sketch aesthetic |
| tldraw | canvas SDK/whiteboard | elbow arrows, shape snapping, frames |
| Whimsical | flowcharts/mind maps | quick-add, Alt+arrow, one-click auto-layout |
| XMind / MindMeister | mind maps | outline view, relationships, boundaries |
| Mermaid / PlantUML / Structurizr | diagrams as code | architecture-beta, C4, model-vs-views |
| IcePanel | C4 modelling | Flows: step-by-step stories over a diagram |
| OWASP Threat Dragon | open-source threat modelling | out-of-scope, red open-threat highlight, user requests |
| Microsoft Threat Modeling Tool | free Windows threat modelling | out-of-scope, messages, interaction focus, `.tm7` |
| IriusRisk / SD Elements | commercial threat modelling | draw.io-based editors, import of TMT/draw.io/Visio |
| ThreatModeler | commercial threat modelling | security controls as components, nested models |
| Threagile | threat models as YAML | diagrams generated from code |

## 4. Competitor Feature Comparison

✓ = has it (verified in docs I opened unless marked *), ~ = partial, – = not that I found, ? = not verified.

| Feature | Threat Tiger | draw.io | Visio | Whimsical | Threat Dragon | MS TMT | IcePanel |
|---|---|---|---|---|---|---|---|
| Pages/tabs | ✓ | ✓* | ✓* | ? | ✓* | ✓ | ✓* |
| Layers | ✓ | ✓ | ✓* | – | – | – | – |
| Tags with filter | – | ✓ | – | – | – | – | ✓ (pinned tags) |
| Colour by data | ~ (badges only) | ~* | ✓ | – | ~ (red when open threats) | ~ (priority colours) | ✓ (tags) |
| Auto-layout | – (Mermaid import only) | ✓ | ✓* | ✓ | – | – | ? |
| Clone-and-connect key | – | ✓ | ? | ✓ | – | – | – |
| Elbow/orthogonal connectors | – | ✓* | ✓* | ✓* | – | – | ? |
| Right-click add/menu | – | ✓* | ✓* | ? | ? | ✓ | ? |
| Out of scope with reason | – | n/a | n/a | n/a | ✓ | ✓ | n/a |
| Step-by-step flows/scenarios | ~ (numbered steps shape) | – | – | – | – | – | ✓ |
| Reusable component templates | – | ✓* (custom libraries) | ✓* (stencils) | ? | ✓ (v2.6, GitHub) | ✓ (templates) | ✓* |
| Import other tools' files | Mermaid | many* | many* | ? | ? | – | ? |
| Threat suggestions from diagram | ✓ | – | – | – | ✓ | ✓ | – |
| Attack paths | ✓ | – | – | – | – | – | – |
| Offline, no account | ✓ | ✓ | ✓ | – | ✓ (desktop) | ✓ (Windows) | – |

## 5. User Feedback and Market Gaps

- **Accidental layout changes during review.** Threat Dragon #1892 (opened): overlapping elements must be moved to
  reach what lies underneath, which breaks the layout; asks for a "Threat Review Mode" with fixed layout and editable
  threats, and for selecting a flow anywhere along its line.
- **Re-creating the same components in every model.** Threat Dragon #1305 (opened): API gateways, credential stores
  and message buses rebuilt per model; asks for model, component and threat templates. Implemented in TD 2.6 via
  GitHub storage, i.e. not offline.
- **Connectors are where time goes.** Miro idea "Autorouting of connectors" (opened): users spend "a large share of
  their time manually arranging connectors", want auto-routing, line jumps (Threat Tiger has these), fewest
  waypoints. r/drawio "Struggling with connectors" (search result only) is similar.
- **Diagram clarity.** Shostack, "Diagram style" (opened): avoid off-diagram reference IDs, label the unusual
  (e.g. the unencrypted flows), left-to-right layout, few crossings, only flows cross boundaries. "Clarity in
  diagrams" (opened): put diagram type, level, date, version and approval status in a title block.
- **Tool friction and lock-in.** MS TMT is Windows-only, commercial tools cost thousands per user (search result
  summaries of guptadeepak.com and dzone); draw.io is used for threat modelling precisely because it is familiar,
  but it has "no semantic checks" and no threat enumeration (michenriksen/drawio-threatmodeling write-up, opened).
  Commercial tools answer this with import: SD Elements imports TM7 and draw.io (opened), IriusRisk imports draw.io
  and Visio (search results).
- **Whiteboards still win for thinking together** (Shostack, "Diagrams in threat modeling", opened). An offline
  single-user app cannot win on collaboration; it can win on making the result clear and reviewable.

## 6. Feature Gap Analysis

1. **Editing ergonomics** (context menu, select all, duplicate, group, z-order, find, shortcut sheet, keyboard
   clone-and-connect, smart guides) are table stakes in every general tool and absent here.
2. **Layout help** (auto-layout, elbow routing) is the most-complained-about area in general tools; Threat Tiger
   already has a layered layout engine in the Mermaid importer that could be reused.
3. **Scoping and review states** (out of scope, locked review) exist in the two best-known free threat-modelling
   tools and are missing.
4. **Way in**: only Mermaid flowcharts import. The largest installed base of threat models is `.tm7` and `.drawio`.
5. **The canvas under-uses the security data** it holds: one red badge per shape. Risk, STRIDE gaps, encryption and
   mitigation status could all be visible at a glance.

## 7. Recommended New Features

Complexity: low / medium / high / very high. "Prev." = suggested in an earlier round and still open.

### 7.1 Out-of-scope elements (quick win, low)
Per component and flow: "Out of scope" switch + reason (both MS TMT and Threat Dragon have exactly this). Drawn
dashed and faded; excluded from suggestions, model checks and attack paths (reuse the `isDisabled` path for
flows); listed with reason in the Markdown/print report so scoping decisions are auditable. Import validation and
XSS test for the reason field.

### 7.2 Canvas essentials (quick win, low–medium)
Right-click menu (add shape here, duplicate, delete, bring to front/send to back, move to layer/page, out of
scope, group); Ctrl/Cmd+A, Ctrl/Cmd+D; group/ungroup (a lightweight group id: select one, select all);
z-order using the existing `zIndex` field; Ctrl/Cmd+F to find components, flows and threats across pages and jump
to them; Alt+arrow to clone-and-connect the selected component in that direction (draw.io, Whimsical); "?" opens a
shortcut sheet. Keyboard-accessible by design, which also helps the a11y suite.

### 7.3 Review mode (quick win, low) – relates to prev. "review workflow"
A header toggle that freezes geometry (no moving, resizing, bending, adding, deleting) while Properties, threats
and mitigations stay editable; overlapping items reachable via Tab/Find instead of moving them. Answers Threat
Dragon #1892 directly. A natural first step of the earlier review-workflow idea (reviewer sign-off can build on it).

### 7.4 Title block and legend (quick win, low)
An optional canvas/print block with model name, diagram type (context / level 1 / level 2, design / as-built),
version, date, author, review status, taken from session metadata (Shostack, "Clarity"). An automatic legend of
the shape kinds, line styles and colours actually used, and of the active lens (7.5). Included in PNG and print.

### 7.5 Lenses: colour the canvas by security data (differentiator, medium) – refines prev. "risk heat map filter"
A lens switcher on the canvas toolbar: **Risk** (highest open score per element), **STRIDE gaps** (categories
without a threat or N/A decision), **Transport** (flows: encrypted / authenticated / neither), **Mitigation
status**, **Untriaged suggestions**, **Trust level**. Non-matching items dim; a legend explains the colours.
Visio's "colour by value" and icon sets (opened) are the model; Threat Dragon's red open-threat highlight is the
minimal version. Render as an overlay class so the user's own colours are untouched and PNG/print can include it.

### 7.6 Scenarios: step-by-step flow stories (differentiator, medium–high)
A scenario is an ordered list of steps that reference existing flows (message) or components (action), with
optional alternate/parallel branches, like IcePanel Flows (opened). Play it with Next/Back or arrow keys: the
canvas highlights the active step, shows that step's threats and the boundary crossings. Attach threats to a
scenario step (STRIDE-per-interaction), list scenarios in the report, and export a scenario as a Mermaid
`sequenceDiagram`. A **present mode** (Excalidraw+ frames-as-slides, opened) walks pages, attack paths and
scenarios full-screen, which serves threat-model review meetings.

### 7.7 Reusable component and pattern library (core improvement, medium)
Save a selection (components, flows between them, security switches, icons, threats, mitigations) as a named
pattern ("API gateway + IdP", "K8s ingress"); insert it with fresh ids and remapped flow references (the approach
Threat Dragon took, opened). Stored in localStorage, exportable/importable as JSON (validated like models). Ships
with a few built-in patterns. Offline, unlike Threat Dragon's GitHub-backed version.

### 7.8 Auto-layout of a selection or page (core improvement, medium)
"Tidy left-to-right / top-to-bottom" for a selection or page, reusing the Mermaid importer's layered layout,
keeping each trust zone as a band and its members inside it; one undo step; respects locked layers. Whimsical's
one-click layout and draw.io's flow/tree layouts (both opened) are the reference; Shostack's left-to-right,
few-crossings advice is the goal.

### 7.9 Import Microsoft TMT `.tm7` and draw.io `.drawio` (major feature, medium–high)
`.tm7` is XML: map processes, external interactors, data stores, flows, boundaries and (where present) threat
states; `.drawio` is XML, optionally deflate-compressed (browser `DecompressionStream`, no new library). Use the
threat-modelling shape library conventions (e.g. michenriksen's) where present, else treat shapes as flowchart
shapes. Parse with DOMParser, never render raw; same size limits and warnings as the Mermaid importer. SD Elements
and IriusRisk offering exactly these imports (opened / search) shows it is how commercial tools win migrations;
for a free offline tool it opens the door to Windows-only TMT users. Pairs with prev. "draw.io export".

### 7.10 Security-control shapes that act on the model (differentiator, high)
A small set of control kinds (WAF, firewall/security group, API gateway, IdP/SSO, DLP, HSM/KMS) that, when placed
on a flow path or in front of a zone, (a) lower the per-hop risk in attack paths with a visible reason
("passes WAF") and (b) mark the matching template suggestions as "addressed by control X" instead of hiding them.
ThreatModeler does this with opaque rules (search result only); Threat Tiger should keep it explainable and
overridable. Build on the existing component-kind recognition and attack-path scoring.

### 7.11 Annotated diagram export (differentiator, medium)
Optional numbered threat markers drawn next to the shape or flow they belong to (ID + severity colour), with the
numbered list beside the diagram in print/PNG and the Markdown report. Directly addresses Shostack's "don't make
readers flip pages for T3" (opened) while keeping the register as the source of truth.

### 7.12 Tags with filter and highlight (core improvement, medium)
Free tags on components and flows (e.g. `pci`, `team-payments`, `release-2`); click a tag to highlight or show
only its items, filter the threat register and report by tag. Items can have many tags, unlike layers (draw.io
docs, opened, explain exactly this tags-vs-layers split).

### 7.13 Outline view (core improvement, medium)
A tree of pages > trust zones > components > flows > threats in a side panel, keyboard-editable (rename, reorder,
move to zone, delete), in sync with the canvas. XMind's mind map/outline switch (search results) is the model; for
Threat Tiger it is also the best screen-reader route through a big model.

### 7.14 Orthogonal (elbow) connectors (core improvement, medium; high with obstacle avoidance)
A third curve style, "Orthogonal", with right-angle segments between anchor sides; then optional routing around
shapes. tldraw added elbow arrows in v3.13 (search result); Miro users call missing auto-routing their top
connector pain (opened). Must keep working with line jumps and bend points.

### 7.15 Smart guides and snap to shapes (quick win/core, medium)
While dragging, show guides when edges or centres line up with nearby shapes, and equal-spacing hints; Ctrl/Cmd
to disable (tldraw behaviour, search result). Complements the existing grid snap and align toolbar.

### 7.16 Import Mermaid `architecture-beta` (core improvement, low–medium)
Groups → trust zones (nested), services → components with icon mapping (`database`, `server`, `internet`, …),
edges with sides → flows. Extends the existing Mermaid importer; architecture-beta (Mermaid 11.1+, opened) is the
diagrams-as-code format closest to a DFD.

### 7.17 Visual model diff (core improvement, medium–high) – prev. "model diff"
Refinement: compare the current model with a History snapshot or file and show the result *on the canvas*: added
(green), removed (ghosted red), changed (amber) shapes and flows, plus a list of changed threats. Uses existing
History snapshots.

### 7.18 Two-way text model (long-term, very high)
A text pane with a small, documented DSL (or YAML) for the whole model, edited side by side with the canvas
(Threagile's YAML-first approach and Structurizr's model-as-code, both via search results / Structurizr landing
page). Git-friendly JSON export already covers most of the need, so this is long-term and only if users ask.

## 8. Innovative and Differentiating Ideas

The ideas no general diagram tool can copy because they need the threat model underneath:

- **Lenses** (7.5): the diagram becomes a live risk picture, not a drawing with a table next to it.
- **Scenarios with STRIDE per step** (7.6): IcePanel tells stories; Threat Tiger would tell *attack* and
  *abuse* stories over the same flows and attach threats to the exact interaction.
- **Controls with explained effect** (7.10): placement on the canvas changes the analysis, with reasons.
- **Annotated export** (7.11): a printed diagram that stands on its own in a review.
- **Visual diff** (7.17): "what changed in the architecture since the last review, and which threats does it
  touch" on one screen.
- Combined later: *lens + scenario + diff* = "show me the new unencrypted crossing introduced in this release, in
  the login scenario".

## 9. UI/UX Recommendations

- Put lens, review mode and present mode in one compact canvas-toolbar group; they are view states, not edits.
- Every new mouse action gets a keyboard path (context menu = Shift+F10 / Menu key; Alt+arrow; Ctrl+F).
- Out-of-scope and lens dimming must not rely on colour only (dash pattern, icon, text in aria-label).
- Keep the right panel the single place for properties; context menu only offers shortcuts to existing actions.
- The shortcut sheet doubles as discoverability for the many features added in 1.14–1.15.

## 10. Technical Feasibility

- All proposals are client-side and need no new vendored library. `.drawio` decompression uses the browser's
  `DecompressionStream('deflate-raw')`; `.tm7`/`.drawio` use `DOMParser` with no script execution.
- Every new model field (out-of-scope reason, tags, scenario text, pattern names, title block) needs: import
  validation, `esc()` on render, an entry in `tests/xss.spec.js`, and git-friendly export ordering.
- Lenses and annotated export are render-time overlays: no model change, low risk.
- Auto-layout: lift the Mermaid importer's layered layout into a shared function; must respect locked layers,
  pages and swimlanes.
- Orthogonal routing without avoidance is a path generator; with avoidance it is a grid A* per flow and needs the
  perf suite.
- Control shapes touch attack-path scoring and suggestion ranking: the riskiest change; needs explainability tests.
- Each change to the inline script requires `npm run sync` (CSP hash). File size keeps growing (13.5k lines);
  consider whether features like the TMT importer could live in a lazily loaded local script like the stencil packs.

## 11. Prioritisation Matrix

RICE with Reach (share of users touched, 1–10), Impact (1–3), Confidence (0.5–1), Effort (person-weeks, rough).

| # | Feature | R | I | C | E | RICE | Category |
|---|---|---|---|---|---|---|---|
| 7.1 | Out-of-scope elements | 7 | 2 | 1.0 | 0.5 | 28 | quick win |
| 7.2 | Canvas essentials | 9 | 2 | 1.0 | 1 | 18 | quick win |
| 7.3 | Review mode | 6 | 2 | 0.9 | 0.5 | 21.6 | quick win |
| 7.4 | Title block + legend | 6 | 1.5 | 0.9 | 0.5 | 16.2 | quick win |
| 7.5 | Lenses | 8 | 3 | 0.8 | 2 | 9.6 | differentiator |
| 7.6 | Scenarios + present | 6 | 3 | 0.7 | 4 | 3.2 | differentiator |
| 7.7 | Pattern library | 6 | 2 | 0.8 | 2 | 4.8 | core |
| 7.8 | Auto-layout | 7 | 2 | 0.8 | 2 | 5.6 | core |
| 7.9 | TMT/draw.io import | 4 | 3 | 0.7 | 3 | 2.8 | major |
| 7.10 | Control shapes | 6 | 3 | 0.6 | 4 | 2.7 | differentiator |
| 7.11 | Annotated export | 6 | 2 | 0.8 | 1.5 | 6.4 | differentiator |
| 7.12 | Tags | 5 | 2 | 0.8 | 1.5 | 5.3 | core |
| 7.13 | Outline view | 5 | 2 | 0.7 | 2 | 3.5 | core |
| 7.14 | Orthogonal connectors | 7 | 1.5 | 0.8 | 2 (no avoidance) | 4.2 | core |
| 7.15 | Smart guides | 8 | 1 | 0.9 | 1 | 7.2 | quick win |
| 7.16 | Mermaid architecture-beta | 3 | 1.5 | 0.9 | 1 | 4.1 | core |
| 7.17 | Visual diff (prev.) | 5 | 2 | 0.7 | 3 | 2.3 | core |
| 7.18 | Two-way text model | 2 | 2 | 0.5 | 6 | 0.3 | long-term |

## 12. DO NOT BUILD

- **Real-time collaboration, accounts or cloud sync**: needs a backend and sends data away; contradicts the core
  promise. Shared files and git-friendly JSON are the collaboration story.
- **AI diagram generation through a cloud LLM** (Whimsical, Lucid, ThreatCanvas do this): uploads architecture
  details of real systems.
- **Cloud-account or IaC auto-discovery with credentials** (ThreatModeler "one click from AWS"): network access and
  secrets in a browser app. (Offline Terraform-plan *file* import could be reconsidered later.)
- **General whiteboard features**: sticky-note brainstorming, freehand pen, emoji reactions, infinite-canvas
  templates. Miro/FigJam parity is not the product.
- **Hand-drawn/sketch rendering** (Excalidraw/rough.js): a new vendored library for aesthetics only.
- **Full mind-map mode**: the outline view (7.13) gets the useful part; attack trees (prev.) cover tree thinking.
- **Visio `.vsdx` export**: complex OOXML package; draw.io export (prev.) covers the need, since draw.io and Visio
  users can convert from it.
- **User-scripted rules or plugins that run code**: would need `eval`/dynamic code under a strict CSP.
- **Live-linked nested models across files** (ThreatModeler "threat chaining"): needs multi-model storage and
  cross-file consistency; pages + patterns (7.7) cover most of it.

## 13. Product Roadmap

- **Short term (quick wins, can ship as one minor release):** 7.1 out of scope, 7.2 canvas essentials, 7.3 review
  mode, 7.4 title block + legend, 7.15 smart guides.
- **Medium term:** 7.5 lenses (+ legend from 7.4), 7.11 annotated export (shares the overlay layer with lenses),
  7.8 auto-layout, 7.7 pattern library, 7.12 tags (lenses can filter by tag), 7.14 orthogonal connectors (no
  avoidance first), 7.16 Mermaid architecture-beta.
- **Longer term:** 7.6 scenarios + present mode, 7.9 TMT/draw.io import (with prev. draw.io export), 7.10 control
  shapes (after lenses, so effects can be shown), 7.17 visual diff, 7.13 outline view; 7.18 only on demand.

Dependencies: lenses → annotated export, control shapes, diff (shared overlay layer and legend); review mode → prev.
review workflow; out of scope → lenses/attack paths must honour it.

## 14. Recommended Next Steps

1. Ship the short-term batch: each item is small, verified missing in the code, and two of them (out of scope,
   review mode) come straight from Threat Dragon/TMT users.
2. Build lenses next: highest differentiation for moderate effort, and the foundation for three later features.
3. Prototype scenarios on the demo model before committing to the full branch/present design.

## 15. Research Sources

Accessed 11 November 2026.

**Opened (content read):**
- Threat Dragon issue #1305, templates: https://github.com/OWASP/threat-dragon/issues/1305
- Threat Dragon issue #1892, diagram locking / review mode: https://github.com/OWASP/threat-dragon/issues/1892
- Threat Dragon issue list (enhancement, "diagram"): https://github.com/OWASP/threat-dragon/issues?q=is%3Aissue+diagram+label%3Aenhancement
- Threat Dragon docs, diagrams: https://www.threatdragon.com/docs/usage/diagrams.html
- Threat Dragon docs index: https://www.threatdragon.com/docs/
- Microsoft Threat Modeling Tool feature overview: https://learn.microsoft.com/en-us/azure/security/azure-security-threat-modeling-tool-feature-overview
- draw.io tags: https://www.drawio.com/docs/manual/links-tooltips-tags/tags-in-diagrams/
- draw.io apply layouts FAQ: https://www.drawio.com/doc/faq/apply-layouts
- draw.io automated layout shapes: https://www.drawio.com/docs/manual/shapes/automated-layout-shapes/
- draw.io Alt+Shift+arrow clone and connect: https://www.drawio.com/blog/shortcut-clone-connect
- Visio data graphics overview: https://support.microsoft.com/en-US/Visio/data-graphics-an-overview
- Whimsical flowcharts guide: https://whimsical.com/learn/get-started/flowcharts
- IcePanel Flows: https://docs.icepanel.io/visual-storytelling/flows.md
- Excalidraw+ presentations: https://plus.excalidraw.com/use-cases/presentations
- Figma components guide: https://help.figma.com/hc/en-us/articles/360038662654-Guide-to-components-in-Figma
- Mermaid architecture-beta syntax: https://mermaid.js.org/syntax/architecture
- Structurizr docs landing page: https://docs.structurizr.com/
- SD Elements diagram tool: https://docs.sdelements.com/master/guide/docs/threat_modeling/diagrams.html
- Miro idea "Autorouting of connectors": https://community.miro.com/ideas/autorouting-of-connectors-9758
- Shostack, Diagrams in threat modeling: https://shostack.org/archive/2016/09/diagrams-in-threat-modeling/
- Shostack, Clarity in diagrams: https://shostack.org/blog/clarity-in-diagrams-threat-model-thursday/
- Shostack, Diagram style: https://shostack.org/blog/diagram-style-threat-model-thursday/
- drawio-threatmodeling write-up: https://starlog.pages.dev/articles/llm-engineering/michenriksen-drawio-threatmodeling

**Tried but failed (404/redirect not available):** Lucidchart conditional-formatting tour and help article; ThreatModeler
"Using security control components" (moved to threatmodelingconnect.com, then 404); IcePanel `core-features/flows`.

**Seen only in search results (summaries, not opened):**
- tldraw release notes v3.13.0 (elbow arrows), snapping: https://tldraw.dev/releases/v3.13.0
- ThreatModeler AWS Marketplace listing and community post (controls, threat chaining): https://aws.amazon.com/marketplace/pp/B07S65ZLPQ
- IriusRisk + draw.io, import of draw.io/Visio: https://iriusrisk.com/secure-design-with-iriusrisk-draw-io , https://www.iriusrisk.com/resources-blog/product-update-release-4-12
- XMind features (outline view, relationships, boundaries): https://xmind.com/features , https://xmind.com/user-guide/the-basics
- Whimsical shortcuts (Alt+arrow, mind-map Tab/Enter): https://help.whimsical.com/shortcuts/pc
- Threagile (YAML models, generated diagrams): https://github.com/Threagile/threagile
- r/drawio "Struggling with connectors": https://libreddit.winscloud.net/r/drawio/comments/1nb6pjc/struggling_with_connectors
- Excalidraw vs draw.io comparisons: https://toolradar.com/compare/drawio-vs-excalidraw
- Tool roundup (TMT Windows-only, commercial pricing): https://guptadeepak.com/tools/top-5-threat-modeling-tools-2026/
- Excalidraw laser pointer package: https://cdn.jsdelivr.net/npm/@excalidraw/laser-pointer@1.3.2/README.md
