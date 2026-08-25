# Agent Instructions — noble-trader-talaria

> **Repo:** `noble-trader-talaria` · **Role:** Client-facing Hermes plugin + Python tools + cron notifiers + Supabase migrations

## What This Repo Is
Talaria = read-only UI + chat tools over the Noble Trader Supabase data surface (public anon key + RLS-granted views). No backend hop, no local server. The desktop plugin talks to Supabase REST directly.

## Components
| Component | Path | What |
|---|---|---|
| Desktop plugin (UI) | `plugins/talaria/desktop/plugin.js` | Hermes Electron runtime page |
| Root plugin copy | `plugins/talaria/plugin.js` | **Must stay byte-identical** to `desktop/plugin.js` |
| Render harness | `plugins/talaria/desktop/test_talaria_render_harness.mjs` | Node render tests |
| Dashboard plugin (web) | `plugins/talaria/dashboard/` | Headless gateway web dashboard |
| Python tools plugin | `plugins/talaria-tools/` | In-chat agent tools |
| Cron notifiers | `scripts/talaria_digest.py`, `scripts/talaria_signal_notify.py` | Daily digest + live signal watcher |
| Schema contract | `supabase/migrations/` | Views/tables the plugin reads (anon RLS) |
| Client skill | `skills/trading/talaria-client/SKILL.md` | User-facing Hermes skill |
| Execution skill | `skills/trading/talaria-trade/SKILL.md` | Live trade execution via MT5 web trader (auto/semi/manual) |

