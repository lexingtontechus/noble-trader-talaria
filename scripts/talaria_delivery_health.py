#!/usr/bin/env python3
"""Talaria delivery-chain health watchdog (Hermes cron, Python stdlib only).

Monitors the FULL delivery chain for the Talaria signals widget + toast
notifications on the local Hermes desktop:

  1. SIGNALS ARRIVING   — nt_sweep_result rows landing (data pipeline live)
  2. QUALIFIED FLOW     — qualified=eq.true rows within SIGNAL_TTL_MS (60 min),
                          i.e. exactly the rows the widget/chip display
  3. DEPLOY INTEGRITY   — desktop/plugin.js == root copy == all 3 Electron
                          homes (a stale deployed plugin = widget shows the
                          old build after a reload — the 2026-08-13 drift)
  4. PLUGIN LOAD HEALTH — desktop.log scan for talaria load failures AFTER the
                          last app boot (runtime load failed / #310 / is not
                          defined)
  5. WIDGET STORE       — talaria-unread.json in Electron localStorage updated
                          within the TTL window (the widget store actually
                          received signal data)

Behavior: prints a status block ONLY when something is drifting or when an
explicit --verbose flag is passed; otherwise stays silent (Hermes cron
no_agent semantics: empty stdout = no delivery). Always exit 0 so the cron
runner never flags a watchdog tick as an error.

Config:
  TALARIA_SUPABASE_URL / TALARIA_SUPABASE_KEY  (anon or service key — REST)
  TALARIA_ROOT          override repo root (default: noble-trader-talaria)
  HERMES_LOG            override desktop.log path
  HERMES_LOCAL_STORAGE  override Electron LevelDB dir
"""
from __future__ import annotations

import hashlib
import json
import os
import re
import sys
import urllib.parse
import urllib.request
from datetime import datetime, timedelta, timezone

# ---------------------------------------------------------------- paths
DEFAULT_REPO = r"C:\Users\aloys\OneDrive\Documents\GitHub\noble-trader-workspace\noble-trader-talaria"
DEFAULT_LOG = r"C:\Users\aloys\AppData\Local\hermes\logs\desktop.log"
DEFAULT_LS = r"C:\Users\aloys\AppData\Roaming\Hermes\Local Storage\leveldb"

HOMES = [
    r"C:\Users\aloys\AppData\Local\hermes\desktop-plugins\talaria\plugin.js",
    r"C:\Users\aloys\AppData\Local\hermes\profiles\ultron\desktop-plugins\talaria\plugin.js",
    r"C:\Users\aloys\.hermes\desktop-plugins\talaria\plugin.js",
]

SIGNAL_TTL_MS = 60 * 60 * 1000   # widget display TTL (SIGNAL_TTL_MS in plugin)
SWEEP_STALE_MIN = 15             # no sweep row at all in 15 min = pipeline drift
QUALIFIED_STALE_H = 6            # no QUALIFIED signal in 6h on a live pipeline
                                 # = widget will show the empty state (worth a
                                 # low-severity note, NOT an error — cooldown
                                 # suppression can legitimately keep q=false
                                 # for hours on slow regimes)
STORE_STALE_H = 4                # talaria-unread.json last write older than 4h
                                 # while qualified signals ARE flowing = store
                                 # not receiving data

_verbose = False


def log(*a) -> None:
    if _verbose:
        print(*a, file=sys.stderr)


# ---------------------------------------------------------------- helpers
def sha256(path: str) -> str | None:
    try:
        h = hashlib.sha256()
        with open(path, "rb") as fh:
            for chunk in iter(lambda: fh.read(1 << 20), b""):
                h.update(chunk)
        return h.hexdigest()
    except OSError:
        return None


def rest_rows(base: str, key: str, table: str, params: dict) -> list:
    url = f"{base}/{table}?{urllib.parse.urlencode(params)}"
    req = urllib.request.Request(url)
    req.add_header("apikey", key)
    req.add_header("Authorization", f"Bearer {key}")
    try:
        with urllib.request.urlopen(req, timeout=25) as resp:
            return json.loads(resp.read().decode("utf-8"))
    except Exception:
        return []


def now_iso(dt: datetime) -> str:
    return dt.isoformat()


