const DAISY_CSS = `
.tla-btn,
.nta-btn{display:inline-flex;align-items:center;justify-content:center;gap:.375rem;white-space:nowrap;font-weight:500;border-radius:var(--radius-btn,.5rem);border:1px solid var(--ui-stroke-secondary);background:var(--ui-panel);color:var(--ui-text-primary);padding:.4rem .85rem;font-size:.875rem;line-height:1.25rem;transition:color .12s,background-color .12s,border-color .12s,box-shadow .12s;cursor:pointer;-webkit-user-select:none;user-select:none}
.tla-btn-primary,
.nta-btn-primary{background:var(--ui-accent);border-color:var(--ui-accent);color:var(--ui-text-on-accent)}
.tla-btn-secondary,
.nta-btn-secondary{background:transparent;border-color:var(--ui-stroke-secondary);color:var(--ui-text-secondary)}
.tla-btn:hover,
.nta-btn:hover{background: color-mix(in srgb, var(--ui-accent,rgb(76,154,255)) 6%, transparent)}
.tla-btn-primary:hover{background:rgba(var(--ui-accent-rgb),.85)}
.tla-btn-disabled,
.nta-btn-disabled{opacity:.5;cursor:not-allowed;pointer-events:auto}
.tla-btn-active,
.nta-btn-active{background: color-mix(in srgb, var(--ui-accent,rgb(76,154,255)) 12%, transparent);border-color:var(--ui-accent);color:var(--ui-accent)}
.tla-btn-sm,
.nta-btn-sm{font-size:.75rem;padding:.25rem .6rem}
.tla-badge,
.nta-badge{display:inline-flex;align-items:center;justify-content:center;border-radius:9999px;padding:.125rem .6rem;font-size:.75rem;font-weight:600;line-height:1}
.tla-badge-sm,
.nta-badge-sm{font-size:.65rem;padding:.08rem .45rem}
.tla-table,
.nta-table{width:100%;border-collapse:separate;border-spacing:0 .5rem;font-size:.85rem}
.tla-table-sm,
.nta-table-sm{font-size:.75rem}
.tla-table th,
.nta-table th{text-align:left;font-weight:600;padding:.5rem .75rem;color:var(--ui-text-tertiary);text-transform:uppercase;font-size:.7rem;letter-spacing:.03em}
.tla-table td,
.nta-table td{padding:.4rem .75rem;border-top:1px solid var(--ui-stroke-secondary);color:var(--ui-text-primary)}
.tla-table tbody tr,
.nta-table tbody tr{background:var(--ui-panel);border-radius:var(--radius-card,.5rem)}
.tla-table tbody tr:hover{background: color-mix(in srgb, var(--ui-accent,rgb(76,154,255)) 4%, transparent)}
.tla-table-sm td,
.nta-table-sm td{padding:.35rem .6rem}
.tla-join,
.nta-join{display:inline-flex;flex-wrap:wrap;gap:.25rem;margin:-.125rem}
.tla-join-item,
.nta-join-item{display:inline-flex}
.tla-donut-wrap{display:inline-flex;flex-direction:column;align-items:center;justify-content:center;width:80px;height:80px;}
.tla-donut-svg{display:block;}
.tla-donut-label{font-size:9px;color:var(--ui-text-secondary,#aaa);margin-top:4px;text-align:center;font-variant-numeric:tabular-nums;}
.tla-line-svg{display:block;width:100%;height:auto;}

/* Tab buttons — Market & Analysis selector in Talaria */
.tla-tabs{display:flex;gap:6px;border-bottom:1px solid var(--ui-stroke-secondary,#2a2a2a);padding-bottom:4px;margin-bottom:8px;-webkit-app-region:no-drag}
.tla-tab-btn{background:transparent;border:1px solid transparent;border-bottom:none;border-top-left-radius:6px;border-top-right-radius:6px;padding:6px 14px;font-size:12px;font-weight:500;color:var(--ui-text-secondary,#888);cursor:pointer;transition:all 0.15s ease;-webkit-app-region:no-drag}
.tla-tab-btn:hover{background:var(--ui-hover,#2a2a2a);color:var(--ui-text-primary,#e0e0e0)}
.tla-tab-active{background:var(--ui-panel-bg,#1e1e1e);color:var(--ui-text-primary,#e0e0e0);border-color:var(--ui-stroke-secondary,#2a2a2a);border-bottom:1px solid var(--ui-panel-bg,#1e1e1e);margin-bottom:-1px}
.tla-brick-btn{background:transparent;border:1px solid var(--ui-stroke-secondary,#2a2a2a);border-radius:4px;padding:4px 8px;font-size:11px;color:var(--ui-text-secondary,#888);cursor:pointer}
.tla-brick-btn-active{background:var(--ui-accent,#4c9aff);color:var(--ui-text-primary,#fff)}
`

import React from 'react'
import { cn, host, ROUTES_AREA, SIDEBAR_NAV_AREA } from '@hermes/plugin-sdk'

// shared-logic.js — single source of truth for logic duplicated (and drifted)
// between noble-trader-admin and talaria desktop plugins.
//
// Both plugin.js files are loaded by Electron as uncompiled ESM with NO imports
// allowed beyond `react` / `react/jsx-runtime` / `@hermes/plugin-sdk`. Therefore
// this file is NOT import()'d at runtime — it is TEXTUALLY CONCATENATED into
// each plugin.js by scripts/build-plugins.py before the per-plugin body.
//
// Reconciliation policy (worklog/20260824):
//   - the 20 byte-identical functions copied verbatim;
//   - the 6 drifted functions unified to the talaria SUPERTSET variant
//     (additive: more params/defaults) which is a strict superset admin can consume.
//
// NOT wrapped in an IIFE: this content is concatenated directly into each
// plugin.js's top-level module scope, ahead of the per-plugin body, so the
// body can call these functions/consts by bare name. An IIFE wrapper here
// would scope every declaration to itself, making them invisible to the
// body (confirmed 2026-08-24: this exact regression broke both plugins —
// every one of these functions was unreachable, throwing "X is not defined"
// the instant register() ran).

// Restored 2026-08-24 from noble-trader-talaria/talaria-plugin-v0.2.10.zip — the 2026-08-24
// consolidation truncated this to 3 generic keys (aggressive/moderate/conservative), but real
// sweep rows carry aggression as passive/mid/aggressive (confirmed against the render harness's
// own mock data), so those never matched and always fell back to generic title-casing.
const AGGRESSION_FRIENDLY = { passive: '🎯 Patient', mid: '⚡ Normal', aggressive: '🔥 Aggressive' }
// Restored 2026-08-24 from the same v0.2.10 backup — was truncated to 3 generic keys
// (bull/bear/neutral), but real regime labels are composite (low_vol_strong_bull,
// high_vol_bear, low_vol_chop, …) and never matched, so the friendly emoji labels never
// actually appeared for real data (only for a bare "bull"/"bear"/"neutral" that nothing emits).
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
// HOT_TTL_MS/HOT_MAX were already in build-plugins.py's SHARED_CONST list but never actually
// declared here — a pre-existing gap from before the 2026-08-24 consolidation. Confirmed both are
// genuinely used by the ORIGINAL HotSignalsBanner (see below) via the same v0.2.10 backup:
// HOT_TTL_MS gates the "last 10m" window, HOT_MAX caps the chip list at the top 5 by Kelly.
const HOT_TTL_MS = 10 * 60 * 1000
const HOT_MAX = 5
// Restored 2026-08-24 from the same v0.2.10 backup — the consolidation truncated this to 2 keys
// mapping to plain slug strings ({ strong_bull: 'strong-bull', ... }), but metaRegimeInfo() (and
// the Sizing-what-if panel that reads its return value) needs { mult, aggressiveness } per regime;
// that shape existed here originally and was lost, which is what caused the Sizing-what-if crash
// documented in worklog/20260824_scope_implementation_and_build_verification.md.
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

function fmtPrice(v) {
  if (v == null || isNaN(Number(v))) return '—'
  const n = Number(v)
  const abs = Math.abs(n)
  if (abs >= 1000) return n.toFixed(1)
  if (abs >= 100) return n.toFixed(3)
  if (abs >= 10) return n.toFixed(4)
  return n.toFixed(5)
}

function fmtUsd(v) {
  if (v == null || isNaN(Number(v))) return '—'
  const n = Number(v)
  if (Math.abs(n) < 1000) return n.toFixed(2)
  return n.toLocaleString('en-US', { maximumFractionDigits: 1 })
}

