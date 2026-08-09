#!/usr/bin/env python3
"""Talaria signal notifier — watermark watcher for new qualified signals.

Polls ``nt_sweep_result`` (Supabase REST, anon key) for NEW qualified signals
since the last run and prints a compact markdown message to stdout. Intended
to run under `hermes cron` in no_agent mode, where stdout is delivered verbatim
to whatever channels the user has configured in Hermes (desktop chat today,
any connected platform after `hermes gateway setup`) — so this script prints
ONLY new signals (nothing = silent tick) and always exits 0.

Watermark: the newest ``sweep_timestamp`` seen is persisted to a state file
(default ``~/.talaria_signal_notify.state``; override via TALARIA_SIGNAL_STATE).
The FIRST run establishes the baseline and prints nothing (no backlog dump).

Config (environment variables):
    TALARIA_SUPABASE_URL  — Supabase project REST URL
    TALARIA_SUPABASE_KEY  — public anon key (nt_sweep_result is anon-granted)
    TALARIA_SIGNAL_STATE  — optional state-file path (default ~/.talaria_signal_notify.state)
"""
from __future__ import annotations

import datetime as _dt
import json
import os
import sys
import urllib.error
import urllib.parse
import urllib.request
from typing import Any, Optional

_TIMEOUT = 10.0
_FETCH_LIMIT = 50
_DIRECTION_ICON = {"buy": "🟢 BUY", "sell": "🔴 SELL", "neutral": "⚪ NEUTRAL"}


# ---------------------------------------------------------------------------
# Config resolution (mirrors scripts/talaria_digest.py)
# ---------------------------------------------------------------------------
def _get_config() -> Optional[dict[str, str]]:
    required = ("TALARIA_SUPABASE_URL", "TALARIA_SUPABASE_KEY")
    missing = [v for v in required if not os.environ.get(v)]
    if missing:
        return None
    return {
        "supabase_url": os.environ["TALARIA_SUPABASE_URL"].rstrip("/"),
        "supabase_key": os.environ["TALARIA_SUPABASE_KEY"],
        "state_file": os.environ.get("TALARIA_SIGNAL_STATE")
        or os.path.join(os.path.expanduser("~"), ".talaria_signal_notify.state"),
    }


def _rest_url(base_url: str, table: str, params: dict[str, str]) -> str:
    base = base_url.rstrip("/")
    if not base.endswith("/rest/v1"):
        base = base + "/rest/v1"
    query = "&".join(f"{k}={urllib.parse.quote(str(v))}" for k, v in params.items())
    return f"{base}/{table}?{query}"


def _fetch_rows(cfg: dict[str, str]) -> list[dict[str, Any]]:
    headers = {"apikey": cfg["supabase_key"], "Authorization": f"Bearer {cfg['supabase_key']}"}
    params = {
        "select": "symbol,signal,entry_price,stop_loss,take_profit,kelly_f,effective_kelly,regime,regime_shift,prev_regime,sweep_timestamp",
        "qualified": "eq.true",
        "order": "sweep_timestamp.desc",
        "limit": str(_FETCH_LIMIT),
    }
    url = _rest_url(cfg["supabase_url"], "nt_sweep_result", params)
    req = urllib.request.Request(url, headers=headers, method="GET")
    with urllib.request.urlopen(req, timeout=_TIMEOUT) as resp:
        body = resp.read().decode("utf-8", errors="replace")
    rows = json.loads(body)
    if not isinstance(rows, list):
        raise ValueError(f"unexpected response shape: {type(rows).__name__}")
    return rows


# ---------------------------------------------------------------------------
# Watermark persistence
# ---------------------------------------------------------------------------
def _read_watermark(cfg: dict[str, str]) -> Optional[_dt.datetime]:
    try:
        with open(cfg["state_file"], encoding="utf-8") as fh:
            raw = fh.read().strip()
        if not raw:
            return None
        return _parse_ts(raw)
    except (OSError, ValueError):
        return None