## Plugin Development Rules
- **React.createElement only** — no JSX in `plugin.js`.
- **Helpers before use** — ESM ordering error #310: declare all helper components/functions BEFORE the component that uses them.
- **Rules-of-hooks** — no early returns before all hooks are called (causes React #310). Declare all hooks first.
- **daisyUI bundle** — embedded with `dui-` prefix (NEVER unprefixed). The Hermes app itself is Tailwind v4 with `.card`/`.table`/`.flex` — unprefixed classes collide.
- **Imports** — desktop `plugin.js` may import only `react` + `@hermes/plugin-sdk`.
- **Table group headers** — render as a separate `<tr colSpan=N>` row, NOT inline cells replacing symbol cells.
- **Kelly table** — intentionally shows ALL symbols (not just `qualified=true`). Rows with `—` dashes are non-qualified signals (expected behavior).

## Dashboard Plugin Contract (web/gateway)
- **IIFE pattern** — plain script, NOT ESM with imports.
- **SDK guard** — early-return if `!SDK || !window.__HERMES_PLUGINS__`.
- **API** — use `SDK.fetchJSON(url, opts)` (handles auth, throws on non-2xx), NOT raw `window.fetch`.
- **Registration** — `window.__HERMES_PLUGINS__.register("talaria", ReactComponent)` (pass a component, NOT `SDK.register({area,render,data})`).
- **Security** — never put claim tokens or user-specific data in the served bundle; use anon key only.
- **Enable** — `hermes plugins enable talaria` is REQUIRED (assets 404 unless enabled).

## Deploy (Electron homes — byte-verify ALL 3)
```bash
# Copy plugin.js to all 3 homes, verify byte-identical
SRC=plugins/talaria/desktop/plugin.js
for d in \
  "$HOME/AppData/Local/hermes/desktop-plugins/talaria" \
  "$HOME/AppData/Local/hermes/profiles/<your-profile>/desktop-plugins/talaria" \
  "$HOME/.hermes/desktop-plugins/talaria"; do
  mkdir -p "$d" && cp "$SRC" "$d/plugin.js" && cmp -s "$SRC" "$d/plugin.js" && echo "OK $d"
done
```
After deploy: restart the desktop app (or ⌘K → *Reload desktop plugins*). Then ⌘K → *Reload desktop plugins*.

## Build / Edit Workflow
1. Edit `desktop/plugin.js`.
2. Sync root copy: `cp desktop/plugin.js plugin.js`.
3. Add fetch-URL stubs to the render harness for any new Supabase views.
4. Verify: `node --check`, render harness → all PASS, `cmp` desktop == root.
5. If daisyUI classNames changed: rebuild `tailwind.plugin.bundle.css` (prefixed `dui-`, NO `@tailwind base`) + re-embed via the python helper.

## Known Pitfalls (verified)
- **Toast/widget parity is a hard contract** — both surfaces MUST show the same most-current qualified signal. A mismatch is a bug, not "expected divergence."
- **Widget poll truncation** (FIXED v0.2.7): 20-row poll fed desc rows into `recent=[row,...recent].slice(0,12)` → newest rows at array TAIL got truncated. Fix: reverse batch (feed oldest→newest), suppressToast=`!isNewest`, `addSignal` always `_emit()`s. Diagnostic in `noble-trader-stack` references.
- **Widget poll MUST filter `qualified=eq.true`** — the 20 newest `nt_sweep_result` rows are usually ALL cooldown-suppressed (q=false), so an unfiltered desc poll starves the widget of priced rows.
- **Stale deploy** = classic "no change after restart" — always byte-verify all 3 homes.
- **Cron `.sh` wrappers fail** on Windows ("bash not found on PATH") — use Python scripts only.
- **`HERMES_PROFILE` env is ignored** in cron/shell contexts — use `HERMES_HOME` for delivery.
- **`no_agent` cron deliveries to origin land as role=tool messages** in the session store — NOT visible chat bubbles.
- **Headless gateway**: desktop widget (`plugin.js`) CANNOT run on a headless remote — only `talaria-tools` Python tools work there.

## Cron Jobs
| Job | Schedule | Script | Notes |
|---|---|---|---|
| Daily digest | `0 15 * * *` | `talaria_digest.py` | no_agent, deliver: local |
| Signal notifier | `*/5 * * * *` | `talaria_signal_notify.py` | no_agent, watches `nt_sweep_result` for qualified signals |
| Delivery health | `*/30 * * * *` | `talaria_delivery_health.py` | no_agent, monitors signals→toast→widget chain |

> All scripts are pure stdlib (no project deps). Run via Hermes cron with:
> `C:\Users\aloys\AppData\Local\hermes\hermes-agent\venv\Scripts\python.exe`

## Pricing Models & UUIDs
| Plan | Symbols | Live UUID |
|---|---|---|
| Signal Scout | 10 | `df980ef1-e41f-41db-9d04-2ad09da69626` |
| Precision Pro | 20 | `1b66e78e-e8d1-46b6-9887-b36e038131c5` |
| Basket Scalper | — | `479635b8-8d1f-40b2-9692-fd0118f72e7a` (plan-only, engine TBD) |

## Live Data Source
The plugin connects directly to Supabase with the **anon key** (`sb_publishable_...`). The data path:
- **Signals** → `nt_sweep_result` (RLS: `signals` public, `paper` Pro-only)
- **Paper portfolio** → `v_talaria_portfolio_stats` (Pro-only, RLS)
- **Calibration** → `v_talaria_calibration_stats`

## talaria-tools Zero-Config (2026-08-13)
`talaria-tools` now embeds `DEFAULT_SUPABASE_URL` + `DEFAULT_ANON_KEY` (same public values as `plugin.js`). Env overrides are optional; "not configured" guards have been removed. Do NOT advise setting `TALARIA_SUPABASE_*` env vars.

## Related
- **Backend** → `noble-trader-fastapi-backend` (sweeps, writes `nt_sweep_result`, Supabase Realtime broadcast)
- **Portal** → `nobletradingapp` (Clerk + Helio checkout, claim tokens, `talaria-check` Edge Function)
- **Proxy** → `noble-trader-proxy` (retired via `NOBLE_TRADER_REDIS_PUBLISH_ENABLED=false`)
- **Admin plugin** → `noble-trader-hermes-plugins` (admin dashboard plugin mirrors here)
