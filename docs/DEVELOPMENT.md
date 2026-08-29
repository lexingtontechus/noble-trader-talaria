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
| Dashboard plugin (web) | `plugins/talaria/dashboard/` | Headless gateway web dashboard — `manifest.json` (entry=`dist/index.js`, css=`dist/style.css`, api=`plugin_api.py`) + harness `test_dashboard_render_harness.mjs` |
| Python tools plugin | `plugins/talaria-tools/` | In-chat agent tools: `talaria_health`, `talaria_stats`, `talaria_calibration` |
| Cron notifiers | `scripts/talaria_digest.py`, `scripts/talaria_signal_notify.py` | Daily digest + live signal watcher (Hermes cron) |
| Schema contract | `supabase/migrations/` | Views/tables the plugin reads (anon RLS) |
| Ops playbook | `docs/OPERATIONS.md` | Operator knowledge (deploy, build, pitfalls) |
| Client skill | `skills/trading/talaria/SKILL.md` | **User-facing Hermes skill** — lets subscribers ask their agent "what does this signal mean?" / "what happened with XAUUSD on <date>?" |

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

> **Naming convention**: Desktop plugins use the folder name as the plugin id.
> The desktop plugin's internal `id` is `'talaria'`, so the folder must be `talaria/`.
> The headless gateway web dashboard plugin uses the `manifest.json` `name` field
> (`"talaria"`) and is installed to `~/.hermes/plugins/talaria/`.

## Verify after install

1. `node --check plugins/talaria/desktop/plugin.js` → exit 0
2. `node plugins/talaria/desktop/test_talaria_render_harness.mjs` → all PASS
3. `cmp plugins/talaria/desktop/plugin.js plugins/talaria/plugin.js` → identical
4. `node --check plugins/talaria/dashboard/dist/index.js` → exit 0
5. `node plugins/talaria/dashboard/test_dashboard_render_harness.mjs` → all PASS (web dashboard)
6. Open `/talaria` in the desktop app → Connect tab → dashboard renders

## Install (headless gateway / web dashboard)

For remote/cloud gateway instances (no Electron), install the dashboard
plugin instead of or in addition to the desktop plugin:

```bash
# Install to your Hermes home user plugins directory
mkdir -p ~/.hermes/plugins/talaria
cp -r plugins/talaria/dashboard/ ~/.hermes/plugins/talaria/

# Enable the plugin (REQUIRED — assets 404 unless enabled)
hermes plugins enable talaria --profile <your-profile>

# Start the headless gateway with the web dashboard
hermes serve --host 0.0.0.0 --port 9119

# Open http://<gateway-host>:9119/talaria in any browser
```

The dashboard plugin talks to Supabase directly (anon read-only key) — no
claim token or secrets needed on the server side. Users paste their claim
token in the browser-based Connect tab.

> **Troubleshooting — plugin not appearing after install:**
> 1. Verify the folder name matches the plugin id (`talaria/`).
> 2. Restart the Hermes desktop app (not just "Rescan").
> 3. Clear the app's plugin cache: delete `~/.hermes/desktop-plugins/talaria/`
>    and re-copy the file.
> 4. Check DevTools Console (`⌘+Shift+I`) for `[talaria 0.2.8]` load errors.

## Release checklist (hermes-vault style)

- [ ] Bump `plugin.yaml` version + package version
- [ ] Run harness + `node --check` + `cmp` byte-verify
- [ ] `node --check plugins/talaria/dashboard/dist/index.js` + harness PASS (web dashboard)
- [ ] Regenerate daisyUI bundle if plugin classNames changed (`tailwind.plugin.bundle.css` re-embed)
- [ ] Tag `v0.x.0` + push (requires explicit "push git")
- [ ] GitHub Release with install notes (copy the Install section above)
- [ ] Smoke: fresh-home install per the Install section, dashboard + one tool call
- [ ] Smoke: headless gateway install (copy above), `hermes serve` + browser open `/talaria`