function fmtLocalDateTime(v) {
  if (!v) return '—'
  const d = new Date(v)
  if (!(d instanceof Date) || isNaN(d.getTime())) return String(v)
  return d.toLocaleString(undefined, { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

function fmtRegime(label) {
  if (!label) return '—'
  const key = String(label).toLowerCase()
  if (REGIME_FRIENDLY[key]) return REGIME_FRIENDLY[key]
  // Handle volatility-tier prefixes (low_/high_/med_) by stripping the prefix
  // and looking up the base regime key, then re-injecting the tier label.
  const tierMatch = key.match(/^(low_|high_|med_)/)
  if (tierMatch) {
    const base = key.slice(tierMatch[0].length)
    if (REGIME_FRIENDLY[base]) {
      const tierWord = { low_: 'Low-vol', high_: 'High-vol', med_: 'Med-vol' }[tierMatch[0]]
      return REGIME_FRIENDLY[base].replace(/Low-vol|High-vol/, tierWord)
    }
  }
  return String(label).replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
}

function fmtRegimeShort(label) {
  if (!label) return '—'
  const full = fmtRegime(label)
  // Truncate the friendly label to ≤18 chars with ellipsis for the prev_regime
  // column to keep rows compact.
  if (full.length > 18) return full.slice(0, 17) + '…'
  return full
}

function fmtAggression(label) {
  if (!label) return '—'
  const key = String(label).toLowerCase()
  if (AGGRESSION_FRIENDLY[key]) return AGGRESSION_FRIENDLY[key]
  return String(label).replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
}

function fmtAggressionAdmin(label) {
  // Admin uses a richer label set; talaria falls back to the generic one.
  return fmtAggression(label)
}

function fmtKellyPct(k) {
  if (k == null || isNaN(Number(k))) return '—'
  return (Number(k) * 100).toFixed(1) + '%'
}

function fmtPwinColor(p, inverted) {
  if (p == null || isNaN(Number(p))) return inverted ? 'var(--ui-text-primary)' : 'var(--ui-text-tertiary)'
  if (Number(p) >= 0.75) return 'var(--ui-success,rgb(38,211,116))'
  if (Number(p) >= 0.5) return 'var(--ui-warning,rgb(240,180,60))'
  if (Number(p) >= 0.25) return 'var(--ui-danger,rgb(255,92,92))'
  return 'var(--ui-danger,rgb(255,92,92))'
}

function fmtEvColor(ev, inverted) {
  if (ev == null || isNaN(Number(ev))) return 'var(--ui-text-tertiary)'
  if (Number(ev) >= 0) return 'var(--ui-success,rgb(38,211,116))'
  return 'var(--ui-danger,rgb(255,92,92))'
}

function markovUpProbability(signal) {
  const p = Number(signal && signal.markov_up_prob)
  if (isNaN(p)) return null
  return p
}

const BRICK_W = 26
const BRICK_GAP = 4
const BRICK_STEP = BRICK_W + BRICK_GAP
const BRICK_RIGHT_MARGIN = 66
const BRICK_TOP_PAD = 18
const BRICK_BOTTOM_PAD = 26
const BRICK_LEFT_PAD = 8
const MIN_BRICK_H = 18

function brickGridLines(lo, hi, step) {
  const lines = []
  if (lo == null || hi == null) return lines
  const r = Math.max(1, Math.ceil((hi - lo) / step))
  for (let i = 0; i <= r; i++) lines.push(lo + i * step)
  return lines
}

function brickStep(raw, mag, step) {
  const norm = Math.max(1, Math.ceil(Math.abs(mag)))
  return raw / (norm * step)
}

function fmtBrickPrice(n) {
  if (n == null || isNaN(Number(n))) return ''
  const v = Number(n)
  const abs = Math.abs(v)
  if (abs >= 1000) return v.toFixed(0)
  if (abs >= 100) return v.toFixed(1)
  if (abs >= 10) return v.toFixed(2)
  return v.toFixed(3)
}

function brickPattern(dirs) {
  if (!dirs || !dirs.length) return ''
  return dirs.map((d) => (typeof d === 'object' ? (Number(d.close_price) > Number(d.open_price) ? 1 : -1) : d)).map((d) => (d > 0 ? 'U' : 'D')).join('').replace(/(.)\1+/g, '$1')
}
function patternLabel(pattern) {
  if (!pattern || !pattern.length) return '—'
  if (pattern === 'UUU') return '3-push up 📈'
  if (pattern === 'DDD') return '3-push down 📉'
  if (pattern === 'UD') return 'Reversal ↑↓'
  if (pattern === 'DU') return 'Reversal ↓↑'
  if (pattern === 'UDU') return 'Pullback ↑↓↑'
  if (pattern === 'DUD') return 'Pullback ↓↑↓'
  if (/^(UD)+$/.test(pattern) || /^(DU)+$/.test(pattern)) return 'Choppy ↕'
  return 'Mixed (' + pattern + ')'
}


function aggregateToMonths(dailyRows, months) {
  if (!dailyRows || !dailyRows.length) return []
  const groups = {}
  for (const r of dailyRows) {
    const d = String(r.day || '').slice(0, 7)
    if (!d || d.length < 7) continue
    if (!groups[d]) groups[d] = { paper: 0, equal: 0 }
    groups[d].paper += Number(r.paper_pnl || 0)
    groups[d].equal += Number(r.equal_wt_pnl || 0)
  }
  const sorted = Object.keys(groups).sort().reverse().slice(0, months)
  return sorted.map((m) => ({
    month: m,
    paper_pnl: groups[m].paper,
    equal_wt_pnl: groups[m].equal,
    delta: groups[m].paper - groups[m].equal,
  }))
}

// Restored 2026-08-24 from noble-trader-talaria/talaria-plugin-v0.2.10.zip. The consolidation
// replaced both this and metaRegimeInfo with a 2-arg/simple-shape pair that didn't match either
// plugin's actual call site (sizingWhatIf(eqUsd, kellyIn, regimeLabel, portDd), reading
// sizing.baseline/.final/.capHit) — this is the real fix for the Sizing-what-if crash a 2026-08-24
// verification pass only null-guarded (see worklog/20260824_scope_implementation_and_build_verification.md).
// SizingEngine what-if: baseline = equity × kelly × regime mult, then a drawdown clip
// ddClip = clamp(1 − dd/max_dd, 0.25, 1.0), capped at 5% of equity.
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

function metaRegimeInfo(regimeLabel) {
  const r = META_REGIME_TABLE[String(regimeLabel || '').trim()] || { mult: 1.0, aggressiveness: 'normal' }
  let tone
  if (r.mult <= 0) tone = 'neg'
  else if (r.mult >= 1.5) tone = 'pos'
  else if (r.mult < 1.0) tone = 'warn'
  return { mult: r.mult, aggressiveness: r.aggressiveness, tone }
}

function saveConfig(cfg) {
  try {
    if (typeof localStorage !== 'undefined') localStorage.setItem(CONFIG_FILE, JSON.stringify(cfg))
  } catch (e) {}
}

function loadConfig(defaults) {
  const saved = {}
  try {
    if (typeof localStorage !== 'undefined') {
      const raw = localStorage.getItem(CONFIG_FILE)
      if (raw) Object.assign(saved, JSON.parse(raw))
    }
  } catch (e) {}
  return defaults ? Object.assign({}, defaults, saved) : saved
}

function useConfig(defaults) {
  const [config, setConfig] = React.useState(() => loadConfig(defaults))
  const update = React.useCallback((patch) => {
    setConfig((prev) => {
      const next = Object.assign({}, prev, typeof patch === 'function' ? patch(prev) : patch)
      saveConfig(next)
      return next
    })
  }, [])
  React.useEffect(() => {
    const onStorage = () => setConfig(() => loadConfig(defaults))
    globalThis.addEventListener?.('storage', onStorage)
    return () => globalThis.removeEventListener?.('storage', onStorage)
  }, [])
  return [config, update]
}

// NOTE (2026-08-24 verification pass): both functions below were missing the
// PostgREST '/rest/v1/' path prefix entirely — fetchSupabase built URLs like
// 'https://<project>.supabase.co' + 'nt_sweep_result' (no separator at all,
// concatenating straight into '.cont_sweep_result'), so every useSupabaseData
// call in both plugins silently failed. Confirmed via the talaria render
// harness ("Unexpected fetch URL: https://...supabase.cont_sweep_result").
function fetchSupabase(config, path, params) {
  const base = config.supabase_url
  const qs = new URLSearchParams(params || {}).toString()
  const url = qs ? base + '/rest/v1/' + path + '?' + qs : base + '/rest/v1/' + path
  return fetch(url, { headers: { apikey: config.supabase_key, Authorization: 'Bearer ' + config.supabase_key } })
    .then((r) => r.json())
}

function fetchSupabaseCount(config, table, filter) {
  const qs = new URLSearchParams(Object.assign({ select: 'count' }, filter || {})).toString()
  const url = config.supabase_url + '/rest/v1/' + table + '?' + qs
  return fetch(url, { headers: { apikey: config.supabase_key, Authorization: 'Bearer ' + config.supabase_key, Prefer: 'count=exact' } })
    .then((r) => Number(r.headers.get('content-range')?.split('/')?.[1] || r.headers.get('x-total-count') || 0))
}

function useSupabaseData(config, table, params, enabled, pollMs) {
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
    const timer = setInterval(load, pollMs || 60000)
    return () => clearInterval(timer)
  }, [load])

  return { data, loading, error, reload: load }
}

function Pager({ total, size, page, onChange }) {
  if (!total) return null
  const pages = Math.max(1, Math.ceil(total / size))
  const btns = []
  for (let i = 1; i <= pages; i++) {
    btns.push(
      React.createElement('button', {
        key: i, className: cn('tla-btn tla-btn-sm', i === page ? 'tla-btn-active' : ''),
        onClick: () => onChange(i),
        style: { minWidth: 32 },
      }, String(i))
    )
  }
  return React.createElement('div', { className: 'tla-join', style: { gap: 4, marginTop: 6 } }, btns)
}

function HBar({ label, value, max, color }) {
  const w = max > 0 ? (Math.abs(value) / max) * 100 : 0
  return React.createElement('div', { className: 'tla-row' },
    React.createElement('span', { className: 'tla-k' }, label),
    React.createElement('div', { className: 'tla-bar-track' },
      React.createElement('div', { className: 'tla-bar-fill', style: { width: w + '%', background: color || 'var(--ui-accent)', maxWidth: '100%' } })
    ),
    React.createElement('span', { className: 'tla-value' }, String(value))
  )
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

// DonutChart — multi-segment donut for outcome distribution.
// Accepts { data: [{ label, value, color }] }.
// Each segment renders as a stroke-dasharray arc; colors are passed per-item.
function DonutChart({ data, size = 80, hole = 32 }) {
  const total = (data || []).reduce((sum, d) => sum + (Number(d.value) || 0), 0)
  if (!total || !data || !data.length) {
    return React.createElement('div', { className: 'tla-donut-wrap', style: { width: size, height: size } },
      React.createElement('svg', { width: size, height: size, className: 'tla-donut-svg', viewBox: '0 0 100 100' },
        React.createElement('circle', {
          cx: 50, cy: 50, r: 30, strokeWidth: 6, fill: 'none',
          stroke: 'var(--ui-stroke-secondary,#2a2a2a)',
        })
      )
    )
  }
  const radius = 32
  const strokeWidth = 8
  const circumference = 2 * Math.PI * radius
  const segments = []
  let runningStart = 0
  for (const d of data) {
    const pct = (Number(d.value) || 0) / total
    const dashLen = pct * circumference
    const offset = circumference * runningStart
    segments.push({
      label: d.label,
      value: d.value,
      color: d.color || 'var(--ui-accent,#4c9aff)',
      dashLen,
      offset,
    })
    runningStart += pct
  }
  const svgW = size
  const svgH = size
  const cy = svgW / 2
  const r = radius
  return React.createElement('div', { className: 'tla-donut-wrap', style: { width: size, height: size } },
    React.createElement('svg', { width: svgW, height: svgH, className: 'tla-donut-svg', viewBox: `0 0 ${svgW} ${svgH}` },
      segments.map((s, i) =>
        React.createElement('circle', {
          key: i,
          cx: cy, cy: cy, r: r, strokeWidth: strokeWidth, fill: 'none',
          stroke: s.color,
          strokeDasharray: s.dashLen + ' ' + circumference,
          strokeDashoffset: -s.offset,
          style: { transform: 'rotate(-90deg)', transformOrigin: '50% 50%' },
        })
      )
    ),
    React.createElement('span', { className: 'tla-donut-label' }, data.length > 1 ? 'Distribution' : (data[0]?.label || '—'))
  )
}

// Preserve Donut alias for any legacy call sites using the old single-segment API.
const Donut = DonutChart

// LineChart — accepts { points, color, height, labels }.
// points may be number[] or {y: number}[].
// height overrides the default 60; labels is accepted for future axis use
// (chart width scales with label count to maintain ~30px minimum per point).
function LineChart({ points, color, height, labels }) {
  if (!points || !points.length) return null
  // Normalize: accept plain numbers OR { y: n } objects.
  const vals = points.map((p) => typeof p === 'number' ? p : (p && p.y != null ? p.y : 0))
  const min = Math.min(...vals); const max = Math.max(...vals)
  const rng = max - min || 1
  const h = height || 60; const pad = 4
  const w = Math.max(160, labels && labels.length ? labels.length * 30 : vals.length * 12)
  const pts = vals.map((v, i) => {
    const x = (i / (vals.length - 1 || 1)) * (w - pad * 2) + pad
    const y = h - pad - ((v - min) / rng) * (h - pad * 2)
    return [x.toFixed(1), y.toFixed(1)].join(',')
  }).join(' ')
  return React.createElement('svg', { width: w, height: h, className: 'tla-line-svg' },
    React.createElement('polyline', { points: pts, fill: 'none', stroke: color || 'var(--ui-accent,#4c9aff)', strokeWidth: 2 })
  )
}

// Restored 2026-08-24 from noble-trader-talaria/talaria-plugin-v0.2.10.zip (talaria variant) and
// noble-trader-admin-plugin-v0.2.10.zip (admin variant) \u2014 these were two genuinely DIFFERENT
// pre-refactor implementations (admin's own nta-*-classed version reads the raw hook-result
// object and filters `qualified` itself; talaria's tla-*-classed version takes an
// already-filtered plain array and uses `direction` not `signal`), not just a CSS-prefix
// difference. The 2026-08-24 consolidation replaced BOTH with a single { rows, newest, cutoff }
// shape neither call site (both still pass { signals }, unchanged) ever supplied, crashing on the
// first render. Branches on `variant` the same way ConnectTab does rather than forking the
// component.
function HotSignalsBanner({ signals, variant }) {
  if (variant === 'admin') {
    const rows = (signals && signals.data || []).filter((s) => s.qualified)
    const newest = Math.max(...rows.map((r) => Date.parse(r.ts) || 0))
    const cutoff = newest ? newest - HOT_TTL_MS : 0
    const hot = rows
      .filter((r) => newest && (Date.parse(r.ts) || 0) >= cutoff)
      .map((r) => ({
        symbol: r.symbol,
        signal: r.signal,
        kelly: Number(r.effective_kelly != null ? r.effective_kelly : r.kelly_f) || 0,
        regime: r.regime,
        ts: r.ts,
      }))
      .sort((a, b) => b.kelly - a.kelly)
      .slice(0, HOT_MAX)

    if (!hot.length) return null

    return React.createElement('div', { className: 'nta-card nta-hot-card' },
      React.createElement('h3', null, 'Hot signals'),
      React.createElement('div', { className: 'nta-explainer' },
        'The most recent qualified signals, ranked by effective Kelly \u2014 the trades the engine is most interested in right now. A chip = one signal for that symbol (buy/sell), with the market regime it fired in.'),
      React.createElement('span', { className: 'nta-hot-ts' },
        `as of ${new Date(newest).toISOString().slice(0, 19).replace('T', ' ')} UTC \u00B7 ${hot.length} in 10m window`),
      React.createElement('div', { className: 'nta-hot' },
        hot.map((h) => {
          const regimeLabel = fmtRegime(h.regime)
          return React.createElement('div', {
            key: h.symbol + h.ts,
            className: cn('nta-hot-chip', h.signal === 'sell' ? 'nta-hot-sell' : 'nta-hot-buy'),
          },
            React.createElement('span', { className: 'nta-hot-sym' }, h.symbol),
            React.createElement('span', { className: 'nta-hot-dir' }, h.signal === 'sell' ? 'Sell' : 'Buy'),
            React.createElement('span', { className: 'nta-hot-kelly' }, `kelly ${h.kelly.toFixed(3)}`),
            regimeLabel ? React.createElement('span', { className: 'nta-hot-regime', title: 'Market regime' }, regimeLabel) : null,
          )
        }),
      ),
    )
  }

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
      'The most recent qualified signals, ranked by effective Kelly \u2014 the trades the engine is most interested in right now. A chip = one signal for that symbol (buy/sell).'),
    React.createElement('span', { className: 'tla-hot-ts' },
      `as of ${new Date(newest).toLocaleString(undefined, { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })} \u00B7 ${hot.length} in 10m window`),
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

// ConnectTab \u2014 shared between admin and talaria, which need genuinely different
// forms: admin connects with its own Supabase URL/anon key; talaria (Option A,
// 2026-08-10) embeds those as service defaults and only ever asks for a claim
// token. Branches on `variant: 'talaria'` rather than forking the component,
// so the two stay reconciled in one place. Restores the claim_token field that
// was dropped entirely in the 2026-08-24 shared-logic consolidation \u2014 talaria
// users who needed to enter/replace a token had no UI path to do so (the
// render harness's own "no config" scenario already asserted this exact
// contract \u2014 'Claim token' field, 'Save & Validate' button, Supabase fields
// hidden, 'pre-configured' hint \u2014 it just never matched the shipped markup).
function ConnectTab({ config, onSave, checkPhase, checkMsg, variant }) {
  const errored = checkPhase === 'bad-token' || checkPhase === 'not-deployed' || checkPhase === 'error'

  if (variant === 'talaria') {
    const [local, setLocal] = React.useState({ claim_token: config.claim_token || '' })
    const save = () => onSave(local)
    return React.createElement('div', { className: 'tla-root' },
      React.createElement('div', { className: 'tla-header' },
        TalariaMark ? React.createElement(TalariaMark, { size: 20 }) : null,
        React.createElement('span', null, 'Talaria \u00b7 Connect')),
      React.createElement('div', { className: 'tla-card' },
        React.createElement('div', { className: 'tla-hint' },
          'Service connection is pre-configured \u2014 just enter your claim token.'),
        React.createElement('label', { className: 'tla-hint' }, 'Claim token'),
        React.createElement('input', {
          className: 'tla-input', type: 'password', placeholder: 'Claim token',
          value: local.claim_token,
          onInput: (e) => setLocal({ claim_token: e.target.value }),
        }),
        errored ? React.createElement('div', { className: 'tla-row' }, checkMsg || 'Could not validate claim token.') : null,
        React.createElement('button', {
          className: cn('tla-btn tla-btn-primary tla-btn-sm', checkPhase === 'running' ? 'tla-btn-disabled' : ''),
          onClick: save, disabled: checkPhase === 'running',
        }, 'Save & Validate'),
      ),
    )
  }

  // admin (default) \u2014 restored 2026-08-24 from noble-trader-admin-plugin-v0.2.10.zip (a
  // pre-Batch-A backup): heading, labeled fields, and the "Test connection" button (pings
  // nt_signal_sim directly) were replaced during the 2026-08-24 consolidation with a
  // placeholder-only, unlabeled, tla-*-classed form that (a) never said "Connect" anywhere,
  // which is what a stale render-harness assertion (findH3(out, 'Connect')) was actually
  // catching, and (b) used talaria's CSS prefix instead of admin's own nta-*/dui-* classes.
  const [local, setLocal] = React.useState({ supabase_url: config.supabase_url || '', supabase_key: config.supabase_key || '' })
  const [testing, setTesting] = React.useState(false)
  const [testResult, setTestResult] = React.useState(null)
  const save = () => onSave(local)
  const testConnection = async () => {
    setTesting(true)
    setTestResult(null)
    try {
      const base = (local.supabase_url || '').replace(/\/+$/, '')
      const resp = await fetch(`${base}/rest/v1/nt_signal_sim?select=signal_id&limit=1`, {
        headers: { apikey: local.supabase_key, Authorization: `Bearer ${local.supabase_key}`, Accept: 'application/json' },
      })
      if (!resp.ok) setTestResult({ ok: false, msg: `${resp.status} ${resp.statusText}` })
      else setTestResult({ ok: true, msg: 'Connected \u2014 Supabase reachable' })
    } catch (err) {
      setTestResult({ ok: false, msg: String((err && err.message) || err) })
    } finally {
      setTesting(false)
    }
  }
  return React.createElement('div', { className: 'nta-root' },
    React.createElement('div', { className: 'nta-card' },
      React.createElement('h3', null, 'Noble Trader Admin \u2014 Connect'),
      React.createElement('div', { className: 'nta-hint' },
        'Enter the Supabase project URL and the PUBLIC anon key. The plugin reads EOD signal-lookback + paper-portfolio data DIRECTLY from Supabase via scoped read-only RLS \u2014 no backend, no service key, safe for multi-user install.'),
      React.createElement('div', { className: 'nta-field' },
        React.createElement('label', null, 'Supabase URL'),
        React.createElement('input', {
          value: local.supabase_url, placeholder: 'https://<project>.supabase.co',
          onInput: (e) => setLocal({ ...local, supabase_url: e.target.value }),
        })),
      React.createElement('div', { className: 'nta-field' },
        React.createElement('label', null, 'Supabase anon/public key'),
        React.createElement('input', {
          value: local.supabase_key, type: 'password', placeholder: 'sb_publishable_...',
          onInput: (e) => setLocal({ ...local, supabase_key: e.target.value }),
        })),
      errored ? React.createElement('div', { className: 'nta-err' }, checkMsg || 'Could not connect.') : null,
      React.createElement('div', { style: { display: 'flex', gap: 8, alignItems: 'center' } },
        React.createElement('button', {
          className: cn('nta-btn', 'dui-btn', 'dui-btn-primary', 'dui-btn-sm'), onClick: save,
        }, 'Save & Connect'),
        React.createElement('button', {
          className: cn('nta-btn', 'dui-btn', 'dui-btn-ghost', 'dui-btn-sm'), onClick: testConnection, disabled: testing,
        }, testing ? 'Testing\u2026' : 'Test connection'),
      ),
      testResult ? React.createElement('div', {
        className: testResult.ok ? 'nta-ok' : 'nta-err', style: { marginTop: 8 },
      }, testResult.msg) : null,
    ),
  )
}

// ensureStyle — UNIFIED (B2-1). Moved here from per-plugin bodies to eliminate
// the document.head clobber drift: both plugins now call the SAME function with
// their own STYLE_ID const. No more duplicate/overwritten <style> elements on
// the shared Electron DOM. DAISY_CSS resolves from module top-level scope
// (declared before this file's content in the concat).
//
// `customCss` param added 2026-08-24: the pre-Batch-A source had TWO separate
// stylesheets per plugin — the vendored DAISY_CSS blob (own <style> tag) and a
// per-plugin `const CSS = [...].join('')` of hand-written app classes
// (.tla-card/.tla-pane-root/.nta-card/etc., injected into a SECOND <style>
// tag). Batch A's CSS trim collapsed this down to a single DAISY_CSS-only
// call, silently dropping every custom app class in the process (confirmed
// against the pre-refactor noble-trader-admin-plugin-v0.2.10.zip backup and
// noble-trader-talaria/talaria-plugin-v0.2.10.zip, both of which still define
// them). Each plugin body now restores its own `CSS` template literal and
// passes it here rather than reintroducing a second <style> tag.
function ensureStyle(styleId, customCss) {
  let style = document.getElementById(styleId)
  if (!style) {
    style = document.createElement('style')
    style.id = styleId
    document.head.appendChild(style)
  }
  style.textContent = DAISY_CSS + (customCss || '')
}




















































































// shared-logic.js — single source of truth for logic duplicated (and drifted)
// between noble-trader-admin and talaria desktop plugins.
//
// Both plugin.js files are loaded by Electron as uncompiled ESM with NO imports
// allowed beyond `react` / `react/jsx-runtime` / `@hermes/plugin-sdk`. Therefore
// this file is NOT import()'d at runtime — it is TEXTUALLY CONCATENATED into
// each plugin.js by scripts/build-plugins.py before the per-plugin body.
//
// Reconciliation policy (worklog/20260824):
//   - the 20 byte-identical functions copied verbatim;
//   - the 6 drifted functions unified to the talaria SUPERTSET variant
//     (additive: more params/defaults) which is a strict superset admin can consume.
//
// NOT wrapped in an IIFE: this content is concatenated directly into each
// plugin.js's top-level module scope, ahead of the per-plugin body, so the
// body can call these functions/consts by bare name. An IIFE wrapper here
// would scope every declaration to itself, making them invisible to the
// body (confirmed 2026-08-24: this exact regression broke both plugins —
// every one of these functions was unreachable, throwing "X is not defined"
// the instant register() ran).

// Restored 2026-08-24 from noble-trader-talaria/talaria-plugin-v0.2.10.zip — the 2026-08-24
// consolidation truncated this to 3 generic keys (aggressive/moderate/conservative), but real
// sweep rows carry aggression as passive/mid/aggressive (confirmed against the render harness's
// own mock data), so those never matched and always fell back to generic title-casing.
// Restored 2026-08-24 from the same v0.2.10 backup — was truncated to 3 generic keys
// (bull/bear/neutral), but real regime labels are composite (low_vol_strong_bull,
// high_vol_bear, low_vol_chop, …) and never matched, so the friendly emoji labels never
// actually appeared for real data (only for a bare "bull"/"bear"/"neutral" that nothing emits).
// HOT_TTL_MS/HOT_MAX were already in build-plugins.py's SHARED_CONST list but never actually
// declared here — a pre-existing gap from before the 2026-08-24 consolidation. Confirmed both are
// genuinely used by the ORIGINAL HotSignalsBanner (see below) via the same v0.2.10 backup:
// HOT_TTL_MS gates the "last 10m" window, HOT_MAX caps the chip list at the top 5 by Kelly.
// Restored 2026-08-24 from the same v0.2.10 backup — the consolidation truncated this to 2 keys
// mapping to plain slug strings ({ strong_bull: 'strong-bull', ... }), but metaRegimeInfo() (and
// the Sizing-what-if panel that reads its return value) needs { mult, aggressiveness } per regime;
// that shape existed here originally and was lost, which is what caused the Sizing-what-if crash
// documented in worklog/20260824_scope_implementation_and_build_verification.md.


// Restored 2026-08-24 from noble-trader-talaria/talaria-plugin-v0.2.10.zip. The consolidation
// replaced both this and metaRegimeInfo with a 2-arg/simple-shape pair that didn't match either
// plugin's actual call site (sizingWhatIf(eqUsd, kellyIn, regimeLabel, portDd), reading
// sizing.baseline/.final/.capHit) — this is the real fix for the Sizing-what-if crash a 2026-08-24
// verification pass only null-guarded (see worklog/20260824_scope_implementation_and_build_verification.md).
// SizingEngine what-if: baseline = equity × kelly × regime mult, then a drawdown clip
// ddClip = clamp(1 − dd/max_dd, 0.25, 1.0), capped at 5% of equity.


// NOTE (2026-08-24 verification pass): both functions below were missing the
// PostgREST '/rest/v1/' path prefix entirely — fetchSupabase built URLs like
// 'https://<project>.supabase.co' + 'nt_sweep_result' (no separator at all,
// concatenating straight into '.cont_sweep_result'), so every useSupabaseData
// call in both plugins silently failed. Confirmed via the talaria render
// harness ("Unexpected fetch URL: https://...supabase.cont_sweep_result").


// ConnectTab \u2014 shared between admin and talaria, which need genuinely different
// forms: admin connects with its own Supabase URL/anon key; talaria (Option A,
// 2026-08-10) embeds those as service defaults and only ever asks for a claim
// token. Branches on `variant: 'talaria'` rather than forking the component,
// so the two stay reconciled in one place. Restores the claim_token field that
// was dropped entirely in the 2026-08-24 shared-logic consolidation \u2014 talaria
// users who needed to enter/replace a token had no UI path to do so (the
// render harness's own "no config" scenario already asserted this exact
// contract \u2014 'Claim token' field, 'Save & Validate' button, Supabase fields
// hidden, 'pre-configured' hint \u2014 it just never matched the shipped markup).

// ensureStyle — UNIFIED (B2-1). Moved here from per-plugin bodies to eliminate
// the document.head clobber drift: both plugins now call the SAME function with
// their own STYLE_ID const. No more duplicate/overwritten <style> elements on
// the shared Electron DOM. DAISY_CSS resolves from module top-level scope
// (declared before this file's content in the concat).
//
// `customCss` param added 2026-08-24: the pre-Batch-A source had TWO separate
// stylesheets per plugin — the vendored DAISY_CSS blob (own <style> tag) and a
// per-plugin `const CSS = [...].join('')` of hand-written app classes
// (.tla-card/.tla-pane-root/.nta-card/etc., injected into a SECOND <style>
// tag). Batch A's CSS trim collapsed this down to a single DAISY_CSS-only
// call, silently dropping every custom app class in the process (confirmed
// against the pre-refactor noble-trader-admin-plugin-v0.2.10.zip backup and
// noble-trader-talaria/talaria-plugin-v0.2.10.zip, both of which still define
// them). Each plugin body now restores its own `CSS` template literal and
// passes it here rather than reintroducing a second <style> tag.


// Restored 2026-08-24 from noble-trader-talaria/talaria-plugin-v0.2.10.zip (talaria variant) and
// noble-trader-admin-plugin-v0.2.10.zip (admin variant) \u2014 these were two genuinely DIFFERENT
// pre-refactor implementations (admin's own nta-*-classed version reads the raw useSupabaseData()
// hook result and filters `qualified` itself; talaria's tla-*-classed version takes an
// already-filtered plain array and uses `direction` not `signal`), not just a CSS-prefix
// difference. The 2026-08-24 consolidation replaced BOTH with a single { rows, newest, cutoff }
// shape neither call site (both still pass { signals }, unchanged) ever supplied, crashing on the
// first render. Branches on `variant` the same way ConnectTab does rather than forking the
// component.


// HOT_TTL_MS/HOT_MAX were already in build-plugins.py's SHARED_CONST list but never actually
// declared here — a pre-existing gap from before the 2026-08-24 consolidation. Confirmed both are
// genuinely used by the ORIGINAL HotSignalsBanner (see below) via
// noble-trader-talaria/talaria-plugin-v0.2.10.zip (a pre-refactor backup): HOT_TTL_MS gates the
// "last 10m" window, HOT_MAX caps the chip list at the top 5 by Kelly.


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

// ---------------------------------------------------------------------------
// Plugin config (localStorage-backed — same pattern as noble-trader-admin)
// ---------------------------------------------------------------------------
const CONFIG_FILE = 'talaria-config.json'
const CLAIM_CHECK_MS = 24 * 60 * 60 * 1000 // 24h subscription re-check
const DATA_POLL_MS = 300 * 1000 // 5min REST data fallback poll

// PostHog analytics (DAU/MAU tracking). CDN lazy-loaded to avoid blocking initial render.
// api_host: us.i.posthog.com (correct PostHog ingestion API host)
const POSTHOG_TOKEN = 'phc_v5U5tCF7ddSmDTtjbZDp3hoV236UjpnKdGNqMWNkjskx'
const POSTHOG_API_HOST = 'https://us.i.posthog.com'

// Plugin version — bumped per release. Shown in the pane + dashboard footers
// so the deployed build is verifiable in-app (2026-08-11).
// 0.2.4: hardening — error logging in register(), poll-failure visibility,
//        graceful degradation when Hermes SDK context is unavailable.
// 0.2.5: widget multi-placement — container-query responsive layout so the
//        signals pane adapts to ANY dock zone (default stays right of chat);
//        placement root-cause docs + delivery-chain watchdog in repo scripts.
// 0.2.6: toast freshness fix — only the newest unseen signal toasts per poll
//        tick (suppressToast flag in addSignal); poll interval 60s→10s so the
//        widget pane lags the live DB by ≤10s instead of ≤60s (6s sweep cadence).
// 0.2.7: widget newest-signal fix — the 20-row poll fed rows newest-first, so
//        .slice(0, RECENT_MAX) truncated the NEWEST rows out of recent[] and
//        the widget showed the OLDEST 12 of each batch (toast had the newest,
//        widget showed stale). Poll now feeds oldest→newest (reverse) so the
//        newest survives at recent[0]; addSignal always _emit()s so the pane
//        re-renders even on re-seen (ts <= watermark) rows.
// 0.2.13: (user correction 2026-08-19) fixed wrong workspace path in docs
// 0.2.14: Phase 2 — in-plugin version check banner (upgrade notice via GitHub Releases API)
const PLUGIN_VERSION = '0.2.18'

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

// Phase 2: in-plugin upgrade banner (2026-08-20)
// The plugin polls the public GitHub Releases API (no auth needed) for the
// latest Talaria release. If the deployed PLUGIN_VERSION is behind the latest
// release tag, an "Upgrade available" banner renders at the top of the
// dashboard. The banner is dismissed-per-version via localStorage so a user
// who silences v0.2.14 won't see it again until v0.2.15.
const GITHUB_RELEASES_URL = 'https://api.github.com/repos/lexingtontechus/noble-trader-talaria/releases/latest'
const UPDATE_CHECK_KEY = 'talaria-update-dismissed' // localStorage: JSON { [tag]: true }


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

// COUNT helper — PostgREST count via Prefer: count=exact header → X-Total-Count.
// Used by the shared poll to populate signalStore.qualifiedCount60m (the single
// count source of truth across toast, widget, chip, and dashboard surfaces).


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

// Aggregate daily rows into rolling N-month buckets (newest first).
// Each daily row: { day: 'YYYY-MM-DD', paper_pnl, equal_wt_pnl, paper_minus_equal_wt }
// Returns: [{ month: 'YYYY-MM', paper_pnl, equal_wt_pnl, delta }, ...] newest-first.


// ---------------------------------------------------------------------------
// Remote data hook — polls Supabase REST every 60s (the data fallback that
// keeps the dashboard alive when the Realtime socket is down)
// ---------------------------------------------------------------------------


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
const CHIP_POLL_MS = 10 * 1000 // FIX (2026-08-14): 60s→10s. Signals qualify every
  // ~6s (sweep cadence) but the widget only re-fetched every 60s, lagging the
  // live DB. 10s captures nearly all new qualified signals within one tick.
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
      // Parallel: 20 newest rows (for display list + card) AND the COUNT of
      // ALL qualified signals in the last 60m (single source of truth for the
      // toast/footer count + widget/chip/dashboard badges — 2026-08-14
      // harmonization fix). The 20-row batch is capped by Supabase LIMIT and
      // cannot represent the true 60m count, so a separate COUNT query via
      // Prefer: count=exact (X-Total-Count header) is the authoritative number.
      const cutoff60m = new Date(Date.now() - 60 * 60 * 1000).toISOString().slice(0, 19)
      const [rows, count] = await Promise.all([
        fetchSupabase(cfg, 'nt_sweep_result', {
          select: 'symbol,signal,effective_kelly,kelly_f,entry_price,stop_loss,take_profit,sweep_timestamp,qualified,regime',
          qualified: 'eq.true',
          order: 'sweep_timestamp.desc', limit: '20',
        }),
        fetchSupabaseCount(cfg, 'nt_sweep_result', {
          qualified: 'eq.true',
          sweep_timestamp: `gte.${cutoff60m}`,
          select: 'id',
        }),
      ])
      signalStore.qualifiedCount60m = count || 0
      // FIX (2026-08-14 #3): feed rows OLDEST→NEWEST (reverse of the desc fetch)
      // so each addSignal's unshift keeps the NEWEST at position 0 — the
      // .slice(0, RECENT_MAX) cap then retains the newest rows. Previously the
      // desc loop unshifted newest-first, pushing the newest rows to the tail
      // where the cap truncated them — the widget could never show the newest
      // signal (only the oldest 12 of the batch survived).
      const batch = (rows || []).filter(
        (r) => r.qualified && String(r.signal || '').toLowerCase() !== 'neutral' && r.sweep_timestamp
      ).reverse()
      batch.forEach((r, i) => {
        const isNewest = i === batch.length - 1
        signalStore.addSignal({
          symbol: r.symbol,
          direction: r.signal,
          kelly: Number(r.effective_kelly != null ? r.effective_kelly : r.kelly_f) || 0,
          regime: r.regime,
          entry: r.entry_price,
          stop: r.stop_loss,
          take: r.take_profit,
          ts: r.sweep_timestamp,
        }, { suppressToast: !isNewest })
      })
    } catch (e) { /* poll fallback — log for diagnostics, next tick retries */ _log('error', 'signal poll failed: ' + (e && e.message ? e.message : String(e))) }
  }
  poll()
  const timer = setInterval(poll, CHIP_POLL_MS)
  return () => clearInterval(timer)
}

