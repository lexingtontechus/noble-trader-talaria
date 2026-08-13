# Changelog

All notable changes to the noble-trader-talaria repo are documented here.
Format loosely based on [Keep a Changelog](https://keepachangelog.com/).

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
