# OPERATIONS — Talaria operator playbook

Condensed from the ultron-profile `talaria` skill (the agent's procedural
memory). Follow this when deploying, debugging, or upgrading Talaria.

## Topology

- **Plugin (client)** — `plugins/talaria/desktop/plugin.js` → Supabase REST
  directly (anon key, RLS views). No backend hop, no local server.
- **Data producer** — `noble-trader-fastapi-backend` sweeps → writes
  `nt_sweep_result` + publishes Supabase Realtime broadcasts
  (`realtime:signals` public, `realtime:paper` Pro).
- **Paywall** — `nobletradingapp` portal (Clerk + Helio) mints claim tokens →
  `talaria-check` Edge Function validates against live `subscriptions`.

## Build / edit workflow

1. Edit `desktop/plugin.js` (React.createElement only; helpers before use).
2. Sync root copy: `cp desktop/plugin.js plugin.js`.
3. Add fetch-URL stubs to the render harness BEFORE the final throw.
4. Verify: `node --check` (repo-local temp), render harness → all PASS,
   `cmp` desktop == root.
5. If daisyUI classNames changed: rebuild `tailwind.plugin.bundle.css`
   (prefixed `dui-`, NO `@tailwind base`) + re-embed via the python helper.

## Deploy (Electron homes — byte-verify ALL)

Copy `plugin.js` to `desktop-plugins/talaria/` under
`AppData/Local/hermes`, `AppData/Local/hermes/profiles/<profile>/`, and
`~/.hermes/` — then `cmp -s` each. Restart the desktop app (or ⌘K → Reload).

## Cron jobs

- **Daily digest** — `0 15 * * *`, no_agent, `talaria_digest` wrapper.
- **Signal notifier** — `*/5 * * * *`, no_agent, `talaria_signal_notify`
  wrapper. Watches `nt_sweep_result` for qualified signals newer than the
  watermark (`TALARIA_SIGNAL_STATE`). Delivery: wrapper → `hermes send` →
  Discord via `HERMES_HOME` (default profile). Cron `deliver: local`.

## Key pitfalls

- **Never ship a service-role key** — anon + RLS only.
- **Cron `.sh` wrappers fail** on Windows ("bash not found on PATH") — Python only.
- **`HERMES_PROFILE` env is ignored** in cron/shell contexts — use `HERMES_HOME`.
- **Render harness fetch stub throws** on unknown URLs — add a stub per new view.
- **Stale deployed plugin.js** = classic "no change after restart" — byte-verify.
- **ESM ordering** — late helper declarations resolve to `undefined` (error #310).
- **Unprefixed daisyUI bundle** collides with the app's Tailwind v4 — use `dui-`.

## Verification checklist

1. `node --check` plugin.js → exit 0
2. render harness → all PASS
3. `cmp` desktop == root plugin.js
4. deploy + `cmp -s` byte-verify (3 homes)
5. `py_compile` talaria-tools + scripts
6. live REST probe of `v_talaria_*` with anon key
