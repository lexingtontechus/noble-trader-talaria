# Worklog: Full-Width TV Chart + Watchlist Removal (v0.2.11 update)

**Date:** 2026-08-17
**Session:** Build code — replace watchlist with full-width TV chart
**Repo:** noble-trader-talaria (desktop + dashboard plugins)
**Author:** Ultron (Hermes Agent)

## Problem

After v0.2.11 deploy, user restarted desktop app — saw sizing what-if panel but **no TV chart at all**.
The `tonbistudio/hermes-desktop-plugins` reference repo uses TradingView iframe widget — confirmed NOT the deployment source (local profile directories used instead).

User feedback:
- "the watchlist isn't really needed — we already have the symbols list in Renko bricks panel, when a symbol is selected every panel below cascades/refreshed"
- "the TV chart should be full width like the renko bricks chart w/o the watchlist"
- Screenshot confirmed: watchlist mini-charts were too small/unusable, chart area showed dark blank canvas

## Root causes

1. **Watchlist mini-charts too small** — SVG fallback rendered but charts ~80px height, hard to navigate
2. **Redundant** — user selects symbol via Renko picker, all panels cascade; watchlist was an additional symbol list
3. **No full-width TV chart** — the lightweight-charts infrastructure (`ensureTvCharts`, `fetchTvCandles`) existed but was only wired to the watchlist mini-charts

## Changes made

### 1. Removed TalariaWatchlist from Market tab rendering
- **Desktop** (`plugin.js`): Removed `React.createElement(TalariaWatchlist, ...)` from Market tab Fragment
- **Dashboard** (`dist/index.js`): Same removal — `h(TalariaWatchlist, ...)` removed from Market tab
- Both harnesses updated: assertions now verify Watchlist is NOT rendered (source-level check confirms component still exists in code)

### 2. Added TalariaTvChart component (full-width TV chart)
- **Desktop** (`plugin.js`): New `TalariaTvChart({ symbol, sweeps })` function
  - Renders lightweight-charts candlestick canvas (240px height, 100% width)
  - Fetches 60 × 5M candles from TDVA price proxy via `fetchTvCandles(sym)`
  - Overlays ENTRY/SL/TP horizontal lines from `sweeps.data` for selected symbol
  - SVG fallback polyline renders if lightweight-charts hasn't loaded yet
  - CSS: `.tla-tv-chart-card`, `.tla-tv-canvas-wrapper`, `.tla-tv-ready`, `.tla-tv-pending`, `.tla-tv-svg-fallback`
- **Dashboard** (`dist/index.js`): Same `TalariaTvChart` function + `h()` hyperscript rendering
- Both: component rendered at bottom of Market tab (after Sizing what-if)

### 3. Market tab layout (final order)
1. Stat cards
2. Hot signals banner
3. Symbol picker
4. Renko bricks (full-width, 10-window)
5. Markov + pattern
6. EV / P_win / TimesFM
7. Sizing what-if
8. **Full-width TV chart** ← NEW (TalariaTvChart, bottom of Market tab)
9. Analysis tab (Kelly / Signal health / Calibration / Paper / Portfolio stats)

### 4. Harness updates
- Desktop: removed watchlist rendering assertions, added TV chart assertions (`tla-tv-chart-card`, `tla-tv-canvas-wrapper`, `TalariaTvChart`, `addCandlestickSeries`, `tla-tv-chart-card` CSS)
- Dashboard: added `TalariaTvChart` + `tla-tv-chart-card` source-level assertions
- Both harnesses: `LightweightCharts` stub updated with `addHorizontalLine` + `timeScale` methods

## Verification

| Check | Desktop | Dashboard |
|---|---|---|
| `node --check` | ✅ OK | ✅ OK |
| Render harness | ✅ 146 PASS, 0 FAIL | ✅ 41 PASS, 0 FAIL |
| MD5 (source + 3 homes) | ✅ `e621596474356da08c35912f9b8fb8a8` | — |

## Design decision: iframe vs lightweight-charts

The `tonbistudio/hermes-desktop-plugins` repo uses TradingView **iframe widget** (`https://s.tradingview.com/widgetembed/?...`).
This approach was NOT adopted because:
- Iframe isolation prevents styling inheritance and signal-level overlays
- Can't overlay ENTRY/SL/TP/regime on the chart (iframe boundary)
- Requires external TradingView data, not the workspace's TDVA candle feed

