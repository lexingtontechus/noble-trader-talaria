<p align="center">
  <img src="https://img.shields.io/badge/Talaria-Noble%20Trading%20Signals-4c9aff" alt="Talaria" />
  <img src="https://img.shields.io/badge/status-live-16a34a" alt="live" />
  <img src="https://img.shields.io/badge/plugin-Hermes%20Desktop-888" alt="Hermes Desktop" />
</p>

# Talaria — Noble Trader signals, inside your Hermes

**Talaria** is the client-facing Hermes Desktop plugin for the **Noble Trader**
signal service. It brings live signals, renko charts, signal health, and paper
analytics straight into your Hermes agent — no backend, no local server, no
secrets on your machine. The plugin talks to Supabase directly with a public
(read-only) key, so **nothing sensitive ever touches your device**.

> 🔒 **Subscription required.** Talaria is a paid service. Choose your plan at
> **[nobletrading.app](https://nobletrading.app)** — your claim token unlocks
> the dashboard after checkout.

## Screenshots

Live signals, ranked by edge — with the renko brick chart showing the price
action behind each signal:

| Dashboard | Renko chart |
|---|---|
| ![Talaria dashboard](docs/screenshots/dashboard.png) | ![Talaria renko chart](docs/screenshots/charts.png) |

---

## What's in this release (v0.2.0)

| Component | What it is |
|---|---|
| **Talaria desktop plugin** | Native Hermes Desktop page: live hot signals, renko brick charts (hover for prices), per-symbol signal health, paper book + portfolio analytics, 60s auto-refresh + realtime updates |
| **talaria-tools** | In-chat agent tools — `talaria_health`, `talaria_stats`, `talaria_calibration` — so your Hermes agent can answer "what does this signal mean?" |
| **talaria-client skill** | A skill your agent installs to explain signals, history, calibration, and paper-vs-equal-weight in plain language |
| **Signal notifier + daily digest** | Optional Hermes cron scripts that deliver new signals to whatever messaging you've connected |
| **Supabase migrations** | The read-only views/tables the plugin reads (anon RLS — subscribers can only SELECT) |

**Data flow:** Noble Trader's quant engine sweeps symbols every 5 minutes
(light) and weekly (heavy), and qualified signals are published to Supabase →
your Talaria dashboard renders them in real time.

## Why Noble Trader

Talaria isn't a chart with arrows. Behind every signal is a pipeline built to
**produce fewer, higher-conviction calls**:

- **Renko bricks** — price action rebuilt as fixed-size bricks, so only real
  price moves count (no time-based noise)
- **HMM regime detection** — the engine knows whether it's in a trending or
  ranging, high- or low-volatility market before it says anything
- **TimesFM foundation-model forecasts** — a learned view of "what happens
  next", fed in as a confidence-gated input
- **EV Engine v5** — four probability sources (pattern, regime, Markov,
  TimesFM) blended into one expected-value score; nothing is trusted alone
- **7 quality gates + Kelly sizing** — most signals are rejected on purpose;
  the ones that publish carry an explicit edge estimate and a math-sized
  position
- **Weekly recalibration + nightly calibration-bias correction + paper-book
  validation** — the engine re-adapts to the market and is audited against
  realized outcomes

> Want the full technical tour? See [How Noble Trader works](docs/HOW_IT_WORKS.md).

## Install

Requirements: **Hermes Desktop** (Electron app), ~2 minutes.

**1. Copy the plugin to your Hermes home** — the desktop app loads the plugin
from its `desktop-plugins` directory:

```bash
# Download talaria-plugin-v0.2.0.zip from the Releases tab, then:
unzip talaria-plugin-v0.2.0.zip
SRC=talaria-plugin/plugin.js
for d in \
  "$HOME/AppData/Local/hermes/desktop-plugins/talaria" \
  "$HOME/AppData/Local/hermes/profiles/<your-profile>/desktop-plugins/talaria"; do
  mkdir -p "$d" && cp "$SRC" "$d/plugin.js" && echo "OK $d"
done
```

**2. (Optional) Python chat tools** — copy `talaria-tools/` to
`<hermes-home>/profiles/<your-profile>/plugins/` and set:
`TALARIA_SUPABASE_URL`, `TALARIA_SUPABASE_KEY` (the public anon key from the
Connect tab), `TALARIA_CLAIM_TOKEN` (from nobletrading.app).

**3. Restart Hermes Desktop** (or ⌘K → *Reload desktop plugins*), enable
**Talaria** in Settings → Plugins, and open the **Talaria** tab.

**4. Connect** — paste your Supabase URL + claim token (get both from
**[nobletrading.app](https://nobletrading.app)** after checkout). The
dashboard unlocks.

> Windows users: the paths above assume the default Hermes home. If your
> profile lives elsewhere, substitute `<your-profile>` and the profile's
> `desktop-plugins` path.

## Verify it works

1. Open the **Talaria** tab → Connect → dashboard renders (signals, charts).
2. Try the chat: *"what does this signal mean?"* → your agent answers using
   `talaria-client`.
3. The dashboard refreshes every 60s and updates live via Supabase Realtime.

## Docs

- [CLIENT_SKILL.md](docs/CLIENT_SKILL.md) — what your agent can answer for you
- [OPERATIONS.md](docs/OPERATIONS.md) — operator/deploy notes
- [DEVELOPMENT.md](docs/DEVELOPMENT.md) — repo structure, install details, release checklist

## Subscribe

Talaria plans (Signal Scout / Precision Pro) are managed at
**[nobletrading.app](https://nobletrading.app)** — checkout, claim tokens,
and account management live there. The plugin is the client; the portal is
where your subscription is handled.

---

Copyright © Lexington Tech LLC
