/**
 * Talaria — Desktop Runtime Plugin (Electron app surface)
 *
 * CLIENT-FACING product dashboard for the Noble Trader signal service.
 * Separate from `noble-trader-admin` (internal superset) and `noble-trader`
 * (agent setup wizard) — this is the paywalled subscriber surface.
 *
 * Data path — STANDALONE, direct Supabase, no backend/agent/proxy hop:
 *   - Claim validation: POST {supabase_url}/functions/v1/talaria-check with
 *     {token} → {ok, plan_slug, plan_uuid, sub_status, period_end, grace_end,
 *     next_charge_url}. The plan_uuid from the SERVER response drives the
 *     symbol list + channel selection — never client-derived.
 *   - Symbol list: GET /rest/v1/nt_symbol?select=symbol&plan_ids=cs.{plan_uuid}
 *     (PostgREST `cs.` contains-filter on the UUID[] column — the array-literal
 *     braces form is required; bare `cs.<uuid>` fails 22P02 on Postgres).
 *   - Data poll: GET /rest/v1/nt_sweep_result + nt_renko_bricks +
 *     nt_paper_positions + v_paper_equity via the PUBLIC anon key
 *     (read-only RLS, migration 107).
 *   - Live push: native WebSocket to the Supabase Realtime endpoint
 *     (Phoenix protocol) — joins the plan-scoped signal topic
 *     `realtime:signals.<plan_slug>` (plan from the SERVER response, never
 *     client-guessed) and `realtime:portfolio` (paper-portfolio validation
 *     events; Precision Pro only). Falls back to the 60s REST poll on socket
 *     error/close — never blanks the dashboard.
 *
 * Claim check cadence: on mount + every 24h. Data refresh: every 60s.
 * Runtime disk plugins are plain ESM — no JSX. Uses React.createElement.
 * Only `react` + `@hermes/plugin-sdk` imports are allowed.
 */
import React from 'react'
import { cn, host, ROUTES_AREA, SIDEBAR_NAV_AREA } from '@hermes/plugin-sdk'

// ---------------------------------------------------------------------------
// Plugin config (localStorage-backed — same pattern as noble-trader-admin)
// ---------------------------------------------------------------------------
const CONFIG_FILE = 'talaria-config.json'
const CLAIM_CHECK_MS = 24 * 60 * 60 * 1000 // 24h subscription re-check
const DATA_POLL_MS = 60 * 1000 // 60s REST data fallback poll

// Plugin version — bumped per release. Shown in the pane + dashboard footers
// so the deployed build is verifiable in-app (2026-08-11).
// 0.2.4: hardening — error logging in register(), poll-failure visibility,
//        graceful degradation when Hermes SDK context is unavailable.
// 0.2.5: widget multi-placement — container-query responsive layout so the
//        signals pane adapts to ANY dock zone (default stays right of chat);
//        placement root-cause docs + delivery-chain watchdog in repo scripts.
const PLUGIN_VERSION = '0.2.5'

// ── Built-in service defaults (2026-08-10) ─────────────────────────────────
// The Supabase project URL + PUBLIC anon key are constants shared by every
// Talaria client (same values ship in the web portal bundle). They are NOT
// user credentials — RLS makes anon read-only, and the real gate is the claim
// token validated by the talaria-check Edge Function. Embedding them here
// means a subscriber only ever enters their claim token in the Connect tab;
// the URL/key are never shown. (User decision 2026-08-10: build Option A,
// hide the pre-filled fields, remove Supabase references from user docs.)
const DEFAULT_SUPABASE_URL = 'https://pcvscowltlrxzgxjurcr.supabase.co'
const DEFAULT_ANON_KEY = 'sb_publishable_cYfseJa9z0qss0g_Y594wA_lXrWVBsa'

function loadConfig() {
  // Defaults apply when nothing is saved (or saved values are partial);
  // saved values win so an existing user's stored config keeps working.
  const saved = {}
  try {
    if (typeof localStorage !== 'undefined') {
      const raw = localStorage.getItem(CONFIG_FILE)
      if (raw) Object.assign(saved, JSON.parse(raw))
    }
  } catch (e) {}
  return {
    supabase_url: saved.supabase_url || DEFAULT_SUPABASE_URL,
    supabase_key: saved.supabase_key || DEFAULT_ANON_KEY,
    claim_token: saved.claim_token || '',
  }
}

function saveConfig(cfg) {
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(CONFIG_FILE, JSON.stringify(cfg))
    }
  } catch (e) {}
}

function useConfig() {
  const [config, setConfig] = React.useState(loadConfig)
  const update = React.useCallback((patch) => {
    setConfig((prev) => {
      const next = { ...prev, ...patch }
      saveConfig(next)
      return next
    })
  }, [])
  return [config, update]
}

// Diagnostic logger — writes to console.error + window.__TA_URI_LOG__ if the
// Hermes desktop app surfaces one. Silent in node test harness (no console
// binding). This is the ONLY place plugin diagnostics should go so that
// failures are visible when the desktop renderer can't connect to the backend.
// ---------------------------------------------------------------------------
function _log(level, msg) {
  try {
    if (typeof console !== 'undefined' && console[level]) {
      console[level](`[talaria ${PLUGIN_VERSION}] ${msg}`)
    }
  } catch (e) {}
}

// ---------------------------------------------------------------------------
// Direct Supabase REST fetch (PostgREST, anon key headers)
// ---------------------------------------------------------------------------
async function fetchSupabase(config, path, params = {}) {
  const base = (config.supabase_url || '').replace(/\/+$/, '')
  if (!base || !config.supabase_key) {
    throw new Error('Not connected — open the Connect tab and save your claim token')
  }
  const qs = new URLSearchParams(params).toString()
  const url = `${base}/rest/v1/${path}${qs ? '?' + qs : ''}`
  const resp = await fetch(url, {
    method: 'GET',
    headers: {
      'apikey': config.supabase_key,
      'Authorization': `Bearer ${config.supabase_key}`,
      'Accept': 'application/json',
    },
  })
  if (!resp.ok) {
    const body = await resp.text().catch(() => '')
    throw new Error(`${resp.status} ${resp.statusText}${body ? ' — ' + body.slice(0, 120) : ''}`)
  }
  return await resp.json()
}

