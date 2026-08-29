# Changelog

All notable changes to the noble-trader-talaria repo are documented here.
Format loosely based on [Keep a Changelog](https://keepachangelog.com/).

## [v0.2.20] — 2026-08-28

### Summary
**Security hardening: production table names → view names + claim token validation + rate limiting.** All direct Supabase PostgREST calls now reference view names instead of production table names. The `fetchSupabase()`, `fetchSupabaseCount()`, and `testConnection()` functions now attach an `x-claim-token` header to every view-retrieval call, gating RLS-protected Pro-only views. The dashboard backend API (`plugin_api.py`) proxy endpoints now enforce per-IP/per-plan rate limiting (60 req/min sliding window) to prevent scraping by anyone who reverse-engineers the anon key + view names from the browser bundle.

### Security
- **Table → View substitution**: All direct Supabase PostgREST calls now reference view names instead of production table names
  - `nt_sweep_result` → `v_talaria_latest_signals`
  - `nt_signal_sim` → `v_signal_sim`
  - `nt_symbol` → `v_talaria_symbols`
  - `nt_renko_bricks` → `v_talaria_renko`
  - `nt_paper_positions` → `v_paper_positions`
- **Claim token validation**: `fetchSupabase()`, `fetchSupabaseCount()`, and `testConnection()` now attach an `x-claim-token` header to every view-retrieval call. The anon key is PUBLIC and read-only via RLS; the claim token gates Pro-only views
- **Rate limiting**: Dashboard backend API (`plugin_api.py`) proxy endpoints (`/symbols`, `/sweeps/latest`, `/signals/count`) now enforce per-IP/per-plan rate limiting (60 req/min sliding window, configurable via `TALARIA_RATE_LIMIT_WINDOW`/`TALARIA_RATE_LIMIT_MAX` env vars)
- **Slash command rename**: `talaria-client` → `talaria` (SKILL.md name, related_skills, DEVELOPMENT.md path refs)

### Changed
- Version: 0.2.18 → 0.2.20 (fixes version drift — root plugin.js was at 0.2.16)

## [v0.2.19] — 2026-08-26

### Summary
**Signal health scoreboard cleanup + version drift fix.** Removes the "sig"
pill badge from the scoreboard table and corrects version drift on the flat
`plugin.js` copy.

### Changed
- **Signal health scoreboard** — Removed the `'sig'` pill badge (`<span
  class="tla-badge tla-hot-chip">sig</span>`) from the Symbol column in the
  scoreboard table. The BH-FDR significance calculation still runs (via
  `fdrBySym`) but is no longer rendered as a visual badge. The `r.symbol`
  cell now renders plain text only.
- **Version drift** — The root `plugin.js` flat copy was stuck at v0.2.16
  (never synced from the v0.2.18 desktop version). Bumped to v0.2.19 in sync
  with `desktop/plugin.js`. The in-plugin upgrade-banner harness mock was
  bumped to v0.2.20 so the check stays strictly ahead of the deployed version.

### Deploy
- Release zip: `talaria-plugin-v0.2.19.zip`
- Includes `plugins/talaria/desktop/plugin.js`, `plugins/talaria/plugin.js`,
  `plugins/talaria/desktop/test_talaria_render_harness.mjs`,
  `scripts/talaria_delivery_health.py`

### Verification
- `node plugins/talaria/desktop/test_talaria_render_harness.mjs` — all PASS
- `node --check plugins/talaria/desktop/plugin.js` — PASS
- `node --check plugins/talaria/plugin.js` — PASS
- No `'sig'` badge references remain in any plugin.js copy

## [v0.2.18] — 2026-08-26

### Summary
**Brick pattern label fix + version bump.** Every symbol was showing "3-push"
due to two regressions from the 2026-08-24 shared-logic consolidation:
`brickPattern()` compared `d > 0` on brick objects (always `false` → all `'D'`),
and `patternLabel()` had a `matchesPush` catch-all returning "N-push" for any
3+ consecutive same-direction bricks.

### Fixed
- `brickPattern()`: changed `d > 0` to `Number(d.close_price) > Number(d.open_price)`
  — correctly classifies brick direction from object data, not object identity
- `patternLabel()`: replaced bloated catch-all `matchesPush` version with the
  simplified 9-line version from commit `3c0afbf` that only matches exact
  known patterns (UUU → "3-push up 📈", DDD → "3-push down 📉", etc.)
- `fmtRegime()`: restored volatility-tier prefix handling (`low_`/`high_`/`med_`
  stripping) for composite regime labels like `low_vol_strong_bull`
- Removed orphaned `patternLabel` code block in admin plugin body that was
  causing `SyntaxError: 'return' outside of function`

### Version Bumps
- Talaria plugin: `0.2.17` → `0.2.18`
- Render harness: mock latest release bumped to `v0.2.19`, deployed version
  assertion updated to `v0.2.18`

### Deploy
- All 17 talaria plugin.js copies synced across `desktop-plugins/` + `plugins/`
  deploy paths (the app loads from both roots)
- `build-plugins.py` `DEPLOY_DIRS` expanded with 4 new targets for the
  unified agent-plugin door (`<hermes home>/plugins/<name>/desktop/plugin.js`)
- Release zip: `talaria-plugin-v0.2.18.zip`

### Verification
- `node test_talaria_render_harness.mjs` — 110/110 PASS
- ESM `node --check` on all deploy copies — PASS

## [v0.2.16] — 2026-08-24

### Summary
**Fix release for the 2026-08-24 shared-logic consolidation in `noble-trader-hermes-plugins`,
plus the originally-requested token re-check / calibration-bias-delta / qualified-signals-card
changes.** That consolidation had broken both the talaria and admin desktop plugins outright
(`ensureStyle is not defined` on load — every shared declaration was scoped inside an IIFE and
unreachable from plugin bodies) and, once that crash was fixed, surfaced a chain of further
regressions from the same refactor. Full detail in `noble-trader-hermes-plugins`'
`worklog/20260824_scope_implementation_and_build_verification.md`.

### Fixed
- Both plugins crashed on load (IIFE scoping bug in shared-logic.js) — fixed at the root.
- The build tooling (`extract-ranges.js`) was silently discarding every `import` statement on
  rebuild, and separately leaving orphaned duplicate doc-comments behind on every rebuild
  (73 stale copies accumulated in one session) — both fixed; rebuilds are now byte-identical
  across repeated runs.
- `fetchSupabase`/`fetchSupabaseCount` were missing the `/rest/v1/` REST path prefix, breaking
  nearly every Supabase query (symbols, sweeps, calibration bias, portfolio stats, etc.).
- `ConnectTab` lost its claim-token field entirely (talaria users had no way to enter/replace a
  token) — restored the original claim-token-only form.
- `HotSignalsBanner` was called with props neither plugin's shared implementation actually
  used, crashing on render — restored each plugin's real pre-refactor behavior.
- `REGIME_FRIENDLY`/`AGGRESSION_FRIENDLY`/`META_REGIME_TABLE` were truncated to a handful of
  generic keys that never matched real sweep-row data — friendly emoji labels effectively never
  rendered. Restored the full tables.
- The Sizing-what-if panel's `metaRegimeInfo`/`sizingWhatIf` had the wrong shape entirely —
  restored the real implementation (regime → `{mult, aggressiveness}`, full baseline/final/cap
  sizing math).
- A whole second stylesheet of hand-written app CSS (`.tla-card`, `.tla-pane-root`'s
  `@container` multi-placement rules, hot-signal chips, etc.) had been silently dropped during
  an earlier CSS trim — restored.

### Added
- Talaria: "Use a different token" link on the expired/cancelled subscription screen, routing
  back to the Connect screen without waiting for an automatic bad-token error.
- Calibration bias panel: "Bias (raw)"/Status (raw)" columns reformatted as deltas vs the
  enforced Bias column ("Next bias" = raw − enforced, "Next status").

### Removed
- Talaria dashboard: "Qualified signals" stat card (below the hot-signals panel) — the shared
  `qualifiedCount60m` count and its poller are unchanged; the chip, signals-pane, and toast
  still show the same live count.

### Version Bumps
- Talaria plugin: `0.2.15` → `0.2.16`

## [v0.2.15] — 2026-08-23

### Summary
**Calibration bias panel raw/enforced delta display + qualified-signals card removal.**
Mirror of the noble-trader-hermes-plugins change: raw bias/status are now shown as small
text under the enforced cell with a delta (Δ = raw − enforced) so users see both the masked
and true model drift without 4 separate columns. Also removes the redundant "Qualified
signals" StatCard from the talaria dashboard (the count is already in the statusbar chip +
toast + widget pane badge).

