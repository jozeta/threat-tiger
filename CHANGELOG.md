# Changelog

The version shown in Help & License comes from `APP_VERSION` in `threat-tiger.html`. Exported JSON files record it as `appVersion`.
Finding IDs (SEC-001, BUG-002, …) refer to the November 2026 audit report.

## 1.1.0 — unreleased (branch `audit-fixes`)

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
