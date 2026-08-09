# supabase/migrations — schema contract the plugin reads

The plugin reads these views/tables via the PUBLIC anon key (RLS-granted).
They are created by the backend repo's migrations — this folder documents the
contract + hosts the standalone SQL for deployment.

| Object | Migration | Plans | Purpose |
|---|---|---|---|
| `nt_symbol` | 001+ | all | symbols + plan_ids |
| `nt_sweep_result` | 029/030/031 | all | signals: entry/SL/TP, kelly, regime, regime_shift/prev_regime, qualified |
| `nt_renko_bricks` | (renko) | all | brick chart + Markov series |
| `v_talaria_signal_health` | **110** | all | per-symbol scoreboard: win rate, bias, PnL, profit factor |
| `v_talaria_portfolio_stats` | **110** | Pro | Sharpe/Sortino/Calmar/MaxDD/vol/PnL |
| `v_eod_calibration_bias` | 103 | all | daily calibration bias |
| `v_paper_vs_optimized_daily` | 106 | Pro | paper vs equal-weight benchmark |
| `nt_paper_positions` + `v_paper_equity` | paper book | Pro | simulated portfolio |

## Source

`noble-trader-fastapi-backend/supabase/migrations/110_talaria_analytics.sql`
(+ 103/106/107 the views build on). User applies migrations manually via the
Supabase SQL editor.

## Fill step

Copy 110 (and referenced migrations) here as the versioned contract.
