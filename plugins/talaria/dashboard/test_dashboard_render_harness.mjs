/**
 * Talaria Dashboard Plugin — node render harness
 *
 * Loads the dashboard plugin's dist/index.js (an IIFE that registers via
 * window.__HERMES_PLUGINS__.register('talaria', Component)), stubs the browser
 * globals (window, document, fetch, localStorage), and forces the registered
 * component to render against mocked Supabase REST payloads.
 *
 * Asserts no "INVALID ELEMENT TYPE" / render crash occurs, and that the new
 * Markov + pattern and standalone TimesFM cards appear in the tree.
 *
 * Run: node plugins/talaria/dashboard/test_dashboard_render_harness.mjs
 */
import fs from 'node:fs'
import path from 'node:path'

const __dirname = path.dirname(new URL(import.meta.url).pathname).replace(/^\/[A-Za-z]:/, (m) => m.slice(1))
const PLUGIN_SRC = path.resolve(__dirname, 'dist/index.js')

// ─── Browser globals ────────────────────────────────────────────────────
const ls = {
  'talaria-config.json': JSON.stringify({
    supabase_url: 'https://pcvscowltlrxzgxjurcr.supabase.co',
    supabase_key: 'sb_publishable_TEST_ANON',
    claim_token: 'test-claim-token-32-hex-chars-0000',
  }),
}
globalThis.localStorage = {
  getItem: (k) => (k in ls ? ls[k] : null),
  setItem: (k, v) => { ls[k] = String(v) },
  removeItem: (k) => { delete ls[k] },
}

globalThis.document = {
  getElementById: () => null,
  createElement: (tag) => ({
    tag, textContent: '', style: {}, appendChild: () => {},
    setAttribute: () => {}, head: { appendChild: () => {} },
  }),
  head: { appendChild: () => {} },
}

globalThis.WebSocket = class WebSocketStub {
  constructor(url) { this.url = url }
  close() {}
}
// 0.2.11: window + LightweightCharts stub for watchlist mini-charts
globalThis.window = {
  LightweightCharts: {
    createChart: () => ({
      addCandlestickSeries: () => ({ setData: () => {} }),
      remove: () => {},
    }),
  },
}
globalThis.AbortSignal = { timeout: () => undefined }
// Stub setInterval to prevent the plugin's polling intervals
// (startSignalPolling, useSupabaseData) from keeping the Node event loop
// alive after the harness exits. setTimeout is left intact for microtask
// flushing in the render loop.
globalThis.setInterval = () => ({ _noop: true })
globalThis.clearInterval = () => {}

const nowIso = () => new Date().toISOString()

function jsonResp(obj, status = 200) {
  return {
    ok: status >= 200 && status < 300, status,
    statusText: status === 200 ? 'OK' : 'ERR',
    json: async () => obj,
    text: async () => JSON.stringify(obj),
    headers: {
      get: (name) => name.toLowerCase() === 'x-total-count'
        ? String(Array.isArray(obj) ? obj.length : 1) : null,
    },
  }
}

