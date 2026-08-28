# Talaria v0.2.19 — Signal Health Scoreboard Cleanup

**Release date:** 2026-08-26
**Plugin version:** `0.2.19`
**Repo:** `lexingtontechus/noble-trader-talaria`

## Summary

Signal health scoreboard cleanup + version drift fix. Removes the "sig" pill badge
from the scoreboard table and corrects version drift on the flat `plugin.js` copy.

## Assets

- `talaria-plugin-v0.2.19.zip` — includes `plugins/talaria/desktop/plugin.js`,
  `plugins/talaria/plugin.js`, `plugins/talaria/desktop/test_talaria_render_harness.mjs`,
  `scripts/talaria_delivery_health.py`

## Changed

### Signal Health Scoreboard

- Removed the `'sig'` pill badge (`span.tla-badge.tla-hot-chip` with text `'sig'`) from
  the Symbol column in the Signal health scoreboard table. The cell now renders the
  trading symbol as plain text only.
- The BH-FDR significance calculation still runs under the hood (via `fdrBySym[r.symbol]`),
  but is no longer rendered as a visual badge.

### Version Drift

- The root `plugins/talaria/plugin.js` flat copy was stuck at v0.2.16 (never synced from
  the v0.2.18 desktop version). Bumped to v0.2.19 in sync with `desktop/plugin.js`.
- In-plugin upgrade-banner harness mock bumped to v0.2.20 so the version check stays
  strictly ahead of the deployed version.

## Verification

- `node plugins/talaria/desktop/test_talaria_render_harness.mjs` — all PASS
- `node --check plugins/talaria/desktop/plugin.js` — PASS
- `node --check plugins/talaria/plugin.js` — PASS
- No `'sig'` badge references remain in any `plugin.js` copy

## Deploy

```bash
# Copy plugin.js to all homes, verify byte-identical
SRC=plugins/talaria/desktop/plugin.js
for d in \
  "$HOME/AppData/Local/hermes/desktop-plugins/talaria" \
  "$HOME/AppData/Local/hermes/profiles/<your-profile>/desktop-plugins/talaria" \
  "$HOME/.hermes/desktop-plugins/talaria"; do
  mkdir -p "$d" && cp "$SRC" "$d/plugin.js" && cmp -s "$SRC" "$d/plugin.js" && echo "OK $d"
done
```

After deploy: restart the desktop app, then `⌘K → Reload desktop plugins`.

## How to Create the GitHub Release

```bash
gh release create v0.2.19 \
  --title "Talaria v0.2.19 — Signal Health Scoreboard Cleanup" \
  --notes-file RELEASE_NOTES.md \
  --target main \
  --notes "$(cat RELEASE_NOTES.md | sed 's/^# Talaria v0.2.19.*#//')"
  talaria-plugin-v0.2.19.zip
```
