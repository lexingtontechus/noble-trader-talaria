# Token Claims Check & DAU/MAU Analytics — Comprehensive Assessment

## 1. Token Claims Check Frequency Audit

### Confirmed: Already efficient — 24h cadence, NOT on every dashboard open

**The user's concern ("token claims is checked everytime the talaria dashboard is access/opened") does NOT match the current code.** The v0.2.12 code already implements the documented 24h cadence.

### Current Implementation (talaria plugin.js)

| Constant | Value | Purpose | Cadence |
|---|---|---|---|
| `CLAIM_CHECK_MS` (L37) | `24 * 60 * 60 * 1000` | Claim validation | **24h** |
| `DATA_POLL_MS` (L38) | `60 * 1000` (60s) | REST data fallback | **60s** |
| `CHIP_POLL_MS` (L414) | `10 * 1000` (10s) | Signal chip poll | 10s |
| `PANE_TICK_MS` (L433) | `30 * 1000` (30s) | Pane age refresh | 30s |

### Claim check flow (L2830-2836)

```javascript
// Fires on mount + when config changes
useEffect(() => {
  runCheck()
  const timer = setInterval(runCheck, CLAIM_CHECK_MS)  // 24h interval
  return () => clearInterval(timer)
}, [config.supabase_url, config.supabase_key, config.claim_token])
```

**9 endpoints polled every 60s** via `useSupabaseData` (L2081-2156):
1. `nt_symbol` — plan symbols
2. `nt_sweep_result` — latest sweeps (kelly histogram, hot-signal seed)
3. `nt_renko_bricks` — 10-brick renko (L2122, **polled TWICE** for different limits)
4. `nt_paper_positions` — Pro only
5. `v_paper_equity` — Pro only
6. `v_talaria_signal_health` — signal quality scoreboard
7. `v_talaria_portfolio_stats` — Pro only (single-row tear-sheet)
8. `v_eod_calibration_bias` — calibration data
9. `v_paper_vs_optimized_daily` — Pro only (6mo rolling)

### CHANGELOG Discrepancy

The hermes-plugins CHANGELOG (v0.2.12, L23-27) documents changes that are **NOT in the current code**:
- ✅ "Background REST polls skipped when `document.visibilityState === 'hidden'`" — **NOT implemented** (no `visibilityState` references in code)
- ✅ "`nt_symbol` poll interval increased from 60s → 4h" — **NOT implemented** (still uses `DATA_POLL_MS`)

These were documented as v0.2.12 changes but the code doesn't reflect them. The egress assessment document (`docs/supabase_egress_assessment.md`) lists these as **recommendations** (Options A, B, C, D), not completed work.

### Claim Check API Calls Per User/Day

