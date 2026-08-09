# noble-trader-talaria

Standalone, deployable repo for the **Talaria client plugin** — the paywalled
Hermes desktop plugin that delivers Noble Trader signal + paper analytics to
subscribers. Modeled on the hermes-vault release pattern (versioned tags,
plugin dirs + README install instructions, tests + verification).

## What this repo is

Talaria = **read-only UI + chat tools** over the Noble Trader Supabase data
surface (public anon key + RLS-granted views). No backend hop, no local
server — the plugin talks to Supabase REST directly. This repo packages the
client-facing artifacts so any Hermes user can install them:

| Component | Path | What it is |
|---|---|---|
| Desktop plugin (UI) | `plugins/talaria/desktop/plugin.js` | Hermes Electron runtime page — dashboard, charts, hot signals, paper analytics |
| Root plugin copy | `plugins/talaria/plugin.js` | **Must stay byte-identical** to `desktop/plugin.js` (Electron may load either) |
| Render harness | `plugins/talaria/desktop/test_talaria_render_harness.mjs` | Node render tests for the UI |
| Python tools plugin | `plugins/talaria-tools/` | In-chat agent tools: `talaria_health`, `talaria_stats`, `talaria_calibration` |
| Cron notifiers | `scripts/talaria_digest.py`, `scripts/talaria_signal_notify.py` | Daily digest + live signal watcher (Hermes cron) |
| Schema contract | `supabase/migrations/` | Views/tables the plugin reads (anon RLS) |
| Ops playbook | `docs/OPERATIONS.md` | Operator knowledge (deploy, build, pitfalls) |
| Client skill | `docs/CLIENT_SKILL.md` | **User-facing Hermes skill** — lets subscribers ask their agent "what does this signal mean?" / "what happened with XAUUSD on <date>?" |

## Not in this repo (stays in the workspace)

- **Backend publisher** → `noble-trader-fastapi-backend` (sweeps, views, Supabase Realtime broadcast)
- **Subscription portal / claim minting** → `nobletradingapp` (Clerk + Helio checkout, `talaria-check` Edge Function)
- **Proxy / Redis feed** → `noble-trader-proxy` (being retired; `NOBLE_TRADER_REDIS_PUBLISH_ENABLED=false` cuts it)

## Install

```bash
# 1. Copy the desktop plugin to your Hermes home (3 locations for the Electron app)
SRC=plugins/talaria/plugin.js
for d in \
  "$HOME/AppData/Local/hermes/desktop-plugins/talaria" \
  "$HOME/AppData/Local/hermes/profiles/<your-profile>/desktop-plugins/talaria" \
  "$HOME/.hermes/desktop-plugins/talaria"; do
  mkdir -p "$d" && cp "$SRC" "$d/plugin.js" && cmp -s "$SRC" "$d/plugin.js" && echo "OK $d"
done

# 2. Python tools plugin (chat tools) → Hermes Python plugin root
cp -r plugins/talaria-tools "$HOME/AppData/Local/hermes/profiles/<your-profile>/plugins/"

# 3. Enable + set env
hermes config set plugins.enabled '["talaria"]' --profile <your-profile>
# env: TALARIA_SUPABASE_URL, TALARIA_SUPABASE_KEY (anon), TALARIA_CLAIM_TOKEN (optional)

# 4. Restart the Hermes desktop app (or ⌘K → Reload desktop plugins)
```

## Verify after install

1. `node --check plugins/talaria/desktop/plugin.js` → exit 0
2. `node plugins/talaria/desktop/test_talaria_render_harness.mjs` → all PASS
3. `cmp plugins/talaria/desktop/plugin.js plugins/talaria/plugin.js` → identical
4. Open `/talaria` in the desktop app → Connect tab → dashboard renders

## Release checklist (hermes-vault style)

- [ ] Bump `plugin.yaml` version + package version
- [ ] Run harness + `node --check` + `cmp` byte-verify
- [ ] Regenerate daisyUI bundle if plugin classNames changed (`tailwind.plugin.bundle.css` re-embed)
- [ ] Tag `v0.x.0` + push (requires explicit "push git")
- [ ] GitHub Release with install notes (copy the Install section above)
- [ ] Smoke: fresh-home install per the Install section, dashboard + one tool call
