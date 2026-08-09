"""Tests for scripts/talaria_signal_notify.py (Hermes cron signal watcher).

Pure-function tests + main() behavior with _fetch_rows monkeypatched (no
network, no Supabase). Mirrors the repo's monkeypatch/tmp_path test style.
"""
import importlib.util
import sys
from pathlib import Path

_SCRIPT = Path(__file__).resolve().parents[1] / "scripts" / "talaria_signal_notify.py"


def _load_module():
    spec = importlib.util.spec_from_file_location("talaria_signal_notify", _SCRIPT)
    mod = importlib.util.module_from_spec(spec)
    sys.modules["talaria_signal_notify"] = mod
    spec.loader.exec_module(mod)
    return mod


m = _load_module()


def _row(**over):
    row = {
        "symbol": "XAUUSD",
        "signal": "buy",
        "entry_price": 4042.23,
        "stop_loss": 4039.23,
        "take_profit": 4048.23,
        "kelly_f": 0.04,
        "effective_kelly": None,
        "regime": "high_vol_strong_bull",
        "regime_shift": False,
        "prev_regime": "",
        "sweep_timestamp": "2026-08-08T22:21:17.951013+00:00",
    }
    row.update(over)
    return row


def _env(monkeypatch, tmp_path, state="s.state"):
    monkeypatch.setenv("TALARIA_SUPABASE_URL", "https://x.supabase.co")
    monkeypatch.setenv("TALARIA_SUPABASE_KEY", "k")
    monkeypatch.setenv("TALARIA_SIGNAL_STATE", str(tmp_path / state))


# ── config ─────────────────────────────────────────────────────────────
def test_config_requires_env(monkeypatch):
    monkeypatch.delenv("TALARIA_SUPABASE_URL", raising=False)
    monkeypatch.delenv("TALARIA_SUPABASE_KEY", raising=False)
    assert m._get_config() is None


def test_config_resolves_state_file(monkeypatch, tmp_path):
    _env(monkeypatch, tmp_path)
    cfg = m._get_config()
    assert cfg["supabase_url"] == "https://x.supabase.co"
    assert cfg["state_file"] == str(tmp_path / "s.state")


# ── formatting (full-value $ prices) ───────────────────────────────────
def test_fmt_price_full_value():
    assert m._fmt_price(4042.23) == "$4042.23"
    assert m._fmt_price(3556.257) == "$3556.257"
    assert m._fmt_price(5801.23975) == "$5801.23975"
    assert m._fmt_price(100.0) == "$100.00"
    assert m._fmt_price(None) == "—"


def test_fmt_time_utc():
    assert m._fmt_time("2026-08-08T22:21:17.951013+00:00") == "2026-08-08 22:21 UTC"
    assert m._fmt_time("2026-08-08T22:21:17.951013Z") == "2026-08-08 22:21 UTC"


def test_build_message_icons_and_kelly_preference():
    msg = m._build_message([_row(), _row(symbol="EURUSD", signal="sell", effective_kelly=0.1)])
    assert "🟢 BUY" in msg
    assert "🔴 SELL" in msg
    assert "Kelly 0.0400" in msg   # kelly_f fallback
    assert "Kelly 0.1000" in msg   # effective_kelly preference
    assert "$4042.23" in msg and "$4039.23" in msg and "$4048.23" in msg
    assert "regime high_vol_strong_bull" in msg


def test_build_message_regime_shift():
    msg = m._build_message([
        _row(regime_shift=True, prev_regime="high_vol_bear"),
        _row(symbol="EURUSD", signal="sell", regime_shift="true", prev_regime=""),
        _row(symbol="BTCUSD", signal="buy", regime_shift=False),
    ])
    assert "⚡ shift from high_vol_bear" in msg
    assert "⚡ regime shift" in msg          # string-true with empty prev
    assert "⚡" not in msg.split("BTCUSD")[1]  # non-shift row has no marker


# ── main() behavior (fetch mocked) ─────────────────────────────────────
def test_main_first_run_silent_baseline(monkeypatch, tmp_path, capsys):
    _env(monkeypatch, tmp_path)
    monkeypatch.setattr(m, "_fetch_rows", lambda cfg: [_row()])
    assert m.main() == 0
    assert capsys.readouterr().out == ""
    assert "2026-08-08T22:21:17.951013+00:00" in (tmp_path / "s.state").read_text()


def test_main_prints_new_signals_then_silent(monkeypatch, tmp_path, capsys):
    _env(monkeypatch, tmp_path)
    (tmp_path / "s.state").write_text("2000-01-01T00:00:00+00:00", encoding="utf-8")
    monkeypatch.setattr(m, "_fetch_rows", lambda cfg: [_row()])
    assert m.main() == 0
    out1 = capsys.readouterr().out
    assert "📡 Noble Trader signals" in out1 and "XAUUSD" in out1
    assert m.main() == 0
    assert capsys.readouterr().out == ""


def test_main_fetch_failure_silent_and_state_unchanged(monkeypatch, tmp_path, capsys):
    _env(monkeypatch, tmp_path)
    (tmp_path / "s.state").write_text("2026-08-08T10:00:00+00:00", encoding="utf-8")

    def _boom(cfg):
        raise RuntimeError("network down")

    monkeypatch.setattr(m, "_fetch_rows", _boom)
    assert m.main() == 0
    assert capsys.readouterr().out == ""
    assert "2026-08-08T10:00:00+00:00" in (tmp_path / "s.state").read_text()