# ---------------------------------------------------------------- checks
def check_signals(base: str, key: str, now: datetime, alerts: list, context: dict):
    """1. Signals arriving + 2. qualified flow within the widget TTL."""
    # newest row of ANY source
    rows = rest_rows(base, key, "nt_sweep_result", {
        "select": "sweep_timestamp,qualified",
        "order": "sweep_timestamp.desc",
        "limit": "50",
    })
    if not rows:
        alerts.append("SIGNALS: nt_sweep_result returned ZERO rows (pipeline or anon-key read broken)")
        return
    try:
        newest = datetime.fromisoformat(rows[0]["sweep_timestamp"].replace("Z", "+00:00"))
    except Exception:
        alerts.append("SIGNALS: could not parse newest sweep_timestamp")
        return
    age_min = (now - newest).total_seconds() / 60
    context["newest_sweep"] = newest.strftime("%Y-%m-%d %H:%M:%S UTC")
    context["newest_age_min"] = round(age_min, 1)
    if age_min > SWEEP_STALE_MIN:
        alerts.append(
            f"SIGNALS: no sweep row for {age_min:.0f} min (> {SWEEP_STALE_MIN} min). "
            "Pipeline stalled or Supabase unreachable."
        )

    # Qualified rows within the widget TTL window — what the widget displays.
    # Mirror the plugin's poll exactly: server-side qualified=eq.true filter
    # over the TTL window (NOT a client-side scan of the newest 50 rows —
    # those span ~5 min of 6s sweeps and cooldown suppression makes most
    # q=false, so the scan undercounts).
    qrows = rest_rows(base, key, "nt_sweep_result", {
        "select": "sweep_timestamp,symbol,signal",
        "qualified": "eq.true",
        "sweep_timestamp": f"gte.{now_iso(now - timedelta(seconds=SIGNAL_TTL_MS // 1000))}",
        "order": "sweep_timestamp.desc",
        "limit": "50",
    })
    qfresh = [r for r in qrows
              if (now - _parse_ts(r.get("sweep_timestamp"))).total_seconds() < SIGNAL_TTL_MS / 1000]
    context["qualified_ttl"] = len(qfresh)
    if qfresh:
        context["newest_qualified"] = qfresh[0]["sweep_timestamp"][:19] + "Z"
    # low-severity note: pipeline live but no qualified signal for a long time
    if qfresh:
        pass
    else:
        newest_q = None
        # fall back to a wider qualified scan for the "stale" note
        wide = rest_rows(base, key, "nt_sweep_result", {
            "select": "sweep_timestamp",
            "qualified": "eq.true",
            "sweep_timestamp": f"gte.{now_iso(now - timedelta(hours=24))}",
            "order": "sweep_timestamp.desc",
            "limit": "1",
        })
        if wide:
            newest_q = _parse_ts(wide[0].get("sweep_timestamp"))
        if newest_q is not None:
            q_age_h = (now - newest_q).total_seconds() / 3600
            if q_age_h > QUALIFIED_STALE_H:
                alerts.append(
                    f"SIGNALS: pipeline live but NO qualified signal for {q_age_h:.1f}h "
                    f"(last {newest_q.strftime('%Y-%m-%d %H:%M UTC')}). Widget shows the "
                    "empty state — cooldown suppression likely, but verify if unexpected."
                )


def _parse_ts(ts) -> datetime:
    try:
        return datetime.fromisoformat(str(ts).replace("Z", "+00:00"))
    except Exception:
        return datetime.min.replace(tzinfo=timezone.utc)


def check_deploy(repo_root: str, alerts: list, context: dict):
    """3. Byte-identity: desktop == root == 3 homes."""
    desktop = os.path.join(repo_root, "plugins", "talaria", "desktop", "plugin.js")
    root = os.path.join(repo_root, "plugins", "talaria", "plugin.js")
    want = sha256(desktop)
    if want is None:
        alerts.append("DEPLOY: desktop/plugin.js missing or unreadable")
        return
    root_h = sha256(root)
    context["plugin_size"] = os.path.getsize(desktop)
    context["plugin_hash"] = want[:12]
    if root_h != want:
        alerts.append("DEPLOY: plugins/talaria/plugin.js (root) != desktop/plugin.js (stale root copy)")
    for home in HOMES:
        h = sha256(home)
        if h is None:
            alerts.append(f"DEPLOY: missing {home}")
        elif h != want:
            alerts.append(f"DEPLOY: stale copy at {home} (mismatch vs desktop/plugin.js)")


def check_log(log_path: str, alerts: list, context: dict):
    """4. desktop.log: talaria load failures AFTER the last app boot."""
    try:
        with open(log_path, "r", encoding="utf-8", errors="ignore") as fh:
            data = fh.read()
    except OSError:
        alerts.append("LOG: desktop.log unreadable")
        return
    # find last boot marker
    boots = [m.start() for m in re.finditer(r"\[boot\].*?Hermes runtime is ready|\[boot\].*?ready", data)]
    start = boots[-1] if boots else 0
    tail = data[start:]
    patterns = [
        r"runtime load failed.*talaria",
        r"Failed to load plugin.*talaria",
        r"talaria[^\n]{0,80}(Cannot access|is not defined|#310|Rendered more hooks|SyntaxError)",
    ]
    hits = []
    for pat in patterns:
        hits.extend(re.findall(pat, tail, re.IGNORECASE))
    if hits:
        # dedupe, cap
        seen = set()
        uniq = []
        for hh in hits:
            key = hh if isinstance(hh, str) else str(hh)
            if key not in seen:
                seen.add(key)
                uniq.append(key)
        alerts.append(f"LOG: {len(uniq)} talaria load error(s) after last boot: {uniq[:3]}")
    else:
        context["log_talaria_errors"] = 0