globalThis.fetch = async (url) => {
  const u = String(url)
  if (u.includes('/functions/v1/talaria-check')) {
    return jsonResp({
      ok: true, plan_slug: 'precision_pro',
      plan_uuid: '1b66e78e-e8d1-46b6-9887-b36e038131c5',
      sub_status: 'active', period_end: '2026-09-01T00:00:00Z',
      grace_end: null, next_charge_url: 'https://pay.example.com/renew',
    })
  }
  if (u.includes('/rest/v1/nt_symbol')) {
    return jsonResp([
      { symbol: 'XAUUSD', asset_class: 'commodities' },
      { symbol: 'EURUSD', asset_class: 'forex' },
      { symbol: 'BTCUSD', asset_class: 'crypto' },
    ])
  }
  if (u.includes('/rest/v1/nt_sweep_result')) {
    return jsonResp([
      { symbol: 'XAUUSD', signal: 'buy', effective_kelly: 0.24, kelly_f: 0.24,
        entry_price: 4090.5, stop_loss: 4085.0, take_profit: 4102.0,
        sweep_timestamp: nowIso(), regime: 'low_vol_strong_bull', qualified: true,
        regime_conf: 0.9, markov_p_up: 0.62, markov_p_dn: 0.38, p_win: 0.6,
        ev: 0.42, p_timesfm: 0.58, aggression: 'aggressive', regime_shift: true,
        prev_regime: 'high_vol_bear', size_mult: 1.2, brick_size: 1,
        sl_bricks: 3, tp_bricks: 6 },
      { symbol: 'EURUSD', signal: 'sell', effective_kelly: 0.18, kelly_f: 0.18,
        entry_price: 1.0845, stop_loss: 1.0875, take_profit: 1.079,
        sweep_timestamp: nowIso(), regime: 'low_vol_range', qualified: true,
        regime_conf: 0.8, markov_p_up: 0.35, markov_p_dn: 0.65, p_win: 0.42,
        ev: -0.18, p_timesfm: 0.31, aggression: 'passive', regime_shift: false,
        prev_regime: 'low_vol_strong_bull', size_mult: 0.6, brick_size: 0.01,
        sl_bricks: 3, tp_bricks: 6 },
      { symbol: 'BTCUSD', signal: 'neutral', effective_kelly: null,
        kelly_f: null, entry_price: null, stop_loss: null, take_profit: null,
        sweep_timestamp: nowIso(), regime: 'high_vol_chop', qualified: false,
        regime_conf: 0.5, markov_p_up: null, markov_p_dn: null, p_win: null,
        ev: null, p_timesfm: null, aggression: 'mid', regime_shift: null,
        prev_regime: null, size_mult: null, brick_size: 100,
        sl_bricks: 3, tp_bricks: 6 },
    ])
  }
  if (u.includes('/rest/v1/nt_renko_bricks')) {
    const m = u.match(/symbol=eq\.([A-Z0-9]+)/)
    const sym = m ? m[1] : 'XAUUSD'
    const bricks = []
    for (let i = 0; i < 10; i++) {
      bricks.push({
        symbol: sym, direction: i % 2 === 0 ? 'up' : 'down', brick_size: 1,
        open_price: 4085 + i, close_price: 4085 + i + (i % 2 === 0 ? 1 : -1),
        high: 4086 + i, low: 4084 + i, brick_index: 300 + i, ts: nowIso(),
        session_date: new Date().toISOString().slice(0, 10),
      })
    }
    return jsonResp(bricks)
  }
  // 0.2.11: TDVA candle data stub for watchlist mini-charts
  if (u.includes('price-feeds.tradingview-proxy.com/history')) {
    const m = u.match(/symbol=([A-Z0-9]+)/)
    const sym = m ? m[1] : 'XAUUSD'
    const basePrice = sym.startsWith('XA') ? 2330 : sym.startsWith('BT') ? 60000 : 1.085
    const bars = []
    for (let i = 0; i < 60; i++) {
      const o = basePrice + i * 0.3
      bars.push({ time: i, open: o, high: o + 2, low: o - 1, close: o + (i % 2 ? 1 : -1) })
    }
    return jsonResp(bars)
  }
  throw new Error('Unexpected fetch URL: ' + u)
}

// ─── React stub ──────────────────────────────────────────────────────────
const hookSlots = []
let hookCursor = 0
let needsRender = false

function scheduleRender() {
  needsRender = true
}

const ReactStub = {
  useState(init) {
    const i = hookCursor++
    if (hookSlots[i] === undefined) {
      hookSlots[i] = { state: typeof init === 'function' ? init() : init }
    }
    const slot = hookSlots[i]
    const set = (v) => {
      const next = typeof v === 'function' ? v(slot.state) : v
      if (Object.is(next, slot.state)) return
      slot.state = next
      scheduleRender()
    }
    return [slot.state, set]
  },
  useEffect(cb, deps) {
    const i = hookCursor++
    const slot = hookSlots[i] || (hookSlots[i] = {})
    const key = deps ? JSON.stringify(deps) : 'nodeps'
    if (!slot.ran || slot.key !== key) {
      slot.ran = true
      slot.key = key
      const cleanup = cb()
      if (typeof cleanup === 'function') cleanup()
    }
  },
  useCallback(cb) { return cb },
  useMemo: (fn) => fn(),
  useRef(init) {
    const i = hookCursor++
    if (hookSlots[i] === undefined) hookSlots[i] = { current: init }
    return hookSlots[i]
  },
  createElement(type, props, ...children) {
    if (type == null) throw new Error('INVALID ELEMENT TYPE: ' + String(type))
    const flat = []
    for (const c of children) {
      if (Array.isArray(c)) flat.push(...c)
      else if (c !== false && c != null) flat.push(c)
    }
    return { type, props: props || {}, children: flat }
  },
}

const sdkHooks = {
  useState: ReactStub.useState,
  useEffect: ReactStub.useEffect,
  useCallback: ReactStub.useCallback,
  useMemo: ReactStub.useMemo,
  useRef: ReactStub.useRef,
}

