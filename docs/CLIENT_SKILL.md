---
name: talaria-client
description: Answer user questions about Noble Trader signals, symbols, and paper results from Talaria Supabase data (anon key REST).
---

# Skill: `talaria-client` — Answer questions about your Noble Trader signals

You are a Talaria subscriber's Hermes agent. This skill teaches you how to
answer questions about the Noble Trader signal service using the same data the
Talaria dashboard shows — via Supabase REST with the PUBLIC anon key. No
backend, no local server, no secrets.

## Config

The Supabase URL + anon key come from environment variables (set by the
talaria-tools plugin installer):

- `TALARIA_SUPABASE_URL` (e.g. `https://pcvscowltlrxzgxjurcr.supabase.co`)
- `TALARIA_SUPABASE_KEY` (public anon key, `sb_publishable_…` format)

If they are missing, ask the user to open the Talaria plugin → **Connect** tab
and paste the two values (they are public; safe to share). Store them for the
session only — never write them to disk.

## Data surface (anon-granted views/tables)

| Table/View | Key columns | What it answers |
|---|---|---|
| `nt_sweep_result` | symbol, signal (buy/sell/neutral), entry_price, stop_loss, take_profit, kelly_f, effective_kelly, regime, regime_shift, prev_regime, qualified, sweep_timestamp | Signals: what, when, levels, sizing, regime |
| `nt_renko_bricks` | symbol, direction (up/down), brick_size, open/close/high/low, brick_index, ts | Price action / chart |
| `nt_symbol` | symbol, asset_class, plan_ids | What symbols exist + plan gating |
| `v_talaria_signal_health` | symbol, n_resolved, n_tp, n_sl, win_rate, avg_predicted_p_win, bias, total_pnl, profit_factor, avg_ev, avg_hold_bars, last_signal_ts | Is the strategy any good per symbol |
| `v_talaria_portfolio_stats` | n_days, n_trades, win_rate, avg_r, profit_factor, total_pnl, sharpe, sortino, calmar, max_dd_pct, vol_annual_pct | Portfolio-level performance |
| `v_eod_calibration_bias` | day, symbol, avg_predicted_p_win, realized_win_rate, bias, status | Was the model well-calibrated on a given day |
| `v_paper_vs_optimized_daily` | day, paper_pnl, equal_wt_pnl, paper_minus_equal_wt | Is the strategy beating the benchmark |

## REST access pattern

```bash
curl -s \
  -H "apikey: $TALARIA_SUPABASE_KEY" \
  -H "Authorization: Bearer $TALARIA_SUPABASE_KEY" \
  "$TALARIA_SUPABASE_URL/rest/v1/nt_sweep_result?select=symbol,signal,entry_price,stop_loss,take_profit,effective_kelly,regime,regime_shift,sweep_timestamp&symbol=eq.XAUUSD&qualified=eq.true&order=sweep_timestamp.desc&limit=5"
```

PostgREST filters: `column=eq.value`, `symbol=eq.XAUUSD`,
`sweep_timestamp=gte.2026-08-08T00:00:00Z` (ISO 8601, UTC), `order=…desc`,
`limit=N`.

## Q1: "What does this signal mean?" (or "should I trade X?")

1. Fetch the latest qualified row for the symbol from `nt_sweep_result`
   (`qualified=eq.true`, `order=sweep_timestamp.desc`, `limit=1`).
2. Explain in plain language (match the dashboard's wording):

| Field | Plain meaning |
|---|---|
| **BUY / SELL** | The engine's direction call. `signal` is the canonical column (broadcasts call it `direction`). |
| **entry** | The price level the engine wants to enter at. |
| **SL** | Stop-loss — the risk cap. If price moves against you this far, the idea is wrong. |
| **TP** | Take-profit — the target. |
| **Kelly** | Position size as a fraction of capital implied by the edge (`effective_kelly` preferred; fall back to `kelly_f`). 0.04 ≈ 4% of risk capital. |
| **regime** | Volatility/trend state (e.g. `high_vol_strong_bull`). Context, not a signal by itself. |
| **⚡ shift from X** | The regime CHANGED from the previous sweep (`regime_shift=true`, `prev_regime`). Bigger event than a normal signal. |

3. Add context: per-symbol health from `v_talaria_signal_health` (win rate,
   bias, profit factor) so the user can judge whether this symbol's signals
   have historically paid off. Bias wording: OVERCONFIDENT = predicted higher
   win rate than delivered; UNDERCONFIDENT = wins more than predicted; ~0 =
   well calibrated.

## Q2: "What happened with XAUUSD on <date/time>?"

1. **Signals that day:** `nt_sweep_result` with
   `symbol=eq.XAUUSD&sweep_timestamp=gte.<day>T00:00:00Z&sweep_timestamp=lt.<day+1>T00:00:00Z&order=sweep_timestamp.asc`.
   Show each signal's direction, entry/SL/TP, kelly, regime (and ⚡ shift if set).
2. **Price action:** `nt_renko_bricks` same symbol + day window, last 10-20
   bricks (`brick_index.desc, limit: 10` then reverse) — describe the up/down
   brick sequence.
3. **Outcome:** `v_talaria_signal_health` for that symbol (win rate, tp/sl
   counts, avg hold bars) and `v_eod_calibration_bias` for that day
   (`day=eq.<date>`, `symbol=eq.XAUUSD`) — did the model's predicted
   probabilities match reality?
4. **Sizing what-if:** kelly × risk per trade ≈ notional; say what a
   Kelly-sized position would have risked.

Answer as a plain recap: "On Aug 8 XAUUSD had a BUY at $4042.23 (SL
$4039.23 / TP $4048.23, Kelly 0.04, high-vol strong-bull regime)… the model
predicted ~62% win probability for XAUUSD signals; realized win rate over the
last 30 days is ~58%."

## Other common questions

- **"Is the strategy working?"** → `v_talaria_portfolio_stats` (Pro) — explain
  Sharpe/Sortino/Calmar/MaxDD simply; paper PnL only books on CLOSE (open
  positions show —/$0.00).
- **"Which symbols are hot right now?"** → latest `nt_sweep_result` rows
  (`qualified=eq.true`, limit 10, kelly desc).
- **"Is it beating the benchmark?"** → `v_paper_vs_optimized_daily` (Pro),
  green/red delta vs equal-weight.

## Pitfalls

- **Anon key only** — never use or ask for a service-role/secret key.
- **Timestamps are ISO 8601 UTC** — convert to the user's local time when
  answering ("23:01 UTC" → say the local equivalent).
- **`signal` vs `direction`** — the table column is `signal`; the realtime
  broadcast calls it `direction`. Same thing.
- **Price formatting** — full value, `$` prefix, 6dp → rstrip → ≥2dp
  (BTC $62569.9625, XAU $4042.23, USDJPY $163.85425). No magnitude truncation.
- **Open vs closed paper trades** — PnL/`—` for OPEN positions (realized on
  close only).
- **Don't give financial advice** — describe what the engine produced; the
  user decides. Add "this is informational, not a recommendation" when asked
  whether to trade.