def check_store(ls_dir: str, now: datetime, alerts: list, context: dict, base: str, key: str):
    """5. talaria-unread.json recency in Electron localStorage."""
    # Find the newest matching key value across LevelDB files (log + ldb).
    newest_mtime: datetime | None = None
    found = False
    for fn in os.listdir(ls_dir):
        if not (fn.endswith(".log") or fn.endswith(".ldb")):
            continue
        path = os.path.join(ls_dir, fn)
        try:
            with open(path, "rb") as fh:
                data = fh.read()
        except OSError:
            continue
        idx = 0
        while True:
            idx = data.find(b"talaria-unread.json", idx)
            if idx < 0:
                break
            found = True
            # The key is followed by a length-prefixed JSON value (LevelDB
            # value encoding). Search forward for a JSON object containing
            # "lastSignal" and try to extract a ts. Best-effort: look for
            # ISO timestamps near the key.
            seg = data[idx: idx + 20000].decode("utf-8", errors="ignore")
            ts_match = re.search(r"\"ts\"\s*:\s*\"([^\"]+)\"", seg)
            if ts_match:
                parsed = _parse_ts(ts_match.group(1))
                if parsed.year > 2024 and (newest_mtime is None or parsed > newest_mtime):
                    newest_mtime = parsed
            idx += len(b"talaria-unread.json")
    context["store_key_found"] = found
    if not found:
        # Absence is only suspicious when qualified signals ARE flowing.
        if rest_rows(base, key, "nt_sweep_result",
                     {"select": "id", "qualified": "eq.true",
                      "sweep_timestamp": f"gte.{now_iso(now - timedelta(hours=STORE_STALE_H))}",
                      "limit": "1"}):
            alerts.append("STORE: talaria-unread.json absent from Electron localStorage "
                          "while qualified signals are flowing (widget store not receiving data)")
        return
    if newest_mtime is None:
        alerts.append("STORE: talaria-unread.json found but no parsable signal ts (format changed?)")
        return
    age_h = (now - newest_mtime).total_seconds() / 3600
    context["store_last_signal"] = newest_mtime.strftime("%Y-%m-%d %H:%M:%S UTC")
    context["store_age_h"] = round(age_h, 1)
    if age_h > STORE_STALE_H and rest_rows(base, key, "nt_sweep_result",
                                           {"select": "id", "qualified": "eq.true",
                                            "sweep_timestamp": f"gte.{now_iso(now - timedelta(hours=STORE_STALE_H))}",
                                            "limit": "1"}):
        alerts.append(f"STORE: talaria-unread.json last signal {age_h:.1f}h ago while "
                      "qualified signals are flowing — widget store stale (poll dead?)")


def main() -> int:
    global _verbose
    _verbose = "--verbose" in sys.argv

    base = os.environ.get("TALARIA_SUPABASE_URL", "").rstrip("/") + "/rest/v1"
    key = os.environ.get("TALARIA_SUPABASE_KEY", "")
    repo_root = os.environ.get("TALARIA_ROOT", DEFAULT_REPO)
    log_path = os.environ.get("HERMES_LOG", DEFAULT_LOG)
    ls_dir = os.environ.get("HERMES_LOCAL_STORAGE", DEFAULT_LS)

    now = datetime.now(timezone.utc)
    alerts: list[str] = []
    context: dict = {}

    if base.startswith("/rest/v1") or not key:
        alerts.append("CONFIG: TALARIA_SUPABASE_URL / TALARIA_SUPABASE_KEY missing")
    else:
        check_signals(base, key, now, alerts, context)

    check_deploy(repo_root, alerts, context)
    check_log(log_path, alerts, context)
    if not base.startswith("/rest/v1") and key:
        check_store(ls_dir, now, alerts, context, base, key)

    if not alerts:
        if _verbose:
            print("TALARIA DELIVERY HEALTH OK "
                  f"(sweep {context.get('newest_age_min')}m ago, "
                  f"qualified_ttl={context.get('qualified_ttl')}, "
                  f"plugin {context.get('plugin_size')}B/{context.get('plugin_hash')}, "
                  f"store {'fresh' if context.get('store_age_h', 99) < STORE_STALE_H else 'absent'})")
        return 0

    print(f"TALARIA DELIVERY WATCHDOG {now.strftime('%Y-%m-%d %H:%M:%S UTC')}")
    print(f"  newest_sweep={context.get('newest_sweep', 'n/a')} "
          f"({context.get('newest_age_min', '?')}m ago) "
          f"qualified_ttl={context.get('qualified_ttl', 0)}")
    for a in alerts:
        print(f"  ! {a}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