def _write_watermark(cfg: dict[str, str], ts: _dt.datetime) -> None:
    try:
        with open(cfg["state_file"], "w", encoding="utf-8") as fh:
            fh.write(ts.isoformat())
    except OSError:
        pass  # never fail the tick on a state write


def _parse_ts(raw: str) -> _dt.datetime:
    value = raw.strip()
    if value.endswith("Z"):
        value = value[:-1] + "+00:00"
    return _dt.datetime.fromisoformat(value)


# ---------------------------------------------------------------------------
# Formatting (full-value $ prices — 6dp → rstrip zeros → keep ≥2dp)
# ---------------------------------------------------------------------------
def _fmt_price(value: Any) -> str:
    if value is None:
        return "—"
    try:
        text = f"{float(value):.6f}".rstrip("0").rstrip(".")
    except (TypeError, ValueError):
        return str(value)
    if "." not in text:
        text += ".00"
    elif len(text.split(".", 1)[1]) < 2:
        text += "0"
    return f"${text}"


def _fmt_time(value: Any) -> str:
    if value is None:
        return ""
    try:
        ts = _parse_ts(str(value))
        return ts.astimezone(_dt.timezone.utc).strftime("%Y-%m-%d %H:%M UTC")
    except (ValueError, TypeError):
        return str(value)


def _is_shift(row: dict[str, Any]) -> bool:
    """Regime-shift flag, tolerating bool or string forms from PostgREST."""
    value = row.get("regime_shift")
    if value is None:
        return False
    if isinstance(value, bool):
        return value
    return str(value).lower() in ("true", "1", "yes")


def _build_message(rows: list[dict[str, Any]]) -> str:
    lines: list[str] = []
    for row in rows:
        signal = str(row.get("signal") or "").lower()
        icon = _DIRECTION_ICON.get(signal, signal.upper() or "SIGNAL")
        symbol = row.get("symbol") or "?"
        kelly = row.get("effective_kelly") if row.get("effective_kelly") is not None else row.get("kelly_f")
        kelly_txt = f"{float(kelly):.4f}" if kelly is not None else "—"
        regime = row.get("regime") or ""
        lines.append(
            f"{icon} **{symbol}** — entry {_fmt_price(row.get('entry_price'))} · "
            f"SL {_fmt_price(row.get('stop_loss'))} · TP {_fmt_price(row.get('take_profit'))}"
        )
        parts = [f"Kelly {kelly_txt}"]
        if regime:
            parts.append(f"regime {regime}")
        if _is_shift(row):
            prev = str(row.get("prev_regime") or "").strip()
            parts.append(f"⚡ shift from {prev}" if prev else "⚡ regime shift")
        parts.append(_fmt_time(row.get("sweep_timestamp")))
        lines.append(" · ".join(parts))
    return "\n".join(lines)


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------
def main() -> int:
    cfg = _get_config()
    if cfg is None:
        return 0  # not configured — silent (matches digest)

    try:
        rows = _fetch_rows(cfg)
    except Exception as exc:
        # Never spam the user: silent tick on failure; the watermark is
        # unchanged, so the next tick catches up. Diagnostics go to stderr.
        print(f"talaria-signal-notify: fetch failed: {exc}", file=sys.stderr)
        return 0

    if not rows:
        return 0

    newest = _parse_ts(str(rows[0]["sweep_timestamp"]))
    watermark = _read_watermark(cfg)

    if watermark is None:
        # First run — establish baseline, no backlog dump.
        _write_watermark(cfg, newest)
        return 0

    new_rows: list[dict[str, Any]] = []
    for row in rows:
        try:
            ts = _parse_ts(str(row.get("sweep_timestamp")))
        except (ValueError, TypeError):
            continue
        if ts > watermark:
            new_rows.append(row)

    if new_rows:
        print(f"📡 Noble Trader signals\n\n{_build_message(new_rows)}")

    _write_watermark(cfg, newest)
    return 0


if __name__ == "__main__":
    sys.exit(main())
