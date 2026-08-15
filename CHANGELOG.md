# Changelog

All notable changes to the noble-trader-talaria repo are documented here.
Format loosely based on [Keep a Changelog](https://keepachangelog.com/).

## [v0.2.8-remote] — 2026-08-14

### Summary

**Talaria Remote Gateway — web dashboard plugin scaffold built.** A new
`dashboard/` directory ships the headless-gateway counterpart to the desktop
plugin (`desktop/plugin.js`), mirroring the kanban board's dual-plugin pattern.
The dashboard plugin renders the Talaria signal feed on remote/cloud Hermes
gateways via the web dashboard's plugin system — no Electron required.

| Feature | Desktop plugin (`desktop/plugin.js`) | Dashboard plugin (`dashboard/dist/index.js`) |
|---|---|---|
| Registration | `export default { register(ctx) }` → `ctx.registerMany([...])` | `window.__HERMES_PLUGINS__.register('talaria', Component)` |
| React | `@hermes/plugin-sdk` (ESM import) | `window.__HERMES_PLUGIN_SDK__` (runtime resolution) |
| Data transport | `ctx.rest()` / `ctx.socket()` → Electron IPC bridge | Direct `fetch()` / `WebSocket` (browser HTTP) |
| Data source | Supabase REST + Phoenix Realtime (direct) | Supabase REST + Phoenix Realtime (direct) |
| Backend | None (pure frontend) | `dashboard/plugin_api.py` — optional proxy endpoints |
| Build | Plain JS (no build step) | Plain JS IIFE (no build step, no JSX) |

### Added

- **`dashboard/manifest.json`** — name `talaria`, label "Talaria", tab path
  `/talaria` positioned `after:skills`, entry `dist/index.js`, css
  `dist/style.css`, api `plugin_api.py`. Mirrors the kanban dashboard plugin
  manifest structure.
- **`dashboard/dist/index.js`** — plain IIFE plugin bundle (~61KB). Resolves
  React/hooks/components from `window.__HERMES_PLUGIN_SDK__` at runtime.
  Includes full claim-check routing (ConnectTab / SubscribeScreen / WaitingScreen
  / PaywallScreen / TalariaPage), shared signal store (with 2026-08-14
  truncation fix), 10s REST poll, Phoenix Realtime WebSocket, and all dashboard
  components (StatCard, TalariaKellyTable, RenkoBrickChart, SignalHealthTable,
  CalibTable, HotSignalsBanner).
- **`dashboard/dist/style.css`** — prefixed `tla-` stylesheet (9KB) to avoid
  collisions with host app styles and the `nta-` namespace.
- **`dashboard/plugin_api.py`** — FastAPI router mounted at `/api/plugins/talaria/`.
  Provides optional proxy endpoints: `/health`, `/config`, `/claim-check`,
  `/symbols`, `/sweeps/latest`, `/signals/count`. For deployments behind a
  strict firewall that blocks browser → Supabase access.

### Verification

- `node --check dist/index.js` — JS syntax OK
- `python3 -c "ast.parse(...)"` on `plugin_api.py` — Python syntax OK
- Manifest JSON parsed — all required fields present and correctly pathed
- Discovery simulation — `_discover_dashboard_plugins()` would find and serve
  the plugin (source=bundled, bypasses plugins.enabled gate)

### Install (headless gateway)

```bash
# Install to user plugins directory
mkdir -p ~/.hermes/plugins/talaria
cp -r dashboard/ ~/.hermes/plugins/talaria/dashboard/
hermes plugins enable talaria   # REQUIRED — assets 404 unless enabled
# refresh the dashboard: sidebar → Talaria tab
```

## [v0.2.8] — 2026-08-14

### Summary

**Panel consolidation: EV, P_win, and TimesFM forecast all moved to a single
standalone panel below Markov + pattern.**

Previously EV, P_win, and TimesFM forecast were below-table context cards
nested inside the "Kelly by symbol" panel. All three have been pulled out
to a **single standalone panel positioned below the Markov + pattern card**
in all three plugin surfaces, matching the dashboard screenshot layout
(EV | P_win | TimesFM side-by-side):

| Surface | File | Location |
|---------|------|----------|
| Talaria desktop | `plugins/talaria/desktop/plugin.js` | Between Markov + pattern card and Kelly table card |
| Admin desktop | `noble-trader-hermes-plugins/.hermes/plugins/noble-trader-admin/desktop/plugin.js` | Between Markov + pattern card and Kelly table card |
| Talaria dashboard | `plugins/talaria/dashboard/dist/index.js` | New panel added between Renko bricks and Kelly table |

### Added

- **Talaria dashboard plugin** (`dashboard/`) now includes a Markov + pattern
  card and a standalone EV / P_win / TimesFM panel, matching the desktop
  plugin's panel structure. The dashboard plugin (`dist/index.js`) is a compiled
  IIFE; a `brickPattern()` helper and `ctxRowDash` computation were added inline.
- **Dashboard render harness** (`test_dashboard_render_harness.mjs`) — new
  test harness for the web dashboard plugin. Loads `dist/index.js` via
  `vm.runInThisContext`, stubs `window.__HERMES_PLUGIN_SDK__` + browser globals,
  drives the component through its async claim-check + data-fetch lifecycle, and
  asserts all 14 panel text/card assertions render. All PASS.
- **Dashboard plugin copied to master codebase repo** — `noble-trader-hermes-plugins/.hermes/plugins/talaria/dashboard/` now mirrors the public deployment repo.

### Changed

- **TimesFM + EV + P_win panel consolidation** (all 3 surfaces): extracted
  all three from below-table context inside the Kelly table to a single
  standalone panel below Markov + pattern. EV and P_win are now in the
  standalone panel (were below-table before).
- **Talaria desktop + admin desktop**: `ctxRow`/`adminCtxRow` computation
  lifted to the dashboard render body (was inside the Kelly table component),
  so the standalone panel can read the most-qualified symbol's metrics.
- **Test harness assertions updated**: EV/P_win/TimesFM assertions now check
  for "standalone panel" location (below Markov + pattern) with combined
  EV/P_win/TimesFM heading, rather than "below-table context".

### Security

- **No secrets exposed.** The `sb_publishable_...` key in the dashboard plugin
  (`plugin_api.py`, `dist/index.js`, `README.md`) is a Supabase **publishable
  anonymous key** by design — it has read-only RLS access and is intended to be
  embedded in client-side code. No service-role keys, JWTs, or claim tokens are
  hardcoded. The `.gitignore` covers `.env`, `*.zip`, and `node_modules/`.

### Summary

**Count harmonization across all 4 Talaria surfaces.** Previously the toast,
widget pane badge, statusbar chip, and dashboard stat each computed the live
signal count from different data pools with different logic — producing values
like `+20 more`, `4 live`, and `5 in 10m window` that could never agree. Now all
four read from a single source of truth: a Supabase `COUNT(qualified=eq.true,
sweep_timestamp >= now-60m)` query, populated in the shared 10s poll and stored
in `signalStore.qualifiedCount60m`.

Additionally, the toast footer is reordered so the **regime label appears first**
(`🐂 High-vol bull · 2026-08-14 … · 22m ago · N live signals`), and the toast
count uses the shared 60m qualified count instead of the cumulative
`_toastCount` "toasts-fired" counter.

### Fixed

- **Toast `+N more` → `<N> live signals`** (the `+N` was a cumulative
  toasts-fired counter since last `markSeen()`, not a signal count). The toast
  footer now reads the shared `signalStore.qualifiedCount60m` so the toast and
  widget badge always agree.
- **Toast footer reordered**: regime label first, then datetime, then age, then
  live count — per user report on the screenshot (regime was after datetime).
- **Chip badge** now uses `signalStore.qualifiedCount60m` (not the TTL-filtered
  `snap.recent` subset capped at `RECENT_MAX=12`), matching the widget pane.
- **Dashboard stat** renamed from "Hot signals (10m)" to "Qualified signals"
  reading the shared `signalStore.qualifiedCount60m`, with the dashboard
  subscribing to the store for live updates.
- **Widget pane badge** was already referencing `signalStore.qualifiedCount60m`
  (2026-08-11 WIP) but the field was never populated — now it is.
- **Copyright footer updated** to "Copyright - Noble Trading App & Lexington
  Tech LLC" across both dashboard and pane footers in both `plugin.js` copies.
- **Stale example text removed** from the "Paper vs equal-weight" explainer —

- `fetchSupabaseCount` helper — PostgREST `Prefer: count=exact` →
  `X-Total-Count` header, for the shared 60m COUNT query.
- `signalStore.qualifiedCount60m` — single count source of truth across toast,
  widget, chip, and dashboard.
- Dashboard `useEffect` subscribing to `signalStore` so the stat refreshes
  when the poll updates the count (every 10s).

### Dashboard UX refinements

- **Hot signals timestamp → local timezone**: the `HotSignalsBanner` timestamp
  changed from UTC (`as of 2026-08-15 00:05 UTC`) to the user's local timezone
  via `new Date(newest).toLocaleString(undefined, { … })`.
- **Plan panel labels**: `status ${sub_status} · claim re-check 24h` →
  `Subscription ${Active|Grace|Inactive} · Token Valid`.
- **Symbols panel label**: `from nt_symbol plan_ids` → the plan name
  (e.g. `Precision Pro`).
- **Kelly table panel**: removed `sweep` / `nt_sweep_result` references from the
  panel header ("Kelly by symbol" — no "latest sweep" suffix) and the
  explainer text ("Latest signal per symbol").

### Tests

- Harness asserts: toast footer has `live signals` (not `+N more`), toast
  `sigToasts` assertion uses the post-addSignal `allToasts` snapshot, chip badge
  reads `qualifiedCount60m`, chip goes neutral when count is 0, mock `fetch`
  returns `X-Total-Count` header. All 82 assertions PASS.

## [v0.2.5] — 2026-08-13

### Summary

Widget multi-placement (container-query responsive layout), widget placement
root-cause documentation, and a delivery-chain health watchdog. The signals
pane still docks **right of the chat by default** (`placement: 'right'` +
`dock: { pane: 'workspace', pos: 'right' }` + `width: '300px'`) but now adapts
to ANY zone a user drags it to (bottom strips, widened docks) via CSS
`@container` queries on `.tla-pane-root` (`container-type: inline-size` +
`@container (min-width: 560px)` → row list becomes a two-column grid and
card/price flatten to one row).

### Added

- **Delivery-chain watchdog** — `scripts/talaria_delivery_health.py` (stdlib,
  Hermes cron `no_agent`): monitors signals arriving (nt_sweep_result fresh
  within 15 min), qualified flow within the widget TTL window (server-side
  `qualified=eq.true` mirror of the plugin poll), plugin deploy byte-identity
  (desktop == root == all 3 Electron homes, sha256), desktop.log talaria load
  errors after last boot, and `talaria-unread.json` widget-store recency.
  Silent when healthy; wrapper `talaria_delivery_health_wrapper.py` delivers
  alert blocks to Discord (default profile HERMES_HOME). Cron
  `talaria-delivery-health` (`d7c6fbeaeb77`, every 30m).
- **Placement root-cause doc** — `plugins/talaria/README.md` widget section +
  Hermes plugin CHANGELOG: the pane landing in the LEFT sidebar is the app's
  persisted layout tree (`hermes.desktop.layoutTree.v2`) holding a stale
  `grp-sessions` adoption; remedy = app `⌘K → Reset layout` once. Full detail
  in the talaria skill `references/widget_placement_and_delivery_monitor.md`.
- Release zip archive: `talaria-plugin-v0.2.5.zip` (current 164,969 B build —
  NOTE: the on-disk v0.2.4 zip was STALE, containing the pre-fix 163,869 B
  plugin.js; v0.2.5 zip contains the verified current build).

### Fixed

- **Repo root + Electron homes were running the pre-fix build** — the
  multi-placement `@container` rules existed only in `desktop/plugin.js`;
  `plugins/talaria/plugin.js` (root) and all 3 deployed homes still had the
  old 163,869 B file. Root re-synced + all homes re-deployed (sha256
  `659e321bd6f3` → now `0.2.5` bump applied). Deploy byte-identity is now
  guarded automatically by the delivery-health watchdog (check 3).

### Version Bumps

- Talaria plugin: `0.2.4` → `0.2.5`

### Known Issues (not yet fixed)

- **Toast shows oldest signal in poll batch** (2026-08-14): the 60s widget poll fetches 20 `qualified=eq.true` rows in `sweep_timestamp.desc` order and feeds ALL through `addSignal`, which toasts (stable `SIGNAL_TOAST_ID`) for each `ts > watermark`. Since the toast replaces on each call, the **last-processed (oldest in the batch)** signal survives as the toast content — NOT the newest. `_toastCount` also accumulates across all 20 rows per tick, inflating `+N more`. Fix scoped (only newest unseen signal should toast per tick) — awaiting build-code approval.

- **Widget pane lags live DB by up to 60s** (2026-08-14): `startSignalPolling` uses `CHIP_POLL_MS = 60s`; signals qualify every ~6s but the widget only re-fetches every 60s. The 30s `PANE_TICK_MS` timer refreshes ages/TTL expiry but does NOT re-fetch data. The widget pane could share the realtime broadcast socket instead of REST-polling. Fix scoped (reduce `CHIP_POLL_MS` or subscribe pane to broadcast `signal` events) — awaiting build-code approval.

See talaria skill `references/widget_placement_and_delivery_monitor.md`.

## [v0.2.7] — 2026-08-14

### Summary

Fixes the **toast/widget disconnect** at its root: the widget pane could never
show the newest signal because the 20-row poll truncated the NEWEST rows out of
`recent[]`. Verified against the persisted leveldb store (showed the 06:05 batch
while the DB + toast had XAUUSD@06:11).

### Fixed

- **Poll truncation bug** (`plugin.js:404`): the poll fetched 20 rows
  `sweep_timestamp.desc` (newest first) and fed them in that order. Each
  `addSignal` does `recent = [row, ...recent].slice(0, RECENT_MAX=12)` (unshift
  to front) — so after 20 newest-first unshifts, the newest rows sat at the
  array TAIL and `.slice()` kept the OLDEST 12. The widget showed the oldest 12
  of each batch and could never render the newest signal; the toast (first-fed
  row, `suppressToast=false`) showed the newest. Now the loop filters +
  REVERSES the batch and feeds **oldest→newest**, so the newest survives at
  `recent[0]`; `suppressToast` flips to `!isNewest` so only the last-fed
  (newest) row toasts.
- `addSignal` always `_emit()`s after a `recent[]` update (kept from 0.2.6) —
  re-seen rows (ts ≤ watermark) still notify the pane so it re-renders.

### Version Bumps

- Talaria plugin: `0.2.6` → `0.2.7`

### Tests

- 3 new harness assertions: `recent` caps at 12 after a 15-row batch; NEWEST
  signal (SYM00) survives at `recent[0]`; oldest surviving row is SYM11 (12th
  oldest), NOT SYM14 (would mean the old oldest-first truncation). All PASS.

## [v0.2.6] — 2026-08-14

### Summary

Fixes toast showing the **oldest** signal in the poll batch (not the newest) and
reduces widget pane lag from 60s to 10s. Harness passes with new
`suppressToast` assertions.

### Fixed

- **Toast showed oldest signal in poll batch** (`plugin.js:399`): the 60s widget
  poll fed all 20 `qualified=eq.true` rows (desc order) through `addSignal`,
  each firing `host.notify` with the stable `SIGNAL_TOAST_ID`. Since the toast
  replaces rather than stacks, the **last-processed (oldest) row** survived as
  the toast content — not the newest. Fix: `addSignal` now accepts
  `{ suppressToast }` (2nd arg); the poll loop sets `suppressToast=true` on all
  rows after the first (newest), so only the newest unseen signal toasts per
  tick. `unread`/`recent[]`/store updates still happen for all rows. The realtime
  broadcast path (`onSignal`, line 1864) is unaffected (per-signal feed).
- **Widget pane lagged live DB by up to 60s** (`plugin.js:357`): `CHIP_POLL_MS`
  reduced from `60 * 1000` to `10 * 1000`. Signals qualify every ~6s (sweep
  cadence); 10s captures nearly all new qualified signals within one tick.

### Version Bumps

- Talaria plugin: `0.2.5` → `0.2.6`

### Tests

- `test_talaria_render_harness.mjs`: new assertions — `suppressToast:true`
  skips `host.notify`; only ONE toast fires per batch; toast message shows the
  NEWEST signal (NZDUSD), not oldest-in-batch (CADCHF). All PASS.
- Version footer assertion bumped `v0.2.5` → `v0.2.6`.

## [v0.2.5] — 2026-08-13

### Summary

Kelly by symbol panel redesign + group header fix + null context + admin plugin
sync. The "Kelly by symbol" panel in both talaria and admin plugins has been
converted from an HBar histogram to a table format, moved below "Markov +
pattern", with new columns and below-table context cards.

### Added

- Table format replacing HBar histogram for "Kelly by symbol" panel
- New columns: aggression, markov_p_up, markov_p_dn, regime_shift, prev_regime
- Below-table context cards: TimesFM forecast, EV, P_win for most-qualified symbol
- Context info text explaining that `—` dash rows represent unqualified symbols
- `AGGRESSION_FRIENDLY` map (🔥⚡🎯), `fmtAggression()`, `fmtPwin()`, `fmtKellyPct()`, `fmtRegimeShort()` helpers
- CSS styles for kelly table: sticky columns, enlarged text, group headers
- Release zip archive: `talaria-plugin-v0.2.4.zip`

### Fixed

- Group header row replacing first symbol's cell — group headers now render as
  a separate full-width `<tr>` row, ensuring all symbols are always visible
- Closing parenthesis missing after `tbody` React.createElement in table component
  (syntax error when ESM module check ran on Windows)
- Version assertion `v0.2.3` → `v0.2.4` in test harness

### Version Bumps

- Talaria plugin: `0.2.3` → `0.2.4`

## [v0.2.3] — 2026-08-07

Plan-scoped realtime channels + channel rename.