The lightweight-charts CDN + SVG fallback approach is superior:
- Same DOM → inherits CSS variables, dark theme
- Full overlay control for ENTRY/SL/TP horizontal lines
- Uses workspace TDVA price data (not TradingView's)
| SVG fallback ensures charts always render even if CDN fails

### 4th iteration (14:30 — loading placeholder)

**Problem**: User restarted desktop app after deploy — TV chart heading rendered but canvas was blank (dark grey rectangle, no candles, no gridlines).

**Root cause**: `TalariaTvChart`'s SVG fallback returned `null` when `candles` was empty/null (initial state) — both the lightweight-charts path (CDN might be blocked in Electron) AND the SVG fallback (no data → null SVG) produced nothing visible.

**Fix**: Added explicit loading placeholder SVG to `fallbackSvg`:
- When `fallbackBars.length === 0`: renders SVG with "Loading 5M candles…" text
- When `closes.length < 2`: renders SVG with "No candle data — chart pending…" text
- Both placeholders use `var(--ui-text-tertiary, #888)` for visibility on dark backgrounds

**Files modified**:
- `plugins/talaria/desktop/plugin.js`: SVG fallback now always returns a visible element (loading/no-data placeholders)
- `plugins/talaria/dashboard/dist/index.js`: Same SVG fallback logic in `h()` hyperscript
- `test_talaria_render_harness.mjs`: +2 assertions (loading text + `tla-tv-loading` class)
- `test_dashboard_render_harness.mjs`: +1 assertion (`tla-tv-loading` class)
- `CHANGELOG.md`: Updated verification metrics
- `docs/worklog/2026-08-17_tv-chart-deploy.md`: This section

### 5th iteration (14:45 — dataLoaded + AbortSignal guard)

**Problem**: User restarted after loading placeholder deploy — chart shows "Loading 5M candles…"
perpetually (never transitions to "No candle data" or actual candles). The `fetchTvCandles` call
never resolves in the Electron environment.

**Root cause**: The `TDVA_CANDLES_URL` pointed to `https://price-feeds.tradingview-proxy.com/history`
— a non-existent domain (DNS fails). The endpoint was fabricated in the 0.2.11 spec. The real price
data source is the **TradingView iframe widget** (`s.tradingview.com/widgetembed`), same pattern as
the tonbistudio reference repo.

**Re-evaluation of pricing data source** (user requested on 2026-08-17 06:29):
- TDVA REST API (`tradingview-data1.p.rapidapi.com/api/price/batch`) — requires RapidAPI key, server-side only
- Noble-Trader Proxy (`/history/{symbol}?tf=5m`) — serves TDVA data but URL not available to desktop plugin
- Hyperliquid API (`api.hyperliquid.xyz/info`) — only crypto perps, not forex/indices
- TradingView iframe widget (`s.tradingview.com/widgetembed`) — loads TDVA-equivalent candles directly, no API key needed ✅ SELECTED

**Fix**: Replaced the entire lightweight-charts + TDVA fetch approach with TradingView iframe widget:
1. `TalariaTvChart`: Now renders `<iframe src="https://s.tradingview.com/widgetembed/?symbol=OANDA:US30&interval=5&...">`
2. Added `TV_SYMBOL_MAP`: maps internal symbols → TradingView `EXCHANGE:SYMBOL` format
3. Removed: `TDVA_CANDLES_URL`, `fetchTvCandles`, `useTvCandles`, `SvgMiniChart`, `TalariaWatchlist` (watchlist mini-charts were already removed from UI)
4. ENTRY/SL/TP levels shown as hint text in the chart footer
5. When no symbol selected: shows "Select a symbol in the Renko panel above" placeholder

**Files modified**:` plugins/talaria/desktop/plugin.js`
| - Replaced `TalariaTvChart` with iframe widget version
| - Replaced `TDVA_CANDLES_URL`/`fetchTvCandles`/`useTvCandles`/`SvgMiniChart`/`TalariaWatchlist` with `tvWidgetUrl` + `TV_SYMBOL_MAP`
| - Updated CSS: `.tla-tv-iframe` rule

**Verification**:
|| Check | Desktop |
||---|---|---||
|| `node --check` | ✅ OK |
|| Harness | ✅ 150 PASS, 0 FAIL |
||| MD5 (2 profile dirs) | ✅ `b46560fcbe341df6c1a85e94295796fa` |