// RELATIVE-AGE + UTC formatters for the toast footer ("how current").
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


// Aggression label + emoji map (mirrors discord.py signal delivery, 2026-08-08).


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
              React.createElement('td', { className: 'tla-regime-cell', style: { color: isBuy ? 'var(--ui-accent)' : isSell ? 'var(--ui-danger)' : 'var(--ui-text-tertiary)' } }, fmtRegime(r.regime)),
              React.createElement('td', { className: 'tla-agg-cell' }, fmtAggression(r.aggression)),
              React.createElement('td', { className: 'tla-pwin-cell', style: { color: fmtPwinColor(r.markov_p_up) } }, Number(r.markov_p_up) != null ? fmtKellyPct(r.markov_p_up) : '—'),
              React.createElement('td', { className: 'tla-pwin-cell', style: { color: fmtPwinColor(r.markov_p_dn) } }, Number(r.markov_p_dn) != null ? fmtKellyPct(r.markov_p_dn) : '—'),
              React.createElement('td', { className: 'tla-shift-cell' }, r.regime_shift ? '⚡' : '—'),
              React.createElement('td', { className: 'tla-prev-cell' }, fmtRegimeShort(r.prev_regime)),
              React.createElement('td', { className: cn('tla-sig-cell', isBuy ? 'tla-pos' : isSell ? 'tla-neg' : ''), style: { color: isBuy ? 'var(--ui-accent)' : isSell ? 'var(--ui-danger)' : 'var(--ui-text-tertiary)' } }, sig === 'neutral' || !sig ? '—' : sig.toUpperCase()),
              React.createElement('td', { className: 'tla-kelly-cell', style: { color: isBuy ? 'var(--ui-accent)' : isSell ? 'var(--ui-danger)' : 'var(--ui-text-tertiary)' } }, kellyVal.toFixed(3)),
              React.createElement('td', { className: 'tla-kelly-fCell' }, Number(r.kelly_f) != null ? Number(r.kelly_f).toFixed(3) : '—'),
              React.createElement('td', { className: 'tla-pwin-cell', style: { color: fmtPwinColor(r.p_win) } }, Number(r.p_win) != null ? fmtKellyPct(r.p_win) : '—'),
              React.createElement('td', { className: 'tla-ev-cell', style: { color: fmtEvColor(r.ev) } }, Number(r.ev) != null ? '$' + Number(r.ev).toFixed(2) : '—'),
              React.createElement('td', { className: 'tla-price-cell' }, Number(r.entry_price) > 0 ? fmtBrickPrice(r.entry_price) : '—'),
              React.createElement('td', { className: 'tla-price-cell', style: { color: 'var(--ui-danger)' } }, Number(r.stop_loss) > 0 ? fmtBrickPrice(r.stop_loss) : '—'),
              React.createElement('td', { className: 'tla-price-cell', style: { color: 'var(--ui-accent)' } }, Number(r.take_profit) > 0 ? fmtBrickPrice(r.take_profit) : '—'),
              React.createElement('td', { className: 'tla-conf-cell' }, Number(r.regime_conf) != null ? (r.regime_conf * 100).toFixed(0) + '%' : '—'),
              React.createElement('td', { className: 'tla-conf-cell' }, (r.p_timesfm != null && r.p_timesfm !== '') ? fmtKellyPct(r.p_timesfm) : '—'),
              React.createElement('td', { className: 'tla-sizemult-cell' }, Number(r.size_mult) != null ? '×' + Number(r.size_mult).toFixed(2) : '—'),
            )
          })
        ]
      }),
    ),
  ),
    // Below-table context removed (2026-08-15): EV, P_win, and TimesFM forecast
    // are now a single standalone panel below Markov + pattern in the dashboard.
    // This table only renders the table itself.
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