### Changed
- Calibration bias panel: raw `bias_raw`/`status_raw` now rendered as a small delta under the
  enforced `bias`/`status` cell (Δ = raw − enforced). Raw status only shows when it differs
  from enforced.
- Removed redundant "Qualified signals" StatCard from the talaria dashboard body — the shared
  `qualifiedCount60m` count (chip + toast + widget pane badge) is unchanged and still drives
  all other surfaces.

### Fixed
- Dashboard `dist/index.js` duplicate render + stale "last 10 rows" hint in the Analysis tab
  CalibTable — fixed.

### Version Bumps
- Talaria plugin: `0.2.14` → `0.2.15` (dashboard was stuck at `0.2.11`)

## [v0.2.14] — 2026-08-23

### Summary
**Calibration bias panel raw columns + upgrade-banner scaffolding.**
Mirror of noble-trader-hermes-plugins: all talaria dashboard variants
(`plugin.js`, `desktop/plugin.js`, `dashboard/dist/index.js`) now query
`bias_raw`/`status_raw`/`n` from `v_eod_calibration_bias_latest` (backend
migration 119 in `noble-trader-fastapi-backend`) and render "(raw)" columns
alongside the existing enforced `bias`/`status` columns. Drops the stale
"· last 10 rows" hint text.

Note: `plugin.js`, `desktop/plugin.js`, and the render harness also carry a
pre-existing, previously-uncommitted "Phase 2" in-plugin upgrade-banner feature
(version bump to 0.2.14, GitHub Releases polling, `UpgradeBanner` component)
already sitting in the working tree — included as-is, untouched by this fix.

