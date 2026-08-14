# Changelog

All notable changes to the noble-trader-talaria repo are documented here.
Format loosely based on [Keep a Changelog](https://keepachangelog.com/).

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

## [v0.2.4] — 2026-08-13

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