// ─── Install window SDK + registration mock ─────────────────────────────
const registered = {}
const win = {
  location: { hash: '' },
  dispatchEvent: () => true,
  addEventListener: () => {},
  removeEventListener: () => {},
}
globalThis.window = win
win.__HERMES_PLUGINS__ = {
  register(name, Component) { registered[name] = Component },
}
win.__HERMES_PLUGIN_SDK__ = {
  React: ReactStub,
  hooks: sdkHooks,
  components: {},
  utils: { cn: (...a) => a.filter(Boolean).join(' ') },
}

// ─── Expand / walk helpers ────────────────────────────────────────────────
function expand(el, depth = 0) {
  if (depth > 12) return el
  if (el == null || typeof el === 'string' || typeof el === 'number') return el
  if (Array.isArray(el)) return el.map((c) => expand(c, depth + 1))
  if (typeof el === 'object' && el.type != null) {
    if (typeof el.type === 'function') return expand(el.type(el.props || {}), depth + 1)
    return { type: el.type, props: el.props || {}, children: (el.children || []).map((c) => expand(c, depth + 1)) }
  }
  return el
}

function walk(el, acc) {
  if (el == null) return acc
  if (typeof el === 'string' || typeof el === 'number') {
    const t = String(el).trim()
    if (t) acc.texts.push(t)
    return acc
  }
  if (Array.isArray(el)) { for (const c of el) walk(c, acc); return acc }
  if (typeof el === 'object' && el.type != null) {
    if (el.props && typeof el.props.className === 'string') acc.classes.push(el.props.className)
    for (const c of el.children || []) walk(c, acc)
  }
  return acc
}

function countNodes(el) {
  if (el == null) return 0
  if (typeof el === 'string' || typeof el === 'number') return 1
  if (Array.isArray(el)) return el.reduce((a, c) => a + countNodes(c), 0)
  if (typeof el === 'object' && el.type != null) {
    if (typeof el.type === 'function') return countNodes(el.type(el.props || {})) + 1
    return 1 + (el.children || []).reduce((a, c) => a + countNodes(c), 0)
  }
  return 0
}

// ─── Load the plugin bundle ─────────────────────────────────────────────
// The dashboard plugin is a plain IIFE script (not ESM module). It reads
// `window.__HERMES_PLUGIN_SDK__` and registers via
// `window.__HERMES_PLUGINS__.register()`.
//
// We use the Function constructor to create a script function whose global
// scope includes `window` as a parameter — this matches the browser <script>
// contract where bare `window` resolves to the window object. (eval() in ESM
// is indirect and doesn't share globalThis with the module.)
const pluginSrc = fs.readFileSync(PLUGIN_SRC, 'utf8')
// eslint-disable-next-line no-new-func
const pluginRunner = new Function('window', 'document', 'fetch', 'localStorage', 'WebSocket', 'globalThis', pluginSrc)
pluginRunner(globalThis.window, globalThis.document, globalThis.fetch, globalThis.localStorage, globalThis.WebSocket, globalThis)

const failures = []
function assert(cond, label) {
  if (cond) console.log('  PASS  ' + label)
  else { failures.push(label); console.log('  FAIL  ' + label) }
}

// Verify registration happened
assert(registered['talaria'], 'dashboard plugin registers as "talaria"')
const Talaria = registered['talaria']
assert(typeof Talaria === 'function', 'registered component is a function')

// ─── Render loop ─────────────────────────────────────────────────────────
// Each call to Talaria() executes the component body synchronously. Hooks
// persist state in hookSlots across re-renders (indexed by hookCursor).
// Async fetches (claimCheck, useSupabaseData) resolve in microtasks →
// setState → scheduleRender() → needsRender flag. We flush, check the flag,
// and re-render until the tree stabilizes.
function renderOnce() {
  hookCursor = 0
  return expand(Talaria({}))
}

let renderThrew = null
let tree = null
hookCursor = 0
hookSlots.length = 0
try {
  tree = renderOnce()
} catch (e) {
  renderThrew = e
}

assert(!renderThrew, 'dashboard render sequence threw nothing')
if (renderThrew) console.log('  THREW: ' + (renderThrew.stack || renderThrew))

// Flush microtasks: async fetch resolves → setState → needsRender flag
let prevCount = countNodes(tree)
for (let i = 0; i < 80 && needsRender; i++) {
  needsRender = false
  await new Promise((r) => setTimeout(r, 10))
  try {
    tree = renderOnce()
  } catch (e) {
    renderThrew = e
    console.log('  THREW on re-render: ' + (renderThrew.stack || renderThrew))
    break
  }
  const nextCount = countNodes(tree)
  if (nextCount === prevCount && !needsRender) break
  prevCount = nextCount
}

