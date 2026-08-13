# plugins/talaria-tools — Python in-chat tools plugin

Hermes **Python plugin** (loaded from `~/.hermes/plugins/<name>/` — NOT the
Electron desktop-plugins path). Gives a Hermes agent the same analytics in
chat: `talaria_health`, `talaria_stats`, `talaria_calibration`.

| File | Source (workspace) |
|---|---|
| `plugin.yaml` | `noble-trader-talaria/plugins/talaria-tools/plugin.yaml` |
| `__init__.py` | `noble-trader-talaria/plugins/talaria-tools/__init__.py` |

## Behavior contract

- Stdlib `urllib` only; 10s timeout; never logs key/token values
- Returns `{error: ...}` dicts, never raises
- Config: embedded service defaults (Option A — same public URL + anon key as
  the desktop widget); optional env overrides `TALARIA_SUPABASE_URL` +
  `TALARIA_SUPABASE_KEY`; `TALARIA_CLAIM_TOKEN` (optional, only for claim
  validation). No `.env` required for normal operation.

## Fill step

Copy both files from the source paths above, `py_compile` to verify.
