# How Noble Trader works — the engine behind Talaria

*Marketing + technical explainer for the repo. Everything below describes the
real pipeline in `noble-trader-fastapi-backend` (LightningAI sweep
orchestrator).*

---

## The short version

Every 5 minutes, Noble Trader's engine sweeps the symbol universe, turns price
history into **renko bricks**, reads the current market **regime** with a
hidden Markov model, asks a **foundation model (TimesFM)** what the next bar
looks like, blends four probability sources into one **expected-value (EV)
score**, and only publishes a signal if it passes **seven quality gates**. The
weekly heavy sweep re-calibrates everything against the last week's data.

The result: fewer, higher-conviction signals — each one carrying an explicit
edge estimate and a Kelly-sized position suggestion.

## Why it's different

| Layer | What it does | Why it matters |
|---|---|---|
| **Renko bricks** | Price action rebuilt as fixed-size bricks ($1, 0.5%, etc.) instead of time candles | Filters out time-based noise — a brick only forms when price actually moves a full step. Cleaner trend structure than candlesticks |
| **HMM regime detection** | A hidden Markov model labels each moment as a volatility/trend regime (`high_vol_strong_bull`, `low_vol_bear`, …) from returns + 5 technical indicators | The engine knows *what kind of market it's in* — it won't treat a low-vol range like a trending breakout |
| **TimesFM forecast** | Google's time-series foundation model predicts the next bar; confidence feeds the gate | Adds a genuinely learned view of "what happens next", not just momentum math |
| **EV Engine (v5)** | Blends 4 probability sources — pattern (renko), regime (HMM), Markov hold-time, TimesFM — into one win-probability and expected value | No single signal source is trusted alone; disagreement is resolved by a weighted blend |
| **7-gate qualification** | Kelly minimum, regime confidence, EV/RR minimum, TimesFM availability + confidence, p_win floor, content/cooldown dedup | Most signals are *rejected* on purpose. Only the signals with a real, measurable edge get published |
| **Kelly sizing** | Position size = fraction of capital implied by the edge (`effective_kelly`, capped at 20%) | Math-driven risk sizing — big edge = bigger bet, thin edge = smaller bet |
| **Weekly heavy recalibration** | Every Sunday the heavy sweep grid-searches brick sizes/ATR over 90 days of 1-hour bars and refits the regime model | Parameters don't rot — the engine re-adapts to the market it's actually seeing |
| **EOD calibration loop** | Every night, realized outcomes are compared to predicted win rates; bias is measured and corrected | Self-improving: if the model is overconfident, it gets tuned down before the next day |
| **Paper book validation** | Every signal is tracked in a Kelly-sized paper book; outcomes resolve to TP/SL/expiry | The scoreboard shows *realized* results of the actual signal flow, not backtest fantasy |

## The pipeline in one diagram

```
1h + 5m price history (TradingView)
        │
        ▼
   Renko bricks ──► pattern probability (p_pattern)
        │
        ▼
   HMM regime ──► regime label + confidence ──► regime probability (p_regime)
        │
        ▼
   Markov hold-time model ──► p_markov_hold_n
        │
        ▼
   TimesFM forecast ──► p_timesfm (+ confidence gate)
        │
        ▼
   EV Engine v5 ──► blended P(win) × reward − (1−P(win)) × risk = EV
        │
        ▼
   7 gates (Kelly, EV/RR, regime conf, TimesFM, p_win, dedup/cooldown)
        │
        ▼
   QUALIFIED signal ──► entry / SL / TP + Kelly size ──► Supabase ──► Talaria
```

## What Talaria adds

Talaria is the client side: a read-only Hermes Desktop dashboard that renders
these signals with the supporting evidence — renko charts, regime state,
per-symbol win rates, calibration bias, and the paper book — so you're not
trading on a black box. Every number on the dashboard traces back to this
pipeline.

---

*Talaria is a product of Noble Trading. Subscription and claim tokens:
[nobletrading.app](https://nobletrading.app).*