// ---------------------------------------------------------------------------
// Claim validation — Supabase Edge Function `talaria-check`
// Throws { kind: 'not-deployed'|'bad-token'|'error', message } on failure so
// the caller can route the UI (404 = function not deployed yet → Connect tab
// shows a clear 'claim service not deployed' state, never crashes).
// ---------------------------------------------------------------------------
async function claimCheck(config) {
  const base = (config.supabase_url || '').replace(/\/+$/, '')
  if (!base || !config.supabase_key || !config.claim_token) {
    throw { kind: 'error', message: 'Enter your claim token in the Connect tab' }
  }
  let resp
  try {
    resp = await fetch(`${base}/functions/v1/talaria-check`, {
      method: 'POST',
      headers: {
        'apikey': config.supabase_key,
        'Authorization': `Bearer ${config.supabase_key}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ token: config.claim_token }),
    })
  } catch (err) {
    throw { kind: 'error', message: 'Claim service unreachable — ' + String(err.message || err) }
  }
  if (resp.status === 404) {
    throw { kind: 'not-deployed', message: 'talaria-check Edge Function not deployed on this project (404)' }
  }
  if (resp.status === 401) {
    let body = {}
    try { body = await resp.json() } catch (e) {}
    throw { kind: 'bad-token', message: `Claim token rejected (${body.error || 'invalid_claim'})` }
  }
  if (!resp.ok) {
    throw { kind: 'error', message: `${resp.status} ${resp.statusText}` }
  }
  let json
  try { json = await resp.json() } catch (e) {
    throw { kind: 'error', message: 'Unexpected claim response (not JSON)' }
  }
  if (!json || json.ok !== true) {
    const err = (json && json.error) || 'invalid_claim'
    throw { kind: err === 'invalid_claim' || err === 'revoked' || err === 'expired' ? 'bad-token' : 'error', message: `Claim rejected (${err})` }
  }
  return json
}

// ---------------------------------------------------------------------------
// Remote data hook — polls Supabase REST every 60s (the data fallback that
// keeps the dashboard alive when the Realtime socket is down)
// ---------------------------------------------------------------------------
function useSupabaseData(config, table, params, enabled) {
  const [data, setData] = React.useState(null)
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState(null)

  const load = React.useCallback(async () => {
    if (!enabled || !config.supabase_url || !config.supabase_key) {
      setLoading(false)
      return
    }
    setLoading(true)
    setError(null)
    try {
      const json = await fetchSupabase(config, table, params)
      setData(json)
    } catch (err) {
      setError(err)
    } finally {
      setLoading(false)
    }
  }, [config.supabase_url, config.supabase_key, table, JSON.stringify(params), enabled])

  React.useEffect(() => {
    load()
    const timer = setInterval(load, DATA_POLL_MS)
    return () => clearInterval(timer)
  }, [load])

  return { data, loading, error, reload: load }
}

// ---------------------------------------------------------------------------
// Native WebSocket Realtime client (Phoenix protocol — no packages)
// ---------------------------------------------------------------------------
function realtimeWsUrl(config) {
  const base = (config.supabase_url || '').replace(/\/+$/, '')
  const host = base.replace(/^https?:\/\//i, '')
  return `wss://${host}/realtime/v1/websocket?apikey=${encodeURIComponent(config.supabase_key || '')}&vsn=1.0.0`
}

function parseRealtimeMessage(raw) {
  let msg
  try { msg = JSON.parse(raw) } catch (e) { return { type: 'other' } }
  if (!msg || typeof msg !== 'object') return { type: 'other' }
  if (msg.event === 'phx_reply') {
    return { type: 'reply', topic: msg.topic, ref: msg.ref, status: msg.payload && msg.payload.status }
  }
  if (msg.event === 'phx_error' || msg.event === 'phx_close') {
    return { type: 'socket_error', topic: msg.topic }
  }
  if (msg.event === 'broadcast' && msg.payload && msg.payload.type === 'broadcast' && msg.payload.event) {
    return { type: 'broadcast', event: msg.payload.event, payload: msg.payload.payload || {} }
  }
  return { type: 'other' }
}

// Open-tab-only socket: opened while the dashboard is mounted, closed on
// unmount. On error/close it schedules an exponential-backoff reconnect; the
// 60s REST polls in useSupabaseData keep rendering data in the meantime.
// `handlers` is kept in a ref so changing callbacks never reconnects.
function useRealtime(config, enabled, planSlug, handlers) {
  const [state, setState] = React.useState('idle')
  const handlersRef = React.useRef(handlers)
  handlersRef.current = handlers

  React.useEffect(() => {
    if (!enabled || !config.supabase_url || !config.supabase_key) return undefined
    const wsUrl = realtimeWsUrl(config)
    let ws = null
    let disposed = false
    let retryTimer = null
    let attempts = 0

    const scheduleRetry = () => {
      if (disposed) return
      const delay = Math.min(30000, 5000 * Math.pow(2, attempts))
      attempts += 1
      retryTimer = setTimeout(connect, delay)
    }
    const connect = () => {
      if (disposed) return
      setState('connecting')
      try {
        ws = new WebSocket(wsUrl)
      } catch (err) {
        setState('error')
        scheduleRetry()
        return
      }
      ws.onopen = () => {
        if (disposed) { try { ws.close() } catch (e) {} return }
        setState('open')
        attempts = 0
        // Plan-scoped signal topic (2026-08-11): join ONLY the plan's own
        // topic — plan_slug comes from the server talaria-check response,
        // never client-derived. Unknown/empty plan → fail-open to BOTH plan
        // topics (mirrors the backend publisher: over-delivery is benign,
        // under-delivery is not).
        const signalTopics = planSlug
          ? ['realtime:signals.' + planSlug]
          : ['realtime:signals.signal_scout', 'realtime:signals.precision_pro']
        signalTopics.forEach((topic, i) => {
          ws.send(JSON.stringify({
            topic,
            event: 'phx_join',
            payload: { config: { broadcast: { self: false, ack: false } } },
            ref: String(i + 1),
          }))
        })
        // Paper-portfolio validation events — Precision Pro only. Topic
        // renamed 2026-08-11 from `realtime:paper` to `realtime:portfolio`
        // (the channel carries the SIMULATED validation book, not a demo
        // trading account).
        if (planSlug === 'precision_pro') {
          ws.send(JSON.stringify({
            topic: 'realtime:portfolio',
            event: 'phx_join',
            payload: { config: { broadcast: { self: false, ack: false } } },
            ref: String(signalTopics.length + 1),
          }))
        }
      }
      ws.onmessage = (evt) => {
        const msg = parseRealtimeMessage(evt.data)
        if (msg.type === 'broadcast') {
          if (msg.event === 'signal' && handlersRef.current.onSignal) {
            handlersRef.current.onSignal(msg.payload)
          } else if (msg.event === 'paper' && handlersRef.current.onPaper) {
            handlersRef.current.onPaper(msg.payload)
          }
        }
      }
      ws.onerror = () => { setState('error') }
      ws.onclose = () => {
        if (disposed) return
        setState('closed')
        scheduleRetry()
      }
    }
    connect()
    return () => {
      disposed = true
      if (retryTimer) clearTimeout(retryTimer)
      if (ws) {
        try { ws.onclose = null; ws.close() } catch (e) {}
      }
    }
  }, [enabled, config.supabase_url, config.supabase_key, planSlug])

  return state
}

// ---------------------------------------------------------------------------
// Signal widget store — shared by the statusbar chip + dashboard.
//
// Notification modes (user spec, 2026-08-09):
//   Mode 1 — dashboard view: the /talaria page itself (existing). Opening it
//     calls markSeen() so the unread badge clears.
//   Mode 2 — widget view: a statusbar chip (statusBar.right) shows unread
//     count + last signal while the user works ANYWHERE in Hermes. Clicking
//     the chip navigates to /talaria.
//   Mode 3 — notifications: host.notify() in-app toast fires for NEW
//     qualified signals when the dashboard is NOT the active view. Away-mode
//     (app closed) is covered by the existing cron → Discord paths.
//
// Unread semantics: badge = qualified signals with ts newer than the last
// time the user SEEN the dashboard. First data ever seen is a baseline (no
// toast / no backlog). Persisted to localStorage so the badge survives
// reloads.
// ---------------------------------------------------------------------------
const UNREAD_FILE = 'talaria-unread.json'
const CHIP_POLL_MS = 60 * 1000
const UNREAD_MAX = 99

// Single persistent toast id — re-notifying with the same id REPLACES the
// toast in the app's notification stack instead of stacking a new one
// (store/notifications.ts: `[notification, ...filter(id !== id)]`).
const SIGNAL_TOAST_ID = 'talaria-signal-toast'

// How many recent signals the widget pane + chip keep (rolling, newest first).
const RECENT_MAX = 12
// Display TTL for the widget surfaces — signals older than this are NOT shown
// in the pane/chip (forex + crypto run 24/7, so a 60-min window stays live).
// FILTER AT RENDER ONLY — the store keeps everything (user decision 2026-08-10:
// don't prune the store).
const SIGNAL_TTL_MS = 60 * 60 * 1000
// How often the pane re-renders to refresh ages + drop TTL-expired rows even
// when no new signal arrives (the store only emits on addSignal/markSeen).
const PANE_TICK_MS = 30 * 1000

// ONE shared poller for the widget surfaces (chip + pane). The dashboard has
// its own realtime socket; the widget surfaces are always mounted even when
// the dashboard is not, so they share a single 60s nt_sweep_result poll that
// feeds signalStore. Guarded so mount/unmount of either surface never
// double-polls. Returns a cleanup (clears the interval) so the harness's
// sync useEffect cleanup can dispose it — keeps the node process exit-able.
let _pollStarted = false
function startSignalPolling() {
  if (_pollStarted) return () => {}
  _pollStarted = true
  const cfg = loadConfig()
  if (!cfg.supabase_url || !cfg.supabase_key) return () => {}
  const poll = async () => {
    try {
      // qualified=eq.true: the 20 newest rows are often all cooldown-suppressed
      // (q=false), which starved the widget of priced rows. Filter server-side
      // so we always get the newest QUALIFIED signals (same as the notify
      // watcher), which carry entry/stop/take. (2026-08-10 fix)
      const rows = await fetchSupabase(cfg, 'nt_sweep_result', {
        select: 'symbol,signal,effective_kelly,kelly_f,entry_price,stop_loss,take_profit,sweep_timestamp,qualified,regime',
        qualified: 'eq.true',
        order: 'sweep_timestamp.desc', limit: '20',
      })
      for (const r of (rows || [])) {
        if (r.qualified && String(r.signal || '').toLowerCase() !== 'neutral' && r.sweep_timestamp) {
          signalStore.addSignal({
            symbol: r.symbol,
            direction: r.signal,
            kelly: Number(r.effective_kelly != null ? r.effective_kelly : r.kelly_f) || 0,
            regime: r.regime,
            entry: r.entry_price,
            stop: r.stop_loss,
            take: r.take_profit,
            ts: r.sweep_timestamp,
          })
        }
      }
    } catch (e) { /* poll fallback — log for diagnostics, next tick retries */ _log('error', 'signal poll failed: ' + (e && e.message ? e.message : String(e))) }
  }
  poll()
  const timer = setInterval(poll, CHIP_POLL_MS)
  return () => clearInterval(timer)
}

// Relative-age + UTC formatters for the toast footer ("how current").
function fmtAge(tsMs) {
  const diff = Math.max(0, Date.now() - tsMs)
  const min = Math.floor(diff / 60000)
  if (min < 1) return 'just now'
  if (min < 60) return `${min}m ago`
  const hr = Math.floor(min / 60)
  if (hr < 24) return `${hr}h ago`
  return `${Math.floor(hr / 24)}d ago`
}
function fmtSignalTime(tsMs) {
  const d = new Date(tsMs)
  if (isNaN(d.getTime())) return ''
  const pad = (n) => String(n).padStart(2, '0')
  // LOCAL wall-clock time + short TZ abbreviation (PDT, EDT, …) via
  // Intl — the toast footer should read in the user's own timezone, not
  // UTC (user request 2026-08-09).
  let tz = ''
  try {
    const part = new Intl.DateTimeFormat('en', { timeZoneName: 'short' }).formatToParts(d)
      .find((p) => p.type === 'timeZoneName')
    tz = (part && part.value) || ''
  } catch (e) {}
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}${tz ? ' ' + tz : ''}`
}
function fmtToastFooter(tsMs, extra) {
  const base = `${fmtSignalTime(tsMs)} · ${fmtAge(tsMs)}`
  return extra ? `${base} · ${extra}` : base
}

// Friendly regime labels — the raw backend regime strings
// (low_vol_strong_bull, high_vol_bear, …) are cryptic; map to plain words
// + an emoji so a user glance reads the market stance. Unknown labels fall
// back to title-cased underscores.
const REGIME_FRIENDLY = {
  low_vol_strong_bull: '🐂 Low-vol strong bull',
  low_vol_bull: '🐂 Low-vol bull',
  low_vol_strong_bear: '🐻 Low-vol strong bear',
  low_vol_bear: '🐻 Low-vol bear',
  high_vol_strong_bull: '🐂 High-vol strong bull',
  high_vol_bull: '🐂 High-vol bull',
  high_vol_strong_bear: '🐻 High-vol strong bear',
  high_vol_bear: '🐻 High-vol bear',
  low_vol_range: '↔️ Low-vol range',
  high_vol_range: '↔️ High-vol range',
  low_vol_chop: '🔀 Low-vol chop',
  high_vol_chop: '🔀 High-vol chop',
  low_vol_strong_trend: '📈 Low-vol strong trend',
  high_vol_strong_trend: '📈 High-vol strong trend',
  strong_trend: '📈 Strong trend',
  range: '↔️ Range',
  chop: '🔀 Chop',
}
function fmtRegime(label) {
  if (!label) return ''
  const key = String(label).toLowerCase()
  if (REGIME_FRIENDLY[key]) return REGIME_FRIENDLY[key]
  return String(label)
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase())
}

// Aggression label + emoji map (mirrors discord.py signal delivery, 2026-08-08).
const AGGRESSION_FRIENDLY = {
  passive: '🎯 Patient',
  mid: '⚡ Normal',
  aggressive: '🔥 Aggressive',
}
function fmtAggression(label) {
  if (!label) return '—'
  const key = String(label).toLowerCase()
  if (AGGRESSION_FRIENDLY[key]) return AGGRESSION_FRIENDLY[key]
  return String(label).replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
}
function fmtRegimeShort(label) {
  if (!label) return '—'
  const full = fmtRegime(label)
  if (full.length > 18) return full.slice(0, 17) + '…'
  return full
}
function fmtKellyPct(v) {
  if (v == null || isNaN(Number(v))) return '—'
  const n = Number(v)
  return n >= 0 ? `+${(n * 100).toFixed(1)}%` : `${(n * 100).toFixed(1)}%`
}
function fmtPwinColor(v) {
  const n = Number(v)
  if (n >= 0.6) return '#26d374'
  if (n <= 0.4) return '#ff5c5c'
  return 'var(--ui-text-tertiary,#888)'
}
function fmtEvColor(v) {
  const n = Number(v)
  if (n > 0) return 'var(--ui-accent,#4c9aff)'
  if (n < 0) return '#ff5c5c'
  return 'var(--ui-text-tertiary,#888)'
}

// Kelly by symbol — latest sweep TABLE component (2026-08-12 redesign).
// Groups nt_sweep_result rows by asset_class, deduped to latest per symbol,
// sorted by symbol ASC within each class. Excludes brick_* columns.
const CLASS_ORDER_TALARIA = { crypto: 0, forex: 1, commodities: 2, stocks: 3, other: 4 }
const CLASS_LABEL_TALARIA = {
  crypto: 'Cryptocurrency  💱',
  forex: 'Forex  📊',
  commodities: 'Commodities  🏦',
  stocks: 'Stocks  📈',
  other: 'Other',
}
function TalariaKellyTable({ sweeps, symbols }) {
  const latestBySym = {}
  for (const r of (sweeps.data || [])) { if (!latestBySym[r.symbol]) latestBySym[r.symbol] = r }
  const rows = Object.values(latestBySym)

  const assetClassOf = {}
  for (const r of (symbols.data || [])) assetClassOf[r.symbol] = r.asset_class || 'other'
  const groups = {}
  for (const r of rows) {
    const cls = assetClassOf[r.symbol] || 'other'
    if (!groups[cls]) groups[cls] = []
    groups[cls].push(r)
  }
  const classOrder = Object.keys(groups).sort((a, b) => (CLASS_ORDER_TALARIA[a] || 99) - (CLASS_ORDER_TALARIA[b] || 99))

  const THEAD = [
    { k: 'regime',      label: 'Regime',          cls: 'tla-regime-cell' },
    { k: 'aggression',  label: 'Aggression',      cls: 'tla-agg-cell' },
    { k: 'markov_p_up', label: 'Markov P(up)',    cls: 'tla-pwin-cell' },
    { k: 'markov_p_dn', label: 'Markov P(dn)',    cls: 'tla-pwin-cell' },
    { k: 'shift',       label: 'Shift',           cls: 'tla-shift-cell' },
    { k: 'prev_regime', label: 'Prev regime',     cls: 'tla-prev-cell' },
    { k: 'signal',      label: 'Signal',          cls: 'tla-sig-cell' },
    { k: 'kelly',       label: 'Effective kelly', cls: 'tla-kelly-cell' },
    { k: 'kelly_f',     label: 'kelly_f',         cls: 'tla-kelly-fCell' },
    { k: 'p_win',       label: 'P_win',           cls: 'tla-pwin-cell' },
    { k: 'ev',          label: 'EV',              cls: 'tla-ev-cell' },
    { k: 'entry',       label: 'ENTRY',           cls: 'tla-price-cell' },
    { k: 'stop_loss',   label: 'SL',              cls: 'tla-price-cell' },
    { k: 'take_profit', label: 'TP',              cls: 'tla-price-cell' },
    { k: 'conf',        label: 'Conf',            cls: 'tla-conf-cell' },
    { k: 'timesfm',     label: 'TimesFM',         cls: 'tla-conf-cell' },
    { k: 'size_mult',   label: 'Size',            cls: 'tla-sizemult-cell' },
  ]

  const ctxRow = rows.find((r) => r.qualified) || rows[0] || {}

  return React.createElement('div', { className: 'tla-kelly-table-wrap' },
    React.createElement('table', { className: 'tla-table tla-kelly-table' },
      React.createElement('thead', null,
        React.createElement('tr', null,
          React.createElement('th', { style: { width: 120 } }, 'Symbol'),
          THEAD.map((h) => React.createElement('th', { key: h.k, className: h.cls, style: { textAlign: h.k === 'shift' ? 'center' : 'left' } }, h.label)),
        ),
      ),
      React.createElement('tbody', null,
        classOrder.map((cls) => {
          const syms = groups[cls].sort((a, b) => a.symbol.localeCompare(b.symbol))
          if (!syms.length) return null
          return [
            // Group header — separate full-width row so the first symbol's
            // symbol cell is NOT replaced by the group label.
            React.createElement('tr', { key: cls + '-header', className: 'tla-group-header-row' },
              React.createElement('td', { colSpan: 17, className: 'tla-group-header' },
                React.createElement('span', { style: { display: 'flex', alignItems: 'center', gap: 6 } },
                  CLASS_LABEL_TALARIA[cls] || cls,
                  React.createElement('span', { className: 'tla-badge' }, syms.length + ' syms'))
              )
            ),
            ...syms.map((r, idx) => {
              const sig = String(r.signal || '').toLowerCase()
              const isBuy = sig === 'buy'
              const isSell = sig === 'sell'
              const kellyVal = Number(r.effective_kelly != null ? r.effective_kelly : r.kelly_f) || 0
              return React.createElement('tr', { key: r.symbol + '|' + (r.sweep_timestamp || ''), className: 'tla-kelly-row' },
                React.createElement('td', { className: 'tla-k' }, r.symbol),
              React.createElement('td', { className: 'tla-regime-cell', style: { color: isBuy ? 'var(--ui-accent,#4c9aff)' : isSell ? '#ff5c5c' : 'var(--ui-text-tertiary,#888)' } }, fmtRegime(r.regime)),
              React.createElement('td', { className: 'tla-agg-cell' }, fmtAggression(r.aggression)),
              React.createElement('td', { className: 'tla-pwin-cell', style: { color: fmtPwinColor(r.markov_p_up) } }, Number(r.markov_p_up) != null ? fmtKellyPct(r.markov_p_up) : '—'),
              React.createElement('td', { className: 'tla-pwin-cell', style: { color: fmtPwinColor(r.markov_p_dn) } }, Number(r.markov_p_dn) != null ? fmtKellyPct(r.markov_p_dn) : '—'),
              React.createElement('td', { className: 'tla-shift-cell' }, r.regime_shift ? '⚡' : '—'),
              React.createElement('td', { className: 'tla-prev-cell' }, fmtRegimeShort(r.prev_regime)),
              React.createElement('td', { className: cn('tla-sig-cell', isBuy ? 'tla-pos' : isSell ? 'tla-neg' : ''), style: { color: isBuy ? 'var(--ui-accent,#4c9aff)' : isSell ? '#ff5c5c' : 'var(--ui-text-tertiary,#888)' } }, sig === 'neutral' || !sig ? '—' : sig.toUpperCase()),
              React.createElement('td', { className: 'tla-kelly-cell', style: { color: isBuy ? 'var(--ui-accent,#4c9aff)' : isSell ? '#ff5c5c' : 'var(--ui-text-tertiary,#888)' } }, kellyVal.toFixed(3)),
              React.createElement('td', { className: 'tla-kelly-fCell' }, Number(r.kelly_f) != null ? Number(r.kelly_f).toFixed(3) : '—'),
              React.createElement('td', { className: 'tla-pwin-cell', style: { color: fmtPwinColor(r.p_win) } }, Number(r.p_win) != null ? fmtKellyPct(r.p_win) : '—'),
              React.createElement('td', { className: 'tla-ev-cell', style: { color: fmtEvColor(r.ev) } }, Number(r.ev) != null ? '$' + Number(r.ev).toFixed(2) : '—'),
              React.createElement('td', { className: 'tla-price-cell' }, Number(r.entry_price) > 0 ? fmtBrickPrice(r.entry_price) : '—'),
              React.createElement('td', { className: 'tla-price-cell', style: { color: '#ff5c5c' } }, Number(r.stop_loss) > 0 ? fmtBrickPrice(r.stop_loss) : '—'),
              React.createElement('td', { className: 'tla-price-cell', style: { color: 'var(--ui-accent,#4c9aff)' } }, Number(r.take_profit) > 0 ? fmtBrickPrice(r.take_profit) : '—'),
              React.createElement('td', { className: 'tla-conf-cell' }, Number(r.regime_conf) != null ? (r.regime_conf * 100).toFixed(0) + '%' : '—'),
              React.createElement('td', { className: 'tla-conf-cell' }, (r.p_timesfm != null && r.p_timesfm !== '') ? fmtKellyPct(r.p_timesfm) : '—'),
              React.createElement('td', { className: 'tla-sizemult-cell' }, Number(r.size_mult) != null ? '×' + Number(r.size_mult).toFixed(2) : '—'),
            )
          })
        ]
      }),
    ),
  ),
    // Below-table context: TimesFM forecast | EV | P_win for the most-qualified symbol
    ctxRow.symbol && React.createElement('div', { className: 'tla-grid', style: { marginTop: 12 } },
      React.createElement(StatCard, {
        title: 'TimesFM forecast — ' + ctxRow.symbol,
        value: (ctxRow.p_timesfm != null && ctxRow.p_timesfm !== '') ? (ctxRow.p_timesfm > 0.5 ? '📈 ' : '📉 ') + fmtKellyPct(ctxRow.p_timesfm) : '⏳ unavailable',
        sub: (ctxRow.p_timesfm != null && ctxRow.p_timesfm !== '')
          ? ctxRow.p_timesfm > 0.5 ? 'bullish skew > 50%' : 'bearish skew < 50%'
          : 'no TimesFM model run yet',
        tone: (ctxRow.p_timesfm != null && ctxRow.p_timesfm !== '') ? (ctxRow.p_timesfm > 0.5 ? 'pos' : 'neg') : undefined,
      }),
      React.createElement(StatCard, {
        title: 'EV — ' + ctxRow.symbol,
        value: (ctxRow.ev != null && ctxRow.ev !== '') ? '$' + Number(ctxRow.ev).toFixed(2) : '—',
        sub: 'expected value per $ of risk',
        tone: (ctxRow.ev != null && ctxRow.ev !== '') ? (Number(ctxRow.ev) > 0 ? 'pos' : Number(ctxRow.ev) < 0 ? 'neg' : undefined) : undefined,
      }),
      React.createElement(StatCard, {
        title: 'P_win — ' + ctxRow.symbol,
        value: (ctxRow.p_win != null && ctxRow.p_win !== '') ? fmtKellyPct(ctxRow.p_win) : '—',
        sub: 'predicted probability of winning',
        tone: (ctxRow.p_win != null && ctxRow.p_win !== '') ? (Number(ctxRow.p_win) >= 0.6 ? 'pos' : Number(ctxRow.p_win) <= 0.4 ? 'neg' : 'warn') : undefined,
      }),
    ),
  )
}

// Navigate to a plugin route in the Hermes desktop app.
//
// The SDK's `host.navigate('/talaria')` sets `window.location.hash` raw — a
// fragment assignment fires `hashchange`, but the app's HashRouter (react-router
// v7, `createHashHistory.listen`) subscribes ONLY to `popstate`. The router
// never hears the navigation, so nothing happens (verified against
// react-router dist history.js + the built SDK chunk, 2026-08-10). The app's
// own surfaces use `useNavigate()` (the real router API); plugins can't, so
// we dispatch a popstate after setting the hash — the event react-router's
// handlePop listens for — and the router picks up the new location.
function navigateTo(path) {
  try {
    const target = path.startsWith('#') ? path : `#${path}`
    if (typeof window === 'undefined') return
    if (window.location.hash === target) {
      // Already there — force the router to re-read (a no-op hash set fires
      // nothing in some builds).
      window.dispatchEvent(new PopStateEvent('popstate'))
      return
    }
    window.location.hash = target
    window.dispatchEvent(new PopStateEvent('popstate'))
  } catch (e) {
    try { host.navigate(path) } catch (e2) {}
  }
}

const signalStore = {
  watermark: null,     // newest signal ts the user has SEEN (ms epoch)
  newestTs: null,      // newest signal ts observed (ms epoch)
  unread: 0,
  lastSignal: null,    // { symbol, direction, kelly, regime, ts }
  recent: [],          // rolling list of recent signals (newest first, cap RECENT_MAX)
  dashboardActive: false,
  listeners: new Set(),
  loaded: false,
  _load() {
    try {
      const raw = localStorage.getItem(UNREAD_FILE)
      if (raw) {
        const s = JSON.parse(raw)
        this.watermark = s.watermark != null ? Number(s.watermark) : null
        this.unread = Number(s.unread) || 0
        this.lastSignal = s.lastSignal || null
        this.recent = Array.isArray(s.recent) ? s.recent : []
      }
    } catch (e) {}
    this.loaded = true
  },
  _persist() {
    try {
      localStorage.setItem(UNREAD_FILE, JSON.stringify({
        watermark: this.watermark,
        unread: this.unread,
        lastSignal: this.lastSignal,
        recent: this.recent.slice(0, RECENT_MAX),
      }))
    } catch (e) {}
  },
  _emit() {
    for (const fn of this.listeners) { try { fn() } catch (e) {} }
  },
  subscribe(fn) {
    if (!this.loaded) this._load()
    this.listeners.add(fn)
    try { fn() } catch (e) {}
    return () => this.listeners.delete(fn)
  },
  // Feed a qualified signal from any source (poll, dashboard realtime).
  addSignal(sig) {
    if (!this.loaded) this._load()
    const ts = Date.parse(sig && sig.ts) || 0
    if (!ts) return
    // Rolling recent list — dedup by symbol+ts, newest first. When a row
    // re-appears with price data (e.g. the persisted store predates the
    // pricing feature), ENRICH the existing entry instead of skipping.
    const key = `${sig.symbol}|${sig.ts}`
    const dupIdx = this.recent.findIndex((r) => `${r.symbol}|${r.ts}` === key)
    const hasPrices = Number(sig.entry) > 0 || Number(sig.stop) > 0 || Number(sig.take) > 0
    if (dupIdx === -1) {
      this.recent = [{ symbol: sig.symbol, direction: sig.direction, kelly: sig.kelly, regime: sig.regime, entry: sig.entry, stop: sig.stop, take: sig.take, ts: sig.ts }, ...this.recent].slice(0, RECENT_MAX)
    } else if (hasPrices) {
      const prev = this.recent[dupIdx]
      this.recent[dupIdx] = {
        ...prev,
        entry: prev.entry == null ? sig.entry : prev.entry,
        stop: prev.stop == null ? sig.stop : prev.stop,
        take: prev.take == null ? sig.take : prev.take,
      }
    }
    // First data ever seen → baseline only (no toast / unread backlog).
    if (this.watermark == null) {
      this.watermark = ts
      this.newestTs = ts
      this.lastSignal = { symbol: sig.symbol, direction: sig.direction, kelly: sig.kelly, regime: sig.regime, entry: sig.entry, stop: sig.stop, take: sig.take, ts: sig.ts }
      this._persist()
      this._emit()
      return
    }
    if (ts > this.newestTs) this.newestTs = ts
    // Enrich lastSignal prices even on a duplicate (same symbol+ts re-arrives
    // with price data — e.g. store persisted before the pricing feature).
    if (hasPrices && this.lastSignal && this.lastSignal.symbol === sig.symbol && this.lastSignal.ts === sig.ts) {
      const ls = this.lastSignal
      if (ls.entry == null || ls.stop == null || ls.take == null) {
        this.lastSignal = {
          ...ls,
          entry: ls.entry == null ? sig.entry : ls.entry,
          stop: ls.stop == null ? sig.stop : ls.stop,
          take: ls.take == null ? sig.take : ls.take,
        }
        this._persist()
        this._emit()
      }
    }
    if (ts > this.watermark) {
      if (this.dashboardActive) {
        // User is viewing the dashboard — the signal is visible live; just
        // advance the watermark so it never counts as "new" later.
        this.watermark = ts
      } else {
        this.unread = Math.min(UNREAD_MAX, this.unread + 1)
        this.lastSignal = { symbol: sig.symbol, direction: sig.direction, kelly: sig.kelly, regime: sig.regime, entry: sig.entry, stop: sig.stop, take: sig.take, ts: sig.ts }
        this._persist()
        this._emit()
        // Mode 3: in-app toast when the dashboard is not the active view.
        // ONE single toast (stable id replaces, never stacks), persistent
        // until manually dismissed (durationMs 0 — the toast X is always
        // rendered), with a footer showing signal datetime + age + friendly
        // regime label.
        if (host && typeof host.notify === 'function') {
          const dir = String(sig.direction || '').toLowerCase() === 'sell' ? 'SELL' : 'BUY'
          this._toastCount = (this._toastCount || 0) + 1
          const extra = this._toastCount > 1 ? `+${this._toastCount - 1} more` : ''
          const regimeLabel = fmtRegime(sig.regime)
          // ENTRY price in the toast message when available (2026-08-11 —
          // user flagged the toast showed "old format w/o pricing").
          const entryLabel = Number(sig.entry) > 0 ? ` · ENTRY ${fmtBrickPrice(sig.entry)}` : ''
          try {
            host.notify({
              id: SIGNAL_TOAST_ID,
              kind: 'info',
              title: 'Talaria signal',
              message: `${sig.symbol} ${dir}${sig.kelly != null ? ' · kelly ' + Number(sig.kelly).toFixed(3) : ''}${entryLabel}`,
              meta: regimeLabel ? `${fmtToastFooter(ts, extra)} · ${regimeLabel}` : fmtToastFooter(ts, extra),
              durationMs: 0,
            })
          } catch (e) {}
        }
      }
      this._persist()
      this._emit()
    }
  },
  // User opened the dashboard (or clicked the chip) — clear the badge.
  markSeen() {
    if (!this.loaded) this._load()
    this._toastCount = 0
    if (this.newestTs != null && (this.watermark == null || this.newestTs > this.watermark)) {
      this.watermark = this.newestTs
    }
    if (this.unread !== 0) {
      this.unread = 0
      this._persist()
      this._emit()
    }
  },
}

// Test hook — lets the node render harness drive the store directly (the
// harness's useEffect runs cleanup synchronously, so the chip's async poll
// never resolves there). No-op in the real app.
if (typeof globalThis !== 'undefined') {
  try { globalThis.__TALARIA_SIGNAL_STORE__ = signalStore } catch (e) {}
}

// ---------------------------------------------------------------------------
// Styles — theme variables only (no hardcoded colors). `tla-` prefix keeps
// this plugin's classes from colliding with noble-trader-admin's `nta-`.
// ---------------------------------------------------------------------------
const STYLE_ID = 'talaria-style'
const DAISY_CSS = `.dui-badge{display:inline-flex;align-items:center;justify-content:center;transition-property:color,background-color,border-color,text-decoration-color,fill,stroke,opacity,box-shadow,transform,filter,-webkit-backdrop-filter;transition-property:color,background-color,border-color,text-decoration-color,fill,stroke,opacity,box-shadow,transform,filter,backdrop-filter;transition-property:color,background-color,border-color,text-decoration-color,fill,stroke,opacity,box-shadow,transform,filter,backdrop-filter,-webkit-backdrop-filter;transition-timing-function:cubic-bezier(.4,0,.2,1);transition-timing-function:cubic-bezier(0,0,.2,1);transition-duration:.2s;height:1.25rem;font-size:.875rem;line-height:1.25rem;width:-moz-fit-content;width:fit-content;padding-left:.563rem;padding-right:.563rem;border-radius:var(--rounded-badge,1.9rem);border-width:1px;--tw-border-opacity:1;border-color:var(--fallback-b2,oklch(var(--b2)/var(--tw-border-opacity)));--tw-bg-opacity:1;background-color:var(--fallback-b1,oklch(var(--b1)/var(--tw-bg-opacity)));--tw-text-opacity:1;color:var(--fallback-bc,oklch(var(--bc)/var(--tw-text-opacity)))}@media (hover:hover){.dui-menu li>:not(ul,.dui-menu-title,details,.dui-btn).dui-active,.dui-menu li>:not(ul,.dui-menu-title,details,.dui-btn):active,.dui-menu li>details>summary:active{--tw-bg-opacity:1;background-color:var(--fallback-n,oklch(var(--n)/var(--tw-bg-opacity)));--tw-text-opacity:1;color:var(--fallback-nc,oklch(var(--nc)/var(--tw-text-opacity)))}.dui-table tr.dui-hover:hover,.dui-table tr.dui-hover:nth-child(2n):hover{--tw-bg-opacity:1;background-color:var(--fallback-b2,oklch(var(--b2)/var(--tw-bg-opacity)))}.dui-table-zebra tr.dui-hover:hover,.dui-table-zebra tr.dui-hover:nth-child(2n):hover{--tw-bg-opacity:1;background-color:var(--fallback-b3,oklch(var(--b3)/var(--tw-bg-opacity)))}}.dui-btn{display:inline-flex;height:3rem;min-height:3rem;flex-shrink:0;cursor:pointer;-webkit-user-select:none;-moz-user-select:none;user-select:none;flex-wrap:wrap;align-items:center;justify-content:center;border-radius:var(--rounded-btn,.5rem);border-color:transparent;border-color:oklch(var(--btn-color,var(--b2))/var(--tw-border-opacity));padding-left:1rem;padding-right:1rem;text-align:center;font-size:.875rem;line-height:1em;gap:.5rem;font-weight:600;text-decoration-line:none;transition-duration:.2s;transition-timing-function:cubic-bezier(0,0,.2,1);border-width:var(--border-btn,1px);transition-property:color,background-color,border-color,opacity,box-shadow,transform;--tw-text-opacity:1;color:var(--fallback-bc,oklch(var(--bc)/var(--tw-text-opacity)));--tw-shadow:0 1px 2px 0 rgba(0,0,0,.05);--tw-shadow-colored:0 1px 2px 0 var(--tw-shadow-color);box-shadow:var(--tw-ring-offset-shadow,0 0 #0000),var(--tw-ring-shadow,0 0 #0000),var(--tw-shadow);outline-color:var(--fallback-bc,oklch(var(--bc)/1));background-color:oklch(var(--btn-color,var(--b2))/var(--tw-bg-opacity));--tw-bg-opacity:1;--tw-border-opacity:1}.dui-btn-disabled,.dui-btn:disabled,.dui-btn[disabled]{pointer-events:none}:where(.dui-btn:is(input[type=checkbox])),:where(.dui-btn:is(input[type=radio])){width:auto;-webkit-appearance:none;-moz-appearance:none;appearance:none}.dui-btn:is(input[type=checkbox]):after,.dui-btn:is(input[type=radio]):after{--tw-content:attr(aria-label);content:var(--tw-content)}@media (hover:hover){.dui-btn:hover{--tw-border-opacity:1;border-color:var(--fallback-b3,oklch(var(--b3)/var(--tw-border-opacity)));--tw-bg-opacity:1;background-color:var(--fallback-b3,oklch(var(--b3)/var(--tw-bg-opacity)))}@supports (color:color-mix(in oklab,black,black)){.dui-btn:hover{background-color:color-mix(in oklab,oklch(var(--btn-color,var(--b2))/var(--tw-bg-opacity,1)) 90%,#000);border-color:color-mix(in oklab,oklch(var(--btn-color,var(--b2))/var(--tw-border-opacity,1)) 90%,#000)}}@supports not (color:oklch(0% 0 0)){.dui-btn:hover{background-color:var(--btn-color,var(--fallback-b2));border-color:var(--btn-color,var(--fallback-b2))}}.dui-btn.dui-glass:hover{--glass-opacity:25%;--glass-border-opacity:15%}.dui-btn-ghost:hover{border-color:transparent}@supports (color:oklch(0% 0 0)){.dui-btn-ghost:hover{background-color:var(--fallback-bc,oklch(var(--bc)/.2))}}.dui-btn-outline:hover{--tw-border-opacity:1;border-color:var(--fallback-bc,oklch(var(--bc)/var(--tw-border-opacity)));--tw-bg-opacity:1;background-color:var(--fallback-bc,oklch(var(--bc)/var(--tw-bg-opacity)));--tw-text-opacity:1;color:var(--fallback-b1,oklch(var(--b1)/var(--tw-text-opacity)))}.dui-btn-outline.dui-btn-primary:hover{--tw-text-opacity:1;color:var(--fallback-pc,oklch(var(--pc)/var(--tw-text-opacity)))}@supports (color:color-mix(in oklab,black,black)){.dui-btn-outline.dui-btn-primary:hover{background-color:color-mix(in oklab,var(--fallback-p,oklch(var(--p)/1)) 90%,#000);border-color:color-mix(in oklab,var(--fallback-p,oklch(var(--p)/1)) 90%,#000)}}.dui-btn-outline.dui-btn-secondary:hover{--tw-text-opacity:1;color:var(--fallback-sc,oklch(var(--sc)/var(--tw-text-opacity)))}@supports (color:color-mix(in oklab,black,black)){.dui-btn-outline.dui-btn-secondary:hover{background-color:color-mix(in oklab,var(--fallback-s,oklch(var(--s)/1)) 90%,#000);border-color:color-mix(in oklab,var(--fallback-s,oklch(var(--s)/1)) 90%,#000)}}.dui-btn-outline.dui-btn-accent:hover{--tw-text-opacity:1;color:var(--fallback-ac,oklch(var(--ac)/var(--tw-text-opacity)))}@supports (color:color-mix(in oklab,black,black)){.dui-btn-outline.dui-btn-accent:hover{background-color:color-mix(in oklab,var(--fallback-a,oklch(var(--a)/1)) 90%,#000);border-color:color-mix(in oklab,var(--fallback-a,oklch(var(--a)/1)) 90%,#000)}}.dui-btn-outline.dui-btn-success:hover{--tw-text-opacity:1;color:var(--fallback-suc,oklch(var(--suc)/var(--tw-text-opacity)))}@supports (color:color-mix(in oklab,black,black)){.dui-btn-outline.dui-btn-success:hover{background-color:color-mix(in oklab,var(--fallback-su,oklch(var(--su)/1)) 90%,#000);border-color:color-mix(in oklab,var(--fallback-su,oklch(var(--su)/1)) 90%,#000)}}.dui-btn-outline.dui-btn-info:hover{--tw-text-opacity:1;color:var(--fallback-inc,oklch(var(--inc)/var(--tw-text-opacity)))}@supports (color:color-mix(in oklab,black,black)){.dui-btn-outline.dui-btn-info:hover{background-color:color-mix(in oklab,var(--fallback-in,oklch(var(--in)/1)) 90%,#000);border-color:color-mix(in oklab,var(--fallback-in,oklch(var(--in)/1)) 90%,#000)}}.dui-btn-outline.dui-btn-warning:hover{--tw-text-opacity:1;color:var(--fallback-wac,oklch(var(--wac)/var(--tw-text-opacity)))}@supports (color:color-mix(in oklab,black,black)){.dui-btn-outline.dui-btn-warning:hover{background-color:color-mix(in oklab,var(--fallback-wa,oklch(var(--wa)/1)) 90%,#000);border-color:color-mix(in oklab,var(--fallback-wa,oklch(var(--wa)/1)) 90%,#000)}}.dui-btn-outline.dui-btn-error:hover{--tw-text-opacity:1;color:var(--fallback-erc,oklch(var(--erc)/var(--tw-text-opacity)))}@supports (color:color-mix(in oklab,black,black)){.dui-btn-outline.dui-btn-error:hover{background-color:color-mix(in oklab,var(--fallback-er,oklch(var(--er)/1)) 90%,#000);border-color:color-mix(in oklab,var(--fallback-er,oklch(var(--er)/1)) 90%,#000)}}.dui-btn-disabled:hover,.dui-btn:disabled:hover,.dui-btn[disabled]:hover{--tw-border-opacity:0;background-color:var(--fallback-n,oklch(var(--n)/var(--tw-bg-opacity)));--tw-bg-opacity:0.2;color:var(--fallback-bc,oklch(var(--bc)/var(--tw-text-opacity)));--tw-text-opacity:0.2}@supports (color:color-mix(in oklab,black,black)){.dui-btn:is(input[type=checkbox]:checked):hover,.dui-btn:is(input[type=radio]:checked):hover{background-color:color-mix(in oklab,var(--fallback-p,oklch(var(--p)/1)) 90%,#000);border-color:color-mix(in oklab,var(--fallback-p,oklch(var(--p)/1)) 90%,#000)}}:where(.dui-menu li:not(.dui-menu-title,.dui-disabled)>:not(ul,details,.dui-menu-title)):not(.dui-active,.dui-btn):hover,:where(.dui-menu li:not(.dui-menu-title,.dui-disabled)>details>summary:not(.dui-menu-title)):not(.dui-active,.dui-btn):hover{cursor:pointer;outline:2px solid transparent;outline-offset:2px}@supports (color:oklch(0% 0 0)){:where(.dui-menu li:not(.dui-menu-title,.dui-disabled)>:not(ul,details,.dui-menu-title)):not(.dui-active,.dui-btn):hover,:where(.dui-menu li:not(.dui-menu-title,.dui-disabled)>details>summary:not(.dui-menu-title)):not(.dui-active,.dui-btn):hover{background-color:var(--fallback-bc,oklch(var(--bc)/.1))}}}.dui-join{display:inline-flex;align-items:stretch;border-radius:var(--rounded-btn,.5rem)}.dui-join :where(.dui-join-item){border-start-end-radius:0;border-end-end-radius:0;border-end-start-radius:0;border-start-start-radius:0}.dui-join .dui-join-item:not(:first-child):not(:last-child),.dui-join :not(:first-child):not(:last-child) .dui-join-item{border-start-end-radius:0;border-end-end-radius:0;border-end-start-radius:0;border-start-start-radius:0}.dui-join .dui-join-item:first-child:not(:last-child),.dui-join :first-child:not(:last-child) .dui-join-item{border-start-end-radius:0;border-end-end-radius:0}.dui-join .dui-dropdown .dui-join-item:first-child:not(:last-child),.dui-join :first-child:not(:last-child) .dui-dropdown .dui-join-item{border-start-end-radius:inherit;border-end-end-radius:inherit}.dui-join :where(.dui-join-item:first-child:not(:last-child)),.dui-join :where(:first-child:not(:last-child) .dui-join-item){border-end-start-radius:inherit;border-start-start-radius:inherit}.dui-join .dui-join-item:last-child:not(:first-child),.dui-join :last-child:not(:first-child) .dui-join-item{border-end-start-radius:0;border-start-start-radius:0}.dui-join :where(.dui-join-item:last-child:not(:first-child)),.dui-join :where(:last-child:not(:first-child) .dui-join-item){border-start-end-radius:inherit;border-end-end-radius:inherit}@supports not selector(:has(*)){:where(.dui-join *){border-radius:inherit}}@supports selector(:has(*)){:where(.dui-join :has(.dui-join-item)){border-radius:inherit}}.dui-menu{display:flex;flex-direction:column;flex-wrap:wrap;font-size:.875rem;line-height:1.25rem;padding:.5rem}.dui-menu :where(li ul){position:relative;white-space:nowrap;margin-inline-start:1rem;padding-inline-start:.5rem}.dui-menu :where(li:not(.dui-menu-title)>:not(ul,details,.dui-menu-title,.dui-btn)),.dui-menu :where(li:not(.dui-menu-title)>details>summary:not(.dui-menu-title)){display:grid;grid-auto-flow:column;align-content:flex-start;align-items:center;gap:.5rem;grid-auto-columns:minmax(auto,max-content) auto max-content;-webkit-user-select:none;-moz-user-select:none;user-select:none}.dui-menu li.dui-disabled{cursor:not-allowed;-webkit-user-select:none;-moz-user-select:none;user-select:none;color:var(--fallback-bc,oklch(var(--bc)/.3))}.dui-menu :where(li>.dui-menu-dropdown:not(.dui-menu-dropdown-show)){display:none}:where(.dui-menu li){position:relative;display:flex;flex-shrink:0;flex-direction:column;flex-wrap:wrap;align-items:stretch}:where(.dui-menu li) .dui-badge{justify-self:end}.dui-table{position:relative;width:100%;border-radius:var(--rounded-box,1rem);text-align:left;font-size:.875rem;line-height:1.25rem}.dui-table :where(.dui-table-pin-rows thead tr){position:sticky;top:0;z-index:1;--tw-bg-opacity:1;background-color:var(--fallback-b1,oklch(var(--b1)/var(--tw-bg-opacity)))}.dui-table :where(.dui-table-pin-rows tfoot tr){position:sticky;bottom:0;z-index:1;--tw-bg-opacity:1;background-color:var(--fallback-b1,oklch(var(--b1)/var(--tw-bg-opacity)))}.dui-table :where(.dui-table-pin-cols tr th){position:sticky;left:0;right:0;--tw-bg-opacity:1;background-color:var(--fallback-b1,oklch(var(--b1)/var(--tw-bg-opacity)))}.dui-table-zebra tbody tr:nth-child(2n) :where(.dui-table-pin-cols tr th){--tw-bg-opacity:1;background-color:var(--fallback-b2,oklch(var(--b2)/var(--tw-bg-opacity)))}.dui-btm-nav>:where(.dui-active){border-top-width:2px;--tw-bg-opacity:1;background-color:var(--fallback-b1,oklch(var(--b1)/var(--tw-bg-opacity)))}@media (prefers-reduced-motion:no-preference){.dui-btn{animation:button-pop var(--animation-btn,.25s) ease-out}}.dui-btn:active:focus,.dui-btn:active:hover{animation:button-pop 0s ease-out;transform:scale(var(--btn-focus-scale,.97))}@supports not (color:oklch(0% 0 0)){.dui-btn{background-color:var(--btn-color,var(--fallback-b2));border-color:var(--btn-color,var(--fallback-b2))}.dui-btn-primary{--btn-color:var(--fallback-p)}}@supports (color:color-mix(in oklab,black,black)){.dui-btn-active{background-color:color-mix(in oklab,oklch(var(--btn-color,var(--b3))/var(--tw-bg-opacity,1)) 90%,#000);border-color:color-mix(in oklab,oklch(var(--btn-color,var(--b3))/var(--tw-border-opacity,1)) 90%,#000)}.dui-btn-outline.dui-btn-primary.dui-btn-active{background-color:color-mix(in oklab,var(--fallback-p,oklch(var(--p)/1)) 90%,#000);border-color:color-mix(in oklab,var(--fallback-p,oklch(var(--p)/1)) 90%,#000)}.dui-btn-outline.dui-btn-secondary.dui-btn-active{background-color:color-mix(in oklab,var(--fallback-s,oklch(var(--s)/1)) 90%,#000);border-color:color-mix(in oklab,var(--fallback-s,oklch(var(--s)/1)) 90%,#000)}.dui-btn-outline.dui-btn-accent.dui-btn-active{background-color:color-mix(in oklab,var(--fallback-a,oklch(var(--a)/1)) 90%,#000);border-color:color-mix(in oklab,var(--fallback-a,oklch(var(--a)/1)) 90%,#000)}.dui-btn-outline.dui-btn-success.dui-btn-active{background-color:color-mix(in oklab,var(--fallback-su,oklch(var(--su)/1)) 90%,#000);border-color:color-mix(in oklab,var(--fallback-su,oklch(var(--su)/1)) 90%,#000)}.dui-btn-outline.dui-btn-info.dui-btn-active{background-color:color-mix(in oklab,var(--fallback-in,oklch(var(--in)/1)) 90%,#000);border-color:color-mix(in oklab,var(--fallback-in,oklch(var(--in)/1)) 90%,#000)}.dui-btn-outline.dui-btn-warning.dui-btn-active{background-color:color-mix(in oklab,var(--fallback-wa,oklch(var(--wa)/1)) 90%,#000);border-color:color-mix(in oklab,var(--fallback-wa,oklch(var(--wa)/1)) 90%,#000)}.dui-btn-outline.dui-btn-error.dui-btn-active{background-color:color-mix(in oklab,var(--fallback-er,oklch(var(--er)/1)) 90%,#000);border-color:color-mix(in oklab,var(--fallback-er,oklch(var(--er)/1)) 90%,#000)}}.dui-btn:focus-visible{outline-style:solid;outline-width:2px;outline-offset:2px}.dui-btn-primary{--tw-text-opacity:1;color:var(--fallback-pc,oklch(var(--pc)/var(--tw-text-opacity)));outline-color:var(--fallback-p,oklch(var(--p)/1))}@supports (color:oklch(0% 0 0)){.dui-btn-primary{--btn-color:var(--p)}}.dui-btn.dui-glass{--tw-shadow:0 0 #0000;--tw-shadow-colored:0 0 #0000;box-shadow:var(--tw-ring-offset-shadow,0 0 #0000),var(--tw-ring-shadow,0 0 #0000),var(--tw-shadow);outline-color:currentColor}.dui-btn.dui-glass.dui-btn-active{--glass-opacity:25%;--glass-border-opacity:15%}.dui-btn-ghost{border-width:1px;border-color:transparent;background-color:transparent;color:currentColor;--tw-shadow:0 0 #0000;--tw-shadow-colored:0 0 #0000;box-shadow:var(--tw-ring-offset-shadow,0 0 #0000),var(--tw-ring-shadow,0 0 #0000),var(--tw-shadow);outline-color:currentColor}.dui-btn-ghost.dui-btn-active{border-color:transparent;background-color:var(--fallback-bc,oklch(var(--bc)/.2))}.dui-btn-link.dui-btn-active{border-color:transparent;background-color:transparent;text-decoration-line:underline}.dui-btn-outline{border-color:currentColor;background-color:transparent;--tw-text-opacity:1;color:var(--fallback-bc,oklch(var(--bc)/var(--tw-text-opacity)));--tw-shadow:0 0 #0000;--tw-shadow-colored:0 0 #0000;box-shadow:var(--tw-ring-offset-shadow,0 0 #0000),var(--tw-ring-shadow,0 0 #0000),var(--tw-shadow)}.dui-btn-outline.dui-btn-active{--tw-border-opacity:1;border-color:var(--fallback-bc,oklch(var(--bc)/var(--tw-border-opacity)));--tw-bg-opacity:1;background-color:var(--fallback-bc,oklch(var(--bc)/var(--tw-bg-opacity)));--tw-text-opacity:1;color:var(--fallback-b1,oklch(var(--b1)/var(--tw-text-opacity)))}.dui-btn-outline.dui-btn-primary{--tw-text-opacity:1;color:var(--fallback-p,oklch(var(--p)/var(--tw-text-opacity)))}.dui-btn-outline.dui-btn-primary.dui-btn-active{--tw-text-opacity:1;color:var(--fallback-pc,oklch(var(--pc)/var(--tw-text-opacity)))}.dui-btn-outline.dui-btn-secondary{--tw-text-opacity:1;color:var(--fallback-s,oklch(var(--s)/var(--tw-text-opacity)))}.dui-btn-outline.dui-btn-secondary.dui-btn-active{--tw-text-opacity:1;color:var(--fallback-sc,oklch(var(--sc)/var(--tw-text-opacity)))}.dui-btn-outline.dui-btn-accent{--tw-text-opacity:1;color:var(--fallback-a,oklch(var(--a)/var(--tw-text-opacity)))}.dui-btn-outline.dui-btn-accent.dui-btn-active{--tw-text-opacity:1;color:var(--fallback-ac,oklch(var(--ac)/var(--tw-text-opacity)))}.dui-btn-outline.dui-btn-success{--tw-text-opacity:1;color:var(--fallback-su,oklch(var(--su)/var(--tw-text-opacity)))}.dui-btn-outline.dui-btn-success.dui-btn-active{--tw-text-opacity:1;color:var(--fallback-suc,oklch(var(--suc)/var(--tw-text-opacity)))}.dui-btn-outline.dui-btn-info{--tw-text-opacity:1;color:var(--fallback-in,oklch(var(--in)/var(--tw-text-opacity)))}.dui-btn-outline.dui-btn-info.dui-btn-active{--tw-text-opacity:1;color:var(--fallback-inc,oklch(var(--inc)/var(--tw-text-opacity)))}.dui-btn-outline.dui-btn-warning{--tw-text-opacity:1;color:var(--fallback-wa,oklch(var(--wa)/var(--tw-text-opacity)))}.dui-btn-outline.dui-btn-warning.dui-btn-active{--tw-text-opacity:1;color:var(--fallback-wac,oklch(var(--wac)/var(--tw-text-opacity)))}.dui-btn-outline.dui-btn-error{--tw-text-opacity:1;color:var(--fallback-er,oklch(var(--er)/var(--tw-text-opacity)))}.dui-btn-outline.dui-btn-error.dui-btn-active{--tw-text-opacity:1;color:var(--fallback-erc,oklch(var(--erc)/var(--tw-text-opacity)))}.dui-btn.dui-btn-disabled,.dui-btn:disabled,.dui-btn[disabled]{--tw-border-opacity:0;background-color:var(--fallback-n,oklch(var(--n)/var(--tw-bg-opacity)));--tw-bg-opacity:0.2;color:var(--fallback-bc,oklch(var(--bc)/var(--tw-text-opacity)));--tw-text-opacity:0.2}.dui-btn:is(input[type=checkbox]:checked),.dui-btn:is(input[type=radio]:checked){--tw-border-opacity:1;border-color:var(--fallback-p,oklch(var(--p)/var(--tw-border-opacity)));--tw-bg-opacity:1;background-color:var(--fallback-p,oklch(var(--p)/var(--tw-bg-opacity)));--tw-text-opacity:1;color:var(--fallback-pc,oklch(var(--pc)/var(--tw-text-opacity)))}.dui-btn:is(input[type=checkbox]:checked):focus-visible,.dui-btn:is(input[type=radio]:checked):focus-visible{outline-color:var(--fallback-p,oklch(var(--p)/1))}@keyframes button-pop{0%{transform:scale(var(--btn-focus-scale,.98))}40%{transform:scale(1.02)}to{transform:scale(1)}}@keyframes checkmark{0%{background-position-y:5px}50%{background-position-y:-2px}to{background-position-y:0}}.dui-join>:where(:not(:first-child)){margin-top:0;margin-bottom:0;margin-inline-start:-1px}.dui-join>:where(:not(:first-child)):is(.dui-btn){margin-inline-start:calc(var(--border-btn)*-1)}.dui-join-item:focus{isolation:isolate}:where(.dui-menu li:empty){--tw-bg-opacity:1;background-color:var(--fallback-bc,oklch(var(--bc)/var(--tw-bg-opacity)));opacity:.1;margin:.5rem 1rem;height:1px}.dui-menu :where(li ul):before{position:absolute;bottom:.75rem;inset-inline-start:0;top:.75rem;width:1px;--tw-bg-opacity:1;background-color:var(--fallback-bc,oklch(var(--bc)/var(--tw-bg-opacity)));opacity:.1;content:""}.dui-menu :where(li:not(.dui-menu-title)>:not(ul,details,.dui-menu-title,.dui-btn)),.dui-menu :where(li:not(.dui-menu-title)>details>summary:not(.dui-menu-title)){border-radius:var(--rounded-btn,.5rem);padding:.5rem 1rem;text-align:start;transition-property:color,background-color,border-color,text-decoration-color,fill,stroke,opacity,box-shadow,transform,filter,-webkit-backdrop-filter;transition-property:color,background-color,border-color,text-decoration-color,fill,stroke,opacity,box-shadow,transform,filter,backdrop-filter;transition-property:color,background-color,border-color,text-decoration-color,fill,stroke,opacity,box-shadow,transform,filter,backdrop-filter,-webkit-backdrop-filter;transition-timing-function:cubic-bezier(.4,0,.2,1);transition-timing-function:cubic-bezier(0,0,.2,1);transition-duration:.2s;text-wrap:balance}:where(.dui-menu li:not(.dui-menu-title,.dui-disabled)>:not(ul,details,.dui-menu-title)):is(summary):not(.dui-active,.dui-btn):focus-visible,:where(.dui-menu li:not(.dui-menu-title,.dui-disabled)>:not(ul,details,.dui-menu-title)):not(summary,.dui-active,.dui-btn).dui-focus,:where(.dui-menu li:not(.dui-menu-title,.dui-disabled)>:not(ul,details,.dui-menu-title)):not(summary,.dui-active,.dui-btn):focus,:where(.dui-menu li:not(.dui-menu-title,.dui-disabled)>details>summary:not(.dui-menu-title)):is(summary):not(.dui-active,.dui-btn):focus-visible,:where(.dui-menu li:not(.dui-menu-title,.dui-disabled)>details>summary:not(.dui-menu-title)):not(summary,.dui-active,.dui-btn).dui-focus,:where(.dui-menu li:not(.dui-menu-title,.dui-disabled)>details>summary:not(.dui-menu-title)):not(summary,.dui-active,.dui-btn):focus{cursor:pointer;background-color:var(--fallback-bc,oklch(var(--bc)/.1));--tw-text-opacity:1;color:var(--fallback-bc,oklch(var(--bc)/var(--tw-text-opacity)));outline:2px solid transparent;outline-offset:2px}.dui-menu li>:not(ul,.dui-menu-title,details,.dui-btn).dui-active,.dui-menu li>:not(ul,.dui-menu-title,details,.dui-btn):active,.dui-menu li>details>summary:active{--tw-bg-opacity:1;background-color:var(--fallback-n,oklch(var(--n)/var(--tw-bg-opacity)));--tw-text-opacity:1;color:var(--fallback-nc,oklch(var(--nc)/var(--tw-text-opacity)))}.dui-menu :where(li>details>summary)::-webkit-details-marker{display:none}.dui-menu :where(li>.dui-menu-dropdown-toggle):after,.dui-menu :where(li>details>summary):after{justify-self:end;display:block;margin-top:-.5rem;height:.5rem;width:.5rem;transform:rotate(45deg);transition-property:transform,margin-top;transition-duration:.3s;transition-timing-function:cubic-bezier(.4,0,.2,1);content:"";transform-origin:75% 75%;box-shadow:2px 2px;pointer-events:none}.dui-menu :where(li>.dui-menu-dropdown-toggle.dui-menu-dropdown-show):after,.dui-menu :where(li>details[open]>summary):after{transform:rotate(225deg);margin-top:0}@keyframes modal-pop{0%{opacity:0}}@keyframes progress-loading{50%{background-position-x:-115%}}@keyframes radiomark{0%{box-shadow:0 0 0 12px var(--fallback-b1,oklch(var(--b1)/1)) inset,0 0 0 12px var(--fallback-b1,oklch(var(--b1)/1)) inset}50%{box-shadow:0 0 0 3px var(--fallback-b1,oklch(var(--b1)/1)) inset,0 0 0 3px var(--fallback-b1,oklch(var(--b1)/1)) inset}to{box-shadow:0 0 0 4px var(--fallback-b1,oklch(var(--b1)/1)) inset,0 0 0 4px var(--fallback-b1,oklch(var(--b1)/1)) inset}}@keyframes rating-pop{0%{transform:translateY(-.125em)}40%{transform:translateY(-.125em)}to{transform:translateY(0)}}@keyframes skeleton{0%{background-position:150%}to{background-position:-50%}}.dui-table:where([dir=rtl],[dir=rtl] *){text-align:right}.dui-table :where(th,td){padding:.75rem 1rem;vertical-align:middle}.dui-table tr.dui-active,.dui-table tr.dui-active:nth-child(2n),.dui-table-zebra tbody tr:nth-child(2n){--tw-bg-opacity:1;background-color:var(--fallback-b2,oklch(var(--b2)/var(--tw-bg-opacity)))}.dui-table-zebra tr.dui-active,.dui-table-zebra tr.dui-active:nth-child(2n),.dui-table-zebra-zebra tbody tr:nth-child(2n){--tw-bg-opacity:1;background-color:var(--fallback-b3,oklch(var(--b3)/var(--tw-bg-opacity)))}.dui-table :where(thead tr,tbody tr:not(:last-child),tbody tr:first-child:last-child){border-bottom-width:1px;--tw-border-opacity:1;border-bottom-color:var(--fallback-b2,oklch(var(--b2)/var(--tw-border-opacity)))}.dui-table :where(thead,tfoot){white-space:nowrap;font-size:.75rem;line-height:1rem;font-weight:700;color:var(--fallback-bc,oklch(var(--bc)/.6))}.dui-table :where(tfoot){border-top-width:1px;--tw-border-opacity:1;border-top-color:var(--fallback-b2,oklch(var(--b2)/var(--tw-border-opacity)))}@keyframes toast-pop{0%{transform:scale(.9);opacity:0}to{transform:scale(1);opacity:1}}.dui-glass,.dui-glass.dui-btn-active{border:none;-webkit-backdrop-filter:blur(var(--glass-blur,40px));backdrop-filter:blur(var(--glass-blur,40px));background-color:transparent;background-image:linear-gradient(135deg,rgb(255 255 255/var(--glass-opacity,30%)) 0,transparent 100%),linear-gradient(var(--glass-reflex-degree,100deg),rgb(255 255 255/var(--glass-reflex-opacity,10%)) 25%,transparent 25%);box-shadow:0 0 0 1px rgb(255 255 255/var(--glass-border-opacity,10%)) inset,0 0 0 2px rgb(0 0 0/5%);text-shadow:0 1px rgb(0 0 0/var(--glass-text-shadow-opacity,5%))}@media (hover:hover){.dui-glass.dui-btn-active{border:none;-webkit-backdrop-filter:blur(var(--glass-blur,40px));backdrop-filter:blur(var(--glass-blur,40px));background-color:transparent;background-image:linear-gradient(135deg,rgb(255 255 255/var(--glass-opacity,30%)) 0,transparent 100%),linear-gradient(var(--glass-reflex-degree,100deg),rgb(255 255 255/var(--glass-reflex-opacity,10%)) 25%,transparent 25%);box-shadow:0 0 0 1px rgb(255 255 255/var(--glass-border-opacity,10%)) inset,0 0 0 2px rgb(0 0 0/5%);text-shadow:0 1px rgb(0 0 0/var(--glass-text-shadow-opacity,5%))}}.dui-badge-sm{height:1rem;font-size:.75rem;line-height:1rem;padding-left:.438rem;padding-right:.438rem}.dui-btm-nav-xs>:where(.dui-active){border-top-width:1px}.dui-btm-nav-sm>:where(.dui-active){border-top-width:2px}.dui-btm-nav-md>:where(.dui-active){border-top-width:2px}.dui-btm-nav-lg>:where(.dui-active){border-top-width:4px}.dui-btn-sm{height:2rem;min-height:2rem;padding-left:.75rem;padding-right:.75rem;font-size:.875rem}.dui-btn-square:where(.dui-btn-sm){height:2rem;width:2rem;padding:0}.dui-btn-circle:where(.dui-btn-sm){height:2rem;width:2rem;border-radius:9999px;padding:0}.dui-join.dui-join-vertical{flex-direction:column}.dui-join.dui-join-vertical .dui-join-item:first-child:not(:last-child),.dui-join.dui-join-vertical :first-child:not(:last-child) .dui-join-item{border-end-start-radius:0;border-end-end-radius:0;border-start-start-radius:inherit;border-start-end-radius:inherit}.dui-join.dui-join-vertical .dui-join-item:last-child:not(:first-child),.dui-join.dui-join-vertical :last-child:not(:first-child) .dui-join-item{border-start-start-radius:0;border-start-end-radius:0;border-end-start-radius:inherit;border-end-end-radius:inherit}.dui-join.dui-join-horizontal{flex-direction:row}.dui-join.dui-join-horizontal .dui-join-item:first-child:not(:last-child),.dui-join.dui-join-horizontal :first-child:not(:last-child) .dui-join-item{border-end-end-radius:0;border-start-end-radius:0;border-end-start-radius:inherit;border-start-start-radius:inherit}.dui-join.dui-join-horizontal .dui-join-item:last-child:not(:first-child),.dui-join.dui-join-horizontal :last-child:not(:first-child) .dui-join-item{border-end-start-radius:0;border-start-start-radius:0;border-end-end-radius:inherit;border-start-end-radius:inherit}.dui-join.dui-join-vertical>:where(:not(:first-child)){margin-left:0;margin-right:0;margin-top:-1px}.dui-join.dui-join-vertical>:where(:not(:first-child)):is(.dui-btn){margin-top:calc(var(--border-btn)*-1)}.dui-join.dui-join-horizontal>:where(:not(:first-child)){margin-top:0;margin-bottom:0;margin-inline-start:-1px}.dui-join.dui-join-horizontal>:where(:not(:first-child)):is(.dui-btn){margin-inline-start:calc(var(--border-btn)*-1);margin-top:0}.dui-table-sm :not(thead):not(tfoot) tr{font-size:.875rem;line-height:1.25rem}.dui-table-sm :where(th,td){padding:.5rem .75rem}.dui-table{display:table}`
const CSS = [
  '.tla-root{display:flex;flex-direction:column;height:100%;gap:12px;padding:16px;overflow:auto;}',
  '.tla-header{display:flex;align-items:center;justify-content:center;padding:10px 0 2px;font-size:1.15rem;font-weight:600;letter-spacing:.02em;border-bottom:1px solid var(--ui-stroke-secondary,#2a2a2a);margin-bottom:2px;}',
  '.tla-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:12px;}',
  '.tla-card{background:var(--ui-panel,#161616);border:1px solid var(--ui-stroke-secondary,#2a2a2a);border-radius:8px;padding:12px;display:flex;flex-direction:column;gap:8px;}',
  '.tla-card h3{margin:0;font-size:12px;font-weight:600;color:var(--ui-text-secondary,#999);text-transform:uppercase;letter-spacing:0.04em;}',
  '.tla-card .tla-value{font-size:26px;font-weight:700;color:var(--ui-text-primary,#eee);}',
  '.tla-card .tla-sub{font-size:11px;color:var(--ui-text-quaternary,#777);}',
  '.tla-row{display:flex;justify-content:space-between;align-items:baseline;padding:3px 0;font-size:12px;}',
  '.tla-row .tla-k{color:var(--ui-text-tertiary,#888);}',
  '.tla-row .tla-v{color:var(--ui-text-primary,#eee);font-variant-numeric:tabular-nums;}',
  '.tla-pos{color:var(--ui-accent,#4c9aff);}',
  '.tla-neg{color:var(--ui-danger,#ff5c5c);}',
  '.tla-table{width:100%;border-collapse:collapse;font-size:11px;}',
  '.tla-table th,.tla-table td{border-bottom:1px solid var(--ui-stroke-secondary,#2a2a2a);padding:5px 6px;text-align:left;white-space:nowrap;}',
  '.tla-table th{color:var(--ui-text-tertiary,#888);font-weight:600;}',
  '.tla-table .tla-sm{font-size:9px;color:var(--ui-text-secondary,#aaa);font-variant-numeric:tabular-nums;white-space:nowrap;}',
  '.tla-table tbody tr:hover{background:rgba(255,255,255,0.02);}',
  '.tla-kelly-table .tla-regime-cell{font-size:14px;font-weight:600;}',
  '.tla-kelly-table .tla-agg-cell{font-size:13px;font-weight:600;}',
  '.tla-kelly-table .tla-sig-cell{font-size:13px;font-weight:700;text-transform:uppercase;}',
  '.tla-kelly-table .tla-kelly-cell{font-size:16px;font-weight:700;font-variant-numeric:tabular-nums;}',
  '.tla-kelly-table .tla-kelly-fCell{font-size:9px;color:var(--ui-text-secondary,#aaa);font-variant-numeric:tabular-nums;}',
  '.tla-kelly-table .tla-pwin-cell{font-size:11px;font-variant-numeric:tabular-nums;}',
  '.tla-kelly-table .tla-ev-cell{font-size:11px;font-variant-numeric:tabular-nums;}',
  '.tla-kelly-table .tla-price-cell{font-size:10px;font-variant-numeric:tabular-nums;}',
  '.tla-kelly-table .tla-conf-cell{font-size:10px;color:var(--ui-text-tertiary,#888);font-variant-numeric:tabular-nums;}',
  '.tla-kelly-table .tla-ts-cell{font-size:9px;color:var(--ui-text-tertiary,#888);font-variant-numeric:tabular-nums;}',
  '.tla-kelly-table .tla-shift-cell{font-size:12px;text-align:center;}',
  '.tla-kelly-table .tla-prev-cell{font-size:11px;color:var(--ui-text-secondary,#aaa);}',
  '.tla-kelly-table .tla-sizemult-cell{font-size:9px;color:var(--ui-text-secondary,#aaa);}',
  '.tla-kelly-table .tla-group-header td{font-size:11px;font-weight:600;color:var(--ui-text-tertiary,#888);border-bottom:1px solid var(--ui-stroke-secondary,#2a2a2a);}',
  '.tla-kelly-table-wrap{overflow-x:auto;}',
  '.tla-context-card .tla-context-value{font-size:20px;font-weight:700;}',
  '.tla-context-card .tla-context-sub{font-size:10px;color:var(--ui-text-quaternary,#777);}',
  '.tla-badge{display:inline-block;padding:1px 8px;border-radius:10px;font-size:10px;font-weight:600;text-transform:uppercase;}',
  '.tla-badge.open{background:rgba(120,220,120,0.15);color:#78dc78;}',
  '.tla-badge.closed{background:rgba(76,154,255,0.15);color:var(--ui-accent,#4c9aff);}',
  '.tla-badge.opened{background:rgba(76,154,255,0.15);color:var(--ui-accent,#4c9aff);}',
  '.tla-badge.equity{background:rgba(153,153,153,0.15);color:var(--ui-text-tertiary,#888);}',
  '.tla-badge.active{background:rgba(120,220,120,0.15);color:#78dc78;}',
  '.tla-badge.grace{background:rgba(240,180,60,0.15);color:#f0b43c;}',
  '.tla-hot{display:flex;flex-wrap:wrap;gap:8px;align-items:stretch;margin-top:8px;}',
  '.tla-hot-card h3{margin-bottom:2px;}',
  '.tla-hot-ts{display:block;font-size:10px;color:var(--ui-text-quaternary,#777);margin-bottom:2px;}',
  '.tla-hot-chip{display:flex;flex-direction:row;align-items:center;gap:6px;padding:6px 10px;border-radius:8px;border:1px solid var(--ui-stroke-secondary,#2a2a2a);}',
  '.tla-hot-chip .tla-hot-sym{font-size:13px;font-weight:700;color:var(--ui-text-primary,#eee);}',
  '.tla-hot-chip .tla-hot-kelly{font-size:11px;font-variant-numeric:tabular-nums;color:var(--ui-text-secondary,#aaa);margin-left:4px;}',
  '.tla-hot-chip .tla-hot-dir{font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:0.06em;padding:2px 5px;border-radius:4px;}',
  '.tla-hot-chip .tla-hot-regime{font-size:10px;color:var(--ui-text-tertiary,#888);margin-left:2px;white-space:nowrap;}',
  '.tla-hot-buy{background:rgba(76,154,255,0.10);border-color:rgba(76,154,255,0.35);}',
  '.tla-hot-buy .tla-hot-dir{color:#fff;background:#2f6fd6;}',
  '.tla-hot-sell{background:rgba(255,92,92,0.10);border-color:rgba(255,92,92,0.35);}',
  '.tla-hot-sell .tla-hot-dir{color:#fff;background:#d64545;}',
  '.tla-err{color:var(--ui-danger,#ff5c5c);font-size:12px;padding:8px;}',
  '.tla-ok{color:#78dc78;font-size:12px;}',
  '.tla-hint{color:var(--ui-text-quaternary,#666);font-size:11px;}',
  '.tla-explainer{color:var(--ui-text-secondary,#bbb);font-size:11px;line-height:1.55;background:rgba(127,127,127,0.07);border-left:3px solid var(--ui-accent,#4c9aff);padding:7px 10px;margin:8px 0 10px;border-radius:0 6px 6px 0;}',
  '.tla-field{display:flex;flex-direction:column;gap:4px;margin-bottom:10px;}',
  '.tla-field label{font-size:11px;color:var(--ui-text-tertiary,#888);}',
  '.tla-field input{background:var(--ui-panel,#101010);border:1px solid var(--ui-stroke-secondary,#2a2a2a);color:var(--ui-text-primary,#eee);border-radius:6px;padding:7px 10px;font-size:12px;font-family:inherit;}',
  '.tla-btn{background:var(--ui-accent,#4c9aff);color:#fff;border:none;border-radius:6px;padding:8px 16px;font-size:12px;font-weight:600;cursor:pointer;font-family:inherit;text-decoration:none;display:inline-block;}',
  '.tla-btn:hover{opacity:0.9;}',
  '.tla-btn-secondary{background:transparent;border:1px solid var(--ui-stroke-secondary,#2a2a2a);color:var(--ui-text-secondary,#aaa);}',
  '.tla-btn-secondary:hover{border-color:var(--ui-accent,#4c9aff);color:var(--ui-accent,#4c9aff);opacity:1;}',
  '.tla-banner{display:flex;align-items:center;gap:8px;padding:8px 12px;border-radius:8px;font-size:12px;background:rgba(240,180,60,0.10);border:1px solid rgba(240,180,60,0.35);color:#f0b43c;}',
  '.tla-banner-paywall{background:rgba(255,92,92,0.10);border-color:rgba(255,92,92,0.35);color:var(--ui-danger,#ff5c5c);}',
  '.tla-center{display:flex;flex-direction:column;align-items:center;justify-content:center;height:100%;gap:14px;padding:24px;text-align:center;}',
  '.tla-title{font-size:18px;font-weight:700;color:var(--ui-text-primary,#eee);}',
  '.tla-brick-picker{display:flex;flex-wrap:wrap;gap:8px;margin:8px 0 10px;}',
  '.tla-brick-btn{background:transparent;border:1px solid var(--ui-stroke-secondary,#2a2a2a);border-radius:8px;color:var(--ui-text-secondary,#aaa);padding:6px 14px;font-size:12px;font-weight:600;cursor:pointer;font-family:inherit;letter-spacing:0.03em;}',
  '.tla-brick-btn:hover{border-color:var(--ui-accent,#4c9aff);color:var(--ui-accent,#4c9aff);}',
  '.tla-brick-btn-active{background:rgba(76,154,255,0.18);border-color:var(--ui-accent,#4c9aff);color:var(--ui-accent,#4c9aff);}',
  // Phase 2 analytics — signal health / calibration / markov / sizing cards
  '.tla-mini-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:8px;}',
  '.tla-inline{display:flex;flex-wrap:wrap;gap:12px;align-items:center;font-size:12px;}',
  '.tla-badge.overconfident{background:rgba(255,92,92,0.15);color:var(--ui-danger,#ff5c5c);}',
  '.tla-badge.underconfident{background:rgba(120,220,120,0.15);color:#78dc78;}',
  '.tla-badge.calibrated{background:rgba(153,153,153,0.15);color:var(--ui-text-tertiary,#888);}',
  '.tla-badge.sig{background:rgba(120,220,120,0.15);color:#78dc78;}',
  // Statusbar chip (Mode 2 widget) — compact, theme-var only
  '.tla-chip{display:inline-flex;align-items:center;gap:6px;height:100%;padding:0 8px;font-size:11px;font-weight:500;color:var(--ui-text-tertiary,#888);background:transparent;border:none;cursor:pointer;font-family:inherit;letter-spacing:0.02em;}',
  '.tla-chip:hover{color:var(--ui-text-primary,#eee);background:rgba(127,127,127,0.08);}',
  '.tla-chip .tla-chip-dot{width:6px;height:6px;border-radius:50%;background:var(--ui-text-quaternary,#777);flex-shrink:0;}',
  '.tla-chip.tla-chip-hot{color:var(--ui-accent,#4c9aff);font-weight:700;}',
  '.tla-chip.tla-chip-hot .tla-chip-dot{background:var(--ui-accent,#4c9aff);}',
  // Side-by-side signals pane (Mode 2 widget — default dock RIGHT of the
  // chat, 300px column; users may drag it to any zone — see the @container
  // rules below for the multi-placement adaptation).
  '.tla-pane-root{display:flex;flex-direction:column;height:100%;width:100%;min-width:0;box-sizing:border-box;gap:8px;padding:10px;overflow:auto;font-size:12px;container-type:inline-size;}',
  '.tla-pane-header{display:flex;align-items:center;gap:8px;font-weight:600;color:var(--ui-text-primary,#eee);padding-bottom:6px;border-bottom:1px solid var(--ui-stroke-secondary,#2a2a2a);}',
  '.tla-pane-badge{background:var(--ui-accent,#4c9aff);color:#fff;border-radius:10px;padding:1px 8px;font-size:10px;font-weight:700;}',
  '.tla-pane-open{margin-left:auto;background:transparent;border:1px solid var(--ui-stroke-secondary,#2a2a2a);color:var(--ui-text-secondary,#aaa);border-radius:6px;padding:2px 8px;font-size:10px;cursor:pointer;font-family:inherit;}',
  '.tla-pane-open:hover{border-color:var(--ui-accent,#4c9aff);color:var(--ui-accent,#4c9aff);}',
  '.tla-pane-last{display:flex;flex-wrap:wrap;align-items:center;gap:6px;padding:8px;border:1px solid var(--ui-stroke-secondary,#2a2a2a);border-radius:8px;}',
  '.tla-pane-sym{font-size:14px;font-weight:700;color:var(--ui-text-primary,#eee);}',
  '.tla-pane-dir{font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:0.06em;padding:2px 5px;border-radius:4px;}',
  '.tla-pane-buy{color:#fff;background:#2f6fd6;}',
  '.tla-pane-sell{color:#fff;background:#d64545;}',
  '.tla-pane-kelly{font-size:11px;color:var(--ui-text-secondary,#aaa);font-variant-numeric:tabular-nums;}',
  '.tla-pane-regime{font-size:10px;color:var(--ui-text-tertiary,#888);}',
  '.tla-pane-ts{font-size:10px;color:var(--ui-text-quaternary,#777);width:100%;}',
  '.tla-pane-price{display:flex;flex-wrap:wrap;gap:8px;width:100%;margin-top:4px;font-size:10px;font-variant-numeric:tabular-nums;padding-top:4px;border-top:1px solid var(--ui-stroke-secondary,#2a2a2a);}',
  '.tla-pane-price-entry{color:var(--ui-text-primary,#eee);}',
  '.tla-pane-price-sl{color:var(--ui-danger,#ff5c5c);}',
  '.tla-pane-price-tp{color:var(--ui-accent,#4c9aff);}',
  '.tla-pane-hint{padding:4px 0;}',
  '.tla-pane-list{display:flex;flex-direction:column;gap:4px;}',
  '.tla-pane-row{display:flex;flex-wrap:wrap;align-items:center;gap:6px;width:100%;background:transparent;border:1px solid transparent;border-radius:6px;padding:5px 6px;color:var(--ui-text-primary,#eee);cursor:pointer;font-family:inherit;text-align:left;}',
  '.tla-pane-row:hover{background:rgba(127,127,127,0.08);border-color:var(--ui-stroke-secondary,#2a2a2a);}',
  // Pricing on every row (2026-08-11): the price line wraps to its own row
  // under the compact summary (flex-basis 100%), slightly tighter than the
  // top card's price block.
  '.tla-pane-price-row{flex-basis:100%;margin-top:2px;padding-top:2px;}',
  '.tla-pane-row-sym{font-size:12px;font-weight:700;}',
  '.tla-pane-row-kelly{font-size:10px;color:var(--ui-text-secondary,#aaa);font-variant-numeric:tabular-nums;margin-left:auto;}',
  '.tla-pane-row-regime{font-size:10px;color:var(--ui-text-tertiary,#888);}',
  '.tla-pane-row-ts{font-size:10px;color:var(--ui-text-quaternary,#777);}',
  '.tla-pane-foot{font-size:9px;color:var(--ui-text-quaternary,#666);margin-top:auto;padding-top:6px;border-top:1px solid var(--ui-stroke-secondary,#2a2a2a);}',
  // Multi-placement adaptation (2026-08-13): the pane is registered with
  // default dock right (300px column), but users can drag it anywhere — a
  // bottom strip, a widened zone, another monitor. `container-type:
  // inline-size` on .tla-pane-root makes these @container queries track the
  // pane's ACTUAL width, so the widget always renders sensibly no matter
  // where it lands:
  //   <560px  → compact single column (default right dock)
  //   >=560px → two-column row grid + card shares the row (bottom/wide docks)
  '@container (min-width: 560px){',
  '.tla-pane-root .tla-pane-list{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:6px;}',
  '.tla-pane-root .tla-pane-last{flex-wrap:nowrap;}',
  '.tla-pane-root .tla-pane-last .tla-pane-ts{width:auto;margin-left:auto;}',
  '.tla-pane-root .tla-pane-price{flex-wrap:nowrap;gap:12px;}',
  '}',
].join('')

function ensureStyle() {
  let style = document.getElementById(STYLE_ID)
  if (!style) {
    style = document.createElement('style')
    style.id = STYLE_ID
    document.head.appendChild(style)
  }
  // Always refresh textContent — hot-reloads keep the OLD css otherwise and
  // new classes silently never apply.
  if (globalThis.__DAISY_INJECTED__ !== "talaria-style") {
    const ds = document.getElementById('daisy-talaria-style')
    if (!ds) { const d = document.createElement('style'); d.id = 'daisy-talaria-style'; d.textContent = DAISY_CSS; document.head.appendChild(d) }
    globalThis.__DAISY_INJECTED__ = "talaria-style"
  }
  style.textContent = CSS
}

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------
// Adaptive price formatter: fewer decimals for large prices (XAU ~4095 → 2dp),
// more for small prices (FX ~1.08 → 5dp).
function fmtPrice(v) {
  if (v == null || isNaN(Number(v))) return '—'
  const n = Number(v)
  const abs = Math.abs(n)
  if (abs >= 1000) return n.toFixed(1)
  if (abs >= 100) return n.toFixed(3)
  if (abs >= 10) return n.toFixed(4)
  return n.toFixed(5)
}

function StatCard({ title, value, sub, tone }) {
  return React.createElement('div', { className: 'tla-card' },
    React.createElement('h3', null, title),
    React.createElement('div', {
      className: cn('tla-value', tone === 'pos' ? 'tla-pos' : tone === 'neg' ? 'tla-neg' : ''),
    }, value),
    sub ? React.createElement('div', { className: 'tla-sub' }, sub) : null,
  )
}

// ---------------------------------------------------------------------------
// Renko brick chart — SVG bricks (up green / down red), price axis on the
// right, brick-index axis on the bottom. Ported from the admin plugin.
// ---------------------------------------------------------------------------
const BRICK_W = 26
const BRICK_GAP = 4
const BRICK_STEP = BRICK_W + BRICK_GAP
const BRICK_RIGHT_MARGIN = 66
const BRICK_TOP_PAD = 18
const BRICK_BOTTOM_PAD = 26
const BRICK_LEFT_PAD = 6
const MIN_BRICK_H = 5

function brickGridLines(minP, maxP, target = 6) {
  const range = maxP - minP
  if (range <= 0) return [minP]
  const raw = range / target
  const mag = Math.pow(10, Math.floor(Math.log10(raw)))
  const norm = raw / mag
  const step = norm <= 1 ? mag : norm <= 2 ? 2 * mag : norm <= 5 ? 5 * mag : 10 * mag
  const lines = []
  for (let p = Math.ceil(minP / step) * step; p <= maxP; p += step) lines.push(parseFloat(p.toPrecision(10)))
  return lines
}

function brickStep(total, target = 8) {
  if (total <= target) return 1
  const raw = total / target
  const mag = Math.pow(10, Math.floor(Math.log10(raw)))
  const norm = raw / mag
  const step = norm <= 1 ? mag : norm <= 2 ? 2 * mag : norm <= 5 ? 5 * mag : 10 * mag
  return Math.max(1, Math.round(step))
}

function fmtBrickPrice(p) {
  const n = Number(p)
  if (n == null || isNaN(n)) return '—'
  // Full-value format (6dp → rstrip trailing zeros → keep ≥2dp): BTC 64900 →
  // $64900.00, XAU 4072.5 → $4072.50, FX 1.137 → $1.137, XAG 57.0568 →
  // $57.0568 (no magnitude-based truncation).
  let s = n.toFixed(6).replace(/\.?0+$/, '')
  if (!s.includes('.')) s += '.00'
  else if (s.split('.')[1].length < 2) s = n.toFixed(2)
  return '$' + s
}

// bricks: [{ open_price, close_price, direction }] ordered by brick_index asc.
// levels: [{ label, price, color }] — horizontal reference lines (entry/sl/tp).
function RenkoBrickChart({ bricks, height = 300, levels }) {
  if (!bricks || !bricks.length) {
    return React.createElement('div', { className: 'tla-hint' }, 'No bricks yet')
  }
  // Y-scale from BRICKS ONLY — levels no longer stretch the price range, so a
  // far-away ENTRY/SL/TP can't crush the bricks into a flat band (the BTCUSD
  // 6420-6468 mess). Level lines are drawn only when inside the visible range,
  // and all pricing lives in the legend row BELOW the chart (2026-08-08).
  let minP = Infinity
  let maxP = -Infinity
  for (const b of bricks) {
    const lo = Math.min(b.open_price, b.close_price)
    const hi = Math.max(b.open_price, b.close_price)
    if (lo < minP) minP = lo
    if (hi > maxP) maxP = hi
  }
  const range = maxP - minP || 1
  const pad = range * 0.12
  const pMin = minP - pad
  const pMax = maxP + pad
  const pRange = pMax - pMin
  const chartH = height - BRICK_TOP_PAD - BRICK_BOTTOM_PAD
  const svgW = bricks.length * BRICK_STEP + BRICK_RIGHT_MARGIN + BRICK_LEFT_PAD
  const priceToY = (p) => BRICK_TOP_PAD + chartH * (1 - (p - pMin) / pRange)
  const idxStep = brickStep(bricks.length)
  const idxLabels = []
  for (let i = 0; i < bricks.length; i += idxStep) idxLabels.push(i)
  if (idxLabels[idxLabels.length - 1] !== bricks.length - 1) idxLabels.push(bricks.length - 1)
  const gridLines = brickGridLines(pMin, pMax, Math.max(4, Math.floor(height / 55)))

  const rects = bricks.map((b, i) => {
    const lo = Math.min(b.open_price, b.close_price)
    const hi = Math.max(b.open_price, b.close_price)
    let yTop = priceToY(hi)
    let yBot = priceToY(lo)
    let h = yBot - yTop
    if (h < MIN_BRICK_H) { h = MIN_BRICK_H; yTop = yBot - h }
    const up = b.direction === 'up'
    // Hover tooltip (native SVG <title>): brick price, direction, index, time.
    const tip = [
      b.symbol, '·', b.direction, 'brick', '·', 'idx', String(b.brick_index ?? ''),
      '·', fmtBrickPrice(b.open_price), '→', fmtBrickPrice(b.close_price),
      '·', String(b.ts || '').slice(0, 16).replace('T', ' ') + ' UTC',
    ].filter(Boolean).join(' ')
    return React.createElement('g', { key: i },
      React.createElement('title', null, tip),
      React.createElement('rect', {
        x: BRICK_LEFT_PAD + i * BRICK_STEP,
        y: yTop,
        width: BRICK_W,
        height: h,
        rx: 1.5,
        fill: up ? 'var(--ui-accent,#4c9aff)' : 'var(--ui-danger,#ff5c5c)',
        fillOpacity: 0.85,
        stroke: up ? '#16a34a' : '#dc2626',
        strokeWidth: 0.5,
      }),
    )
  })

  const gridEls = gridLines.map((p) => {
    const y = priceToY(p)
    return React.createElement('g', { key: 'g' + p },
      React.createElement('line', {
        x1: BRICK_LEFT_PAD, x2: BRICK_LEFT_PAD + bricks.length * BRICK_STEP,
        y1: y, y2: y,
        stroke: 'var(--ui-text-tertiary,#888)', strokeOpacity: 0.15, strokeDasharray: '3 3',
      }),
      React.createElement('text', {
        x: BRICK_LEFT_PAD + bricks.length * BRICK_STEP + 5, y: y + 3,
        fill: 'var(--ui-text-tertiary,#888)', fontSize: 9, fontFamily: 'monospace',
      }, fmtBrickPrice(p)),
    )
  })

  const idxEls = idxLabels.map((i) =>
    React.createElement('text', {
      key: 'i' + i,
      x: BRICK_LEFT_PAD + i * BRICK_STEP + BRICK_W / 2,
      y: height - 6,
      fill: 'var(--ui-text-tertiary,#888)', fontSize: 8, fontFamily: 'monospace', textAnchor: 'middle',
    }, String(i)),
  )

  // Axis titles: "Price" (right, rotated) + "Brick index" (bottom centre)
  const chartEndX = BRICK_LEFT_PAD + bricks.length * BRICK_STEP
  const axisTitles = [
    React.createElement('text', {
      key: 'pricetitle',
      x: BRICK_LEFT_PAD + bricks.length * BRICK_STEP + 42,
      y: BRICK_TOP_PAD + chartH / 2,
      fill: 'var(--ui-text-tertiary,#888)', fontSize: 9, fontFamily: 'sans-serif',
      textAnchor: 'middle',
      transform: `rotate(-90, ${BRICK_LEFT_PAD + bricks.length * BRICK_STEP + 42}, ${BRICK_TOP_PAD + chartH / 2})`,
    }, 'Price'),
    React.createElement('text', {
      key: 'idxtitle',
      x: BRICK_LEFT_PAD + chartEndX / 2 - BRICK_LEFT_PAD / 2,
      y: height - 1,
      fill: 'var(--ui-text-tertiary,#888)', fontSize: 9, fontFamily: 'sans-serif', textAnchor: 'middle',
    }, 'Brick index'),
  ]

  // Level lines — dashed horizontal, drawn ONLY when inside the visible brick
  // range. No on-chart labels (pricing is in the legend row below).
  const levelEls = (levels || [])
    .filter((lv) => lv.price != null && Number(lv.price) > 0)
    .filter((lv) => Number(lv.price) >= pMin && Number(lv.price) <= pMax)
    .map((lv) => {
      const y = priceToY(Number(lv.price))
      const color = lv.color || 'var(--ui-text-tertiary,#888)'
      return React.createElement('g', { key: 'lv' + lv.label },
        React.createElement('line', {
          x1: BRICK_LEFT_PAD, x2: BRICK_LEFT_PAD + bricks.length * BRICK_STEP,
          y1: y, y2: y,
          stroke: color, strokeWidth: 1, strokeDasharray: '5 3', strokeOpacity: 0.8,
        }),
      )
    })

  // Pricing legend (for ALL symbols) — colored ENTRY/SL/TP with full-value
  // prices, rendered below the chart so nothing overlaps the bricks.
  const levelLegend = (levels || [])
    .filter((lv) => lv.price != null && Number(lv.price) > 0)
    .map((lv) => {
      const color = lv.color || 'var(--ui-text-tertiary,#888)'
      return React.createElement('span', {
        key: 'lg' + lv.label,
        style: { color, fontWeight: 600, marginRight: 14, fontSize: 11, fontFamily: 'monospace', whiteSpace: 'nowrap' },
      }, `${lv.label} ${fmtBrickPrice(Number(lv.price))}`)
    })

  return React.createElement('div', null,
    React.createElement('svg', {
      viewBox: `0 0 ${svgW} ${height}`,
      width: '100%',
      height: 'auto',
      style: { display: 'block', maxHeight: 420 },
    },
      gridEls,
      levelEls,
      rects,
      idxEls,
      axisTitles,
    ),
    levelLegend.length
      ? React.createElement('div', { style: { marginTop: 6, display: 'flex', flexWrap: 'wrap', alignItems: 'center' } },
          React.createElement('span', { style: { marginRight: 4, fontSize: 11, color: 'var(--ui-text-quaternary,#666)' } }, 'levels:'),
          levelLegend,
        )
      : null,
    React.createElement('div', { className: 'tla-hint', style: { marginTop: 4 } },
      `${bricks.length} bricks (last ${bricks.length} of series) · up = buy (blue) · down = sell (red) · last brick index ${bricks[bricks.length - 1].brick_index != null ? bricks[bricks.length - 1].brick_index : bricks.length - 1}`),
  )
}

// Kelly histogram — horizontal bars, value labels INSIDE bars when wide
// enough, 0 → max scale axis, regime/sub text after the bar. Ported from the
// admin plugin (same UX preferences).
// ---------------------------------------------------------------------------
function HBar({ data, height = 140, width = 640, format }) {
  if (!data || !data.length) {
    return React.createElement('div', { className: 'tla-hint' }, 'No data yet')
  }
  const rowH = 26
  const gap = 8
  const labelW = 56
  const badgeW = 40
  const valW = 50
  const barMaxW = width - labelW - badgeW - valW - 16
  const max = Math.max(...data.map((d) => Math.abs(d.value || 0)), 1)
  const svgH = data.length * (rowH + gap) + 16
  const rows = data.map((d, i) => {
    const y = i * (rowH + gap)
    const w = (Math.abs(d.value || 0) / max) * barMaxW
    const color = d.color || ((d.value || 0) >= 0 ? 'var(--ui-accent, #4c9aff)' : 'var(--ui-danger, #ff5c5c)')
    const badge = d.badge || ''
    const badgeColor = badge === 'SELL' ? 'var(--ui-danger, #ff5c5c)' : 'var(--ui-accent, #4c9aff)'
    const label = format ? format(d.value) : String(d.value)
    // Put the value INSIDE the bar when it's wide enough; otherwise right
    // after the bar end in the bar's color.
    const inside = w >= 46
    return React.createElement('g', { key: d.label },
      React.createElement('text', {
        x: 0, y: y + rowH - 10,
        fontSize: 12,
        fill: 'var(--ui-text-primary, #eee)',
        fontWeight: 600,
      }, d.label.length > 7 ? d.label.slice(0, 6) : d.label),
      React.createElement('text', {
        x: labelW, y: y + rowH - 10,
        fontSize: 9,
        fill: badgeColor,
        fontWeight: 700,
      }, badge),
      React.createElement('rect', {
        x: labelW + badgeW, y: y + 4, width: Math.max(w, 2), height: rowH - 8,
        fill: color, rx: 2, opacity: 0.9,
      }),
      inside
        ? React.createElement('text', {
            x: labelW + badgeW + Math.max(w, 2) - 6, y: y + rowH - 10,
            fontSize: 11,
            fill: '#fff',
            fontWeight: 700,
            textAnchor: 'end',
          }, label)
        : React.createElement('text', {
            x: labelW + badgeW + Math.max(w, 2) + 6, y: y + rowH - 10,
            fontSize: 11,
            fill: color,
            fontWeight: 700,
          }, label),
      d.sub ? React.createElement('text', {
        x: labelW + badgeW + barMaxW, y: y + rowH - 2,
        fontSize: 9,
        fill: 'var(--ui-text-quaternary, #666)',
        textAnchor: 'end',
      }, d.sub.length > 18 ? d.sub.slice(0, 17) : d.sub) : null,
    )
  })
  // Scale context: 0 → max axis + faint max reference line.
  const axisY = svgH - 5
  const scaleEls = [
    React.createElement('line', {
      key: 'ref',
      x1: labelW + badgeW, x2: labelW + badgeW + barMaxW,
      y1: axisY - 5, y2: axisY - 5,
      stroke: 'var(--ui-stroke-secondary, #2a2a2a)',
      strokeWidth: 1,
    }),
    React.createElement('text', {
      key: 'z',
      x: labelW + badgeW, y: axisY,
      fontSize: 9,
      fill: 'var(--ui-text-tertiary, #888)',
      textAnchor: 'start',
    }, '0'),
    React.createElement('text', {
      key: 'mx',
      x: labelW + badgeW + barMaxW, y: axisY,
      fontSize: 9,
      fill: 'var(--ui-text-tertiary, #888)',
      textAnchor: 'end',
    }, format ? format(max) : String(max)),
  ]
  return React.createElement('div', null,
    React.createElement('div', { className: 'tla-hint', style: { display: 'flex', gap: 16, marginBottom: 10, fontSize: 11 } },
      React.createElement('span', null,
        React.createElement('span', { style: { display: 'inline-block', width: 10, height: 10, background: 'var(--ui-accent, #4c9aff)', borderRadius: 2, marginRight: 5 } }),
        'BUY'),
      React.createElement('span', null,
        React.createElement('span', { style: { display: 'inline-block', width: 10, height: 10, background: 'var(--ui-danger, #ff5c5c)', borderRadius: 2, marginRight: 5 } }),
        'SELL'),
    ),
    React.createElement('svg', {
      viewBox: `0 0 ${width} ${svgH}`,
      width: '100%',
      height: 'auto',
      style: { display: 'block', maxHeight: 460 },
    }, rows, scaleEls),
  )
}

// ---------------------------------------------------------------------------
// Hot signals banner — live 'signal' broadcasts + seed from nt_sweep_result
// (qualified, non-neutral, kelly present). 10-min TTL vs the newest signal,
// sorted by kelly desc, ~5 shown. Hidden entirely when empty (returns null).
// ---------------------------------------------------------------------------
const HOT_TTL_MS = 10 * 60 * 1000 // 10 min window vs the newest signal
const HOT_MAX = 5

function HotSignalsBanner({ signals }) {
  const rows = signals || []
  const newest = Math.max(...rows.map((s) => Date.parse(s.ts) || 0))
  const cutoff = newest ? newest - HOT_TTL_MS : 0
  const hot = rows
    .filter((s) => newest && (Date.parse(s.ts) || 0) >= cutoff)
    .sort((a, b) => Number(b.kelly || 0) - Number(a.kelly || 0))
    .slice(0, HOT_MAX)

  if (!hot.length) return null

  return React.createElement('div', { className: 'tla-card tla-hot-card' },
    React.createElement('h3', null, 'Hot signals'),
    React.createElement('div', { className: 'tla-explainer' },
      'The most recent qualified signals, ranked by effective Kelly — the trades the engine is most interested in right now. A chip = one signal for that symbol (buy/sell).'),
    React.createElement('span', { className: 'tla-hot-ts' },
      `as of ${new Date(newest).toISOString().slice(0, 19).replace('T', ' ')} UTC · ${hot.length} in 10m window`),
    React.createElement('div', { className: 'tla-hot' },
      hot.map((h) => {
        const sell = String(h.direction || '').toLowerCase() === 'sell'
        const regimeLabel = fmtRegime(h.regime)
        return React.createElement('div', {
          key: h.symbol + (h.ts || ''),
          className: cn('tla-hot-chip', sell ? 'tla-hot-sell' : 'tla-hot-buy'),
        },
          React.createElement('span', { className: 'tla-hot-sym' }, h.symbol),
          React.createElement('span', { className: 'tla-hot-dir' }, sell ? 'Sell' : 'Buy'),
          React.createElement('span', { className: 'tla-hot-kelly' }, `kelly ${Number(h.kelly || 0).toFixed(3)}`),
          regimeLabel ? React.createElement('span', { className: 'tla-hot-regime', title: 'Market regime' }, regimeLabel) : null,
        )
      }),
    ),
  )
}

// ---------------------------------------------------------------------------
// Pager — daisyUI join pagination with active button (2026-08-08)
// ---------------------------------------------------------------------------
const PAGE_SIZE = 8

function Pager({ page, pages, onChange }) {
  if (!pages || pages <= 1) return null
  const btns = []
  for (let i = 1; i <= pages; i++) {
    btns.push(React.createElement('button', {
      key: 'pg' + i,
      className: cn('dui-join-item', 'dui-btn', 'dui-btn-sm', i === page ? 'dui-btn-active' : ''),
      onClick: () => onChange(i),
    }, String(i)))
  }
  return React.createElement('div', { className: cn('dui-join', 'dui-join-horizontal'), style: { marginTop: 8, flexWrap: 'wrap' } },
    React.createElement('button', {
      className: cn('dui-join-item', 'dui-btn', 'dui-btn-sm'),
      onClick: () => onChange(Math.max(1, page - 1)),
    }, '«'),
    ...btns,
    React.createElement('button', {
      className: cn('dui-join-item', 'dui-btn', 'dui-btn-sm'),
      onClick: () => onChange(Math.min(pages, page + 1)),
    }, '»'),
  )
}

// ---------------------------------------------------------------------------
// Paper section — Precision Pro only. Live 'paper' broadcast events
// (opened/closed/equity) appended to a list (cap 50) + seed from
// nt_paper_positions + latest v_paper_equity row. Renders an empty state
// gracefully when the tables don't exist yet (PGRST205 / 404).
// ---------------------------------------------------------------------------
function PaperSection({ positions, equity, events }) {
  const [paperPage, setPaperPage] = React.useState(1)
  const eqRow = (equity.data || [])[0]
  const seedRows = (positions.data || []).map((p) => ({
    type: p.status === 'closed' || p.status === 'expired' ? 'closed' : 'opened',
    symbol: p.symbol,
    direction: p.direction,
    realized_pnl: p.realized_pnl,
    r_multiple: p.r_multiple,
    ts: p.open_ts,
  }))
  const rows = [...(events || []), ...seedRows].slice(0, 50)
  const paperPages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE))
  const paperPageRows = rows.slice((paperPage - 1) * PAGE_SIZE, paperPage * PAGE_SIZE)
  const missingTable = !!(positions.error || equity.error)

  return React.createElement('div', { className: 'tla-card' },
    React.createElement('h3', null, 'Paper portfolio — Precision Pro'),
    React.createElement('div', { className: 'tla-explainer' },
      'What this is: the SIMULATED (paper) trade book — the trades the engine WOULD have taken, at real Kelly-sized notional. PnL here is only BOOKED when the backend CLOSES a position: open positions show — / $0.00, and the paper equity curve adds each day\'s closed-trade PnL. This is the ACTUAL sized result — it is NOT the same as the Signal health scoreboard, which shows the THEORETICAL unit-size PnL of every signal. So $0.00 early on just means no trades have closed yet, not that the strategy is flat.'),
    React.createElement('div', { className: 'tla-grid' },
      React.createElement(StatCard, {
        title: 'Paper equity',
        value: eqRow ? `$${Number(eqRow.cumulative_pnl || 0).toFixed(2)}` : '—',
        sub: eqRow ? `as of ${String(eqRow.day || '').slice(0, 10)} · realized today $${Number(eqRow.realized_pnl || 0).toFixed(2)}` : 'no equity ticks yet',
        tone: eqRow && Number(eqRow.cumulative_pnl) >= 0 ? 'pos' : 'neg',
      }),
    ),
    React.createElement('div', { className: 'tla-hint' },
      'Paper equity = cumulative realized PnL of the SIMULATED portfolio (no real money). Each day adds the closed-trade PnL for that day.'),
    missingTable && rows.length === 0
      ? React.createElement('div', { className: 'tla-hint' },
          'Paper portfolio data not available yet — the nt_paper_positions table or v_paper_equity view is not deployed (PGRST205). Live paper events will still appear here once the backend publishes them.')
      : null,
    React.createElement('table', { className: cn('tla-table', 'dui-table', 'dui-table-sm') },
      React.createElement('thead', null,
        React.createElement('tr', null,
          React.createElement('th', null, 'Type'),
          React.createElement('th', null, 'Symbol'),
          React.createElement('th', null, 'Dir'),
          React.createElement('th', null, 'Realized PnL'),
          React.createElement('th', null, 'R-multiple'),
          React.createElement('th', null, 'Date/Time'))),
      React.createElement('tbody', null,
        paperPageRows.length
          ? paperPageRows.map((r, i) => (
            React.createElement('tr', { key: (r.symbol || 'evt') + (r.ts || '') + i },
              React.createElement('td', null,
                React.createElement('span', { className: cn('tla-badge', r.type === 'closed' ? 'closed' : r.type === 'opened' ? 'opened' : 'equity') }, r.type || 'event')),
              React.createElement('td', null, r.symbol || '—'),
              React.createElement('td', null, r.direction || '—'),
              React.createElement('td', {
                className: (r.realized_pnl || 0) >= 0 ? 'tla-pos' : 'tla-neg',
              }, r.realized_pnl != null ? `$${Number(r.realized_pnl).toFixed(2)}` : '—'),
              React.createElement('td', { className: 'tla-sm' }, r.r_multiple != null ? Number(r.r_multiple).toFixed(2) : '—'),
              React.createElement('td', { className: 'tla-sm' }, fmtSignalTime(Date.parse(r.ts || ''))),
            )
          ))
          : React.createElement('tr', null,
            React.createElement('td', { colSpan: 6 },
              React.createElement('div', { className: 'tla-hint' }, missingTable ? 'Waiting for paper tables…' : 'No paper activity yet — positions appear when the backend opens/closes them.')),
          ),
      ),
    ),
    React.createElement(Pager, { page: paperPage, pages: paperPages, onChange: setPaperPage }),
    React.createElement('div', { className: 'tla-hint' },
      `${rows.length} rows · live broadcast + REST seed · 60s poll · PnL — for OPEN positions (realized only on close), so $0/blank is expected until the backend closes a trade · R-multiple = PnL ÷ risk per trade (R=1 means you made exactly one unit of risk)`),
  )
}