### Files Modified
- `plugins/talaria/desktop/plugin.js` — calibration bias raw columns + upgrade-banner scaffolding
- `plugins/talaria/plugin.js` — synced from desktop

## [v0.2.13] — 2026-08-20

### Summary
**Polling optimization (60s→300s) + PostHog DAU/MAU analytics.**

### Changed
- `DATA_POLL_MS`: 60s → 300s (5min REST fallback; -80% egress per user/day). WebSocket
  Realtime remains the primary channel; REST polling now only runs as a slower fallback.
- PostHog analytics: CDN-lazy-loaded SDK, `dashboard_open` event on mount.
- PostHog `api_host` corrected: `us.posthog.com` → `us.i.posthog.com` (was 404ing events).
- PostHog CDN URL: `us-assets.posthog.com` → `us-assets.i.posthog.com`.
- `README.md` install download ref updated: `talaria-plugin-v0.2.3.zip` → `talaria-plugin-v0.2.13.zip`.

### Version Bumps
- `PLUGIN_VERSION`: `0.2.11` → `0.2.13`
- Render harness version assertion: `0.2.11` → `0.2.13`

### Verification
- `node --check plugin.js`: PASS
- `node test_talaria_render_harness.mjs`: 31/31 PASS

## [v0.2.12] — 2026-08-19

### Summary
**TradingView symbol mapping fixes + Supabase egress assessment.** Fixed stale
`FOREXCOM:` exchange prefixes in the TV symbol map (TradingView retagged US
indices to `PEPPERSTONE:` prefix). Made the symbol mapping dynamic — the plugin
now fetches `tradingview_symbol` from the `nt_symbol` Supabase table at runtime
and uses it as the source of truth, falling back to the corrected static map.
Also assessed Supabase free-tier egress impact for 500 users on 60s REST
polling (see `docs/supabase_egress_assessment.md`).