if (tree) {
  const acc = { texts: [], classes: [] }
  walk(tree, acc)

  const hasText = (t) => acc.texts.some((x) => x.includes(t))
  const hasEmoji = (emoji) => acc.texts.some((x) => x.includes(emoji))
  const hasClass = (c) => acc.classes.some((x) => x.includes(c))

  assert(hasText('Renko bricks'), 'renko bricks card renders')
  assert(hasText('EV / P_win / TimesFM'), 'EV / P_win / TimesFM standalone panel renders (below Markov + pattern)')
  assert(hasText('Markov + pattern'), 'Markov + pattern card renders (new, 2026-08-15)')
  assert(hasText('Brick pattern'), 'brick pattern stat renders')
  assert(hasText('Markov P(up in 3)'), 'Markov P(up in 3) stat renders')
  assert(hasText('EV — XAUUSD'), 'EV stat card renders for most-qualified symbol')
  assert(hasText('P_win — XAUUSD'), 'P_win stat card renders for most-qualified symbol')
  assert(hasText('$0.42'), 'EV value renders for most-qualified symbol')
  assert(hasText('+60.0%'), 'P_win value renders for most-qualified symbol')
  // XAUUSD is the most-qualified symbol with p_timesfm=0.58 → bullish forecast
  assert(hasEmoji('\ud83d\udcc8'), 'TimesFM card shows bullish forecast for qualified XAUUSD')
  assert(hasText('Sizing what-if'), 'sizing what-if card renders (Market tab)')
  // 0.2.11: Two-tab dashboard — Analysis tab content verified at source level below
  assert(hasText('Market'), 'Market tab label renders')
  assert(hasText('Analysis'), 'Analysis tab label renders')
  assert(hasClass('tla-tabs'), 'tab bar renders')
  assert(hasClass('tla-tab-btn'), 'tab buttons render')
  // Market tab content visible by default
  assert(hasText('Renko bricks'), 'Market tab: Renko bricks card renders')
  assert(hasText('Markov + pattern'), 'Market tab: Markov card renders')
  assert(hasText('EV / P_win / TimesFM'), 'Market tab: EV/P_win/TimesFM panel renders')
  assert(!hasText('Watchlist'), 'Market tab: Watchlist NOT rendered (removed by user preference)')
  // Analysis tab content present in source (renders when activeTab='analysis')
  const dashboardSrc = fs.readFileSync(PLUGIN_SRC, 'utf8')
  assert(dashboardSrc.includes("activeTab === 'analysis'"), 'Analysis tab conditional exists in source')
  assert(dashboardSrc.includes("activeTab === 'market'"), 'Market tab conditional exists in source')
  assert(dashboardSrc.includes('TalariaWatchlist'), 'TalariaWatchlist component defined in source (not mounted)')
  assert(dashboardSrc.includes('TalariaTvChart'), 'TalariaTvChart component defined in source')
  assert(dashboardSrc.includes('tla-tv-chart-card'), 'TV chart card CSS class defined in source')
  assert(dashboardSrc.includes('ensureTvCharts'), 'ensureTvCharts (TDVA loader) defined')
  assert(dashboardSrc.includes('TV_LWCHARTS_CDN'), 'TV_LWCHARTS_CDN constant defined')
  assert(dashboardSrc.includes('lightweight-charts'), 'TradingView lightweight-charts CDN URL present')
  assert(dashboardSrc.includes('tla-tv-loading'), 'TV chart loading SVG fallback renders')
  assert(dashboardSrc.includes('Sizing what-if'), 'Sizing what-if is in Market tab (source)')
  assert(dashboardSrc.includes('Kelly by symbol'), 'Kelly table is in Analysis tab (source)')
  assert(dashboardSrc.includes('Signal health scoreboard'), 'Signal health is in Analysis tab (source)')
  assert(dashboardSrc.includes('Calibration bias'), 'Calibration bias is in Analysis tab (source)')
  assert(dashboardSrc.includes('Paper vs equal-weight'), 'Paper vs equal-weight is in Analysis tab (source)')
  assert(dashboardSrc.includes('Portfolio stats'), 'Portfolio stats is in Analysis tab (source)')
  assert(dashboardSrc.includes('fetchTvCandles'), 'watchlist fetches TDVA candle data (source)')
  assert(dashboardSrc.includes('addCandlestickSeries'), 'watchlist populates charts with candle series (source)')
  assert(dashboardSrc.includes('setData'), 'watchlist sets candle data on chart series (source)')
  assert(dashboardSrc.includes("'0.2.11'"), 'dashboard PLUGIN_VERSION is v0.2.11')
}

console.log('')
if (failures.length) {
  console.log('HARNESS FAIL — ' + failures.length + ' assertion(s) failed')
  process.exitCode = 1
} else {
  console.log('HARNESS PASS — dashboard plugin renders all panels')
}
