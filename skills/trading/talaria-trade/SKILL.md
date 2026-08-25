---
name: talaria-trade
description: Execute Talaria BUY/SELL signals as 0.01-lot MT5 web-trader orders
tags: [talaria, trading, mt5, execution, order-panel]
category: trading
related_skills: [talaria-client]
version: 0.2.0
---

# Skill: talaria-trade — Execute Talaria Signals in MT5

## Purpose
You are a Hermes agent executing live trades from Talaria BUY/SELL signals into the MT5 web trader, using the in-app browser only. No external browser, no Supabase calls, no thinking.

Three execution modes:

- `auto` — fully autonomous
- `semi` — agent opens the F9 order panel + sets 0.01 volume, then asks user to confirm
- `manual` — agent opens the F9 order panel + sets 0.01 volume, user clicks Buy themselves

**Default mode:** `manual`

## Execution Discipline (User-Enforced)

- **Never spin.** If the order panel is already open (visible in read_preview text output), DO NOT re-run F9. Check current state before acting.
- **Trust visual state.** User says "it's already open" — verify via read_preview (look for volume input, buy button text), not by re-issuing F9.

## Prerequisites
- MT5 web trader loaded in Hermes in-app browser preview pane at https://mt5webtrader.plexytrade.com/terminal
- Logged into account 3112146 (or current demo account)
- Talaria dashboard visible in Hermes middle pane showing BUY/SELL signals
- F9 opens the Trade Form order panel (NOT one-click trading)

## Config
```yaml
talaria:
  execution_mode: manual   # auto | semi | manual
  default_volume: "0.01"   # lot size string for MT5 volume input
```

## Execution Workflow

### Step 1 — Signal to Symbol
1. Read Talaria dashboard (Hermes middle pane) for latest BUY/SELL signal
2. Select ONE symbol (e.g., XAUUSD)
3. In in-app browser, search for symbol and click to load chart
4. Verify via read_preview that symbol loaded (title shows [SYMBOL, H1])

### Step 2 — Analyze Price
1. read_preview to get current Bid/Ask
2. Note entry — Ask price for BUY, Bid price for SELL
3. Set SL/TP based on recent chart structure or leave at defaults

### Step 3 — F9 Order Panel
1. **Check read_preview text first** — if volume input and Buy/Sell buttons appear in the text output, skip to Step 5
2. click canvas element (gives chart focus)
3. If One Click Trading disclaimer dialog pops up:
   - press Space on the Cancel button (NOT Accept — that disables one-click mode)
4. press_key F9 via computer_use on Hermes window (pid 21024)
5. drive_preview elements — look for:
   - sel-market-execution-* (select dropdown)
   - inp-0-01-* (volume input, should show value=0.01)
   - btn-buy-by-market-* (Buy button ref)
   - btn-sell-by-market-* (Sell button ref)

### Step 4 — Set Volume (if needed)
If inp-0-01-* exists with value not equal to "0.01":
- drive_preview click on inp-0-01-* to focus the volume field
- drive_preview type 0.01 to set volume

If DOM volume elements are missing (Canvas-only):
- Skip — One Click Trading uses default 0.01 volume

### Step 5 — Execute
- **auto/semi mode:** drive_preview press Enter on btn-buy-by-market-*
- **manual mode:** Leave the order panel open with volume at 0.01. Tell user: "Order panel open for XAUUSD — click Buy by Market to execute."

### Step 6 — Verify
read_preview count=5000 — look for:
- Order ticket number: #767XXXXX buy 0.01 SYMBOL at PRICE
- Status: Done
- Trade appears in history table

## Pitfalls

- **Canvas vs DOM disconnect**: The order panel renders on Canvas, but volume inputs exist as hidden HTML. The DOM value attribute may read "0.01" while Canvas displays "1.00 XAU". Always verify via read_preview text extraction, not just DOM.
- **One Click Trading popup**: If the order panel doesn't appear via F9, it may be blocked by the One Click Trading disclaimer. Dismiss with Space on the Cancel button.
- **F9 focus fails silently**: F9 only works when the MT5 chart Canvas has focus. Always click(canvas) first, then F9.
- **Rebound elements**: After page mutations, previous refs may be marked rebound — they still work, reuse them immediately.
- **Volume default trap**: If volume shows "1.00 XAU" in Canvas but DOM says "0.01", the CANVAS value wins. Manually click the volume input and type "0.01" via computer_use if needed.
- **Don't reopen an already-open panel**: If read_preview shows the volume input, trade mode, and Buy/Sell buttons in the text output, the panel IS open. Press Enter on the Buy button directly without re-running F9.

## When NOT to use
- User requests manual trade execution without explicit authorization
- Supabase calls needed for signal data (use talaria-client skill instead)
- MT5 web trader not loaded in Hermes in-app browser
- Existing position on same symbol (avoid doubling without user approval)
- Market is highly volatile (spread widening) — check spread before executing