### Fixed
- **TV symbol map**: `FOREXCOM:US500` → `PEPPERSTONE:US500` (TradingView retagged)
- **TV symbol map**: `US30` → `US30USD`, `US100` → `UK100` (matches backend `nt_symbol` column names)
- **Dynamic symbol lookup**: `useSupabaseData` for `nt_symbol` now selects
  `tradingview_symbol` column; `TalariaTvChart` receives a `tvSymbolMap` prop
  built from the fetched data, which takes priority over the static `TV_SYMBOL_MAP`
  fallback. If a symbol is deactivated in `nt_symbol`, it no longer appears in
  the dynamic map and falls back to the static entry.
  - `tvWidgetUrl(sym, tvSymbolMap)` — checks dynamic map first
  - `TalariaTvChart({ symbol, sweepRow, tvSymbolMap })` — accepts map prop
  - Render call: `TalariaTvChart({ symbol, sweepRow, tvSymbolMap: tvSymbolBySym })`

### Assessed
- **Supabase egress**: 500 users × 60s polling × 5 REST endpoints = ~13 GB/day
  (2.6× over the free plan's 5 GB limit). WebSocket Realtime is the primary
  channel but REST polling runs unconditionally in parallel. Recommendation:
  suppress REST polling when `wsState === 'open'` + only poll when dashboard
  tab is visible. See `docs/supabase_egress_assessment.md`.

### Files Modified
- `.hermes/plugins/talaria/desktop/plugin.js` (canonical source)
- `.hermes/plugins/talaria/plugin.js` (root, synced from desktop)

### Verification
- `node --check`: PASS
- `node test_talaria_render_harness.mjs`: **31/31 PASS**
- All 5 talaria plugin.js copies byte-identical (SHA-256 match)
- Zero `FOREXCOM` references remaining; 3 `PEPPERSTONE` refs confirmed
- 4 `useSupabaseData` signal queries pass `{ wsState }` option

## [v0.2.11] — 2026-08-16 → 2026-08-17

### Summary
**Dashboard restructured into two tabs: Market (live, per-symbol) + Analysis (historical/retrospective).** The Market tab becomes the primary live decision surface with a universal symbol picker cascading across all per-symbol panels plus a full-width TV chart panel at the bottom (below sizing what-if). The Analysis tab holds all aggregate/historical validation views.

### Added
- **Two-tab dashboard structure** (`activeTab` state + tab bar) at `/talaria` route in BOTH desktop plugin + remote dashboard plugin:
  - **Market tab** (default): stat cards, hot signals banner, symbol picker, Renko bricks (10-window, full-width), Markov + pattern, EV/P_win/TimesFM, **Sizing what-if** (below EV/P_win/TimesFM), **Full-width TV chart** (TradingView iframe widget, 5M candles, ENTRY/SL/TP overlay hints) (below sizing what-if)
  - **Analysis tab**: Kelly by symbol (all symbols), signal health scoreboard (30d resolved), calibration bias (7d), paper portfolio (Pro), portfolio stats (Pro), paper vs equal-weight (Pro)
- **TalariaWatchlist component** (REMOVED from Market tab rendering 2026-08-17) — per-symbol rows with mini-charts were too small for users to navigate/view point-in-time pricing. The Market tab now uses the full-width TV chart for the selected symbol, with all cascading panels refreshing on symbol selection.
- **TradingView iframe widget** (`https://s.tradingview.com/widgetembed/?...`) — loads 5M candles directly from TradingView's servers (TDVA-equivalent price data) without requiring a RapidAPI key in the desktop client. Symbol mapping: internal symbols → TradingView `EXCHANGE:SYMBOL` format (OANDA:XAUUSD, OANDA:USDJPY, FOREXCOM:US500, COINBASE:BTCUSD, etc.).
- **ENTRY/SL/TP overlay hints** — the TV chart hint footer displays signal levels from the sweep row for the selected symbol
- **SVG fallback** — when no symbol is selected, the TV chart card shows a placeholder prompting symbol selection from the Renko panel

### Changed
- **Sizing what-if panel** moved from Analysis context to Market tab (below EV/P_win/TimesFM) — it is a live per-symbol sizing calculation driven by `activeBrickSym`, not historical analysis
- **Analysis tab** now houses Kelly table, signal health, calibration, sizing-historical, paper portfolio/stats, and paper-vs-equal-weight — all previously on the single Market tab, grouped by purpose (validation/retrospective)
- **Universal symbol picker** persists `activeBrickSym` across tab switches — selecting a symbol in Market keeps it selected when navigating to Analysis
- Footer label updated: "TradingView reference chart; Talaria supplies signal levels, regime, and sizing" (was referencing Hyperliquid — no Supabase or provider name in footer)

### Verified
| - `node --check plugin.js` passes (both desktop + dashboard dist/index.js)
|| - `node test_talaria_render_harness.mjs` — **150 PASS, 0 FAIL** (Market tab: sizing what-if + TV chart panel with TradingView iframe widget + symbol selection placeholder, Analysis tab: source-level assertions)
|| - `node test_dashboard_render_harness.mjs` — **42 PASS, 0 FAIL**
|| - Byte-verified deploy to 2 Electron profile dirs: identical MD5 `b46560fcbe341df6c1a85e94295796fa` (2026-08-17 15:30: chart height 240→320px, iframe key prop for symbol remount)

### Data Flow
|- **Price data for TV chart**: via TradingView iframe widget (`s.tradingview.com/widgetembed`) — loads 5M candles directly from TradingView's servers (TDVA-equivalent), no API key needed in desktop client
|- **ENTRY/SL/TP levels**: from `nt_sweep_result` (single row per symbol, desc fetch — already in `sweepRow` variable)
|- `nt_renko_bricks` fetch remains per-`activeBrickSym` (10-brick window for chart, 200-series for Markov) — unchanged
- `symbolList` derivation (`nt_symbol ∩ nt_sweep_result`, plan-gated, stable ordering) reused for watchlist rows

### Risks
| Risk | Mitigation |
|---|---||
| **TradingView lightweight-charts CDN fails to load** | **FIXED 2026-08-17**: SVG mini-chart fallback (`<SvgMiniChart>`) renders inside every canvas div when `tvReady` is false — charts are ALWAYS visible regardless of CDN availability. The SVG renders static candle data as an inline `<svg>` with colored stroke (green/red) + shaded area. If lightweight-charts loads, it takes over the canvas (SVG hidden). This mirrors the `tonbistudio/hermes-desktop-plugins` markets plugin pattern.
|| Chart canvas memory leak (many canvases) | Store chart refs in a `Map<symbol, IChartApi>`, destroy on unmount via cleanup function |
|| Desktop + dashboard drift | Same `TalariaWatchlist` component + tab logic defined identically in both plugin.js patterns (React.createElement in desktop, h() in dashboard IIFE) |

### Files Changed (scoped to `noble-trader-talaria`)
|| `plugins/talaria/desktop/plugin.js` — tab restructure + watchlist component + TDVA candle fetching + cancellation race fix |
|| `plugins/talaria/desktop/test_talaria_render_harness.mjs` — stubs (LightweightCharts, AbortSignal, TDVA candles) + assertions updated for Analysis tab source-level checks + watchlist chart assertions |
|| `plugins/talaria/dashboard/dist/index.js` — mirror tab restructure + watchlist + TDVA candle fetching + cancellation race fix |
|| `plugins/talaria/dashboard/dist/style.css` — tab bar + watchlist row CSS |

## [v0.2.10] — 2026-08-15

### Summary

**EV / P_win / TimesFM panel now syncs to the Renko panel's selected symbol.**
Previously the standalone EV/P_win/TimesFM panel (consolidated in v0.2.8/v0.2.9)
always showed the *most-qualified* symbol's metrics, ignoring the symbol the user
selected in the Renko bricks panel. Now the panel filters sweep data by
`activeBrickSym` (the Renko-selected symbol), falling back to the most-qualified
row only when no data exists for the selected symbol.

### Fixed

- **Symbol desync in EV / P_win / TimesFM panel.** In both the Talaria desktop
  plugin (`desktop/plugin.js:2046`) and the Noble Trader Admin plugin
  (`noble-trader-admin/desktop/plugin.js:1373`), `ctxRow` / `adminCtxRow` was
  computed as `Object.values(latestBySymCtx).find((r) => r.qualified)` — picking
  the first qualified row from the 20-newest sweep batch, regardless of the
  user's Renko panel selection. Changed to
  `Object.values(latestBySymCtx).find((r) => r.symbol === activeBrickSym)` with
  the old qualified-row fallback preserved. The Renko/Markov/Kelly panels already
  used `activeBrickSym`; this was the only panel that didn't sync.
- **Version string bump** — `PLUGIN_VERSION` was stuck at `0.2.8` despite the
  v0.2.9 panel-consolidation release. Bumped to `0.2.10` in all 4 plugin.js
  copies (desktop + root, hermes-plugins + talaria repo) and all runtime
  AppData locations. Test harness version assertions updated to `v0.2.10`.

### Changed

- **TalariaMark SVG component** added to all 3 header surfaces in the desktop
  plugin (dashboard root header, ConnectTab header, widget pane header) with
  `.tla-mark` CSS class (broad-bolt icon, bronze `#B8823D`). Previously only
  the dashboard `dist/` bundle had the logo; the desktop `plugin.js` (what
  Electron actually loads) had plain-text headers.
- **`.tla-header` CSS** updated with `gap: 8px` (was missing, causing logo +
  text to touch) and `.tla-mark { display: inline-block; flex-shrink: 0; }`
  rule added.
- **Admin dashboard** (`noble-trader-admin/desktop/plugin.js`) — created a new
  `nta-header` element (did not exist before) with `AdminTalariaMark` SVG +
  `'Noble Trader Admin'` title at the root of the plugin, with `nta-header` /
  `.nta-mark` CSS rules.
- **Header text format** changed: `'Talaria By Noble Trading App'` →
  `'Talaria · Noble Trading App'` and `'Talaria — Connect'` →
  `'Talaria · Connect'` (dot-separated format matching the dashboard plugin's
  existing convention from commit `751c310`).

### Tests

- `test_talaria_render_harness.mjs` — added assertion: `EV/P_win/TimesFM panel
  syncs to activeBrickSym (XAUUSD = default), not most-qualified fallback`.
  Version footer assertion updated `v0.2.8` → `v0.2.10`. All 97 assertions PASS.
- `test_nta_render_harness.mjs` — updated EV/P_win/TimesFM assertions to
  expect XAUUSD (the default `activeBrickSym`) instead of USDCAD (most-qualified).
  Added `nta-mark` class assertion for admin dashboard header. All 36 assertions
  PASS.

### Deploy

- All 4 plugin.js copies synced to root-level + desktop-level + 2 runtime
  AppData locations + talaria repo mirror. Byte-verified identical.
- Release zip: `talaria-plugin-v0.2.10.zip`

## [v0.2.9] — 2026-08-15

### Summary

**Panel consolidation: EV, P_win, and TimesFM forecast all moved to a single
standalone panel below Markov + pattern.** Previously EV, P_win, and TimesFM
forecast were below-table context cards nested inside the "Kelly by symbol"
panel. All three have been pulled out to a single standalone panel positioned
below the Markov + pattern card in all three plugin surfaces, matching the
dashboard screenshot layout (EV | P_win | TimesFM side-by-side).

|| Surface | File | Change |
||---------|------|--------|
|| Talaria desktop | `plugins/talaria/desktop/plugin.js` | EV + P_win + TimesFM in one standalone panel; removed from below-table context |
|| Admin desktop | `noble-trader-hermes-plugins/.hermes/plugins/noble-trader-admin/desktop/plugin.js` | Same consolidation |
|| Talaria dashboard | `plugins/talaria/dashboard/dist/index.js` | Added Markov + pattern card + EV/P_win/TimesFM panel |

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
  Optional proxy Endpoints: `/health`, `/config`, `/claim-check`, `/symbols`,
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

## [v0.2.4] — 2026-08-14

### Summary

Widget multi-placement + placement root-cause + delivery-chain watchdog.

### Fixed

- **Widget placement root cause** — the pane appeared in the LEFT sidebar after
  reload/layout changes because the app's persisted layout tree held the pane
  inside `grp-sessions`. Remedy: run ⌘K → Reset layout once to restore the
  right dock. Fix requires app-level change to `adoptMissingPanes` (honor
  `data.dock`) — outside plugin repos.
- **Deploy drift** — the multi-placement build (`@container` rules in
  `.tla-pane-root`) was never deployed to root + all 3 Electron homes. Root
  copy re-synced from desktop + re-deployed; all copies byte-verified.

### Changed

- **Talaria widget multi-placement** — default dock stays **right of the chat**
  (`placement: 'right'` + `dock: { pane: 'workspace', pos: 'right' }` +
  `width: '300px'`), but the pane now adapts to ANY zone:
  - `.tla-pane-root` declares `container-type: inline-size` (container-query host)
  - New `@container (min-width: 560px)` rules: row list → two-column grid,
    last-signal card + price line flatten to a single row
  - <560px keeps the compact single column
- **Talaria plugin (`desktop/plugin.js`)** — `startSignalPolling()` poll catch
  block now logs errors via `_log('error', ...)` instead of silently swallowing.
- **Talaria plugin (`desktop/plugin.js`)** — `register(ctx)` now wraps
  `ctx.registerMany()` in try/catch with validation.

### Added

- `talaria_delivery_health.py` + cron `talaria-delivery-health` (every 30m, no_agent) —
  delivery-chain watchdog watching signals → toast → widget path.

### Tests

- Harness: default-dock-width + responsive-CSS contract assertions +
  placement: 'default' / onDismiss assertions. All PASS.

### Verification

- Live monitor run (healthy): sweep 2.7m ago, qualified_ttl=4, plugin
  164969B/659e321bd6f3, store fresh.
- Qualified signals confirmed live: EURUSD, XAUUSD, XAGUSD, US500 (all q=true, within TTL).
- `talaria-unread.json` store confirmed persisting.
- Harness PASS + `node --check` OK after deploy sync; all 3 homes byte-verify.

## [v0.2.3] — 2026-08-07

**Plan-scoped realtime channels + channel rename.**

- **Plan-scoped signal broadcasts**: signals are now published per plan:
  `realtime:signals.signal_scout` (Scout's symbols) and
  `realtime:signals.precision_pro` (Pro's symbols). The backend routes each
  signal to the topic(s) matching the symbol's plan membership; the plugin joins
  only its own plan's topic (decided by the server-validated claim — never
  client-guessed). Pro subscribers receive Scout + Pro symbols; Scout
  subscribers receive only their 10.
- **`realtime:paper` → `realtime:portfolio`**: the paper-validation channel was
  renamed. It carries the **simulated validation book** (positions the engine
  would have taken, realized PnL, equity ticks) — not a demo trading account.
  Topic is now `realtime:portfolio` (Precision Pro only).
- **Fail-open routing**: if a symbol's plan membership can't be resolved, the
  signal is published to **both** plan topics so no subscriber misses it.
  Unknown plan claims also join both topics.
- **Widget display order + dedup**: the signals pane now renders
  **most-recent-at-top** (newest first, always), the pinned card shows the
  actual newest signal, and a signal **never renders twice** (the card's signal
  is excluded from the list). Badge counts all live signals.
- **Date/Time columns in user locale**: the Paper portfolio table's timestamp
  column is now Date/Time in your local timezone instead of raw UTC.

## [v0.2.2] — 2026-08-06

### Components
|| Component | What it is |
||---|---||
|| **Talaria desktop plugin** | Native Hermes Desktop page: live hot signals, renko brick charts (hover for prices), per-symbol signal health, paper book + portfolio analytics, 60s auto-refresh + realtime updates. **v0.2.2 widget:** live qualified-signal badge (pane shows `N live`, chip shows `Talaria · N`), ENTRY/SL/TP pricing on EVERY displayed signal, ENTRY price in toasts, 10-min TTL hot-signal count, plugin version shown in footers |
|| **talaria-tools** | In-chat agent tools — `talaria_health`, `talaria_stats`, `talaria_calibration` — so your Hermes agent can answer "what does this signal mean?" |
|| **talaria-client skill** | A skill your agent installs to explain signals, history, calibration, and paper-vs-equal-weight in plain language |
|| **talaria-trade skill** | A skill your agent uses to execute live 0.01-lot BUY/SELL orders from Talaria signals into the MT5 web trader via the Hermes in-app browser (auto/semi/manual modes) |
|| **Signal notifier + daily digest** | Optional Hermes cron scripts that deliver new signals to whatever messaging you've connected |
|| **Supabase migrations** | The read-only views/tables the plugin reads (anon RLS — subscribers can only SELECT) |