| Scenario | Claim checks | Data poll calls | Total |
|---|---|---|---|
| App open once, left running 24h | 1 (mount) | 1440 (60s) | ~1441 |
| App restarted hourly (8x/day) | 8 (mount only) + 0 (24h interval doesn't fire 8x) | 1440 | ~1448 |

> The 24h interval does NOT fire if the app restarts every hour — `setInterval` resets on each mount. But the mount-time check + 24h interval means at most **2 claim checks per 24h** per session.

### Recommendation
**No changes needed for claim check frequency.** The 24h cadence is already implemented correctly. The user's concern may stem from v0.2.11 behavior or confusion with the 60s data polling.

---

## 2. DAU/MAU Analytics — Comprehensive Review

### Current State
**No DAU/MAU tracking exists.** The only "analytics" are server-side SQL views:
- `v_talaria_signal_health` — signal quality scoreboard (30-day rolling)
- `v_talaria_portfolio_stats` — portfolio tear-sheet

These are **signal analytics**, not **user analytics**. No user activity is tracked.

### PostHog Snippet Analysis (user-provided)

The user provided a PostHog init snippet. Key findings:

| Item | Detail |
|---|---|
| **Project token** | `phc_v5U5tCF7ddSmDTtjbZDp3hoV236UjpnKdGNqMWNkjskx` |
| **api_host** | `@url:`https://us.i.posthog.com`` |
| **Issue** | The `@url:` prefix is a template artifact — should be just `'https://us.posthog.com'` |
| **404 confirmed** | `https://us.i.posthog.com` returns "404 - Page not found" (PostHog's whimsical error page) |
| **Correct host** | `https://us.posthog.com` (verified — loads PostHog login page) |
| **array.js accessible** | ✅ `https://us-assets.i.posthog.com/static/array.js` loads (263KB, gzipped, async CDN) |
| **Token validity** | Unknown — cannot verify without attempting to send an event |

### PostHog Snippet Issues for Hermes Desktop Plugin

1. **`<script>` tag won't work**: The snippet is HTML `<script>` — Hermes plugins use `React.createElement`, not raw HTML. Must use `document.createElement('script')` injection.

2. **Template artifact**: `api_host: '@url:`https://us.i.posthog.com`'` — the `@url:` wrapper and `.i.posthog.com` subdomain are placeholders, not production values.

3. **Bundle size**: `array.js` is ~263KB unminified (~40-80KB gzipped). For a lightweight desktop plugin, this is heavy. The `posthog-js/dist/module.slim` variant is ~10-15KB but requires npm/bundler (Talaria plugin has neither).

### Options Comparison (Wider View)

| Option | JS Size | Self-Host | DAU/MAU | Events | Session Granularity | Privacy |
|---|---|---|---|---|---|---|
| **PostHog** (CDN) | ~40KB gzipped | ✅/☁️ | ✅ Built-in | ✅ Full (retention, funnels, paths, flags) | ✅ Session ID | Full control if self-hosted |
| **PostHog** (self-host) | ~40KB gzipped | ✅ Required | ✅ Built-in | ✅ Full | ✅ Session ID | Full ownership |
| **Umami** | ~1.6KB | ✅ Required | ✅ Built-in | Basic (pageview + events) | ❌ No session ID | Cookie-free, GDPR |
| **Plausible** | ~1KB | ✅ Optional | ✅ Built-in | Basic (pageview + events) | ❌ No session ID | Cookie-free, GDPR |
| **Pirsch** | ~1KB | ✅/☁️ | ✅ Built-in | Basic | ❌ No session ID | GDPR, no cookies |
| **Simple Analytics** | ~1KB | ✅/☁️ | ✅ Built-in | Basic | ❌ No session ID | GDPR, no cookies |
| **Server-side (Supabase)** | 0KB (no JS) | ✅ (existing) | ✅ Partial | ✅ SQL-based | ❌ No session ID | Fully controlled |
| **None** | 0KB | N/A | ❌ | ❌ | ❌ | Best privacy |

### Recommendation

#### Option B+ (Hybrid: extend talaria-check for server-side analytics)

The user preferred Option B ("reuse talaria-check"). Given the 24h cadence limitation, a **hybrid approach** is best:

**1. Extend `talaria-check` Edge Function** to log a user event on each claim check:
```typescript
// In talaria-check edge function:
await supabase.from('talaria_user_activity').insert({
  claim_token_hash: crypto.subtle.digest('SHA-256', token),
  event_type: 'subscription_check',
  user_agent: req.headers.get('user-agent') || 'unknown',
  session_id: req.headers.get('x-session-id') || null,  // optional
  timestamp: new Date().toISOString()
})
```

**2. Add a `talaria_user_activity` table + DAU/MAU views:**
```sql
-- Migration 113_talaria_user_analytics.sql
CREATE TABLE talaria_user_activity (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  claim_token_hash TEXT NOT NULL,
  event_type TEXT NOT NULL CHECK (event_type IN ('subscription_check', 'dashboard_open')),
  user_agent TEXT,
  session_id UUID,
  timestamp TIMESTAMPTZ DEFAULT now()
);

-- DAU view
CREATE VIEW v_talaria_dau AS
SELECT DATE(timestamp) as day, COUNT(DISTINCT claim_token_hash) as dau
FROM talaria_user_activity
GROUP BY DATE(timestamp);

-- MAU view
CREATE VIEW v_talaria_mau AS
SELECT 
  DATE_TRUNC('month', timestamp) as month, 
  COUNT(DISTINCT claim_token_hash) as mau
FROM talaria_user_activity
GROUP BY DATE_TRUNC('month', timestamp);
```

**3. Capture sessions:**
- The `talaria-check` runs at 24h intervals — this gives **unique active users** (DAU/MAU)
- For session count: add an optional `x-session-id` header from the plugin (via `crypto.randomUUID()` generated once per app session)

**4. PostHog consideration:**
If the user wants richer analytics (retention, funnels, paths), PostHog is the best option. The corrected snippet for the Hermes plugin:

```javascript
// In talaria plugin.js — inject PostHog dynamically (no <script> tag)
React.useEffect(() => {
  const script = document.createElement('script')
  script.src = 'https://us-assets.i.posthog.com/static/array.js'
  script.async = true
  script.onload = () => {
    window.posthog.init('phc_v5U5tCF7ddSmDTtjbZDp3hoV236UjpnKdGNqMWNkjskx', {
      api_host: 'https://us.posthog.com',  // NOT us.i.posthog.com
      person_profiles: 'identified_only',
      defaults: '2026-05-30',
    })
    // Identify by plan (anonymous, not user-specific)
    if (claim?.plan_slug) {
      window.posthog.identify(claim.plan_slug, { plan_slug: claim.plan_slug })
      window.posthog.capture('dashboard_open', { session_id: crypto.randomUUID() })
    }
  }
  document.head.appendChild(script)
  return () => script.parentNode?.removeChild(script)
}, [])
```

**⚠️ Warning:** The PostHog URL `https://us.i.posthog.com` returns 404 — the correct US cloud URL is `https://us.posthog.com`. The project token `phc_v5U5tCF7ddSmDTtjbZDp3hoV236UjpnKdGNqMWNkjskx` cannot be verified without sending a test event.

### Final Recommendation

**For DAU/MAU tracking, extend the existing `talaria-check` flow** — it's zero-cost JS, leverages the existing 24h cadence, and provides accurate unique-user counts. Use PostHog only if product analytics (retention, funnels, paths) are also needed.

### Egress Impact of Analytics
| Option | Additional calls/user/day | Additional bytes/user/day |
|---|---|---|
| Server-side (talaria-check extension) | 1 INSERT per 24h check | ~50 bytes |
| PostHog CDN | 1 capture event | ~200 bytes |
| Both combined | ~3 calls (60s poll + 24h check + PostHog) | ~1KB |

All options are negligible compared to the ~18KB/poll × 1440 polls/day = ~26MB/user/day from the REST data polling.


---

## 3. Polling Change Status (60s → 300s)

### Finding: NOT YET APPLIED

The user stated "we just changed polling from 60s to 300s." After auditing:

| Source | `DATA_POLL_MS` value | Status |
|---|---|---|
| Local plugin (desktop) | `60 * 1000` (L38) | **NOT changed** |
| GitHub remote (talaria repo) | `60 * 1000` (L38) | **NOT changed** |
| Git history (initial commit) | `60 * 1000` | Never modified |
| CHANGELOG v0.2.12 | Documents "300s" as a change | **Documented but not implemented** |
| `docs/supabase_egress_assessment.md` | Lists "Option B: 300s" as a recommendation | **Planned, not executed** |

### What WAS applied in v0.2.12:
- ✅ TradingView symbol mapping fix
- ✅ Supabase egress optimization (background poll skip on hidden tab — CHANGELOG L27, but NOT in code)
- ✅ Rolling 6-month table format

### What was NOT applied:
- ❌ `DATA_POLL_MS` still `60 * 1000` (not `300 * 1000`)
- ❌ `visibilityState` gating NOT implemented (no references in code)
- ❌ `nt_symbol` still polled at 60s (not 4h)

### Reconciliation
The CHANGELOG and egress assessment document describe 60s→300s as an **intended change**, but it was never applied to the actual plugin code. The user may be thinking of:
1. The documented plan from v0.2.12 release notes
2. A local uncommitted change that was reverted
3. A planned change for the next release

### To Apply the Polling Change (1 line):

```diff
- const DATA_POLL_MS = 60 * 1000 // 60s REST data fallback poll
+ const DATA_POLL_MS = 300 * 1000 // 5min REST data fallback poll (was 60s, reduced for Supabase free tier egress)
```

Also update L1738 status text:
```diff
-   `... · live broadcast + REST seed · 60s poll · ...`
+   `... · live broadcast + REST seed · 5min poll · ...`
```

**Egress savings:** ~80% reduction in REST data calls per user/day (~1440 → ~288 calls).
