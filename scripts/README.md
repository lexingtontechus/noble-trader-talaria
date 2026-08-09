# scripts — Hermes cron notifiers

| Script | What | Cron recipe |
|---|---|---|
| `talaria_digest.py` | Daily digest markdown → stdout (exit 0 always) | `no_agent`, `0 15 * * *`, script + wrapper |
| `talaria_signal_notify.py` | Watermark watcher on `nt_sweep_result` — prints NEW qualified signals (direction, entry/SL/TP, kelly, regime, ⚡ shift, UTC time) | `no_agent`, `*/5 * * * *` |

## Sources (workspace)

- `noble-trader-agent/scripts/talaria_digest.py`
- `noble-trader-agent/scripts/talaria_signal_notify.py`

## Env (both)

`TALARIA_SUPABASE_URL`, `TALARIA_SUPABASE_KEY` (anon). Signal notifier also:
`TALARIA_SIGNAL_STATE` (default `~/.talaria_signal_notify.state`).

## Cron gotchas (Windows)

- Cron wrappers MUST be Python (`.py`) — the Hermes cron runner cannot execute
  `.sh` ("bash not found on PATH").
- For Discord delivery when the bot lives on a DIFFERENT profile home, the
  wrapper calls `hermes send --to discord -q` with `HERMES_HOME` set to the
  default profile home (`HERMES_PROFILE` env is IGNORED; `HERMES_HOME` works).
- `deliver: local` on the cron + the wrapper handles Discord explicitly.

## Fill step

Copy both scripts + the profile wrappers (deployment-specific), `py_compile`,
and wire the cron jobs.