// ---------------------------------------------------------------------------
// Connect tab — claim token only (Option A, 2026-08-10). The Supabase URL +
// public anon key are embedded service defaults (DEFAULT_SUPABASE_URL /
// DEFAULT_ANON_KEY) and are never shown to the user. Save triggers the
// talaria-check; inline result shows ok / 401 / 404
// ('claim service not deployed') states.
// ---------------------------------------------------------------------------
function ConnectTab({ config, onSave, checkPhase, checkMsg }) {
  const [token, setToken] = React.useState(config.claim_token || '')

  const save = () => {
    // Service URL + anon key are embedded defaults — only the user's claim
    // token is personal. (2026-08-10: Option A — hide the pre-filled fields.)
    onSave({ claim_token: token.trim() })
  }

  const statusEls = []
  if (checkPhase === 'running') {
    statusEls.push(React.createElement('div', { key: 's', className: 'tla-hint', style: { marginTop: 8 } },
      'Validating claim token against talaria-check…'))
  } else if (checkPhase === 'not-deployed') {
    statusEls.push(React.createElement('div', { key: 's', className: 'tla-err', style: { marginTop: 8 } },
      'Claim service not deployed — the talaria-check Edge Function is not live on this project yet (404). The dashboard will unlock once the backend deploys it.'))
  } else if (checkPhase === 'bad-token') {
    statusEls.push(React.createElement('div', { key: 's', className: 'tla-err', style: { marginTop: 8 } },
      `Claim token rejected — ${checkMsg || 'invalid, revoked or expired token'}. Re-mint a token from the Talaria portal.`))
  } else if (checkPhase === 'error') {
    statusEls.push(React.createElement('div', { key: 's', className: 'tla-err', style: { marginTop: 8 } },
      checkMsg || 'Claim check failed'))
  }

  return React.createElement('div', { className: 'tla-root' },
    React.createElement('div', { className: 'tla-card' },
      React.createElement('h3', null, 'Talaria — Connect'),
      React.createElement('div', { className: 'tla-hint' },
        'Enter the claim token from the Talaria portal. The token is validated against the talaria-check Edge Function (live subscription status, re-checked every 24h). The service connection is pre-configured.'),
      React.createElement('div', { className: 'tla-field' },
        React.createElement('label', null, 'Claim token'),
        React.createElement('input', {
          value: token,
          type: 'password',
          placeholder: 'paste claim token from the Talaria portal',
          onChange: (e) => setToken(e.target.value),
        })),
      React.createElement('div', { style: { display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' } },
        React.createElement('button', {
          type: 'button',
          className: 'tla-btn',
          // Explicit inline style so the button ALWAYS renders as a solid
          // clickable button — the daisyUI bundle has no theme layer here
          // (--p/--b2 undefined), so dui-btn-primary's oklch background is
          // invalid and the button can render as plain text. (2026-08-10)
          style: {
            background: 'var(--ui-accent,#4c9aff)',
            color: '#fff',
            border: 'none',
            borderRadius: 6,
            padding: '8px 16px',
            fontSize: 12,
            fontWeight: 600,
            cursor: 'pointer',
            fontFamily: 'inherit',
          },
          onClick: save,
        }, 'Save & Validate'),
      ),
      statusEls,
    ),
  )
}

// ---------------------------------------------------------------------------
// Status screens — subscription routing
// ---------------------------------------------------------------------------
function SubscribeScreen({ claim, onRetry }) {
  const url = claim.next_charge_url || ''
  return React.createElement('div', { className: 'tla-center' },
    React.createElement('div', { className: 'tla-title' }, 'Talaria'),
    React.createElement('div', { className: 'tla-card', style: { maxWidth: 420, alignItems: 'center' } },
      React.createElement('h3', null, 'No active subscription'),
      React.createElement('div', { className: 'tla-hint', style: { textAlign: 'center' } },
        `Your claim token is valid, but there is no active subscription for ${claim.plan_slug || 'your plan'}.`),
      url
        ? React.createElement('a', { className: cn('tla-btn', 'dui-btn', 'dui-btn-primary', 'dui-btn-sm'), href: url, target: '_blank', rel: 'noreferrer' },
            'Subscribe / pay')
        : React.createElement('div', { className: 'tla-hint', style: { textAlign: 'center' } },
            'No payment link available — subscribe from the Talaria portal.'),
      React.createElement('button', { className: cn('tla-btn', 'tla-btn-secondary', 'dui-btn', 'dui-btn-ghost', 'dui-btn-sm'), onClick: onRetry },
        'Re-check'),
      React.createElement('div', { className: 'tla-hint', style: { textAlign: 'center' } },
        'Subscription status re-checks automatically every 24h.'),
    ),
  )
}

function WaitingScreen({ claim, onRetry }) {
  return React.createElement('div', { className: 'tla-center' },
    React.createElement('div', { className: 'tla-title' }, 'Talaria'),
    React.createElement('div', { className: 'tla-card', style: { maxWidth: 420, alignItems: 'center' } },
      React.createElement('h3', null, 'Waiting for payment confirmation'),
      React.createElement('div', { className: 'tla-hint', style: { textAlign: 'center' } },
        `Your ${claim.plan_slug || ''} subscription is pending. Once the payment webhook confirms it, this screen unlocks automatically (re-checked every 24h).`),
      React.createElement('button', { className: cn('tla-btn', 'dui-btn', 'dui-btn-primary', 'dui-btn-sm'), onClick: onRetry },
        'Re-check now'),
    ),
  )
}

function PaywallScreen({ claim, onRetry }) {
  const url = claim.next_charge_url || ''
  const status = claim.sub_status || 'expired'
  return React.createElement('div', { className: 'tla-center' },
    React.createElement('div', { className: 'tla-title' }, 'Talaria'),
    React.createElement('div', { className: 'tla-card', style: { maxWidth: 420, alignItems: 'center' } },
      React.createElement('h3', null, `Subscription ${status}`),
      React.createElement('div', { className: 'tla-banner tla-banner-paywall', style: { width: '100%' } },
        `Your ${claim.plan_slug || ''} subscription is ${status} — renew to keep receiving signals.`),
      url
        ? React.createElement('a', { className: cn('tla-btn', 'dui-btn', 'dui-btn-primary', 'dui-btn-sm'), href: url, target: '_blank', rel: 'noreferrer' },
            'Renew / pay')
        : React.createElement('div', { className: 'tla-hint', style: { textAlign: 'center' } },
            'No payment link available — renew from the Talaria portal.'),
      React.createElement('button', { className: cn('tla-btn', 'tla-btn-secondary', 'dui-btn', 'dui-btn-ghost', 'dui-btn-sm'), onClick: onRetry },
        'Re-check'),
    ),
  )
}

// ---------------------------------------------------------------------------
// Phase 2 — light client-side analytics math (pure JS, no imports).
// Ports of BrickPatternAnalyzer (agent signals/renko_engine.py),
// MetaRegimeClassifier display logic, MarkovChain (backend markov_chain.py),
// wilson_confidence (agent pattern_learning.py), multiple_testing.py
// (Benjamini-Hochberg FDR) and the SizingEngine what-if arithmetic.
// All functions are defined ABOVE TalariaDashboard (ESM order).
// ---------------------------------------------------------------------------

// Classify the last-10 brick window into a short pattern label from the
// up/down directions. Rule table (per the portability spec):
//   3 consecutive same-direction → '3-push'
//   2 up then 1 down             → 'pullback'
//   strictly alternating         → 'chop'
//   otherwise                    → 'neutral'
function brickPattern(bricks) {
  const dirs = (bricks || [])
    .map((b) => String(b.direction || '').toLowerCase())
    .filter((d) => d === 'up' || d === 'down')
  const win = dirs.slice(-10)
  if (win.length < 3) return 'neutral'
  // 3 consecutive same-direction (any position in the window)
  for (let i = 0; i + 2 < win.length; i++) {
    if (win[i] === win[i + 1] && win[i + 1] === win[i + 2]) return '3-push'
  }
  // 2 up then 1 down (pullback after an up-push)
  if (win.length >= 3 && win[win.length - 3] === 'up' && win[win.length - 2] === 'up' && win[win.length - 1] === 'down') {
    return 'pullback'
  }
  // Strictly alternating = chop
  let alt = true
  for (let i = 1; i < win.length; i++) {
    if (win[i] === win[i - 1]) { alt = false; break }
  }
  if (alt) return 'chop'
  return 'neutral'
}

// Map a backend regime label to the sizing rule table. Mirrors the
// MetaRegimeClassifier display logic (sizing_multiplier + aggressiveness).
// Returns { mult, aggressiveness, tone } with tone 'pos'|'neg'|'warn'|undefined.
const META_REGIME_TABLE = {
  calm_trend: { mult: 1.0, aggressiveness: 'normal' },
  choppy_range: { mult: 0.5, aggressiveness: 'patient' },
  high_vol_breakout: { mult: 1.5, aggressiveness: 'aggressive' },
  regime_transition: { mult: 0.3, aggressiveness: 'standby' },
  risk_off: { mult: -1.0, aggressiveness: 'standby' },
  funding_stress: { mult: -0.5, aggressiveness: 'standby' },
  liquidity_drained: { mult: -0.3, aggressiveness: 'standby' },
  strong_trend: { mult: 1.2, aggressiveness: 'normal' },
  low_vol_range: { mult: 0.8, aggressiveness: 'patient' },
  high_vol_chop: { mult: 0.6, aggressiveness: 'patient' },
}
function metaRegimeInfo(regimeLabel) {
  const r = META_REGIME_TABLE[String(regimeLabel || '').trim()] || { mult: 1.0, aggressiveness: 'normal' }
  let tone
  if (r.mult <= 0) tone = 'neg'
  else if (r.mult >= 1.5) tone = 'pos'
  else if (r.mult < 1.0) tone = 'warn'
  return { mult: r.mult, aggressiveness: r.aggressiveness, tone }
}

// Fit a 3-state (UP/DOWN/FLAT) Markov chain on the brick close prices and
// compute P(UP after 3 steps) from the last state's row of the transition
// matrix raised to the 3rd power (hand-rolled matrix multiply — no libs).
// FLAT is a real state (|delta| <= 1e-4), not dropped. Returns
// { pUp, pDown, n } or null when fewer than 10 closes.
function markovUpProbability(closes) {
  const cs = (closes || []).map(Number).filter((v) => isFinite(v))
  if (cs.length < 10) return null
  const EPS = 0.0001
  const stateOf = (a, b) => {
    const d = a - b
    return Math.abs(d) <= EPS ? 2 : d > 0 ? 0 : 1
  }
  // Transition counts: T[from][to], states 0=UP 1=DOWN 2=FLAT
  const T = [[0, 0, 0], [0, 0, 0], [0, 0, 0]]
  for (let i = 2; i < cs.length; i++) {
    T[stateOf(cs[i - 1], cs[i - 2])][stateOf(cs[i], cs[i - 1])] += 1
  }
  // Normalize rows; an unvisited state falls back to uniform transitions.
  const P = T.map((row) => {
    const s = row[0] + row[1] + row[2]
    return s > 0 ? [row[0] / s, row[1] / s, row[2] / s] : [1 / 3, 1 / 3, 1 / 3]
  })
  const last = stateOf(cs[cs.length - 1], cs[cs.length - 2])
  // v = e_last · P³  (row-vector × P, three times)
  let v = P[last]
  for (let step = 0; step < 3; step++) {
    const nv = [0, 0, 0]
    for (let j = 0; j < 3; j++) {
      for (let k = 0; k < 3; k++) nv[k] += v[j] * P[j][k]
    }
    v = nv
  }
  return { pUp: v[0], pDown: v[1], n: cs.length }
}

// Wilson score lower bound at 95% confidence: clamp(centre − half, 0..1).
function wilsonLower(n, wins) {
  n = Number(n)
  wins = Number(wins)
  if (!isFinite(n) || n <= 0) return 0
  const z = 1.96
  const phat = Math.min(1, Math.max(0, wins / n))
  const denom = 1 + (z * z) / n
  const centre = (phat + (z * z) / (2 * n)) / denom
  const half = (z * Math.sqrt((phat * (1 - phat) + (z * z) / (4 * n)) / n)) / denom
  return Math.min(1, Math.max(0, centre - half))
}

// Benjamini-Hochberg FDR at 0.05: sort p ascending, rank i=1..k, mark
// significant where p <= (i/k)*0.05 (all rows up to the last passing rank).
// Returns [{ symbol, p_value, significant }].
function benjaminiHochberg(rows) {
  const items = (rows || [])
    .filter((r) => r && r.symbol != null)
    .map((r) => ({ symbol: r.symbol, p_value: Number(r.p_value) }))
  const sorted = items.slice().sort((a, b) => a.p_value - b.p_value)
  const k = sorted.length
  let lastSig = -1
  for (let i = 0; i < k; i++) {
    if (sorted[i].p_value <= ((i + 1) / k) * 0.05) lastSig = i
  }
  return sorted.map((r, i) => ({ symbol: r.symbol, p_value: r.p_value, significant: i <= lastSig }))
}

// erf via the Abramowitz-Stegun 7.1.26 rational approximation (|error| <= 1.5e-7).
function _erfAS(x) {
  const t = 1 / (1 + 0.3275911 * x)
  const a1 = 0.254829592, a2 = -0.284496736, a3 = 1.421413741, a4 = -1.453152027, a5 = 1.061405429
  const poly = a1 * t + a2 * t * t + a3 * t * t * t + a4 * t * t * t * t + a5 * t * t * t * t * t
  return 1 - poly * Math.exp(-x * x)
}
function _phiStd(z) {
  return 0.5 * (1 + _erfAS(z / Math.SQRT2))
}

// Per-symbol two-sided binomial p-value (normal approx) testing the null that
// the true win rate is 50%: z = |phat − 0.5| / sqrt(0.25/n), p = 2·(1 − Φ(|z|)).
// Rows with n_resolved <= 0 get p = 1 (no evidence).
function computePValues(signalHealthRows) {
  return (signalHealthRows || [])
    .filter((r) => r && r.symbol)
    .map((r) => {
      const n = Number(r.n_resolved)
      const wins = Number(r.n_tp)
      let p = 1
      if (isFinite(n) && n > 0 && isFinite(wins) && wins >= 0) {
        const phat = Math.min(1, wins / n)
        const z = Math.abs(phat - 0.5) / Math.sqrt(0.25 / n)
        p = Math.min(1, Math.max(0, 2 * (1 - _phiStd(z))))
      }
      return { symbol: r.symbol, p_value: p }
    })
}

// SizingEngine what-if: baseline = equity × kelly × regime mult, then a
// drawdown clip ddClip = clamp(1 − dd/max_dd, 0.25, 1.0), capped at 5% of
// equity. Returns { baseline, final, capHit, cap, ddClip }.
function sizingWhatIf(equityUsd, effectiveKelly, regimeLabel, dd = 0.15) {
  const eq = Number(equityUsd) > 0 ? Number(equityUsd) : 1000
  const kelly = isFinite(Number(effectiveKelly)) && Number(effectiveKelly) > 0 ? Number(effectiveKelly) : 0
  const reg = metaRegimeInfo(regimeLabel)
  const baseline = eq * kelly * reg.mult
  const maxDd = 0.15
  const ddClip = Math.min(1, Math.max(0.25, 1 - dd / maxDd))
  let final = baseline * ddClip
  const cap = eq * 0.05
  let capHit = false
  if (final > cap) { final = cap; capHit = true }
  return { baseline, final, capHit, cap, ddClip }
}

// ---------------------------------------------------------------------------
// Talaria dashboard — hot-signal banner, kelly histogram, 10-brick renko
// chart (with ENTRY/SL/TP levels), Pro-only paper section.
// ---------------------------------------------------------------------------
function TalariaDashboard({ config, claim }) {
  const connected = !!(config.supabase_url && config.supabase_key)
  const isPro = claim.plan_slug === 'precision_pro'
  const [liveSignals, setLiveSignals] = React.useState([])
  const [paperEvents, setPaperEvents] = React.useState([])
  const [brickSym, setBrickSym] = React.useState(null)
  const [sigHealthPage, setSigHealthPage] = React.useState(1)

  // Symbol list — plan-gated via nt_symbol.plan_ids cs. filter (UUID from the
  // server claim response, never client-derived). Intersected with the latest
  // sweep rows so ONLY ACTIVE symbols (those with a recent sweep) show in the
  // picker; falls back to the full plan list while sweeps are still loading.
  // Ordering is STABLE: grouped by asset_class (commodities → forex → crypto
  // → stocks) then symbol ASC — the raw sweep order changes every refresh.
  const hasPlanUuid = !!claim.plan_uuid
  const symbols = useSupabaseData(config, 'nt_symbol',
    { select: 'symbol,asset_class', plan_ids: hasPlanUuid ? 'cs.{' + claim.plan_uuid + '}' : undefined },
    connected && hasPlanUuid)
  const planSymbols = (symbols.data || []).map((r) => r.symbol).filter(Boolean)
  const assetClassOf = {}
  for (const r of (symbols.data || [])) assetClassOf[r.symbol] = r.asset_class || 'other'
  const CLASS_RANK = { commodities: 0, forex: 1, crypto: 2, stocks: 3 }
  const sortByClassThenSymbol = (a, b) => {
    const ra = CLASS_RANK[assetClassOf[a]] != null ? CLASS_RANK[assetClassOf[a]] : 9
    const rb = CLASS_RANK[assetClassOf[b]] != null ? CLASS_RANK[assetClassOf[b]] : 9
    return (ra - rb) || a.localeCompare(b)
  }

  // Sweep data — powers the kelly histogram, the hot-signal seed and the
  // renko ENTRY/SL/TP levels. NOTE: nt_sweep_result's direction column is
  // `signal` (buy/sell/neutral) — the broadcast contract calls it `direction`,
  // so both are normalized client-side.
  const sweeps = useSupabaseData(config, 'nt_sweep_result',
    { select: 'symbol,sweep_timestamp,regime,regime_conf,markov_p_up,markov_p_dn,p_win,ev,p_timesfm,kelly_f,effective_kelly,brick_size,sl_bricks,tp_bricks,signal,entry_price,stop_loss,take_profit,qualified,aggression,regime_shift,prev_regime,size_mult', order: 'sweep_timestamp.desc', limit: '200' },
    connected)

  // Active symbols = plan symbols present in the latest sweep stream
  // (same derivation as noble-trader-admin). Fallback to plan list when
  // sweeps have not loaded yet (loading / empty → picker stays usable).
  const sweepSyms = []
  {
    const seen = {}
    for (const r of (sweeps.data || [])) {
      if (!seen[r.symbol]) { seen[r.symbol] = true; sweepSyms.push(r.symbol) }
    }
  }
  const symbolList = (sweepSyms.length ? planSymbols.filter((s) => sweepSyms.includes(s)) : planSymbols)
    .slice()
    .sort(sortByClassThenSymbol)

  // 10-brick renko window for the selected symbol (default = first symbol).
  const activeBrickSym = brickSym || (symbolList[0] || '')
  const bricks = useSupabaseData(config, 'nt_renko_bricks',
    { select: 'symbol,direction,brick_size,open_price,close_price,high,low,brick_index,ts', order: 'session_date.desc,brick_index.desc', limit: '10', symbol: 'eq.' + activeBrickSym },
    connected && !!activeBrickSym)

  // Paper portfolio (Precision Pro only) — REST seed + live events.
  const paperPositions = useSupabaseData(config, 'nt_paper_positions',
    { select: 'symbol,direction,status,realized_pnl,r_multiple,open_ts', order: 'open_ts.desc', limit: '20' },
    connected && isPro)
  const paperEquity = useSupabaseData(config, 'v_paper_equity',
    { select: 'day,realized_pnl,cumulative_pnl', order: 'day.desc', limit: '1' },
    connected && isPro)

  // Phase 1 — analytics reads (migration 110 views may not exist yet; the
  // fetch helper already degrades to .error on PGRST205, cards render hints).
  // Signal health validates the paid signal stream — ALL plans see it.
  const signalHealth = useSupabaseData(config, 'v_talaria_signal_health',
    { select: '*', limit: '20' },
    connected)
  // Portfolio tear-sheet — Precision Pro only.
  const portStats = useSupabaseData(config, 'v_talaria_portfolio_stats',
    { select: '*', limit: '1' },
    connected && isPro)
  // EOD calibration bias — all plans (already anon-granted, migration 103).
  const calib = useSupabaseData(config, 'v_eod_calibration_bias',
    { select: 'day,symbol,avg_predicted_p_win,realized_win_rate,bias,status', order: 'day.desc', limit: '10' },
    connected)
  // Paper book vs equal-weight baseline — Precision Pro only (migration 106).
  const vsOpt = useSupabaseData(config, 'v_paper_vs_optimized_daily',
    { select: 'day,paper_pnl,equal_wt_pnl,paper_minus_equal_wt', order: 'day.desc', limit: '14' },
    connected && isPro)
  // Long brick series (up to 200) for the Markov card — same symbol as the
  // 10-brick chart window, kept as a separate fetch.
  const brickSeries = useSupabaseData(config, 'nt_renko_bricks',
    { select: 'symbol,direction,open_price,close_price,high,low,brick_index,ts', order: 'session_date.desc,brick_index.desc', limit: '200', symbol: 'eq.' + activeBrickSym },
    connected && !!activeBrickSym)

  // Live Realtime socket (open-tab-only — closed on unmount; the REST polls
  // above keep the dashboard alive on socket error/close).
  const wsState = useRealtime(config, connected, claim.plan_slug, {
    onSignal: (s) => {
      setLiveSignals((prev) => [s, ...prev].slice(0, 50))
      // Feed the shared widget store too — a live signal while the dashboard
      // is open advances the watermark (no badge), but the store is the
      // source of truth for the statusbar chip + toasts.
      signalStore.addSignal(s)
    },
    onPaper: (p) => setPaperEvents((prev) => [p, ...prev].slice(0, 50)),
  })

  // Mode 1: opening the dashboard marks all current signals seen (badge
  // clears). Mark dashboardActive so addSignal advances watermark instead of
  // counting unread while the user is looking at the dashboard.
  React.useEffect(() => {
    signalStore.dashboardActive = true
    signalStore.markSeen()
    return () => { signalStore.dashboardActive = false }
  }, [])

  // Hot-signal banner: live broadcasts + seed rows (qualified, non-neutral,
  // kelly present), deduped by symbol+ts, live first.
  const seedSignals = []
  for (const r of (sweeps.data || [])) {
    if (r.qualified && String(r.signal || '').toLowerCase() !== 'neutral' && r.kelly_f != null && !isNaN(Number(r.kelly_f))) {
      seedSignals.push({
        symbol: r.symbol,
        direction: r.signal,
        kelly: Number(r.effective_kelly != null ? r.effective_kelly : r.kelly_f) || 0,
        regime: r.regime,
        ts: r.sweep_timestamp,
      })
    }
  }
  const bannerSignals = []
  {
    const seen = {}
    for (const s of [...liveSignals, ...seedSignals]) {
      const k = s.symbol + '|' + (s.ts || '')
      if (!seen[k]) { seen[k] = true; bannerSignals.push(s) }
    }
  }
  // HOT WINDOW COUNT (2026-08-11): the "Hot signals" stat previously showed
  // bannerSignals.length — ALL qualified rows in the 200-row sweep fetch,
  // which can span hours → "16 hot signals" while the banner itself said
  // "5 in 10m window". Now it counts only signals within HOT_TTL_MS of the
  // newest, matching the banner's "N in 10m window" (user: 16 not correct).
  const hotWindowCount = bannerSignals.length
    ? bannerSignals.filter((s) => {
        const newest = Math.max(...bannerSignals.map((x) => Date.parse(x.ts) || 0))
        return newest && (Date.parse(s.ts) || 0) >= newest - HOT_TTL_MS
      }).length
    : 0

  // Kelly histogram — latest per symbol (fetch is sweep_timestamp desc, so
  // first occurrence per symbol is the newest).
  // Kelly table is now built inside TalariaKellyTable component (which dedups
  // sweeps directly). The old histData for the HBar histogram is no longer used.

  // Renko chart window: fetch is brick_index desc limit 10 → reverse for the
  // ascending order the chart expects.
  const brickWindow = ((bricks.data || []).filter((b) => b.symbol === activeBrickSym)).reverse()
  const sweepRow = (sweeps.data || []).find((r) => r.symbol === activeBrickSym)
  const levels = []
  if (sweepRow) {
    if (sweepRow.entry_price != null && Number(sweepRow.entry_price) > 0)
      levels.push({ label: 'ENTRY', price: Number(sweepRow.entry_price), color: 'var(--ui-text-primary,#eee)' })
    if (sweepRow.stop_loss != null && Number(sweepRow.stop_loss) > 0)
      levels.push({ label: 'SL', price: Number(sweepRow.stop_loss), color: 'var(--ui-danger,#ff5c5c)' })
    if (sweepRow.take_profit != null && Number(sweepRow.take_profit) > 0)
      levels.push({ label: 'TP', price: Number(sweepRow.take_profit), color: 'var(--ui-accent,#4c9aff)' })
    }

    // --- Phase 2 derived analytics -------------------------------------------
    // Markov + pattern: pattern from the 10-brick window, Markov fit on the
    // longer (≤200) brick close series (desc fetch → reverse to ascending).
    const brickSeriesAsc = (brickSeries.data || []).reverse()
    const pattern = brickPattern(brickWindow)
    const markov = markovUpProbability(brickSeriesAsc.map((b) => Number(b.close_price)))

    // Signal health scoreboard: per-symbol Wilson lower bound + BH-FDR over
    // the two-sided binomial p-values (null: true win rate = 50%).
    const sigHealthRows = (signalHealth.data || []) || []
    const sigHealthPages = Math.max(1, Math.ceil(sigHealthRows.length / PAGE_SIZE))
    const sigHealthPageRows = sigHealthRows.slice((sigHealthPage - 1) * PAGE_SIZE, sigHealthPage * PAGE_SIZE)
    const fdrBySym = {}
    for (const f of benjaminiHochberg(computePValues(sigHealthRows))) {
      fdrBySym[f.symbol] = f
    }

    // Calibration + paper-vs-optimized rows (already day.desc ordered).
    const calibRows = calib.data || []
    const vsOptRows = vsOpt.data || []

    // Sizing what-if — follows the SELECTED renko symbol (Opt 1, 2026-08-08):
    // kelly + regime come from that symbol's newest sweep row, NOT the
    // globally newest sweep. Paper equity + portfolio drawdown as before.
    const kellyIn = sweepRow && sweepRow.effective_kelly != null
      ? Number(sweepRow.effective_kelly)
      : (sweepRow && sweepRow.kelly_f != null ? Number(sweepRow.kelly_f) : null)
    const regimeLabel = (sweepRow && sweepRow.regime) || ''
    const eqRowSizing = (paperEquity.data || [])[0]
    const eqUsd = eqRowSizing && Number(eqRowSizing.cumulative_pnl) > 0 ? Number(eqRowSizing.cumulative_pnl) : 1000
    const portRow = (portStats.data || [])[0]
    const portDd = portRow && Number(portRow.max_dd_pct) > 0 ? Number(portRow.max_dd_pct) / 100 : 0.15
    const sizing = sizingWhatIf(eqUsd, kellyIn, regimeLabel, portDd)
    const regInfo = metaRegimeInfo(regimeLabel)

    const graceDate = claim.grace_end || claim.period_end || ''

  return React.createElement('div', { className: 'tla-root' },
    React.createElement('div', { className: 'tla-header' },
      'Talaria By Noble Trading App'),
    claim.sub_status === 'grace'
      ? React.createElement('div', { className: 'tla-banner' },
          `Subscription in grace period — renews ${String(graceDate).slice(0, 10) || 'soon'} · still entitled to signals.`)
      : null,
    React.createElement(HotSignalsBanner, { signals: bannerSignals }),
    React.createElement('div', { className: 'tla-grid' },
      React.createElement(StatCard, {
        title: 'Plan',
        value: claim.plan_slug === 'precision_pro' ? 'Precision Pro' : 'Signal Scout',
        sub: `status ${claim.sub_status} · claim re-check 24h`,
      }),
      React.createElement(StatCard, {
        title: 'Symbols',
        value: String(symbolList.length || '—'),
        sub: symbols.error ? `symbol list unavailable (${symbols.error.message})` : 'from nt_symbol plan_ids',
      }),
      React.createElement(StatCard, {
        title: 'Realtime',
        value: wsState === 'open' ? 'Live' : wsState === 'connecting' ? 'Connecting' : wsState === 'idle' ? '—' : 'Poll fallback',
        sub: 'signals (' + (isPro ? 'pro' : 'scout') + ')' + (isPro ? ' + portfolio' : '') + ' · REST poll 60s',
        tone: wsState === 'open' ? 'pos' : undefined,
      }),
      React.createElement(StatCard, {
        title: 'Hot signals',
        value: String(hotWindowCount || 0),
        sub: 'qualified · 10m TTL · top 5',
      }),
    ),
    React.createElement('div', { className: 'tla-card' },
      React.createElement('h3', null, 'Renko bricks — last 10 (per symbol)'),
      React.createElement('div', { className: 'tla-explainer' },
        'The last 10 renko bricks of the selected symbol (each brick = one fixed price move of brick_size). ENTRY / SL / TP reference lines come from that symbol\'s latest sweep. Switch symbols to re-analyze.'),
      React.createElement('div', { className: 'tla-brick-picker' },
        symbolList.map((s) =>
          React.createElement('button', {
            key: s,
            className: cn('tla-brick-btn', 'dui-btn', 'dui-btn-sm', s === activeBrickSym ? 'tla-brick-btn-active' : ''),
            onClick: () => setBrickSym(s),
          }, s),
        ),
      ),
      React.createElement(RenkoBrickChart, { bricks: brickWindow, levels }),
      React.createElement('div', { className: 'tla-hint' },
        'ENTRY / SL / TP reference lines from the latest sweep · window = last 10 bricks'),
    ),
    // Markov + brick-pattern — ALL plans (client-side light math only). Placed
    // right below the renko chart because both analyze the SAME selected symbol
    // (activeBrickSym): pattern = last 10 bricks (short-term shape), Markov =
    // up to 200 brick closes (longer statistical fit).
    React.createElement('div', { className: 'tla-card' },
      React.createElement('h3', null, `Markov + pattern — ${activeBrickSym || 'select a symbol'}`),
      React.createElement('div', { className: 'tla-explainer' },
        'Short-term shape + longer statistical odds for the SELECTED symbol. Brick pattern reads the last 10 bricks; Markov P(up in 3) fits a 3-state chain on up to 200 closes.'),
      React.createElement('div', { className: 'tla-grid' },
        React.createElement(StatCard, {
          title: 'Brick pattern',
          value: pattern || '—',
          sub: `last ${brickWindow.length} bricks · ${(sweepRow && sweepRow.regime) || 'regime n/a'}`,
        }),
        React.createElement(StatCard, {
          title: 'Markov P(up in 3)',
          value: markov ? (markov.pUp * 100).toFixed(1) + '%' : '—',
          sub: markov ? `P(down) ${(markov.pDown * 100).toFixed(1)}% · ${markov.n} bricks` : 'needs ≥10 bricks',
          tone: markov && markov.pUp > 0.5 ? 'pos' : markov && markov.pUp < 0.5 ? 'neg' : undefined,
        }),
      ),
      React.createElement('div', { className: 'tla-hint' },
        `Analyzes the symbol selected in the chart above (${activeBrickSym || 'none'}). Nuance: Brick pattern = the last 10 bricks only (short-term shape: 3-push / pullback / chop). Markov P(up in 3) = a 3-state UP/DOWN/FLAT Markov chain fitted on up to 200 brick closes (longer statistical fit) — the probability the next 3-brick move is UP. A 50% value means no edge; >50% leans bullish, <50% leans bearish.`),
    ),

    // Kelly by symbol — latest sweep (TABLE format, 2026-08-12 redesign).
    // Moved below Markov + pattern. Groups by asset_class, sorts by symbol.
    // Excludes brick_* columns. Below-table context: TimesFM / EV / P_win.
    React.createElement('div', { className: 'tla-card' },
      React.createElement('h3', null, 'Kelly by symbol — latest sweep'),
      React.createElement('div', { className: 'tla-explainer' },
        'Latest nt_sweep_result per symbol. Table is grouped by asset class and sorted by symbol. Effective Kelly = post-EV scaling fraction of the book the engine would risk (blue buy, red sell). Brick columns excluded. Below-table context cards show the TimesFM forecast, EV, and P_win for the most-qualified symbol. Rows with — in signal/price columns represent symbols whose latest sweep did NOT qualify (qualified=false) — the regime, aggression, and prev_regime values are still current; only the signal-dependent fields (p_win, EV, markov probabilities, entry/SL/TP) are blank.'),
      React.createElement(TalariaKellyTable, { sweeps, symbols }),
    ),

    isPro ? React.createElement(PaperSection, {
      positions: paperPositions,
      equity: paperEquity,
      events: paperEvents,
    }) : null,

    // --- Phase 2/3 analytics cards (data computed above) ---

    // Signal health scoreboard — ALL plans. Wilson lower bound + BH-FDR over
    // two-sided binomial p-values (null: true win rate = 50%).
    React.createElement('div', { className: 'tla-card' },
      React.createElement('h3', null, 'Signal health scoreboard'),
      React.createElement('div', { className: 'tla-explainer' },
        '30-day resolved-signal record per symbol. Wilson LB = 95% lower confidence bound on true win rate; sig = statistically above 50% after BH-FDR correction. Higher + sig = more reliable signals.'),
      signalHealth.error
        ? React.createElement('div', { className: 'tla-hint' },
            'Signal health view not deployed yet (migration 110) — ' + signalHealth.error.message)
        : sigHealthRows.length === 0
          ? React.createElement('div', { className: 'tla-hint' }, 'No resolved signals yet — rows appear once the EOD resolver closes signals.')
          : React.createElement('table', { className: cn('tla-table', 'dui-table', 'dui-table-sm') },
              React.createElement('thead', null,
                React.createElement('tr', null,
                  React.createElement('th', null, 'Symbol'),
                  React.createElement('th', null, 'Resolved'),
                  React.createElement('th', null, 'Win rate'),
                  React.createElement('th', null, 'WR LB'),
                  React.createElement('th', null, 'Bias'),
                  React.createElement('th', null, 'Profit factor'),
                  React.createElement('th', null, 'Total PnL'))),
              React.createElement('tbody', null,
                sigHealthPageRows.map((r, i) => {
                  const fdr = fdrBySym[r.symbol]
                  const lb = (r.n_resolved > 0 && r.n_tp != null)
                    ? wilsonLower(Number(r.n_resolved), Number(r.n_tp))
                    : null
                  return React.createElement('tr', { key: r.symbol + i },
                    React.createElement('td', null,
                      r.symbol,
                      fdr && fdr.significant
                        ? React.createElement('span', { className: cn('tla-badge', 'tla-hot-chip'), title: 'survives BH-FDR at 0.05' }, 'sig')
                        : null),
                    React.createElement('td', null, r.n_resolved != null ? String(r.n_resolved) : '—'),
                    React.createElement('td', null, r.win_rate != null ? (Number(r.win_rate) * 100).toFixed(1) + '%' : '—'),
                    React.createElement('td', { className: 'tla-sm' }, lb != null ? (lb * 100).toFixed(1) + '%' : '—'),
                    React.createElement('td', {
                      className: r.bias != null && Number(r.bias) > 0.10 ? 'tla-neg' : r.bias != null && Number(r.bias) < -0.10 ? 'tla-pos' : '',
                    }, r.bias != null ? Number(r.bias).toFixed(3) : '—'),
                    React.createElement('td', null, r.profit_factor != null ? Number(r.profit_factor).toFixed(2) : '—'),
                    React.createElement('td', {
                      className: r.total_pnl != null && Number(r.total_pnl) >= 0 ? 'tla-pos' : 'tla-neg',
                    }, r.total_pnl != null ? `$${Number(r.total_pnl).toFixed(2)}` : '—'),
                  )
                }),
              ),
            ),
      React.createElement(Pager, { page: sigHealthPage, pages: sigHealthPages, onChange: setSigHealthPage }),
      React.createElement('div', { className: 'tla-hint' },
        '30-day window · Wilson lower bound (95%) · sig = survives BH-FDR at 0.05 · bias = predicted − realized win rate'),
    ),

    // Calibration bias — ALL plans (migration 103).
    React.createElement('div', { className: 'tla-card' },
      React.createElement('h3', null, 'Calibration bias (7d)'),
      React.createElement('div', { className: 'tla-explainer' },
        'Does predicted win rate match reality? OVERCONFIDENT = the model predicted a HIGHER win rate than it delivered (be cautious). UNDERCONFIDENT = it wins more than predicted. Near 0 = well calibrated.'),
      calib.error
        ? React.createElement('div', { className: 'tla-hint' }, 'Calibration view not deployed yet — ' + calib.error.message)
        : calibRows.length === 0
          ? React.createElement('div', { className: 'tla-hint' }, 'No calibration rows yet — resolved signals needed.')
          : React.createElement('table', { className: cn('tla-table', 'dui-table', 'dui-table-sm') },
              React.createElement('thead', null,
                React.createElement('tr', null,
                  React.createElement('th', null, 'Day'),
                  React.createElement('th', null, 'Symbol'),
                  React.createElement('th', null, 'Predicted'),
                  React.createElement('th', null, 'Realized'),
                  React.createElement('th', null, 'Bias'),
                  React.createElement('th', null, 'Status'))),
              React.createElement('tbody', null,
                calibRows.map((r, i) => (
                  React.createElement('tr', { key: (r.day || '') + (r.symbol || '') + i },
                    React.createElement('td', { className: 'tla-sm' }, String(r.day || '').slice(0, 10)),
                    React.createElement('td', null, r.symbol || '—'),
                    React.createElement('td', null, r.avg_predicted_p_win != null ? (Number(r.avg_predicted_p_win) * 100).toFixed(1) + '%' : '—'),
                    React.createElement('td', null, r.realized_win_rate != null ? (Number(r.realized_win_rate) * 100).toFixed(1) + '%' : '—'),
                    React.createElement('td', {
                      className: r.bias != null && Number(r.bias) > 0.10 ? 'tla-neg' : r.bias != null && Number(r.bias) < -0.10 ? 'tla-pos' : '',
                    }, r.bias != null ? Number(r.bias).toFixed(3) : '—'),
                    React.createElement('td', null,
                      React.createElement('span', {
                        className: cn('tla-badge',
                          r.status === 'OVERCONFIDENT' ? 'closed' : r.status === 'UNDERCONFIDENT' ? 'opened' : ''),
                      }, r.status || '—')),
                  )
                )),
              ),
            ),
      React.createElement('div', { className: 'tla-hint' },
        'What it means: OVERCONFIDENT = the model predicted a HIGHER win rate than it actually delivered (it thinks it wins more than it does — be cautious). UNDERCONFIDENT = it wins MORE than predicted (predictions are too pessimistic). Close to 0 = well calibrated. · last 10 rows'),
    ),

    // Sizing what-if — ALL plans (arithmetic on sweep kelly + equity).
    React.createElement('div', { className: 'tla-card' },
      React.createElement('h3', null, `Sizing what-if — ${activeBrickSym || 'select a symbol'}`),
      React.createElement('div', { className: 'tla-explainer' },
        'If the engine sized a trade on the SELECTED symbol right now: baseline = paper equity × effective_kelly × regime multiplier, then clipped by drawdown and capped at 5% of equity.'),
      React.createElement('div', { className: 'tla-grid' },
        React.createElement(StatCard, {
          title: 'Baseline size',
          value: kellyIn != null ? `$${Number(sizing.baseline).toFixed(2)}` : '—',
          sub: `equity $${Number(eqUsd).toFixed(2)} × kelly ${kellyIn != null ? Number(kellyIn).toFixed(3) : 'n/a'} × regime ${regInfo.mult.toFixed(2)}`,
        }),
        React.createElement(StatCard, {
          title: 'Final size (capped)',
          value: kellyIn != null ? `$${Number(sizing.final).toFixed(2)}` : '—',
          sub: sizing.capHit ? '5% equity cap hit' : `regime ${regInfo.aggressiveness} · dd clip ${(portDd * 100).toFixed(1)}%`,
          tone: kellyIn != null ? (sizing.final > 0 ? 'pos' : 'neg') : undefined,
        }),
      ),
      React.createElement('div', { className: 'tla-hint' },
        `Sizing for the symbol selected above (${activeBrickSym || 'none'}) — SizingEngine arithmetic: baseline = equity × effective_kelly × regime multiplier, clipped by drawdown, capped at 5% of equity`),
    ),

    // Portfolio tear-sheet — Precision Pro only (SQL view, migration 110).
    isPro ? React.createElement('div', { className: 'tla-card' },
      React.createElement('h3', null, 'Portfolio stats — Precision Pro'),
      React.createElement('div', { className: 'tla-explainer' },
        'What this is: risk-adjusted performance of the CLOSED paper trades in the Paper portfolio section above (Sharpe, Sortino, Calmar, drawdown, profit factor, total PnL). These are computed from the ACTUAL sized paper book — the same +$0.xx number you see in Paper equity — NOT the theoretical Signal health scoreboard. Dash (—) = not enough CLOSED trades yet for a meaningful number, which is expected early on.'),
      portStats.error
        ? React.createElement('div', { className: 'tla-hint' }, 'Portfolio stats view not deployed yet (migration 110) — ' + portStats.error.message)
        : portRow
          ? React.createElement('div', { className: 'tla-grid' },
              React.createElement(StatCard, { title: 'Sharpe', value: portRow.sharpe != null ? Number(portRow.sharpe).toFixed(2) : '—', sub: 'annualized daily' }),
              React.createElement(StatCard, { title: 'Sortino', value: portRow.sortino != null ? Number(portRow.sortino).toFixed(2) : '—', sub: 'downside-only' }),
              React.createElement(StatCard, { title: 'Calmar', value: portRow.calmar != null ? Number(portRow.calmar).toFixed(2) : '—', sub: 'return / max DD' }),
              React.createElement(StatCard, { title: 'Max DD %', value: portRow.max_dd_pct != null ? (Number(portRow.max_dd_pct) * 100).toFixed(1) + '%' : '—', sub: 'peak-to-trough', tone: portRow.max_dd_pct != null && Number(portRow.max_dd_pct) > 0.10 ? 'neg' : undefined }),
              React.createElement(StatCard, { title: 'Vol ann %', value: portRow.vol_annual_pct != null ? (Number(portRow.vol_annual_pct) * 100).toFixed(1) + '%' : '—', sub: 'daily σ annualized' }),
              React.createElement(StatCard, { title: 'Profit factor', value: portRow.profit_factor != null ? Number(portRow.profit_factor).toFixed(2) : '—', sub: 'gross wins / gross losses', tone: portRow.profit_factor != null && Number(portRow.profit_factor) >= 1 ? 'pos' : 'neg' }),
              React.createElement(StatCard, { title: 'Total PnL', value: portRow.total_pnl != null ? `$${Number(portRow.total_pnl).toFixed(2)}` : '—', sub: portRow.n_trades != null ? `${portRow.n_trades} trades · win rate ${portRow.win_rate != null ? (Number(portRow.win_rate) * 100).toFixed(1) + '%' : '—'}` : '', tone: portRow.total_pnl != null && Number(portRow.total_pnl) >= 0 ? 'pos' : 'neg' }),
            )
          : React.createElement('div', { className: 'tla-hint' }, 'No portfolio stats yet — the paper book needs resolved positions.'),
      React.createElement('div', { className: 'tla-hint' },
        'Risk-adjusted performance of the paper book over its trading history. Sharpe = reward per unit of volatility (higher is better); Sortino = same but only counts downside; Calmar = annualized return ÷ max drawdown; Max DD = worst peak-to-trough; Vol = how jumpy returns are; Profit factor = gross wins ÷ gross losses (above 1.0 = profitable); Total PnL = cumulative paper profit. Dash (—) = not enough closed trades yet for a meaningful number.'),
    ) : null,

    // Paper vs equal-weight — Precision Pro only (migration 106).
    isPro ? React.createElement('div', { className: 'tla-card' },
      React.createElement('h3', null, 'Paper vs equal-weight'),
      React.createElement('div', { className: 'tla-explainer' },
        'Is the strategy beating the benchmark? Paper PnL = the ACTUAL paper book (Kelly-sized, realized only when positions close). Equal-wt PnL = THEORETICAL unit-size PnL of every resolved signal — what you would have made betting $1 per signal on every symbol with no regime filter. IMPORTANT: these are different scales AND different timings. A negative delta usually does NOT mean the strategy lost money — it means the benchmark counted signals the paper book had not closed yet that day (realized PnL books on close, signal PnL books on signal date). Example: 08-06 showed −$448 because 362 signals resolved (+$448 theoretical) while the paper book had $0 realized that day — the closes were booked 08-08 instead. Read it as a trend, not an exact comparison.'),
      vsOpt.error
        ? React.createElement('div', { className: 'tla-hint' }, 'Comparison view not deployed yet — ' + vsOpt.error.message)
        : vsOptRows.length === 0
          ? React.createElement('div', { className: 'tla-hint' }, 'No comparison rows yet.')
          : React.createElement('table', { className: cn('tla-table', 'dui-table', 'dui-table-sm') },
              React.createElement('thead', null,
                React.createElement('tr', null,
                  React.createElement('th', null, 'Day'),
                  React.createElement('th', null, 'Paper PnL'),
                  React.createElement('th', null, 'Equal-wt PnL'),
                  React.createElement('th', null, 'Delta'))),
              React.createElement('tbody', null,
                vsOptRows.map((r, i) => (
                  React.createElement('tr', { key: (r.day || '') + i },
                    React.createElement('td', { className: 'tla-sm' }, String(r.day || '').slice(0, 10)),
                    React.createElement('td', { className: Number(r.paper_pnl || 0) >= 0 ? 'tla-pos' : 'tla-neg' }, `$${Number(r.paper_pnl || 0).toFixed(2)}`),
                    React.createElement('td', null, `$${Number(r.equal_wt_pnl || 0).toFixed(2)}`),
                    React.createElement('td', {
                      className: Number(r.paper_minus_equal_wt || 0) >= 0 ? 'tla-pos' : 'tla-neg',
                    }, `$${Number(r.paper_minus_equal_wt || 0).toFixed(2)}`),
                  )
                )),
              ),
            ),
      React.createElement('div', { className: 'tla-hint' },
        'Is the strategy beating the benchmark? Paper PnL = the signal engine\'s Kelly/regime-sized trades. Equal-wt PnL = what you would have made betting the same amount on every symbol with no regime filter. Delta > $0 (green) = the engine beat the equal-weight benchmark that day; Delta < $0 (red) = the benchmark won. · last 14 days'),
    ) : null,

    React.createElement('div', { className: 'tla-hint' },
      `Talaria v${PLUGIN_VERSION} · Copyright - Lexington Tech LLC`),
  )
}

// ---------------------------------------------------------------------------
// Talaria signals pane — the side-by-side WIDGET (Mode 2).
//
// A dockable pane (`area: 'panes'`) that sits beside the chat session — the
// SDK pattern from the Hermes desktop widgets video (2026-08-09): register a
// pane with placement/dock instead of a full /route dashboard page. Shows the
// live signal feed from the shared signalStore: unread badge, last signal
// (with friendly regime + freshness), and a rolling list of recent signals.
// Clicking a row navigates to the full /talaria dashboard.
// ---------------------------------------------------------------------------
function TalariaSignalsPane() {
  const [snap, setSnap] = React.useState(() => ({
    unread: signalStore.unread,
    lastSignal: signalStore.lastSignal,
    recent: signalStore.recent,
  }))
  // Tick: refresh ages + drop TTL-expired rows even when no new signal
  // arrives (the store only emits on addSignal/markSeen).
  const [, setTick] = React.useState(0)

  React.useEffect(() => {
    return signalStore.subscribe(() => {
      setSnap({
        unread: signalStore.unread,
        lastSignal: signalStore.lastSignal,
        recent: signalStore.recent,
      })
    })
  }, [])

  React.useEffect(() => {
    return startSignalPolling()
  }, [])

  React.useEffect(() => {
    const timer = setInterval(() => setTick((t) => t + 1), PANE_TICK_MS)
    return () => clearInterval(timer)
  }, [])

  const now = Date.now()
  const unread = snap.unread || 0
  const last = snap.lastSignal
  const recent = snap.recent || []
  // DISPLAY ORDER (2026-08-11, user: "most recent at top"): the pinned card
  // shows the NEWEST TTL-fresh signal (max ts — NOT the possibly-stale
  // persisted lastSignal, which only updates on unread increments and can
  // lag a whole batch), and the list below renders newest-first. The card's
  // own signal is excluded from the list so a signal NEVER renders twice
  // (card + list) — that was the widget duplication seen in screenshots.
  const lastTs = last ? (Date.parse(last.ts) || 0) : 0
  const lastFresh = last && lastTs > 0 && (now - lastTs) <= SIGNAL_TTL_MS
  const freshRows = (recent || [])
    .map((r) => ({ ...r, _ts: Date.parse(r.ts) || 0 }))
    .filter((r) => r._ts > 0 && (now - r._ts) <= SIGNAL_TTL_MS)
    .sort((a, b) => b._ts - a._ts)
  let card = null
  let cardTs = 0
  if (freshRows.length && (!lastFresh || freshRows[0]._ts > lastTs)) {
    card = freshRows[0]
    cardTs = card._ts
  } else if (lastFresh) {
    card = last
    cardTs = lastTs
  }
  const cardKey = card && card.ts ? `${card.symbol}|${card.ts}` : null
  const rows = (cardKey ? freshRows.filter((r) => `${r.symbol}|${r.ts}` !== cardKey) : freshRows)
    .slice(0, RECENT_MAX)
  const dir = card && String(card.direction || '').toLowerCase() === 'sell' ? 'SELL' : 'BUY'
  // LIVE COUNT (2026-08-11): the badge reflects the number of LIVE qualified
  // signals (TTL-fresh recent rows — same count as the chip), NOT the
  // accumulated unread counter (which was capped at 99 and never decayed —
  // "99 new" was meaningless).
  const liveCount = freshRows.length

  const lastPriceLine = card &&
    (Number(card.entry) > 0 || Number(card.stop) > 0 || Number(card.take) > 0)

  return React.createElement('div', { className: 'tla-pane-root' },
    React.createElement('div', { className: 'tla-pane-header' },
      React.createElement('span', null, 'Talaria signals'),
      liveCount > 0
        ? React.createElement('span', { className: 'tla-pane-badge', title: `${liveCount} live qualified signal(s) in the last 60m` }, `${liveCount} live`)
        : null,
      React.createElement('button', {
        type: 'button',
        className: 'tla-pane-open',
        title: 'Open full dashboard',
        onClick: () => { signalStore.markSeen(); navigateTo('/talaria') },
      }, 'Open'),
    ),
    card
      ? React.createElement('div', { className: 'tla-pane-last' },
          React.createElement('span', { className: 'tla-pane-sym' }, card.symbol),
          React.createElement('span', {
            className: cn('tla-pane-dir', String(card.direction || '').toLowerCase() === 'sell' ? 'tla-pane-sell' : 'tla-pane-buy'),
          }, dir),
          card.kelly != null ? React.createElement('span', { className: 'tla-pane-kelly' }, `kelly ${Number(card.kelly).toFixed(3)}`) : null,
          card.regime ? React.createElement('span', { className: 'tla-pane-regime', title: 'Market regime' }, fmtRegime(card.regime)) : null,
          React.createElement('span', { className: 'tla-pane-ts' }, `${fmtSignalTime(cardTs)} · ${fmtAge(cardTs)}`),
          lastPriceLine
            ? React.createElement('div', { className: 'tla-pane-price' },
                Number(card.entry) > 0 ? React.createElement('span', { className: 'tla-pane-price-entry' }, `ENTRY ${fmtBrickPrice(card.entry)}`) : null,
                Number(card.stop) > 0 ? React.createElement('span', { className: 'tla-pane-price-sl' }, `SL ${fmtBrickPrice(card.stop)}`) : null,
                Number(card.take) > 0 ? React.createElement('span', { className: 'tla-pane-price-tp' }, `TP ${fmtBrickPrice(card.take)}`) : null,
              )
            : null,
        )
      : React.createElement('div', { className: 'tla-hint tla-pane-hint' },
          'No recent signals — new qualified signals appear here live.'),
    rows.length
      ? React.createElement('div', { className: 'tla-pane-list' },
          rows.map((r) => {
            const rTs = Date.parse(r.ts)
            const rDir = String(r.direction || '').toLowerCase() === 'sell' ? 'SELL' : 'BUY'
            const rPriceLine = Number(r.entry) > 0 || Number(r.stop) > 0 || Number(r.take) > 0
            return React.createElement('button', {
              key: r.symbol + '|' + r.ts,
              type: 'button',
              className: 'tla-pane-row',
              title: `${r.symbol} ${rDir}${r.regime ? ' · ' + fmtRegime(r.regime) : ''} · ${fmtSignalTime(rTs)} (${fmtAge(rTs)})`,
              onClick: () => { signalStore.markSeen(); navigateTo('/talaria') },
            },
              React.createElement('span', { className: 'tla-pane-row-sym' }, r.symbol),
              React.createElement('span', {
                className: cn('tla-pane-dir', String(r.direction || '').toLowerCase() === 'sell' ? 'tla-pane-sell' : 'tla-pane-buy'),
              }, rDir),
              React.createElement('span', { className: 'tla-pane-row-kelly' }, r.kelly != null ? `k${Number(r.kelly).toFixed(3)}` : ''),
              React.createElement('span', { className: 'tla-pane-row-regime' }, r.regime ? fmtRegime(r.regime) : ''),
              React.createElement('span', { className: 'tla-pane-row-ts' }, rTs ? fmtAge(rTs) : ''),
              // Pricing on EVERY row (2026-08-11 — user: only the top signal
              // showed pricing; add ENTRY/SL/TP to all displayed signals).
              rPriceLine
                ? React.createElement('div', { className: 'tla-pane-price tla-pane-price-row' },
                    Number(r.entry) > 0 ? React.createElement('span', { className: 'tla-pane-price-entry' }, `ENTRY ${fmtBrickPrice(r.entry)}`) : null,
                    Number(r.stop) > 0 ? React.createElement('span', { className: 'tla-pane-price-sl' }, `SL ${fmtBrickPrice(r.stop)}`) : null,
                    Number(r.take) > 0 ? React.createElement('span', { className: 'tla-pane-price-tp' }, `TP ${fmtBrickPrice(r.take)}`) : null,
                  )
                : null,
            )
          }),
        )
      : null,
    React.createElement('div', { className: 'tla-pane-foot' },
      `Talaria v${PLUGIN_VERSION} · Lexington Tech LLC`),
  )
}

// ---------------------------------------------------------------------------
// Statusbar chip (Mode 2 widget + Mode 3 in-app toast driver).
//
// Reads the shared signalStore (fed by the singleton startSignalPolling poll
// + dashboard realtime). Click → navigate to /talaria + clear the badge.
// ---------------------------------------------------------------------------
function TalariaChip() {
  const [snap, setSnap] = React.useState(() => ({
    unread: signalStore.unread,
    lastSignal: signalStore.lastSignal,
    recent: signalStore.recent,
  }))

  // Subscribe to the shared store (badge/label update on signal or markSeen).
  React.useEffect(() => {
    return signalStore.subscribe(() => {
      setSnap({ unread: signalStore.unread, lastSignal: signalStore.lastSignal, recent: signalStore.recent })
    })
  }, [])

  // Start the shared 60s poll (idempotent — pane + chip share one poll).
  React.useEffect(() => {
    return startSignalPolling()
  }, [])

  // Tick: refresh the age label + drop stale (TTL-expired) last signal even
  // when no new signal arrives.
  const [, setTick] = React.useState(0)
  React.useEffect(() => {
    const timer = setInterval(() => setTick((t) => t + 1), PANE_TICK_MS)
    return () => clearInterval(timer)
  }, [])

  const now = Date.now()
  const unread = snap.unread || 0
  const last = snap.lastSignal
  const lastTs = last && Date.parse(last.ts)
  // TTL: a last signal older than 60 min is stale → chip goes neutral (the
  // unread badge still counts unseen signals, per user decision 2026-08-10).
  const lastFresh = last && lastTs && (now - lastTs) <= SIGNAL_TTL_MS
  const dir = last && String(last.direction || '').toLowerCase() === 'sell' ? 'SELL' : 'BUY'
  const ageLabel = lastFresh && lastTs ? fmtAge(lastTs) : ''
  // LIVE COUNT (2026-08-11): same as the pane — the chip badge reflects LIVE
  // qualified signals (TTL-fresh recent rows), NOT the accumulated unread
  // counter (which capped at 99 and never decayed).
  const liveCount = ((snap.recent || []).filter((r) => Date.parse(r.ts) && (now - Date.parse(r.ts)) <= SIGNAL_TTL_MS)).length
  const regimeLabel = lastFresh && last && last.regime ? fmtRegime(last.regime) : ''
  const label = liveCount > 0
    ? `Talaria · ${liveCount}`
    : lastFresh && last
      ? `Talaria · ${last.symbol} ${dir}${ageLabel ? ' · ' + ageLabel : ''}`
      : 'Talaria'

  return React.createElement('button', {
    type: 'button',
    className: cn('tla-chip', liveCount > 0 ? 'tla-chip-hot' : ''),
    title: 'Talaria — open signal dashboard' + (lastFresh && last && lastTs
      ? ` · ${last.symbol} ${dir} · ${fmtSignalTime(lastTs)} (${ageLabel})${regimeLabel ? ' · ' + regimeLabel : ''}`
      : ''),
    onClick: () => {
      signalStore.markSeen()
      navigateTo('/talaria')
    },
  },
    React.createElement('span', { className: 'tla-chip-dot' }),
    label,
  )
}

// ---------------------------------------------------------------------------
// Main component — claim check + status routing
//   invalid/expired/revoked token  → Connect (re-enter token)
//   sub_status 'none'              → Subscribe CTA (next_charge_url / pricing)
//   'pending'                      → waiting screen + retry
//   'active'                       → dashboard
//   'grace'                        → dashboard + renews-date banner
//   'expired'/'cancelled'          → paywall + payment link
// ---------------------------------------------------------------------------
function Talaria() {
  const [config, updateConfig] = useConfig()
  const [claim, setClaim] = React.useState(null)
  const [checkPhase, setCheckPhase] = React.useState('idle') // idle|running|ok|bad-token|not-deployed|error
  const [checkMsg, setCheckMsg] = React.useState('')

  const runCheck = React.useCallback(async () => {
    if (!config.supabase_url || !config.supabase_key || !config.claim_token) {
      setClaim(null)
      setCheckPhase('idle')
      setCheckMsg('')
      return
    }
    setCheckPhase('running')
    setCheckMsg('')
    try {
      const res = await claimCheck(config)
      setClaim(res)
      setCheckPhase('ok')
    } catch (err) {
      setClaim(null)
      setCheckPhase(
        err && err.kind === 'not-deployed' ? 'not-deployed'
          : err && err.kind === 'bad-token' ? 'bad-token'
            : 'error')
      setCheckMsg((err && err.message) || String(err))
    }
  }, [config.supabase_url, config.supabase_key, config.claim_token])

  // Claim check on mount + every 24h. Saving config in the Connect tab
  // changes the callback identity → effect re-runs → immediate re-check.
  React.useEffect(() => {
    runCheck()
    const timer = setInterval(runCheck, CLAIM_CHECK_MS)
    return () => clearInterval(timer)
  }, [runCheck])

  const hasConfig = !!(config.supabase_url && config.supabase_key && config.claim_token)

  if (!hasConfig) {
    return React.createElement(ConnectTab, {
      config, onSave: updateConfig, checkPhase: 'idle', checkMsg: '',
    })
  }
  if (checkPhase === 'running' || checkPhase === 'idle') {
    return React.createElement('div', { className: 'tla-root' },
      React.createElement('div', { className: 'tla-card' },
        React.createElement('h3', null, 'Checking claim…'),
        React.createElement('div', { className: 'tla-hint' },
          'Validating claim token against talaria-check (live subscription status)…'),
      ),
    )
  }
  if (checkPhase !== 'ok') {
    // bad-token / not-deployed / error — back to Connect with inline status
    return React.createElement(ConnectTab, {
      config, onSave: updateConfig, checkPhase, checkMsg,
    })
  }

  const status = String((claim && claim.sub_status) || 'none').toLowerCase()
  if (status === 'none') {
    return React.createElement(SubscribeScreen, { claim, onRetry: runCheck })
  }
  if (status === 'pending') {
    return React.createElement(WaitingScreen, { claim, onRetry: runCheck })
  }
  if (status === 'expired' || status === 'cancelled') {
    return React.createElement(PaywallScreen, { claim, onRetry: runCheck })
  }
  // active | grace
  return React.createElement(TalariaDashboard, { config, claim })
}

// ---------------------------------------------------------------------------
const plugin = {
  id: 'talaria',
  name: 'Talaria',
  defaultEnabled: true,
  register(ctx) {
    ensureStyle()
    ctx.registerMany([
      {
        id: 'page',
        area: ROUTES_AREA,
        data: { path: '/talaria' },
        render: () => React.createElement(Talaria, null),
      },
      {
        id: 'nav',
        area: SIDEBAR_NAV_AREA,
        order: 50,
        data: { codicon: 'graph-line', label: 'Talaria', path: '/talaria' },
      },
      {
        // Mode 2 widget — always-visible statusbar chip (unread badge +
        // last signal). Independent 60s poll keeps it live while the
        // dashboard socket is closed.
        id: 'chip',
        area: 'statusBar.right',
        order: 55,
        render: () => React.createElement(TalariaChip, null),
      },
      {
        // Mode 2 widget — side-by-side pane (dock right of the chat
        // session, like the Hermes desktop widgets video). Compact live
        // signal feed; click a row → full /talaria dashboard.
        id: 'signals-pane',
        area: 'panes',
        title: 'Talaria signals',
        data: { placement: 'right', dock: { pane: 'workspace', pos: 'right' }, width: '300px' },
        render: () => React.createElement(TalariaSignalsPane, null),
      },
    ])
  },
}

export default plugin