// ─── TalariaMark — broad-bolt SVG (brand guide section 09, Bronze #B8823D) ──
// Rendered inline in every tla-header instance: dashboard, ConnectTab, and
// the signals pane header. Must be declared BEFORE any component that uses it
// (ESM ordering — helpers before consumers, per AGENT_INSTRUCTIONS.md).
const TalariaMark = ({ className = 'tla-mark', size = 24, color = '#B8823D' }) =>
  React.createElement('svg',
    { className, width: size, height: size, viewBox: '0 0 100 100', 'aria-hidden': true,
      style: { display: 'inline-block', flexShrink: 0, width: size + 'px', height: size + 'px' } },
    React.createElement('circle', { cx: 24, cy: 76, r: 8, fill: 'none', stroke: color, strokeWidth: 6 }),
    React.createElement('path', { d: 'M28 70 L44 50 L38 64 L56 40 L48 58 L68 32 L58 52 L82 18 L70 46 L88 8', fill: 'none', stroke: color, strokeWidth: 11, strokeLinejoin: 'miter', strokeLinecap: 'butt' }),
  )

// 0.2.11: TradingView lightweight-charts constants + helpers for watchlist mini-charts.
// 0.2.11: TradingView lightweight-charts CDN constant (retained for future use)
const TV_LWCHARTS_CDN = 'https://unpkg.com/lightweight-charts@4.3.0/dist/lightweight-charts.standalone.production.js'
const TV_TIMEFRAME_NUM = '5'  // 5-minute charts via TradingView widget

// Static fallback map for TradingView symbol format (used when the nt_symbol
// table hasn't provided a tradingview_symbol value for a symbol).
// The dynamic map (tvSymbolBySym) is built from nt_symbol.tradingview_symbol
// fetched via useSupabaseData at runtime — that is the source of truth.
const TV_SYMBOL_MAP = {
  BTCUSD: 'COINBASE:BTCUSD',
  ETHUSD: 'COINBASE:ETHUSD',
  SOLUSD: 'COINBASE:SOLUSD',
  XAUUSD: 'OANDA:XAUUSD',
  XAUEUR: 'OANDA:XAUEUR',
  XAUAUD: 'OANDA:XAUAUD',
  XAGUSD: 'OANDA:XAGUSD',
  USDJPY: 'OANDA:USDJPY',
  EURUSD: 'OANDA:EURUSD',
  GBPUSD: 'OANDA:GBPUSD',
  AUDUSD: 'OANDA:AUDUSD',
  USDCAD: 'OANDA:USDCAD',
  US500: 'PEPPERSTONE:US500',
  US30USD: 'PEPPERSTONE:US30USD',
  UK100: 'PEPPERSTONE:UK100',
  DXY: 'TVC:DXY',
}

// 0.2.11: Build a TradingView widgetembed iframe URL for the given symbol.
// Loads 5M candles directly from TradingView's servers (TDVA-equivalent data)
// without requiring a RapidAPI key in the desktop client.
function tvWidgetUrl(sym, tvSymbolMap) {
  const tvSym = (tvSymbolMap && tvSymbolMap[sym]) || TV_SYMBOL_MAP[sym] || `OANDA:${sym}`
  const params = new URLSearchParams({
    frameElementId: `hermes-tv-chart-${sym}`,
    symbol: tvSym,
    interval: TV_TIMEFRAME_NUM,
    hidesidetoolbar: '0',
    symboledit: '0',
    saveimage: '0',
    toolbarbg: '0d1623',
    studies: '[]',
    theme: 'dark',
    style: '1',
    timezone: 'Etc/UTC',
    withdateranges: '0',
    hidevolume: '1',
    locale: 'en',
  })
  return `https://s.tradingview.com/widgetembed/?${params.toString()}`
}

