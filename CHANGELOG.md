# Changelog

All notable changes to the noble-trader-talaria repo are documented here.
Format loosely based on [Keep a Changelog](https://keepachangelog.com/).

## [v0.2.9] — 2026-08-15

### Summary

**Panel consolidation: EV, P_win, and TimesFM forecast all moved to a single
standalone panel below Markov + pattern.** Previously EV, P_win, and TimesFM
forecast were below-table context cards nested inside the "Kelly by symbol"
panel. All three have been pulled out to a single standalone panel positioned
below the Markov + pattern card in all three plugin surfaces, matching the
dashboard screenshot layout (EV | P_win | TimesFM side-by-side).

| Surface | File | Change |
|---------|------|--------|
| Talaria desktop | `plugins/talaria/desktop/plugin.js` | EV + P_win + TimesFM in one standalone panel; removed from below-table context |
| Admin desktop | `noble-trader-hermes-plugins/.hermes/plugins/noble-trader-admin/desktop/plugin.js` | Same consolidation |
| Talaria dashboard | `plugins/talaria/dashboard/dist/index.js` | Added Markov + pattern card + EV/P_win/TimesFM panel |

### Added

- **Talaria dashboard plugin** (`plugins/talaria/dashboard/`) now includes a
  Markov + pattern card and a standalone EV / P_win / TimesFM panel, matching
  the desktop plugin's panel structure.
- **Dashboard render harness** (`test_dashboard_render_harness.mjs`) — new
  test harness for the web dashboard plugin. Loads `dist/index.js` via
  `vm.runInThisContext`, stubs `window.__HERMES_PLUGIN_SDK__` + browser globals,
  drives the component through its async claim-check + data-fetch lifecycle, and
  asserts all 14 panel text/card assertions render. All PASS.
- **Dashboard plugin copied to master codebase repo** —
  `noble-trader-hermes-plugins/.hermes/plugins/talaria/dashboard/` now mirrors
  the public deployment repo.

### Changed

- **Standalone EV / P_win / TimesFM panel** (all 3 surfaces): extracted all
  three from below-table context inside the Kelly table to a single standalone
  panel below Markov + pattern.
- **Talaria desktop + admin desktop**: `ctxRow`/`adminCtxRow` computation lifted
  to the dashboard render body (was inside the Kelly table component), so the
  standalone panel can read the most-qualified symbol's metrics.
- **Test harness assertions updated**: EV/P_win/TimesFM assertions now check
  for "standalone panel" location (below Markov + pattern) with combined
  EV/P_win/TimesFM heading, rather than "below-table context".
- **DEVELOPMENT.md**: Fixed headless gateway install path (`cp -r dashboard/
  ~/.hermes/plugins/talaria/` instead of `.../talaria/dashboard/`), added
  naming convention notes and troubleshooting section.

### Security

- **No secrets exposed.** The `sb_publishable_...` key in the dashboard plugin
  is a Supabase **publishable anonymous key** by design — read-only RLS access,
  safe to embed in client-side code. No service-role keys, JWTs, or claim
  tokens are hardcoded. The `.gitignore` covers `.env`, `*.zip`, and
  `node_modules/`.

---

## [v0.2.8-remote] — 2026-08-14

### Summary

**Talaria Remote Gateway — web dashboard plugin scaffold built.** A new
`dashboard/` directory ships the headless-gateway counterpart to the desktop
plugin (`desktop/plugin.js`), mirroring the kanban board's dual-plugin pattern.

### Added

- **`dashboard/manifest.json`** — name `talaria`, label "Talaria", tab path
  `/talaria` positioned `after:skills`, entry `dist/index.js`, css
  `dist/style.css`, api `plugin_api.py`.
- **`dashboard/dist/index.js`** — plain IIFE plugin bundle. Resolves React/hooks
  from `window.__HERMES_PLUGIN_SDK__` at runtime. Includes full claim-check
  routing, shared signal store, 10s REST poll, Phoenix Realtime WebSocket, and
  all dashboard components.
- **`dashboard/dist/style.css`** — prefixed `tla-` stylesheet.
- **`dashboard/plugin_api.py`** — FastAPI router at `/api/plugins/talaria/`.
  Optional proxy endpoints: `/health`, `/config`, `/claim-check`, `/symbols`,
  `/sweeps/latest`, `/signals/count`.

### Verification

- `node --check dist/index.js` — JS syntax OK
- Manifest JSON parsed — all required fields present and correctly pathed

### Install (headless gateway)

```bash
mkdir -p ~/.hermes/plugins/talaria
cp -r dashboard/ ~/.hermes/plugins/talaria/
hermes plugins enable talaria   # REQUIRED
```

---

## [v0.2.8] — 2026-08-14

### Summary

**Count harmonization across all 4 Talaria surfaces.** All four signal-count
surfaces (toast footer, widget pane badge, statusbar chip, dashboard stat) now
read from a single source of truth: `signalStore.qualifiedCount60m` (a Supabase
`COUNT(qualified=eq.true, sweep_timestamp >= now-60m)` query, updated every 10s).

### Fixed

- **Toast `+N more` → `<N> live signals`** — the `+N` was a cumulative
  toasts-fired counter, not a signal count. Toast footer now reads the shared
  `signalStore.qualifiedCount60m`.
- **Toast footer reordered**: regime label first, then datetime, then age, then
  live count.
- **Chip badge** now uses `signalStore.qualifiedCount60m` (not the TTL-filtered
  `snap.recent` subset).
- **Dashboard stat** renamed from "Hot signals (10m)" to "Qualified signals".
- **Copyright footer** updated to "Copyright - Noble Trading App & Lexington
  Tech LLC".
- **Stale example text removed** from "Paper vs equal-weight" explainer.

### Added

- `fetchSupabaseCount` helper, `signalStore.qualifiedCount60m` field, dashboard
  `useEffect` subscribing to `signalStore`.

### Dashboard UX refinements

- Hot signals timestamp → local timezone.
- Plan panel labels: `Subscription Active/Grace/Inactive · Token Valid`.
- Symbols panel label: plan name (e.g. `Precision Pro`).
- Kelly table panel: removed `sweep`/`nt_sweep_result` refs from header.

### Tests

- 82 new assertions covering count harmonization. All PASS.

## [v0.2.7] — 2026-08-14

### Summary

Fixes the **toast/widget disconnect** at its root: the widget pane could never
show the newest signal because the 20-row poll truncated the NEWEST rows out of
`recent[]`.

### Fixed

- **Poll truncation bug**: poll fetched 20 rows `sweep_timestamp.desc` (newest
  first) and fed them in that order. Each `addSignal` does
  `recent = [row, ...recent].slice(0, RECENT_MAX=12)` — so after 20 newest-first
  unshifts, the newest rows sat at the array TAIL and `.slice()` kept the OLDEST
  12. Now the loop filters + REVERSES the batch and feeds oldest→newest, so the
  newest survives at `recent[0]`; `suppressToast` flips to `!isNewest` so only
  the newest unseen signal toasts.
- `addSignal` always `_emit()`s after a `recent[]` update.

### Version Bumps

- Talaria plugin: `0.2.6` → `0.2.7`

### Tests

- 3 new harness assertions: `recent` caps at 12 after a 15-row batch; NEWEST
  signal (SYM00) survives at `recent[0]`; oldest surviving row is SYM11. All PASS.

## [v0.2.6] — 2026-08-14

### Summary

Fixes toast showing the **oldest** signal in the poll batch and reduces widget
pane lag from 60s to 10s.

### Fixed

- **Toast showed oldest signal in poll batch**: `addSignal` now accepts
  `{ suppressToast }` (2nd arg); the poll loop sets `suppressToast=true` on all
  rows after the first (newest), so only the newest unseen signal toasts per
  tick.
- **Widget pane lag**: `CHIP_POLL_MS` reduced from `60 * 1000` to `10 * 1000`.

### Version Bumps

- Talaria plugin: `0.2.5` → `0.2.6`

### Tests

- New assertions: `suppressToast:true` skips `host.notify`; only ONE toast
  fires per batch; toast shows NEWEST signal (NZDUSD). All PASS.

## [v0.2.5] — 2026-08-13

### Summary

Kelly by symbol panel redesign + group header fix + null context + admin plugin
sync.

### Added

- Table format replacing HBar histogram for "Kelly by symbol" panel
- New columns: aggression, markov_p_up, markov_p_dn, regime_shift, prev_regime
- Below-table context cards: TimesFM forecast, EV, P_win for most-qualified symbol
- `AGGRESSION_FRIENDLY` map (🔥⚡🎯), `fmtAggression()`, `fmtPwin()`,
  `fmtKellyPct()`, `fmtRegimeShort()` helpers
- CSS styles for kelly table: sticky columns, enlarged text, group headers
- Release zip archive: `talaria-plugin-v0.2.4.zip`

### Fixed

- Group header row replacing first symbol's cell — group headers now render as
  a separate full-width `<tr>` row.
- Closing parenthesis missing after `tbody` React.createElement.
- Version assertion `v0.2.3` → `v0.2.4` in test harness.

### Version Bumps

- Talaria plugin: `0.2.3` → `0.2.4`

## [v0.2.3] — 2026-08-07

Plan-scoped realtime channels + channel rename.