// 0.2.11: Full-width TV chart panel — uses TradingView iframe widget for price data.
// Loads 5M candles directly from TradingView (TDVA-equivalent) via the widgetembed
// iframe, with ENTRY/SL/TP overlay hints from sweep data. No external API key needed.
function TalariaTvChart({ symbol, sweepRow, tvSymbolMap }) {
  const iframeRef = React.useRef(null)
  const [loaded, setLoaded] = React.useState(false)
  const [ready, setReady] = React.useState(false)
  const [error, setError] = React.useState(false)

  const src = symbol ? tvWidgetUrl(symbol, tvSymbolMap) : ''

  // Reset state when symbol changes
  React.useEffect(() => {
    setLoaded(false)
    setReady(false)
    setError(false)
    if (iframeRef.current) {
      iframeRef.current.src = src || 'about:blank'
    }
  }, [symbol])

  // Build TV symbol overlay labels (ENTRY/SL/TP) for hint display
  const signalLevels = []
  if (sweepRow) {
    if (sweepRow.entry_price != null && Number(sweepRow.entry_price) > 0)
      signalLevels.push({ label: 'ENTRY', price: Number(sweepRow.entry_price) })
    if (sweepRow.stop_loss != null && Number(sweepRow.stop_loss) > 0)
      signalLevels.push({ label: 'SL', price: Number(sweepRow.stop_loss) })
    if (sweepRow.take_profit != null && Number(sweepRow.take_profit) > 0)
      signalLevels.push({ label: 'TP', price: Number(sweepRow.take_profit) })
  }

  const levelHint = signalLevels
    .map((lv) => `${lv.label}: ${lv.price.toFixed(2)}`)
    .join(' · ') || 'No signal levels'

  const hint = symbol
    ? `TradingView 5M candles (TDVA-equivalent via widgetembed iframe). Signal levels — ${levelHint}. TradingView loads price data directly from its own servers; no API key required.`
    : 'Select a symbol in the Renko panel to load the TradingView chart.'

  return React.createElement('div', { className: 'tla-card tla-tv-chart-card' },
    React.createElement('h3', null, `TradingView reference chart — ${symbol || 'select a symbol'}`),
    React.createElement('div', {
      className: cn('tla-tv-canvas-wrapper', loaded ? 'tla-tv-ready' : 'tla-tv-pending'),
    },
      symbol
        ? React.createElement('iframe', {
            key: symbol,              // force remount when symbol changes (reload iframe)
            ref: iframeRef,
            src: src,
            title: `TradingView 5M chart for ${symbol}`,
            className: 'tla-tv-iframe',
            onLoad: () => { setLoaded(true); setReady(true) },
            onError: () => { setError(true); setLoaded(true) },
            style: { width: '100%', height: '320px', border: 'none', opacity: ready ? 1 : 0, transition: 'opacity 0.3s' },
          })
        : React.createElement('div', {
            className: 'tla-tv-svg-fallback',
            style: { display: 'flex', alignItems: 'center', justifyContent: 'center', height: '320px' },
          },
            React.createElement('span', { className: 'tla-hint', style: { color: 'var(--ui-text-tertiary)', fontSize: '12px' } },
              'Select a symbol in the Renko panel above — the TradingView chart will load here.')
          )
    ),
    React.createElement('div', { className: 'tla-hint' }, hint)
  )
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
  qualifiedCount60m: undefined, // live: Supabase COUNT of qualified signals in last 60m —
  // single source of truth for the toast footer count, widget badge, chip badge,
  // and dashboard stat (2026-08-14 harmonization — all 4 surfaces now agree).
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
  // opts.suppressToast: when true, still updates recent[]/lastSignal/unread but
  // skips the host.notify toast (used by the 60s poll to toast ONLY the newest
  // signal in a desc-ordered batch — 2026-08-14 fix for toast showing stale
  // oldest-in-batch content).
  addSignal(sig, opts) {
    const suppressToast = !!(opts && opts.suppressToast)
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
    // CROSS-SURFACE CONSISTENCY (2026-08-14 user: toast+widget+dashboards
    // must show the SAME latest signal). lastSignal is the single source of
    // truth for "latest signal" across the toast (L811), widget card
    // (L2326-2332, falls back to last when stale), and dashboards
    // (feed signalStore via addSignal L1899). Always refresh it to the newest
    // incoming signal so a stale lastSignal (e.g. persisted before the pricing
    // feature, or signals that arrived during dashboardActive where only
    // watermark advanced L787 without touching lastSignal) can't make the
    // widget card lag the toast.
    if (!this.lastSignal || ts > (Date.parse(this.lastSignal.ts) || 0)) {
      this.lastSignal = { symbol: sig.symbol, direction: sig.direction, kelly: sig.kelly, regime: sig.regime, entry: sig.entry, stop: sig.stop, take: sig.take, ts: sig.ts }
    }
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
        // FIX (2026-08-14): skip the host.notify when suppressToast is set —
        // the poll feeds 20 desc-ordered rows reversed (oldest→newest) but only
        // the newest (last-fed) should produce a toast (older rows would replace
        // it with stale content). unread/lastSignal/store updates still happen
        // for all rows.
        if (!suppressToast && host && typeof host.notify === 'function') {
          const dir = String(sig.direction || '').toLowerCase() === 'sell' ? 'SELL' : 'BUY'
          // HARMONIZATION (2026-08-14): use signalStore.qualifiedCount60m — the
          // shared Supabase COUNT of all qualified signals in the last 60m — so
          // the toast footer shows the SAME count as the widget badge, chip
          // badge, and dashboard stat. Previously _toastCount was a cumulative
          // toasts-fired counter (e.g. "+20 more") which did NOT match any of
          // those surfaces. Regime label is placed FIRST in the footer (before
          // datetime + age) per user preference.
          const regimeLabel = fmtRegime(sig.regime)
          const liveCount = signalStore.qualifiedCount60m
          const countLabel = liveCount > 0 ? ` · ${liveCount} live signals` : ''
          // ENTRY price in the toast message when available (2026-08-11 —
          // user flagged the toast showed "old format w/o pricing").
          const entryLabel = Number(sig.entry) > 0 ? ` · ENTRY ${fmtBrickPrice(sig.entry)}` : ''
          const footerParts = [
            regimeLabel,
            fmtSignalTime(ts),
            fmtAge(ts),
          ].filter(Boolean)
          const footer = footerParts.join(' · ') + countLabel
          try {
            host.notify({
              id: SIGNAL_TOAST_ID,
              kind: 'info',
              // FIX (2026-08-17): pin placement to 'default' (top-center) so the
              // signal toast does NOT overlap the chat composer controls in the
              // bottom-right corner. The app's defaultPlacement() routes bare
              // 'info' notifications to 'bottom-right' — overriding here.
              placement: 'default',
              // FIX (2026-08-17): when the user manually dismisses the toast
              // (clicks the X), advance the watermark via markSeen() so the
              // same signal does NOT re-toast on the next 10s poll tick or
              // realtime rebroadcast. Without this, dismissed toasts reappear
              // ~5-10s later because the store watermark was never advanced
              // (the dismissal only removes the notification from the app's
              // stack, it doesn't touch signalStore).
              onDismiss: () => { try { signalStore.markSeen() } catch (e) {} },
              title: 'Talaria signal',
              message: `${sig.symbol} ${dir}${sig.kelly != null ? ' · kelly ' + Number(sig.kelly).toFixed(3) : ''}${entryLabel}`,
              meta: footer,
              durationMs: 0,
            })
          } catch (e) {}
        }
      }
    }
    // FIX (2026-08-14): ALWAYS _emit() when recent[] was updated — previously
    // _emit() only fired inside `if (ts > this.watermark)`, so re-seen rows
    // (ts <= watermark, the common case for 19/20 poll rows) updated recent[]
    // but never notified subscribers → the widget pane showed STALE data and
    // never re-rendered between poll ticks. The 30s PANE_TICK_MS age-refresh
    // only re-sorted existing recent[], it never pulled new rows into view.
    this._persist()
    this._emit()
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

// Restored 2026-08-24 from noble-trader-talaria/talaria-plugin-v0.2.10.zip (a
// pre-Batch-A backup) — Batch A's DAISY_CSS trim silently dropped this entire
// custom-class stylesheet (it was a SEPARATE `const CSS = [...].join('')`,
// injected into its own <style> tag, not part of the vendored daisyUI blob).
// Base .tla-btn/.tla-btn-secondary/.tla-btn:hover/.tla-badge/.tla-table
// (+ th/td/tbody-tr:hover) rules are intentionally NOT restored here — B1's
// shared-css.js now defines those with different (deliberately unified admin+
// talaria) values, and re-adding the old ones would silently override that
// unification since this CSS is appended after DAISY_CSS. Everything else
// (cards, rows, badges color-modifiers, the signals-pane incl. its
// @container multi-placement rules, chip, banners, etc.) had no shared
// equivalent and is restored verbatim.
const CSS = `
.tla-root{display:flex;flex-direction:column;height:100%;gap:12px;padding:16px;overflow:auto;}
.tla-header{display:flex;align-items:center;justify-content:center;padding:10px 0 2px;font-size:1.15rem;font-weight:600;letter-spacing:.02em;border-bottom:1px solid var(--ui-stroke-secondary);margin-bottom:2px;gap:8px;}
.tla-mark{display:inline-block;flex-shrink:0;}
.tla-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:12px;}
.tla-card{background:var(--ui-panel);border:1px solid var(--ui-stroke-secondary);border-radius:8px;padding:12px;display:flex;flex-direction:column;gap:8px;}
.tla-card h3{margin:0;font-size:12px;font-weight:600;color:var(--ui-text-secondary);text-transform:uppercase;letter-spacing:0.04em;}
.tla-card .tla-value{font-size:26px;font-weight:700;color:var(--ui-text-primary);}
.tla-card .tla-sub{font-size:11px;color:var(--ui-text-quaternary);}
.tla-row{display:flex;justify-content:space-between;align-items:baseline;padding:3px 0;font-size:12px;}
.tla-row .tla-k{color:var(--ui-text-tertiary);}
.tla-row .tla-v{color:var(--ui-text-primary);font-variant-numeric:tabular-nums;}
.tla-pos{color:var(--ui-accent);}
.tla-neg{color:var(--ui-danger);}
.tla-table .tla-sm{font-size:9px;color:var(--ui-text-secondary);font-variant-numeric:tabular-nums;white-space:nowrap;}
.tla-kelly-table .tla-regime-cell{font-size:14px;font-weight:600;}
.tla-kelly-table .tla-agg-cell{font-size:13px;font-weight:600;}
.tla-kelly-table .tla-sig-cell{font-size:13px;font-weight:700;text-transform:uppercase;}
.tla-kelly-table .tla-kelly-cell{font-size:16px;font-weight:700;font-variant-numeric:tabular-nums;}
.tla-kelly-table .tla-kelly-fCell{font-size:9px;color:var(--ui-text-secondary);font-variant-numeric:tabular-nums;}
.tla-kelly-table .tla-pwin-cell{font-size:11px;font-variant-numeric:tabular-nums;}
.tla-kelly-table .tla-ev-cell{font-size:11px;font-variant-numeric:tabular-nums;}
.tla-kelly-table .tla-price-cell{font-size:10px;font-variant-numeric:tabular-nums;}
.tla-kelly-table .tla-conf-cell{font-size:10px;color:var(--ui-text-tertiary);font-variant-numeric:tabular-nums;}
.tla-kelly-table .tla-ts-cell{font-size:9px;color:var(--ui-text-tertiary);font-variant-numeric:tabular-nums;}
.tla-kelly-table .tla-shift-cell{font-size:12px;text-align:center;}
.tla-kelly-table .tla-prev-cell{font-size:11px;color:var(--ui-text-secondary);}
.tla-kelly-table .tla-sizemult-cell{font-size:9px;color:var(--ui-text-secondary);}
.tla-kelly-table .tla-group-header td{font-size:11px;font-weight:600;color:var(--ui-text-tertiary);border-bottom:1px solid var(--ui-stroke-secondary);}
.tla-kelly-table-wrap{overflow-x:auto;}
.tla-context-card .tla-context-value{font-size:20px;font-weight:700;}
.tla-context-card .tla-context-sub{font-size:10px;color:var(--ui-text-quaternary);}
.tla-badge.open{background:rgba(120,220,120,0.15);color:var(--ui-success);}
.tla-badge.closed{background:rgba(76,154,255,0.15);color:var(--ui-accent);}
.tla-badge.opened{background:rgba(76,154,255,0.15);color:var(--ui-accent);}
.tla-badge.equity{background:rgba(153,153,153,0.15);color:var(--ui-text-tertiary);}
.tla-badge.active{background:rgba(120,220,120,0.15);color:var(--ui-success);}
.tla-badge.grace{background:rgba(240,180,60,0.15);color:var(--ui-accent);}
.tla-hot{display:flex;flex-wrap:wrap;gap:8px;align-items:stretch;margin-top:8px;}
.tla-hot-card h3{margin-bottom:2px;}
.tla-hot-ts{display:block;font-size:10px;color:var(--ui-text-quaternary);margin-bottom:2px;}
.tla-hot-chip{display:flex;flex-direction:row;align-items:center;gap:6px;padding:6px 10px;border-radius:8px;border:1px solid var(--ui-stroke-secondary);}
.tla-hot-chip .tla-hot-sym{font-size:13px;font-weight:700;color:var(--ui-text-primary);}
.tla-hot-chip .tla-hot-kelly{font-size:11px;font-variant-numeric:tabular-nums;color:var(--ui-text-secondary);margin-left:4px;}
.tla-hot-chip .tla-hot-dir{font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:0.06em;padding:2px 5px;border-radius:4px;}
.tla-hot-chip .tla-hot-regime{font-size:10px;color:var(--ui-text-tertiary);margin-left:2px;white-space:nowrap;}
.tla-hot-buy{background:rgba(76,154,255,0.10);border-color:rgba(76,154,255,0.35);}
.tla-hot-buy .tla-hot-dir{color:var(--ui-text-on-accent);background:var(--ui-accent);}
.tla-hot-sell{background:rgba(255,92,92,0.10);border-color:rgba(255,92,92,0.35);}
.tla-hot-sell .tla-hot-dir{color:var(--ui-text-on-accent);background:var(--ui-danger);}
.tla-err{color:var(--ui-danger);font-size:12px;padding:8px;}
.tla-ok{color:var(--ui-success);font-size:12px;}
.tla-hint{color:var(--ui-text-quaternary);font-size:11px;}
.tla-explainer{color:var(--ui-text-secondary);font-size:11px;line-height:1.55;background:rgba(127,127,127,0.07);border-left:3px solid var(--ui-accent);padding:7px 10px;margin:8px 0 10px;border-radius:0 6px 6px 0;}
.tla-field{display:flex;flex-direction:column;gap:4px;margin-bottom:10px;}
.tla-field label{font-size:11px;color:var(--ui-text-tertiary);}
.tla-field input{background:var(--ui-panel);border:1px solid var(--ui-stroke-secondary);color:var(--ui-text-primary);border-radius:6px;padding:7px 10px;font-size:12px;font-family:inherit;}
.tla-btn-secondary:hover{border-color:var(--ui-accent);color:var(--ui-accent);opacity:1;}
.tla-banner{display:flex;align-items:center;gap:8px;padding:8px 12px;border-radius:8px;font-size:12px;background:rgba(240,180,60,0.10);border:1px solid rgba(240,180,60,0.35);color:var(--ui-accent);}
.tla-banner-paywall{background:rgba(255,92,92,0.10);border-color:rgba(255,92,92,0.35);color:var(--ui-danger);}
.tla-center{display:flex;flex-direction:column;align-items:center;justify-content:center;height:100%;gap:14px;padding:24px;text-align:center;}
.tla-title{font-size:18px;font-weight:700;color:var(--ui-text-primary);}
.tla-brick-picker{display:flex;flex-wrap:wrap;gap:8px;margin:8px 0 10px;}
.tla-brick-btn{background:transparent;border:1px solid var(--ui-stroke-secondary);border-radius:8px;color:var(--ui-text-secondary);padding:6px 14px;font-size:12px;font-weight:600;cursor:pointer;font-family:inherit;letter-spacing:0.03em;}
.tla-brick-btn:hover{border-color:var(--ui-accent);color:var(--ui-accent);}
.tla-brick-btn-active{background:rgba(76,154,255,0.18);border-color:var(--ui-accent);color:var(--ui-accent);}
.tla-mini-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:8px;}
.tla-inline{display:flex;flex-wrap:wrap;gap:12px;align-items:center;font-size:12px;}
.tla-badge.overconfident{background:rgba(255,92,92,0.15);color:var(--ui-danger);}
.tla-badge.underconfident{background:rgba(120,220,120,0.15);color:var(--ui-success);}
.tla-badge.calibrated{background:rgba(153,153,153,0.15);color:var(--ui-text-tertiary);}
.tla-badge.sig{background:rgba(120,220,120,0.15);color:var(--ui-success);}
.tla-chip{display:inline-flex;align-items:center;gap:6px;height:100%;padding:0 8px;font-size:11px;font-weight:500;color:var(--ui-text-tertiary);background:transparent;border:none;cursor:pointer;font-family:inherit;letter-spacing:0.02em;}
.tla-chip:hover{color:var(--ui-text-primary);background:rgba(127,127,127,0.08);}
.tla-chip .tla-chip-dot{width:6px;height:6px;border-radius:50%;background:var(--ui-text-quaternary);flex-shrink:0;}
.tla-chip.tla-chip-hot{color:var(--ui-accent);font-weight:700;}
.tla-chip.tla-chip-hot .tla-chip-dot{background:var(--ui-accent);}
.tla-pane-root{display:flex;flex-direction:column;height:100%;width:100%;min-width:0;box-sizing:border-box;gap:8px;padding:10px;overflow:auto;font-size:12px;container-type:inline-size;}
.tla-pane-header{display:flex;align-items:center;gap:8px;font-weight:600;color:var(--ui-text-primary);padding-bottom:6px;border-bottom:1px solid var(--ui-stroke-secondary);}
.tla-pane-badge{background:var(--ui-accent);color:#fff;border-radius:10px;padding:1px 8px;font-size:10px;font-weight:700;}
.tla-pane-open{margin-left:auto;background:transparent;border:1px solid var(--ui-stroke-secondary);color:var(--ui-text-secondary);border-radius:6px;padding:2px 8px;font-size:10px;cursor:pointer;font-family:inherit;}
.tla-pane-open:hover{border-color:var(--ui-accent);color:var(--ui-accent);}
.tla-pane-last{display:flex;flex-wrap:wrap;align-items:center;gap:6px;padding:8px;border:1px solid var(--ui-stroke-secondary);border-radius:8px;}
.tla-pane-sym{font-size:14px;font-weight:700;color:var(--ui-text-primary);}
.tla-pane-dir{font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:0.06em;padding:2px 5px;border-radius:4px;}
.tla-pane-buy{color:#fff;background:var(--ui-accent);}
.tla-pane-sell{color:#fff;background:var(--ui-danger);}
.tla-pane-kelly{font-size:11px;color:var(--ui-text-secondary);font-variant-numeric:tabular-nums;}
.tla-pane-regime{font-size:10px;color:var(--ui-text-tertiary);}
.tla-pane-ts{font-size:10px;color:var(--ui-text-quaternary);width:100%;}
.tla-pane-price{display:flex;flex-wrap:wrap;gap:8px;width:100%;margin-top:4px;font-size:10px;font-variant-numeric:tabular-nums;padding-top:4px;border-top:1px solid var(--ui-stroke-secondary);}
.tla-pane-price-entry{color:var(--ui-text-primary);}
.tla-pane-price-sl{color:var(--ui-danger);}
.tla-pane-price-tp{color:var(--ui-accent);}
.tla-pane-hint{padding:4px 0;}
.tla-pane-list{display:flex;flex-direction:column;gap:4px;}
.tla-pane-row{display:flex;flex-wrap:wrap;align-items:center;gap:6px;width:100%;background:transparent;border:1px solid transparent;border-radius:6px;padding:5px 6px;color:var(--ui-text-primary);cursor:pointer;font-family:inherit;text-align:left;}
.tla-pane-row:hover{background:rgba(127,127,127,0.08);border-color:var(--ui-stroke-secondary);}
.tla-pane-price-row{flex-basis:100%;margin-top:2px;padding-top:2px;}
.tla-pane-row-sym{font-size:12px;font-weight:700;}
.tla-pane-row-kelly{font-size:10px;color:var(--ui-text-secondary);font-variant-numeric:tabular-nums;margin-left:auto;}
.tla-pane-row-regime{font-size:10px;color:var(--ui-text-tertiary);}
.tla-pane-row-ts{font-size:10px;color:var(--ui-text-quaternary);}
.tla-pane-foot{font-size:9px;color:var(--ui-text-quaternary);margin-top:auto;padding-top:6px;border-top:1px solid var(--ui-stroke-secondary);}
@container (min-width: 560px){
.tla-pane-root .tla-pane-list{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:6px;}
.tla-pane-root .tla-pane-last{flex-wrap:nowrap;}
.tla-pane-root .tla-pane-last .tla-pane-ts{width:auto;margin-left:auto;}
.tla-pane-root .tla-pane-price{flex-wrap:nowrap;gap:12px;}
}
`


// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------
// Adaptive price formatter: fewer decimals for large prices (XAU ~4095 → 2dp),
// more for small prices (FX ~1.08 → 5dp).


// ---------------------------------------------------------------------------
// Renko brick chart — SVG bricks (up green / down red), price axis on the
// right, brick-index axis on the bottom. Ported from the admin plugin.
// ---------------------------------------------------------------------------


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
  const gridLines = brickGridLines(pMin, pMax, pRange / 4)

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
        fill: up ? '#26a69a' : '#ef5350',
        fillOpacity: 0.85,
        stroke: up ? '#26a69a' : '#ef5350',
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
        stroke: 'var(--ui-text-tertiary,#888)', strokeOpacity: 0.25, strokeDasharray: '3 3',
      }),
      React.createElement('text', {
        x: BRICK_LEFT_PAD + bricks.length * BRICK_STEP + 5, y: y + 3,
        fill: 'var(--ui-text-secondary,#aaa)', fontSize: 11, fontFamily: 'monospace',
      }, fmtBrickPrice(p)),
    )
  })

  const idxEls = idxLabels.map((i) =>
    React.createElement('text', {
      key: 'i' + i,
      x: BRICK_LEFT_PAD + i * BRICK_STEP + BRICK_W / 2,
      y: height - 6,
      fill: 'var(--ui-text-tertiary,#888)', fontSize: 10, fontFamily: 'monospace', textAnchor: 'middle',
    }, String(i)),
  )

  // Axis titles: "Price" (right, rotated) + "Brick index" (bottom centre)
  const chartEndX = BRICK_LEFT_PAD + bricks.length * BRICK_STEP
  const axisTitles = [
    React.createElement('text', {
      key: 'pricetitle',
      x: BRICK_LEFT_PAD + bricks.length * BRICK_STEP + 42,
      y: BRICK_TOP_PAD + chartH / 2,
      fill: 'var(--ui-text-tertiary,#888)', fontSize: 10, fontFamily: 'sans-serif',
      textAnchor: 'middle',
      transform: `rotate(-90, ${BRICK_LEFT_PAD + bricks.length * BRICK_STEP + 42}, ${BRICK_TOP_PAD + chartH / 2})`,
    }, 'Price'),
    React.createElement('text', {
      key: 'idxtitle',
      x: BRICK_LEFT_PAD + chartEndX / 2 - BRICK_LEFT_PAD / 2,
      y: height - 1,
      fill: 'var(--ui-text-tertiary,#888)', fontSize: 10, fontFamily: 'sans-serif', textAnchor: 'middle',
    }, 'Brick index'),
  ]

  // Level lines — dashed horizontal, drawn ONLY when inside the visible brick
  // range. No on-chart labels (pricing is in the legend row below).
  const levelEls = (levels || [])
    .filter((lv) => lv.price != null && Number(lv.price) > 0)
    .filter((lv) => Number(lv.price) >= pMin && Number(lv.price) <= pMax)
    .map((lv) => {
      const y = priceToY(Number(lv.price))
      const color = lv.color || 'var(--ui-text-tertiary)'
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
      const color = lv.color || 'var(--ui-text-tertiary)'
      return React.createElement('span', {
        key: 'lg' + lv.label,
        style: { color, fontWeight: 600, marginRight: 14, fontSize: 11, fontFamily: 'monospace', whiteSpace: 'nowrap' },
      }, `${lv.label} ${fmtBrickPrice(Number(lv.price))}`)
    })

  return React.createElement('div', null,
    React.createElement('svg', {
      viewBox: `0 0 ${svgW} ${height}`,
      width: '100%',
      style: { display: 'block', maxHeight: 420, height: 'auto' },
    },
      gridEls,
      levelEls,
      rects,
      idxEls,
      axisTitles,
    ),
    levelLegend.length
      ? React.createElement('div', { style: { marginTop: 6, display: 'flex', flexWrap: 'wrap', alignItems: 'center' } },
          React.createElement('span', { style: { marginRight: 4, fontSize: 11, color: 'var(--ui-text-quaternary)' } }, 'levels:'),
          levelLegend,
        )
      : null,
    React.createElement('div', { className: 'tla-hint', style: { marginTop: 4 } },
      `${bricks.length} bricks (last ${bricks.length} of series) · up = buy (green #26a69a) · down = sell (red #ef5350) · last brick index ${bricks[bricks.length - 1].brick_index != null ? bricks[bricks.length - 1].brick_index : bricks.length - 1}`),
  )
}

// Kelly histogram — horizontal bars, value labels INSIDE bars when wide
// enough, 0 → max scale axis, regime/sub text after the bar. Ported from the
// admin plugin (same UX preferences).
// ---------------------------------------------------------------------------


// ---------------------------------------------------------------------------
// Hot signals banner — live 'signal' broadcasts + seed from nt_sweep_result
// (qualified, non-neutral, kelly present). 10-min TTL vs the newest signal,
// sorted by kelly desc, ~5 shown. Hidden entirely when empty (returns null).
// ---------------------------------------------------------------------------
// 10 min window vs the newest signal


// ---------------------------------------------------------------------------
// Pager — daisyUI join pagination with active button (2026-08-08)
// ---------------------------------------------------------------------------
const PAGE_SIZE = 8


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
    React.createElement('table', { className: cn('tla-table') },
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
      `${rows.length} rows · live broadcast + REST seed · 300s poll · PnL — for OPEN positions (realized only on close), so $0/blank is expected until the backend closes a trade · R-multiple = PnL ÷ risk per trade (R=1 means you made exactly one unit of risk)`),
  )
}

// ---------------------------------------------------------------------------
// Connect tab — claim token only (Option A, 2026-08-10). The Supabase URL +
// public anon key are embedded service defaults (DEFAULT_SUPABASE_URL /
// DEFAULT_ANON_KEY) and are never shown to the user. Save triggers the
// talaria-check; inline result shows ok / 401 / 404
// ('claim service not deployed') states.
// ---------------------------------------------------------------------------


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
        ? React.createElement('a', { className: cn('tla-btn'), href: url, target: '_blank', rel: 'noreferrer' },
            'Subscribe / pay')
        : React.createElement('div', { className: 'tla-hint', style: { textAlign: 'center' } },
            'No payment link available — subscribe from the Talaria portal.'),
      React.createElement('button', { className: cn('tla-btn', 'tla-btn-secondary'), onClick: onRetry },
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
      React.createElement('button', { className: cn('tla-btn'), onClick: onRetry },
        'Re-check now'),
    ),
  )
}

function PaywallScreen({ claim, onRetry, onChangeToken }) {
  const url = claim.next_charge_url || ''
  const status = claim.sub_status || 'expired'
  return React.createElement('div', { className: 'tla-center' },
    React.createElement('div', { className: 'tla-title' }, 'Talaria'),
    React.createElement('div', { className: 'tla-card', style: { maxWidth: 420, alignItems: 'center' } },
      React.createElement('h3', null, `Subscription ${status}`),
      React.createElement('div', { className: 'tla-banner tla-banner-paywall', style: { width: '100%' } },
        `Your ${claim.plan_slug || ''} subscription is ${status} — renew to keep receiving signals.`),
      url
        ? React.createElement('a', { className: cn('tla-btn'), href: url, target: '_blank', rel: 'noreferrer' },
            'Renew / pay')
        : React.createElement('div', { className: 'tla-hint', style: { textAlign: 'center' } },
            'No payment link available — renew from the Talaria portal.'),
      React.createElement('button', { className: cn('tla-btn', 'tla-btn-secondary'), onClick: onRetry },
        'Re-check'),
      // Previously the only way back to the Connect screen was an automatic
      // bad-token/error re-route — a user whose token was revoked/replaced
      // (not merely a lapsed subscription) had no way to enter a new one.
      onChangeToken ? React.createElement('button', {
        className: cn('tla-btn', 'tla-btn-secondary', 'tla-btn-sm'), onClick: onChangeToken,
        style: { marginTop: 4 },
      }, 'Use a different token') : null,
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


// Map a backend regime label to the sizing rule table. Mirrors the
// MetaRegimeClassifier display logic (sizing_multiplier + aggressiveness).
// Returns { mult, aggressiveness, tone } with tone 'pos'|'neg'|'warn'|undefined.


// Fit a 3-state (UP/DOWN/FLAT) Markov chain on the brick close prices and
// compute P(UP after 3 steps) from the last state's row of the transition
// matrix raised to the 3rd power (hand-rolled matrix multiply — no libs).
// FLAT is a real state (|delta| <= 1e-4), not dropped. Returns
// { pUp, pDown, n } or null when fewer than 10 closes.


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


// ---------------------------------------------------------------------------
// Talaria dashboard — hot-signal banner, kelly histogram, 10-brick renko
// chart (with ENTRY/SL/TP levels), Pro-only paper section.
// ---------------------------------------------------------------------------
function TalariaDashboard({ config, claim, latestRelease, onDismissUpgrade }) {
  const connected = !!(config.supabase_url && config.supabase_key)
  const isPro = claim.plan_slug === 'precision_pro'
  const [liveSignals, setLiveSignals] = React.useState([])
  const [paperEvents, setPaperEvents] = React.useState([])
  const [brickSym, setBrickSym] = React.useState(null)
  const [sigHealthPage, setSigHealthPage] = React.useState(1)
  // 0.2.11: Two-tab structure — Market (live per-symbol) + Analysis (historical/aggregate).
  const [activeTab, setActiveTab] = React.useState('market')

  // Live Realtime socket — must be declared before useSupabaseData
  // so wsState can gate REST polling for live signal channels (Option A).
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
  // Symbol list — plan-gated via nt_symbol.plan_ids cs. filter (UUID from the
  // server claim response, never client-derived). Intersected with the latest
  // sweep rows so ONLY ACTIVE symbols (those with a recent sweep) show in the
  // picker; falls back to the full plan list while sweeps are still loading.
  // Ordering is STABLE: grouped by asset_class (commodities → forex → crypto
  // → stocks) then symbol ASC — the raw sweep order changes every refresh.
  const hasPlanUuid = !!claim.plan_uuid
  const symbols = useSupabaseData(config, 'nt_symbol',
    { select: 'symbol,asset_class,tradingview_symbol', plan_ids: hasPlanUuid ? 'cs.{' + claim.plan_uuid + '}' : undefined },
    connected && hasPlanUuid)
  const planSymbols = (symbols.data || []).map((r) => r.symbol).filter(Boolean)
  const assetClassOf = {}
  const tvSymbolBySym = {}  // Internal symbol → TradingView symbol (from nt_symbol.tradingview_symbol)
  for (const r of (symbols.data || [])) {
    assetClassOf[r.symbol] = r.asset_class || 'other'
    if (r.tradingview_symbol) tvSymbolBySym[r.symbol] = r.tradingview_symbol
  }
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
  const calib = useSupabaseData(config, 'v_eod_calibration_bias_latest',
    { select: 'day,symbol,avg_predicted_p_win,realized_win_rate,bias,status,bias_raw,status_raw,n' },
    connected)
  // Paper book vs equal-weight baseline — Precision Pro only (migration 106).
  const vsOpt = useSupabaseData(config, 'v_paper_vs_optimized_daily',
    { select: 'day,paper_pnl,equal_wt_pnl,paper_minus_equal_wt', order: 'day.desc', limit: '180' },
    connected && isPro)
  // Long brick series (up to 200) for the Markov card — same symbol as the
  // 10-brick chart window, kept as a separate fetch.
  const brickSeries = useSupabaseData(config, 'nt_renko_bricks',
    { select: 'symbol,direction,open_price,close_price,high,low,brick_index,ts', order: 'session_date.desc,brick_index.desc', limit: '200', symbol: 'eq.' + activeBrickSym },
    connected && !!activeBrickSym)


  // Mode 1: opening the dashboard marks all current signals seen (badge
  // clears). Mark dashboardActive so addSignal advances watermark instead of
  // counting unread while the user is looking at the dashboard.
  React.useEffect(() => {
    signalStore.dashboardActive = true
    signalStore.markSeen()
    return () => { signalStore.dashboardActive = false }
  }, [])
  // Re-render when the shared qualifiedCount60m changes (poll updates it every
  // 10s) so the dashboard stat stays in lockstep with the widget/chip/toast.
  const [, setCountTick] = React.useState(0)
  React.useEffect(() => signalStore.subscribe(() => setCountTick((t) => t + 1)), [])

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
      levels.push({ label: 'ENTRY', price: Number(sweepRow.entry_price), color: 'var(--ui-text-primary)' })
    if (sweepRow.stop_loss != null && Number(sweepRow.stop_loss) > 0)
      levels.push({ label: 'SL', price: Number(sweepRow.stop_loss), color: 'var(--ui-danger)' })
    if (sweepRow.take_profit != null && Number(sweepRow.take_profit) > 0)
      levels.push({ label: 'TP', price: Number(sweepRow.take_profit), color: 'var(--ui-accent)' })
    }

    // --- Phase 2 derived analytics -------------------------------------------
    // Markov + pattern: pattern from the 10-brick window, Markov fit on the
    // longer (≤200) brick close series (desc fetch → reverse to ascending).
    const brickSeriesAsc = (brickSeries.data || []).reverse()
    const pattern = brickPattern(brickWindow)
    const markov = markovUpProbability(brickSeriesAsc.map((b) => Number(b.close_price)))

    // Most-qualified symbol's latest sweep row — used for the standalone
    // TimesFM forecast card (moved below Markov + pattern, 2026-08-15).
    const sweepRowsCtx = (sweeps.data || [])
    const latestBySymCtx = {}
    for (const r of sweepRowsCtx) { if (!latestBySymCtx[r.symbol]) latestBySymCtx[r.symbol] = r }
    const ctxRow = Object.values(latestBySymCtx).find((r) => r.symbol === activeBrickSym)
      || Object.values(latestBySymCtx).find((r) => r.qualified)
      || Object.values(latestBySymCtx)[0] || {}

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
    // Aggregate daily comparison rows into rolling 6-month buckets for the
    // table (same method as the admin plugin — shared data UX).
    const vsOptRows = aggregateToMonths(vsOpt.data || [], 6)

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
    // Header + banner (always visible, shared across tabs)
    React.createElement('div', { className: 'tla-header' },
      React.createElement(TalariaMark, { size: 20 }),
      React.createElement('span', null, 'Talaria · Noble Trading App')),
    claim.sub_status === 'grace'
      ? React.createElement('div', { className: 'tla-banner' },
          `Subscription in grace period — renews ${String(graceDate).slice(0, 10) || 'soon'} · still entitled to signals.`)
      : null,
    // Phase 2: upgrade banner (2026-08-20) — only renders when latestRelease
    // is set and PLUGIN_VERSION is behind the latest release tag
    React.createElement(UpgradeBanner, { latest: latestRelease, onDismiss: onDismissUpgrade }),
    React.createElement(HotSignalsBanner, { signals: bannerSignals }),
    React.createElement('div', { className: 'tla-grid' },
      React.createElement(StatCard, {
        title: 'Plan',
        value: claim.plan_slug === 'precision_pro' ? 'Precision Pro' : 'Signal Scout',
        sub: `Subscription ${claim.sub_status === 'active' ? 'Active' : claim.sub_status === 'grace' ? 'Grace' : 'Inactive'} · Token Valid`,
      }),
      React.createElement(StatCard, {
        title: 'Symbols',
        value: String(symbolList.length || '—'),
        sub: symbols.error ? `symbol list unavailable (${symbols.error.message})` : (claim.plan_slug === 'precision_pro' ? 'Precision Pro' : 'Signal Scout'),
      }),
      React.createElement(StatCard, {
        title: 'Realtime',
        value: wsState === 'open' ? 'Live' : wsState === 'connecting' ? 'Connecting' : wsState === 'idle' ? '—' : 'Poll fallback',
        sub: 'signals (' + (isPro ? 'pro' : 'scout') + ')' + (isPro ? ' + portfolio' : '') + ' · REST poll 60s',
        tone: wsState === 'open' ? 'pos' : undefined,
      }),
    ),
    // 0.2.11: Tab bar — Market (live per-symbol) | Analysis (historical/aggregate)
    React.createElement('div', { className: 'tla-tabs' },
      React.createElement('button', {
        className: cn('tla-tab-btn', activeTab === 'market' ? 'tla-tab-active' : ''),
        onClick: () => setActiveTab('market'),
      }, 'Market'),
      React.createElement('button', {
        className: cn('tla-tab-btn', activeTab === 'analysis' ? 'tla-tab-active' : ''),
        onClick: () => setActiveTab('analysis'),
      }, 'Analysis'),
    ),
    // Market tab — live per-symbol panels
    activeTab === 'market' && React.createElement(React.Fragment, null,
      // Renko bricks — last 10 (per symbol)
      React.createElement('div', { className: 'tla-card' },
        React.createElement('h3', null, 'Renko bricks — last 10 (per symbol)'),
        React.createElement('div', { className: 'tla-explainer' },
          'The last 10 renko bricks of the selected symbol (each brick = one fixed price move of brick_size). ENTRY / SL / TP reference lines come from that symbol\'s latest sweep. Switch symbols to re-analyze.'),
        React.createElement('div', { className: 'tla-brick-picker' },
          symbolList.map((s) =>
            React.createElement('button', {
              key: s,
              className: cn('tla-brick-btn', s === activeBrickSym ? 'tla-brick-btn-active' : ''),
              onClick: () => setBrickSym(s),
            }, s),
          ),
        ),
        React.createElement(RenkoBrickChart, { bricks: brickWindow, levels }),
        React.createElement('div', { className: 'tla-hint' },
          'ENTRY / SL / TP reference lines from the latest sweep · window = last 10 bricks'),
      ),
      // Markov + brick-pattern — ALL plans
      React.createElement('div', { className: 'tla-card' },
        React.createElement('h3', null, `Markov + pattern — ${activeBrickSym || 'select a symbol'}`),
        React.createElement('div', { className: 'tla-explainer' },
          'Short-term shape + longer statistical odds for the SELECTED symbol. Brick pattern reads the last 10 bricks; Markov P(up in 3) fits a 3-state chain on up to 200 closes.'),
        React.createElement('div', { className: 'tla-grid' },
          React.createElement(StatCard, {
            title: 'Brick pattern',
            value: patternLabel(pattern),
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
      // EV / P_win / TimesFM forecast — standalone panel (Market tab)
      ctxRow.symbol && React.createElement('div', { className: 'tla-card' },
        React.createElement('h3', null, 'EV / P_win / TimesFM — ' + ctxRow.symbol),
        React.createElement('div', { className: 'tla-grid' },
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
          React.createElement(StatCard, {
            title: 'p_timesfm',
            value: (ctxRow.p_timesfm != null && ctxRow.p_timesfm !== '') ? (ctxRow.p_timesfm > 0.5 ? '📈 ' : '📉 ') + fmtKellyPct(ctxRow.p_timesfm) : '⏳ unavailable',
            sub: (ctxRow.p_timesfm != null && ctxRow.p_timesfm !== '')
              ? ctxRow.p_timesfm > 0.5 ? 'bullish skew > 50%' : 'bearish skew < 50%'
              : 'no TimesFM model run yet',
            tone: (ctxRow.p_timesfm != null && ctxRow.p_timesfm !== '') ? (ctxRow.p_timesfm > 0.5 ? 'pos' : 'neg') : undefined,
          }),
        ),
        React.createElement('div', { className: 'tla-hint' },
          'TimesFM is a foundation-model forecast of the next price direction, expressed as a probability (p_timesfm). >50% = bullish skew; <50% = bearish skew. For the most-qualified symbol in the Kelly table below.'),
      ),
      // 0.2.11: Sizing what-if — ALL plans (in Market tab, above watchlist)
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
      // 0.2.11: Full-width TV chart — renders for activeBrickSym, below sizing what-if
      React.createElement(TalariaTvChart, { symbol: activeBrickSym, sweepRow, tvSymbolMap: tvSymbolBySym }),
    ),
    // Analysis tab — historical/aggregate panels
    activeTab === 'analysis' && React.createElement(React.Fragment, null,
      // Kelly by symbol — latest sweep (TABLE format)
      React.createElement('div', { className: 'tla-card' },
        React.createElement('h3', null, 'Kelly by symbol'),
        React.createElement('div', { className: 'tla-explainer' },
          'Latest signal per symbol. Table is grouped by asset class and sorted by symbol. Effective Kelly = post-EV scaling fraction of the book the engine would risk (blue buy, red sell). Brick columns excluded. The EV, P_win, and TimesFM forecast panels show metrics for the most-qualified symbol. Rows with — in signal/price columns represent symbols whose latest signal did NOT qualify — the regime, aggression, and prev_regime values are still current; only the signal-dependent fields (p_win, EV, markov probabilities, entry/SL/TP) are blank.'),
        React.createElement(TalariaKellyTable, { sweeps, symbols }),
      ),
      // Paper portfolio — Precision Pro only
      isPro ? React.createElement(PaperSection, {
        positions: paperPositions,
        equity: paperEquity,
        events: paperEvents,
      }) : null,
      // Signal health scoreboard — ALL plans
      React.createElement('div', { className: 'tla-card' },
        React.createElement('h3', null, 'Signal health scoreboard'),
        React.createElement('div', { className: 'tla-explainer' },
          '30-day resolved-signal record per symbol. Wilson LB = 95% lower confidence bound on true win rate; sig = statistically above 50% after BH-FDR correction. Higher + sig = more reliable signals.'),
        signalHealth.error
          ? React.createElement('div', { className: 'tla-hint' },
              'Signal health view not deployed yet (migration 110) — ' + signalHealth.error.message)
          : sigHealthRows.length === 0
            ? React.createElement('div', { className: 'tla-hint' }, 'No resolved signals yet — rows appear once the EOD resolver closes signals.')
            : React.createElement('table', { className: cn('tla-table') },
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
      // Calibration bias — ALL plans
      React.createElement('div', { className: 'tla-card' },
        React.createElement('h3', null, 'Calibration bias (7d)'),
        React.createElement('div', { className: 'tla-explainer' },
          'Does predicted win rate match reality? OVERCONFIDENT = the model predicted a HIGHER win rate than it delivered (be cautious). UNDERCONFIDENT = it wins more than predicted. Near 0 = well calibrated.'),
        calib.error
          ? React.createElement('div', { className: 'tla-hint' }, 'Calibration view not deployed yet — ' + calib.error.message)
          : calibRows.length === 0
            ? React.createElement('div', { className: 'tla-hint' }, 'No calibration rows yet — resolved signals needed.')
            : React.createElement('table', { className: cn('tla-table') },
                React.createElement('thead', null,
                  React.createElement('tr', null,
                    React.createElement('th', null, 'Day'),
                    React.createElement('th', null, 'Symbol'),
                    React.createElement('th', null, 'Predicted'),
                    React.createElement('th', null, 'Realized'),
                    React.createElement('th', null, 'Bias'),
                    React.createElement('th', null, 'Status'),
                    React.createElement('th', null, 'Next bias'),
                    React.createElement('th', null, 'Next status'))),
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
                          className: cn('tla-badge', r.status === 'OVERCONFIDENT' ? 'closed' : r.status === 'UNDERCONFIDENT' ? 'opened' : ''),
                        }, r.status || '—')),
                      // Next bias (2026-08-24) — formatted as a delta vs the enforced Bias
                      // column (raw − enforced), i.e. how much enforcement is currently
                      // masking. Raw itself is pre-enforcement model output, not muted by
                      // Bayesian-shrink enforcement. See noble-trader-fastapi-backend
                      // migration 119 + worklog/20260823_calibration_bias_panel_raw_vs_enforced_mismatch.md.
                      // Color threshold still keys off the raw value's own magnitude (the
                      // alarm condition is "is the underlying model overconfident", not the
                      // size of the delta itself).
                      React.createElement('td', {
                        className: r.bias_raw != null && Number(r.bias_raw) >= 0.30 ? 'tla-neg' : r.bias_raw != null && Number(r.bias_raw) <= -0.20 ? 'tla-pos' : '',
                      }, r.bias_raw != null && r.bias != null
                        ? (Number(r.bias_raw) - Number(r.bias) >= 0 ? '+' : '') + (Number(r.bias_raw) - Number(r.bias)).toFixed(3)
                        : '—'),
                      React.createElement('td', null,
                        React.createElement('span', {
                          className: cn('tla-badge', r.status_raw === 'OVERCONFIDENT' ? 'closed' : r.status_raw === 'UNDERCONFIDENT' ? 'opened' : ''),
                        }, r.status_raw || '—')),
                    )
                  )),
                ),
              ),
        React.createElement('div', { className: 'tla-hint' },
          'What it means: OVERCONFIDENT = the model predicted a HIGHER win rate than it actually delivered (it thinks it wins more than it does — be cautious). UNDERCONFIDENT = it wins MORE than predicted (predictions are too pessimistic). Close to 0 = well calibrated. "Next bias" = raw (pre-enforcement) bias minus the enforced Bias column — how much enforcement is currently masking. "Next status" is the classification on that same pre-enforcement model output.'),
      ),
      // Paper vs equal-weight — Precision Pro only
      isPro ? React.createElement('div', { className: 'tla-card' },
        React.createElement('h3', null, 'Paper vs equal-weight (rolling 6 months)'),
        React.createElement('div', { className: 'tla-explainer' },
          'Is the strategy beating the benchmark? Paper PnL = the ACTUAL paper book (Kelly-sized, realized only when positions close). Equal-wt PnL = THEORETICAL unit-size PnL of every resolved signal — what you would have made betting $1 per signal on every symbol with no regime filter. IMPORTANT: these are different scales AND different timings. A negative delta usually does NOT mean the strategy lost money — it means the benchmark counted signals the paper book had not closed yet that day (realized PnL books on close, signal PnL books on signal date). Read it as a trend, not an exact comparison.'),
        vsOpt.error
          ? React.createElement('div', { className: 'tla-hint' }, 'Comparison view not deployed yet — ' + vsOpt.error.message)
          : vsOptRows.length === 0
            ? React.createElement('div', { className: 'tla-hint' }, 'No comparison rows yet — check back after the engine resolves its first day of paper positions (the monthly aggregation needs ≥6 months of daily data).')
            : React.createElement('table', { className: cn('tla-table') },
                React.createElement('thead', null,
                  React.createElement('tr', null,
                    React.createElement('th', null, 'Month'),
                    React.createElement('th', null, 'Paper PnL'),
                    React.createElement('th', null, 'Equal-wt PnL'),
                    React.createElement('th', null, 'Delta'))),
                React.createElement('tbody', null,
                  vsOptRows.map((r, i) => (
                    React.createElement('tr', { key: (r.month || '') + i },
                      React.createElement('td', { className: 'tla-sm' }, r.month || '—'),
                      React.createElement('td', { className: Number(r.paper_pnl || 0) >= 0 ? 'tla-pos' : 'tla-neg' }, `$${Number(r.paper_pnl || 0).toFixed(2)}`),
                      React.createElement('td', null, `$${Number(r.equal_wt_pnl || 0).toFixed(2)}`),
                      React.createElement('td', {
                        className: Number(r.delta || 0) >= 0 ? 'tla-pos' : 'tla-neg',
                      }, `$${Number(r.delta || 0).toFixed(2)}`),
                    )
                  )),
                ),
              ),
        React.createElement('div', { className: 'tla-hint' },
          'Is the strategy beating the benchmark? Paper PnL = the signal engine\'s Kelly/regime-sized trades. Equal-wt PnL = what you would have made betting the same amount on every symbol with no regime filter. Delta > $0 (green) = the engine beat the equal-weight benchmark for that month; Delta < $0 (red) = the benchmark won. · rolling 6 months'),
      ) : null,
      // Portfolio tear-sheet — Precision Pro only
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
    ),
    // Footer (always visible)
    React.createElement('div', { className: 'tla-hint' },
      `Talaria v${PLUGIN_VERSION} · Copyright - Noble Trading App & Lexington Tech LLC`),
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
  // lastSignal is now updated on every addSignal (L767-771) to the newest
  // incoming signal — removed the stale-fallback branch that used a
  // possibly-stale persisted lastSignal (before: lastFresh && ...card=last).
  const freshRows = (recent || [])
    .map((r) => ({ ...r, _ts: Date.parse(r.ts) || 0 }))
    .filter((r) => r._ts > 0 && (now - r._ts) <= SIGNAL_TTL_MS)
    .sort((a, b) => b._ts - a._ts)
  let card = null
  let cardTs = 0
  if (freshRows.length && (freshRows[0]._ts > lastTs)) {
    card = freshRows[0]
    cardTs = card._ts
  }
  const cardKey = card && card.ts ? `${card.symbol}|${card.ts}` : null
  const rows = (cardKey ? freshRows.filter((r) => `${r.symbol}|${r.ts}` !== cardKey) : freshRows)
    .slice(0, RECENT_MAX)
  const dir = card && String(card.direction || '').toLowerCase() === 'sell' ? 'SELL' : 'BUY'
  // LIVE COUNT (2026-08-11): the badge reflects the number of LIVE qualified
  // signals (TTL-fresh recent rows — same count as the chip), NOT the
  // accumulated unread counter (which was capped at 99 and never decayed —
  // "99 new" was meaningless).
  const liveCount = signalStore.qualifiedCount60m

  const lastPriceLine = card &&
    (Number(card.entry) > 0 || Number(card.stop) > 0 || Number(card.take) > 0)

  return React.createElement('div', { className: 'tla-pane-root' },
    React.createElement('div', { className: 'tla-pane-header' },
      React.createElement(TalariaMark, { size: 16 }),
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
      `Talaria v${PLUGIN_VERSION} · Copyright - Noble Trading App & Lexington Tech LLC`),
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
  // LIVE COUNT (2026-08-14 harmonization): the chip badge uses the SAME
  // signalStore.qualifiedCount60m (Supabase COUNT of all qualified signals in
  // the last 60m) as the widget pane badge and toast footer — NOT the TTL-fresh
  // recent[] subset (capped at RECENT_MAX=12) which could undercount or 0
  // while the toast showed a different number. All 4 surfaces now agree.
  const liveCount = signalStore.qualifiedCount60m || 0
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

// ----------------------------------------------------------------------------
// Phase 2: in-plugin upgrade banner (2026-08-20)
// Polls the public GitHub Releases API for the latest Talaria release tag.
// If the deployed PLUGIN_VERSION is behind, an upgrade banner renders.
// Dismissal is per-version via localStorage so re-bumping the version shows it again.
// ----------------------------------------------------------------------------
async function checkForUpdates() {
  try {
    const resp = await fetch(GITHUB_RELEASES_URL)
    if (!resp.ok) return null // network error / rate-limit → silent no-show
    const data = await resp.json()
    const tag = String(data.tag_name || '') // e.g. "v0.2.15"
    const version = tag.replace(/^v/, '') // "0.2.15"
    // If the latest release has no assets or a pre-release, skip (not a real GA ship)
    if (!version || data.prerelease) return null
    return { tag, version, name: data.name || tag, body: data.body || '', html_url: data.html_url || '', assets: data.assets || [] }
  } catch {
    return null // never blocks the dashboard render
  }
}

function isVersionBehind(current, latest) {
  // Simple semantic compare: compare dot-separated numeric parts
  const a = String(current).split('.').map(Number)
  const b = String(latest).split('.').map(Number)
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const av = a[i] || 0
    const bv = b[i] || 0
    if (av < bv) return true
    if (av > bv) return false
  }
  return false // equal or current is ahead
}

// Dismissed-version tracking via localStorage (persisted, per-user)
function isUpdateDismissed(tag) {
  try {
    const dismissed = JSON.parse(localStorage.getItem(UPDATE_CHECK_KEY) || '{}')
    return !!dismissed[tag]
  } catch {
    return false
  }
}

function dismissUpdate(tag) {
  try {
    const dismissed = JSON.parse(localStorage.getItem(UPDATE_CHECK_KEY) || '{}')
    dismissed[tag] = true
    localStorage.setItem(UPDATE_CHECK_KEY, JSON.stringify(dismissed))
  } catch {
    // localStorage quota / unavailable — ignore silently
  }
}

// Download URL: prefer the release zip asset, fall back to the release page
function getDownloadUrl(latest) {
  if (latest && latest.assets && latest.assets.length > 0) {
    const zip = latest.assets.find((a) => a.name && a.name.includes('talaria-plugin-v'))
    if (zip && zip.browser_download_url) return zip.browser_download_url
  }
  if (latest && latest.html_url) return latest.html_url
  return GITHUB_RELEASES_URL
}

// Upgrade banner component — renders at the top of the dashboard header area
function UpgradeBanner({ latest, onDismiss }) {
  if (!latest) return null
  if (!isVersionBehind(PLUGIN_VERSION, latest.version)) return null
  return React.createElement('div', { className: 'tla-banner tla-banner-upgrade' },
    React.createElement('span', { className: 'tla-upgrade-title' },
      `Upgrade available · v${latest.version}`),
    React.createElement('span', null, 'New version with bug fixes + improvements.'),
    React.createElement('a',
      { className: cn('tla-btn', 'tla-upgrade-actions'),
        href: getDownloadUrl(latest), target: '_blank', rel: 'noreferrer', style: { fontSize: '11px', padding: '2px 8px', height: 'auto', minHeight: 'auto' } },
      'Download'),
    React.createElement('button',
      { className: cn('tla-upgrade-actions'),
        onClick: onDismiss, style: { fontSize: '11px', padding: '2px 8px', height: 'auto', minHeight: 'auto', lineHeight: 1 } },
      'Dismiss'),
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
  // Option A (2026-08-10): supabase_url/supabase_key are embedded service
  // defaults, never entered by the user — restored here (was dropped by the
  // 2026-08-24 shared-logic consolidation, which called useConfig() with no
  // defaults, so hasConfig below could never be satisfied without them and
  // ConnectTab's own claim-token-only form has no field for them anyway).
  const [config, updateConfig] = useConfig({ supabase_url: DEFAULT_SUPABASE_URL, supabase_key: DEFAULT_ANON_KEY })
  const [claim, setClaim] = React.useState(null)
  const [checkPhase, setCheckPhase] = React.useState('idle') // idle|running|ok|bad-token|not-deployed|error
  const [checkMsg, setCheckMsg] = React.useState('')
  // Phase 2: upgrade banner state (2026-08-20)
  const [latestRelease, setLatestRelease] = React.useState(null)

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

  // PostHog — initialize once on mount, only when claim is available
  React.useEffect(() => {
    if (!claim || !claim.plan_slug) return
    if (!window.posthog) {
      const script = document.createElement('script')
      script.src = 'https://us-assets.i.posthog.com/static/array.js'
      script.async = true
      script.onload = () => {
        window.posthog.init(POSTHOG_TOKEN, {
          api_host: POSTHOG_API_HOST,
          person_profiles: 'identified_only',
          defaults: '2026-05-30',
        })
        window.posthog.identify(claim.plan_slug, {
          plan_slug: claim.plan_slug,
          sub_status: claim.sub_status,
        })
        window.posthog.capture('dashboard_open', {
          session_id: sessionStorage.getItem('hermes_sid') || crypto.randomUUID(),
          plan: claim.plan_slug,
          sub_status: claim.sub_status,
        })
      }
      script.onerror = () => console.warn('[talaria] PostHog script failed to load')
      document.head.appendChild(script)
      return () => { if (script.parentNode) script.parentNode.removeChild(script) }
    }
  }, [claim && claim.plan_slug])

  // Phase 2: check for plugin updates on mount (2026-08-20)
  // Fires once on mount — fetches the latest GitHub release and stores it
  // in state so the dashboard can render the upgrade banner. Only shows
  // if the deployed PLUGIN_VERSION is behind the latest release tag.
  React.useEffect(() => {
    checkForUpdates().then((latest) => {
      if (latest && latest.version && isVersionBehind(PLUGIN_VERSION, latest.version)) {
        setLatestRelease(latest)
      } else {
        setLatestRelease(null)
      }
    })
  }, [])

  const hasConfig = !!(config.supabase_url && config.supabase_key && config.claim_token)

  if (!hasConfig) {
    return React.createElement(ConnectTab, {
      config, onSave: updateConfig, checkPhase: 'idle', checkMsg: '', variant: 'talaria',
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
      config, onSave: updateConfig, checkPhase, checkMsg, variant: 'talaria',
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
    return React.createElement(PaywallScreen, {
      claim, onRetry: runCheck, onChangeToken: () => updateConfig({ claim_token: '' }),
    })
  }
  // active | grace
  return React.createElement(TalariaDashboard, { config, claim, latestRelease, onDismissUpgrade: () => dismissUpdate(latestRelease.tag) })
}

// ---------------------------------------------------------------------------
const plugin = {
  id: 'talaria',
  name: 'Talaria',
  defaultEnabled: true,
  register(ctx) {
    ensureStyle(STYLE_ID, CSS)
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
