/**
 * Talaria Remote Gateway — Dashboard Plugin (Headless Gateway Surface)
 * v0.2.11 — Two-tab dashboard: Market (live per-symbol) + Analysis (historical)
 *
 * CLIENT-FACING product dashboard for the Noble Trader signal service,
 * rendered on headless Hermes gateway instances via the web dashboard's
 * dashboard plugin system.
 *
 * This is the parallel of the desktop plugin (../../desktop/plugin.js) for
 * the headless gateway. It uses the SAME data path (direct Supabase REST +
 * Phoenix WebSocket) but a different registration contract:
 *
 *   Desktop:  export default { id, register(ctx) } → ctx.registerMany([...])
 *   Dashboard: window.__HERMES_PLUGINS__.register(name, Component)
 *
 * The dashboard plugin is NOT bundled — it's a plain ESM IIFE loaded via
 * <script> tag by the web dashboard (web/src/plugins/usePlugins.ts),
 * exactly like the kanban plugin (plugins/kanban/dashboard/dist/index.js).
 * It uses React.createElement (no JSX), resolves React/hooks/components
 * from window.__HERMES_PLUGIN_SDK__, and calls fetchJSON/authedFetch for
 * the plugin's own backend API routes.
 *
 * Data path (identical to desktop plugin, minus Electron IPC):
 *   - Claim validation: POST {supabase_url}/functions/v1/talaria-check
 *   - Symbol list: GET /rest/v1/nt_symbol?select=...&plan_ids=cs.{plan_uuid}
 *   - Data poll: GET /rest/v1/nt_sweep_result + nt_renko_bricks + ...
 *   - Live push: WebSocket to {supabase_url}/realtime/v1/websocket (Phoenix)
 *   - Fallback poll: 60s REST (10s for the widget surfaces)
 *
 * Claim check cadence: on mount + every 24h. Data refresh: every 60s.
 *
 * CSS: served via the manifest's "css" field → dist/style.css
 * (the host injects a <link> tag before the <script>).
 */
(function () {
  "use strict";

  // Early-return if the host SDK isn't available — the web dashboard
  // always injects window.__HERMES_PLUGIN_SDK__ before loading plugin
  // scripts, but guard defensively.
  var SDK = window.__HERMES_PLUGIN_SDK__;
  if (!SDK) return;

  var React = SDK.React;
  var h = React.createElement;
  var useState = SDK.hooks.useState;
  var useEffect = SDK.hooks.useEffect;
  var useCallback = SDK.hooks.useCallback || function (fn) { return fn; };
  var useMemo = SDK.hooks.useMemo || function (fn) { return fn(); };
  var useRef = SDK.hooks.useRef || function (init) { return { current: init }; };

  var cn = (SDK.utils && SDK.utils.cn) || function () {
    return Array.prototype.filter.call(arguments, Boolean).join(' ');
  };

  // ─── Constants (mirrored from desktop plugin) ────────────────────────

  var PLUGIN_VERSION = '0.2.15';
  var TV_LWCHARTS_CDN = 'https://unpkg.com/lightweight-charts@4.3.0/dist/lightweight-charts.standalone.production.js';
  var TV_TIMEFRAME = '5M';
  var TV_BAR_COUNT = 60;
  var CONFIG_FILE = 'talaria-config.json';
  var UNREAD_FILE = 'talaria-unread.json';
  var CLAIM_CHECK_MS = 24 * 60 * 60 * 1000;
  var DATA_POLL_MS = 60 * 1000;
  var CHIP_POLL_MS = 10 * 1000;
  var UNREAD_MAX = 99;
  var RECENT_MAX = 12;
  var SIGNAL_TTL_MS = 60 * 60 * 1000;
  var HOT_TTL_MS = 10 * 60 * 1000;

  var DEFAULT_SUPABASE_URL = 'https://pcvscowltlrxzgxjurcr.supabase.co';
  var DEFAULT_ANON_KEY = 'sb_publishable_cYfseJa9z0qss0g_Y594wA_lXrWVBsa';

  // ─── Config load/save ──────────────────────────────────────────────

  function loadConfig() {
    if (typeof localStorage === 'undefined') return defaultConfig();
    try {
      var raw = localStorage.getItem(CONFIG_FILE);
      if (raw) {
        var s = JSON.parse(raw);
        return {
          supabase_url: s.supabase_url || DEFAULT_SUPABASE_URL,
          supabase_key: s.supabase_key || DEFAULT_ANON_KEY,
          claim_token: s.claim_token || '',
        };
      }
    } catch (e) {}
    return defaultConfig();
  }

  function defaultConfig() {
    return { supabase_url: DEFAULT_SUPABASE_URL, supabase_key: DEFAULT_ANON_KEY, claim_token: '' };
  }

  function saveConfig(cfg) {
    var next = Object.assign({}, loadConfig(), cfg);
    if (typeof localStorage !== 'undefined') {
      try { localStorage.setItem(CONFIG_FILE, JSON.stringify(next)); } catch (e) {}
    }
    return next;
  }

  // ─── Diagnostic logger ─────────────────────────────────────────────

  function _log(level, msg) {
    try { if (typeof console !== 'undefined' && console[level]) console[level]('[talaria ' + PLUGIN_VERSION + '] ' + msg); } catch (e) {}
  }

  // ─── Supabase REST helpers ─────────────────────────────────────────

  async function fetchSupabase(config, path, params) {
    var base = (config.supabase_url || '').replace(/\/+$/, '');
    if (!base || !config.supabase_key) {
      throw new Error('Not connected — open the Connect tab and save your claim token');
    }
    var qs = new URLSearchParams(params || {}).toString();
    var url = base + '/rest/v1/' + path + (qs ? '?' + qs : '');
    var resp = await fetch(url, {
      method: 'GET',
      headers: {
        apikey: config.supabase_key,
        Authorization: 'Bearer ' + config.supabase_key,
        Accept: 'application/json',
      },
    });
    if (!resp.ok) {
      var body = await resp.text().catch(function () { return ''; });
      throw new Error(resp.status + ' ' + resp.statusText + (body ? ' — ' + body.slice(0, 120) : ''));
    }
    return await resp.json();
  }

  async function fetchSupabaseCount(config, path, params) {
    var base = (config.supabase_url || '').replace(/\/+$/, '');
    if (!base || !config.supabase_key) {
      throw new Error('Not connected');
    }
    var qs = new URLSearchParams(params || {}).toString();
    var url = base + '/rest/v1/' + path + (qs ? '?' + qs : '');
    var resp = await fetch(url, {
      method: 'GET',
      headers: {
        apikey: config.supabase_key,
        Authorization: 'Bearer ' + config.supabase_key,
        Accept: 'application/json',
        Prefer: 'count=exact',
      },
    });
    if (!resp.ok) {
      var body = await resp.text().catch(function () { return ''; });
      throw new Error(resp.status + ' ' + resp.statusText + (body ? ' — ' + body.slice(0, 120) : ''));
    }
    var n = parseInt(resp.headers.get('X-Total-Count') || '0', 10);
    return Number.isNaN(n) ? 0 : n;
  }

  // ─── Claim validation (talaria-check Edge Function) ─────────────────

  async function claimCheck(config) {
    var base = (config.supabase_url || '').replace(/\/+$/, '');
    if (!base || !config.supabase_key || !config.claim_token) {
      throw { kind: 'error', message: 'Enter your claim token in the Connect tab' };
    }
    var resp;
    try {
      resp = await fetch(base + '/functions/v1/talaria-check', {
        method: 'POST',
        headers: {
          apikey: config.supabase_key,
          Authorization: 'Bearer ' + config.supabase_key,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ token: config.claim_token }),
      });
    } catch (err) {
      throw { kind: 'error', message: 'Claim service unreachable — ' + String(err && err.message ? err.message : err) };
    }
    if (resp.status === 404) {
      throw { kind: 'not-deployed', message: 'talaria-check Edge Function not deployed on this project (404)' };
    }
    if (resp.status === 401) {
      var body = {};
      try { body = await resp.json(); } catch (e) {}
      throw { kind: 'bad-token', message: 'Claim token rejected (' + (body.error || 'invalid_claim') + ')' };
    }
    if (!resp.ok) {
      throw { kind: 'error', message: resp.status + ' ' + resp.statusText };
    }
    var json;
    try { json = await resp.json(); } catch {
      throw { kind: 'error', message: 'Unexpected claim response (not JSON)' };
    }
    if (!json || json.ok !== true) {
      var err = (json && json.error) || 'invalid_claim';
      throw {
        kind: err === 'invalid_claim' || err === 'revoked' || err === 'expired' ? 'bad-token' : 'error',
        message: 'Claim rejected (' + err + ')',
      };
    }
    return json;
  }

  // ─── React hooks wrappers ──────────────────────────────────────────

  function useConfig() {
    var _a = useState(loadConfig());
    var config = _a[0]; var setConfig = _a[1];
    var update = useCallback(function (patch) {
      setConfig(function (prev) {
        var next = Object.assign({}, prev, patch);
        saveConfig(next);
        return next;
      });
    }, []);
    return [config, update];
  }

  // ─── useSupabaseData (REST poll + manual reload) ───────────────────

  function useSupabaseData(config, table, params, enabled) {
    var _a = useState(null);
    var data = _a[0]; var setData = _a[1];
    var _b = useState(true);
    var loading = _b[0]; var setLoading = _b[1];
    var _c = useState(null);
    var error = _c[0]; var setError = _c[1];

    var load = useCallback(function () {
      if (!enabled || !config.supabase_url || !config.supabase_key) {
        setLoading(false);
        return;
      }
      setLoading(true);
      setError(null);
      fetchSupabase(config, table, params)
        .then(function (json) { setData(json); })
        .catch(function (err) { setError(err); })
        .finally(function () { setLoading(false); });
    }, [config.supabase_url, config.supabase_key, table, JSON.stringify(params), enabled]);

    useEffect(function () {
      load();
      var timer = setInterval(load, DATA_POLL_MS);
      return function () { clearInterval(timer); };
    }, [load]);

    return { data: data, loading: loading, error: error, reload: load };
  }

  // ─── useRealtime (open-tab-only WebSocket) ─────────────────────────

  function realtimeWsUrl(config) {
    var base = (config.supabase_url || '').replace(/^[https?:]+/i, '');
    return 'wss://' + base + '/realtime/v1/websocket?apikey=' + encodeURIComponent(config.supabase_key || '') + '&vsn=1.0.0';
  }

  function parseRealtimeMessage(raw) {
    var msg;
    try { msg = JSON.parse(raw); } catch (e) { return { type: 'other' }; }
    if (!msg || typeof msg !== 'object') return { type: 'other' };
    if (msg.event === 'phx_reply') return { type: 'reply', topic: msg.topic, ref: msg.ref, status: msg.payload && msg.payload.status };
    if (msg.event === 'phx_error' || msg.event === 'phx_close') return { type: 'socket_error', topic: msg.topic };
    if (msg.event === 'broadcast' && msg.payload && msg.payload.type === 'broadcast' && msg.payload.event) {
      return { type: 'broadcast', event: msg.payload.event, payload: msg.payload.payload || {} };
    }
    return { type: 'other' };
  }

  function useRealtime(config, enabled, planSlug, handlers) {
    var _a = useState('idle');
    var state = _a[0]; var setState = _a[1];
    var handlersRef = useRef(handlers);
    handlersRef.current = handlers;

    useEffect(function () {
      if (!enabled || !config.supabase_url || !config.supabase_key) return undefined;
      var wsUrl = realtimeWsUrl(config);
      var ws = null;
      var disposed = false;
      var retryTimer = null;
      var attempts = 0;

      function scheduleRetry() {
        if (disposed) return;
        var delay = Math.min(30000, 5000 * Math.pow(2, attempts));
        attempts += 1;
        retryTimer = setTimeout(connect, delay);
      }

      function connect() {
        if (disposed) return;
        setState('connecting');
        try {
          ws = new WebSocket(wsUrl);
        } catch (err) {
          setState('error');
          scheduleRetry();
          return;
        }
        ws.onopen = function () {
          if (disposed) { try { ws.close(); } catch (e) {} return; }
          setState('open');
          attempts = 0;
          var signalTopics = planSlug
            ? ['realtime:signals.' + planSlug]
            : ['realtime:signals.signal_scout', 'realtime:signals.precision_pro'];
          signalTopics.forEach(function (topic, i) {
            ws.send(JSON.stringify({
              topic: topic,
              event: 'phx_join',
              payload: { config: { broadcast: { self: false, ack: false } } },
              ref: String(i + 1),
            }));
          });
          if (planSlug === 'precision_pro') {
            ws.send(JSON.stringify({
              topic: 'realtime:portfolio',
              event: 'phx_join',
              payload: { config: { broadcast: { self: false, ack: false } } },
              ref: String(signalTopics.length + 1),
            }));
          }
        };
        ws.onmessage = function (evt) {
          var msg = parseRealtimeMessage(evt.data);
          if (msg.type === 'broadcast') {
            if (msg.event === 'signal' && handlersRef.current.onSignal) {
              handlersRef.current.onSignal(msg.payload);
            } else if (msg.event === 'paper' && handlersRef.current.onPaper) {
              handlersRef.current.onPaper(msg.payload);
            }
          }
        };
        ws.onerror = function () { setState('error'); };
        ws.onclose = function () {
          if (disposed) return;
          setState('closed');
          scheduleRetry();
        };
      }
      connect();
      return function () {
        disposed = true;
        if (retryTimer) clearTimeout(retryTimer);
        if (ws) { try { ws.onclose = null; ws.close(); } catch (e) {} }
      };
    }, [enabled, config.supabase_url, config.supabase_key, planSlug]);

    return state;
  }

  // ─── Formatters ────────────────────────────────────────────────────

  var REGIME_FRIENDLY = {
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
  };

  function fmtRegime(label) {
    if (!label) return '';
    var key = String(label).toLowerCase();
    if (REGIME_FRIENDLY[key]) return REGIME_FRIENDLY[key];
    return String(label).replace(/_/g, ' ').replace(/\b\w/g, function (c) { return c.toUpperCase(); });
  }

  function fmtRegimeShort(label) {
    if (!label) return '—';
    var full = fmtRegime(label);
    if (full.length > 18) return full.slice(0, 17) + '…';
    return full;
  }

  function fmtAge(tsMs) {
    var diff = Math.max(0, Date.now() - tsMs);
    var min = Math.floor(diff / 60000);
    if (min < 1) return 'just now';
    if (min < 60) return min + 'm ago';
    var hr = Math.floor(min / 60);
    if (hr < 24) return hr + 'h ago';
    return Math.floor(hr / 24) + 'd ago';
  }

  function fmtSignalTime(tsMs) {
    var d = new Date(tsMs);
    if (isNaN(d.getTime())) return '';
    var pad = function (n) { return String(n).padStart(2, '0'); };
    var tz = '';
    try {
      var parts = new Intl.DateTimeFormat('en', { timeZoneName: 'short' }).formatToParts(d);
      var tzPart = parts.find(function (p) { return p.type === 'timeZoneName'; });
      tz = (tzPart && tzPart.value) || '';
    } catch (e) {}
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) + ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes()) + (tz ? ' ' + tz : '');
  }

  function fmtBrickPrice(p) {
    if (p == null || isNaN(Number(p)) || Number(p) <= 0) return '—';
    var n = Number(p);
    if (n >= 1000) return '$' + n.toFixed(0);
    if (n >= 1) return '$' + n.toFixed(2);
    return '$' + n.toFixed(4);
  }

  function fmtKellyPct(v) {
    if (v == null || isNaN(Number(v))) return '—';
    var n = Number(v);
    return n >= 0 ? '+' + (n * 100).toFixed(1) + '%' : (n * 100).toFixed(1) + '%';
  }

  // Brick pattern classifier — reads the short-term shape from the last N
  // renko bricks (port of the desktop plugin's brickPattern, simplified for
  // the dashboard bundle which doesn't ship the full Markov fit).
  function brickPattern(bricks) {
    var b = (bricks || []).map(function (x) { return x.direction === 'up' ? 1 : -1; });
    if (b.length < 4) return 'needs ≥4 bricks';
    var ups = 0, cons = 0, maxCons = 0, maxDown = 0, maxUp = 0;
    for (var i = 0; i < b.length; i++) {
      if (b[i] > 0) { ups++; cons = Math.max(cons, 0); maxUp = Math.max(maxUp, (cons = b[i - 1] > 0 ? cons + 1 : 1)); }
      else { maxDown = Math.max(maxDown, (cons = b[i - 1] < 0 ? cons + 1 : 1)); }
    }
    var streak = b[b.length - 1] > 0 ? maxUp : maxDown;
    if (ups >= b.length * 0.8) return 'strong up';
    if (ups <= b.length * 0.2) return 'strong down';
    if (streak >= 3) return b[b.length - 1] > 0 ? '3-push up' : '3-push down';
    return 'chop / pullback';
  }

  // ─── Signal Store (shared) ─────────────────────────────────────────

  var UNREAD_MAX_STORE = 99;
  var RECENT_MAX_STORE = 12;

  var signalStore = {
    watermark: null,
    newestTs: null,
    unread: 0,
    lastSignal: null,
    recent: [],
    dashboardActive: false,
    loaded: false,
    qualifiedCount60m: undefined,
    _toastCount: 0,
    _listeners: new Set(),

    _load: function () {
      try {
        if (typeof localStorage !== 'undefined') {
          var raw = localStorage.getItem(UNREAD_FILE);
          if (raw) {
            var s = JSON.parse(raw);
            this.watermark = s.watermark != null ? Number(s.watermark) : null;
            this.unread = Number(s.unread) || 0;
            this.lastSignal = s.lastSignal || null;
            this.recent = Array.isArray(s.recent) ? s.recent : [];
          }
        }
      } catch (e) {}
      this.loaded = true;
    },

    _persist: function () {
      try {
        if (typeof localStorage !== 'undefined') {
          localStorage.setItem(UNREAD_FILE, JSON.stringify({
            watermark: this.watermark,
            unread: this.unread,
            lastSignal: this.lastSignal,
            recent: this.recent.slice(0, RECENT_MAX_STORE),
          }));
        }
      } catch (e) {}
    },

    _emit: function () {
      for (var fn of this._listeners) { try { fn(); } catch (e) {} }
    },

    subscribe: function (fn) {
      if (!this.loaded) this._load();
      this._listeners.add(fn);
      try { fn(); } catch (e) {}
      return function () { signalStore._listeners.delete(fn); };
    },

    addSignal: function (sig, opts) {
      var suppressToast = !!(opts && opts.suppressToast);
      if (!this.loaded) this._load();
      var ts = Date.parse(sig && sig.ts) || 0;
      if (!ts) return;

      var key = sig.symbol + '|' + sig.ts;
      var dupIdx = -1;
      for (var i = 0; i < this.recent.length; i++) {
        if ((this.recent[i].symbol + '|' + this.recent[i].ts) === key) { dupIdx = i; break; }
      }
      var hasPrices = Number(sig.entry) > 0 || Number(sig.stop) > 0 || Number(sig.take) > 0;

      if (dupIdx === -1) {
        this.recent = [
          { symbol: sig.symbol, direction: sig.direction, kelly: sig.kelly, regime: sig.regime, entry: sig.entry, stop: sig.stop, take: sig.take, ts: sig.ts },
          ...this.recent,
        ].slice(0, RECENT_MAX_STORE);
      } else if (hasPrices) {
        var prev = this.recent[dupIdx];
        this.recent[dupIdx] = Object.assign({}, prev, {
          entry: prev.entry == null ? sig.entry : prev.entry,
          stop: prev.stop == null ? sig.stop : prev.stop,
          take: prev.take == null ? sig.take : prev.take,
        });
      }

      if (this.watermark == null) {
        this.watermark = ts;
        this.newestTs = ts;
        this.lastSignal = Object.assign({}, sig);
        this._persist();
        this._emit();
        return;
      }

      if (ts > this.newestTs) this.newestTs = ts;
      if (!this.lastSignal || ts > (Date.parse(this.lastSignal.ts) || 0)) {
        this.lastSignal = Object.assign({}, sig);
      }

      if (hasPrices && this.lastSignal && this.lastSignal.symbol === sig.symbol && this.lastSignal.ts === sig.ts) {
        var ls = this.lastSignal;
        if (ls.entry == null || ls.stop == null || ls.take == null) {
          this.lastSignal = Object.assign({}, ls, {
            entry: ls.entry == null ? sig.entry : ls.entry,
            stop: ls.stop == null ? sig.stop : ls.stop,
            take: ls.take == null ? sig.take : ls.take,
          });
          this._persist();
          this._emit();
        }
      }

      if (ts > this.watermark) {
        if (this.dashboardActive) {
          this.watermark = ts;
        } else {
          this.unread = Math.min(UNREAD_MAX_STORE, this.unread + 1);
          this._persist();
          this._emit();

          // Mode 3: in-app toast (dashboard notification system).
          // The web dashboard has its own notification system — we
          // dispatch a custom event the host can listen for.
          if (!suppressToast && !this.dashboardActive) {
            this._toastCount = (this._toastCount || 0) + 1;
            if (typeof window !== 'undefined') {
              window.dispatchEvent(new CustomEvent('talaria:signal', {
                detail: Object.assign({}, sig, {
                  count: this.qualifiedCount60m,
                  unread: this.unread,
                }),
              }));
            }
          }
        }
      }

      this._persist();
      this._emit();
    },

    markSeen: function () {
      if (!this.loaded) this._load();
      this._toastCount = 0;
      if (this.newestTs != null && (this.watermark == null || this.newestTs > this.watermark)) {
        this.watermark = this.newestTs;
      }
      if (this.unread !== 0) {
        this.unread = 0;
        this._persist();
        this._emit();
      }
    },
  };

  // Expose for test harnesses.
  if (typeof globalThis !== 'undefined') {
    try { globalThis.__TALARIA_SIGNAL_STORE__ = signalStore; } catch (e) {}
  }

  // ─── Shared 10s poll (feeds signalStore for widget surfaces) ──────

  var _pollStarted = false;
  function startSignalPolling() {
    if (_pollStarted) return function () {};
    _pollStarted = true;
    var cfg = loadConfig();
    if (!cfg.supabase_url || !cfg.supabase_key) return function () {};
    var poll = async function () {
      try {
        var cutoff60m = new Date(Date.now() - 60 * 60 * 1000).toISOString().slice(0, 19);
        var _a = await Promise.all([
          fetchSupabase(cfg, 'nt_sweep_result', {
            select: 'symbol,signal,effective_kelly,kelly_f,entry_price,stop_loss,take_profit,sweep_timestamp,qualified,regime',
            qualified: 'eq.true',
            order: 'sweep_timestamp.desc', limit: '20',
          }),
          fetchSupabaseCount(cfg, 'nt_sweep_result', {
            qualified: 'eq.true',
            sweep_timestamp: 'gte.' + cutoff60m,
            select: 'id',
          }),
        ]);
        var rows = _a[0];
        var count = _a[1];
        signalStore.qualifiedCount60m = count || 0;
        // FIX (2026-08-14): feed OLDEST→NEWEST so newest survives slice(0,RECENT_MAX).
        var batch = (rows || []).filter(function (r) {
          return r.qualified && String(r.signal || '').toLowerCase() !== 'neutral' && r.sweep_timestamp;
        }).reverse();
        batch.forEach(function (r, i) {
          var isNewest = i === batch.length - 1;
          signalStore.addSignal({
            symbol: r.symbol,
            direction: r.signal,
            kelly: Number(r.effective_kelly != null ? r.effective_kelly : r.kelly_f) || 0,
            regime: r.regime,
            entry: r.entry_price,
            stop: r.stop_loss,
            take: r.take_profit,
            ts: r.sweep_timestamp,
          }, { suppressToast: !isNewest });
        });
      } catch (e) {
        _log('error', 'signal poll failed: ' + (e && e.message ? e.message : String(e)));
      }
    };
    poll();
    var timer = setInterval(poll, CHIP_POLL_MS);
    return function () { clearInterval(timer); };
  }

  // ─── React Components ──────────────────────────────────────────────

  function StatCard(props) {
    return h('div', { className: 'tla-card' },
      h('h3', null, props.title),
      h('div', { className: 'tla-value', style: { color: props.tone === 'pos' ? '#78dc78' : props.tone === 'neg' ? '#ff5c5c' : undefined } }, props.value),
      props.sub ? h('div', { className: 'tla-sub' }, props.sub) : null
    );
  }

  function HotSignalsBanner(props) {
    var signals = props.signals || [];
    if (!signals.length) return null;
    return h('div', { className: 'tla-banner' },
      h('span', { style: { fontWeight: 600 } }, '🔥 Hot signals'),
      h('span', null, signals.length + ' qualified in the last 10m')
    );
  }

  function SignalHealthTable(props) {
    var rows = props.rows || [];
    if (!rows.length) {
      return h('div', { className: 'tla-hint' }, 'No resolved signals yet — rows appear once the EOD resolver closes signals.');
    }
    return h('table', { className: 'tla-table' },
      h('thead', null,
        h('tr', null,
          h('th', null, 'Symbol'),
          h('th', null, 'Resolved'),
          h('th', null, 'Win rate'),
          h('th', null, 'WR LB'),
          h('th', null, 'Bias'),
          h('th', null, 'Total PnL')
        )
      ),
      h('tbody', null,
        rows.map(function (r, i) {
          return h('tr', { key: r.symbol + i },
            h('td', null, r.symbol),
            h('td', null, r.n_resolved != null ? String(r.n_resolved) : '—'),
            h('td', null, r.win_rate != null ? (Number(r.win_rate) * 100).toFixed(1) + '%' : '—'),
            h('td', null, '—'),
            h('td', null, r.bias != null ? Number(r.bias).toFixed(3) : '—'),
            h('td', { className: r.total_pnl != null && Number(r.total_pnl) >= 0 ? 'tla-ok' : '' },
              r.total_pnl != null ? '$' + Number(r.total_pnl).toFixed(2) : '—')
          );
        })
      )
    );
  }

    function TalariaMark(_ref) {
      var className = _ref.className !== undefined ? _ref.className : 'tla-mark';
      var size = _ref.size !== undefined ? _ref.size : 24;
      var color = _ref.color !== undefined ? _ref.color : '#B8823D';
      return h('svg', {
        className: className,
        width: size,
        height: size,
        viewBox: '0 0 100 100',
        'aria-hidden': true,
        style: {
          display: 'inline-block',
          flexShrink: '0',
          width: size + 'px',
          height: size + 'px',
        },
      },
        h('circle', { cx: 24, cy: 76, r: 8, fill: 'none', stroke: color, 'stroke-width': 6 }),
        h('path', {
          d: 'M28 70 L44 50 L38 64 L56 40 L48 58 L68 32 L58 52 L82 18 L70 46 L88 8',
          fill: 'none',
          stroke: color,
          'stroke-width': 11,
          'stroke-linejoin': 'miter',
          'stroke-linecap': 'butt',
        })
      );
    }

    function TalariaKellyTable(props) {
    var sweeps = props.sweeps.data || [];
    var symbols = props.symbols.data || [];

    // Dedup to latest per symbol (fetch is sweep_timestamp desc).
    var latestBySym = {};
    for (var _i = 0; _i < sweeps.length; _i++) {
      var r = sweeps[_i];
      if (!r.symbol || latestBySym[r.symbol]) continue;
      latestBySym[r.symbol] = r;
    }
    var rows = Object.values(latestBySym);

    // Asset class lookup from symbol metadata.
    var assetClassOf = {};
    for (var _i2 = 0; _i2 < symbols.length; _i2++) {
      var _r = symbols[_i2];
      if (_r.symbol) assetClassOf[_r.symbol] = _r.asset_class || 'other';
    }

    var CLASS_ORDER = { crypto: 0, forex: 1, commodities: 2, stocks: 3, other: 4 };
    var CLASS_LABEL = {
      crypto: 'Cryptocurrency  💱',
      forex: 'Forex  📊',
      commodities: 'Commodities  🏦',
      stocks: 'Stocks  📈',
      other: 'Other',
    };

    var groups = {};
    for (var _i3 = 0; _i3 < rows.length; _i3++) {
      var _r2 = rows[_i3];
      var cls = assetClassOf[_r2.symbol] || 'other';
      if (!groups[cls]) groups[cls] = [];
      groups[cls].push(_r2);
    }
    var classOrder = Object.keys(groups).sort(function (a, b) {
      return (CLASS_ORDER[a] || 99) - (CLASS_ORDER[b] || 99);
    });

    var THEAD = [
      { k: 'signal', label: 'Signal' },
      { k: 'regime', label: 'Regime' },
      { k: 'kelly', label: 'Effective kelly' },
      { k: 'kelly_f', label: 'kelly_f' },
      { k: 'p_win', label: 'P_win' },
      { k: 'ev', label: 'EV' },
      { k: 'entry', label: 'ENTRY' },
      { k: 'stop_loss', label: 'SL' },
      { k: 'take_profit', label: 'TP' },
    ];

    return h('div', { className: 'tla-kelly-table-wrap' },
      h('table', { className: cn('tla-table', 'tla-kelly-table') },
        h('thead', null,
          h('tr', null,
            h('th', { style: { width: 120 } }, 'Symbol'),
            THEAD.map(function (hd) {
              return h('th', { key: hd.k }, hd.label);
            })
          )
        ),
        h('tbody', null,
          classOrder.map(function (cls) {
            var syms = (groups[cls] || []).slice().sort(function (a, b) {
              return a.symbol.localeCompare(b.symbol);
            });
            if (!syms.length) return null;
            return [
              h('tr', { key: cls + '-header', className: 'tla-group-header-row' },
                h('td', { colSpan: 10, className: 'tla-group-header' },
                  h('span', { style: { display: 'flex', alignItems: 'center', gap: 6 } },
                    CLASS_LABEL[cls] || cls,
                    h('span', { className: 'tla-badge' }, String(syms.length) + ' syms')
                  )
                )
              ),
              ...syms.map(function (r) {
                var sig = String(r.signal || '').toLowerCase();
                var isBuy = sig === 'buy';
                var isSell = sig === 'sell';
                var kellyVal = Number(r.effective_kelly != null ? r.effective_kelly : r.kelly_f) || 0;
                return h('tr', { key: r.symbol + '|' + (r.sweep_timestamp || ''), className: 'tla-kelly-row' },
                  h('td', { className: 'tla-k' }, r.symbol),
                  h('td', { className: cn('tla-sig-cell', isBuy ? 'tla-pos' : isSell ? 'tla-neg' : ''),
                    style: { color: isBuy ? 'var(--ui-accent,#4c9aff)' : isSell ? 'var(--ui-danger,#ff5c5c)' : 'var(--ui-text-tertiary)' } },
                    sig === 'neutral' || !sig ? '—' : sig.toUpperCase()),
                  h('td', null, fmtRegimeShort(r.regime)),
                  h('td', { style: { color: isBuy ? 'var(--ui-accent,#4c9aff)' : isSell ? 'var(--ui-danger,#ff5c5c)' : 'var(--ui-text-tertiary)' } },
                    kellyVal.toFixed(3)),
                  h('td', null, r.kelly_f != null ? Number(r.kelly_f).toFixed(3) : '—'),
                  h('td', null, r.p_win != null ? fmtKellyPct(r.p_win) : '—'),
                  h('td', null, r.ev != null ? '$' + Number(r.ev).toFixed(2) : '—'),
                  h('td', null, Number(r.entry_price) > 0 ? fmtBrickPrice(r.entry_price) : '—'),
                  h('td', { style: { color: 'var(--ui-danger,#ff5c5c)' } }, Number(r.stop_loss) > 0 ? fmtBrickPrice(r.stop_loss) : '—'),
                  h('td', { style: { color: 'var(--ui-accent,#4c9aff)' } }, Number(r.take_profit) > 0 ? fmtBrickPrice(r.take_profit) : '—')
                );
              })
            ];
          })
        )
      )
    );
  }

  function RenkoBrickChart(props) {
    var bricks = props.bricks || [];
    var levels = props.levels || [];
    if (!bricks.length) {
      return h('div', { className: 'tla-hint' }, 'No brick data for this symbol yet.');
    }
    var direction = bricks[0].direction;
    var isBuy = String(direction).toLowerCase() === 'up' || String(direction).toLowerCase() === 'buy';
    var prices = [];
    for (var _i = 0; _i < bricks.length; _i++) {
      var p = Number(bricks[_i].close_price);
      if (p > 0) prices.push(p);
    }
    if (!prices.length) {
      return h('div', { className: 'tla-hint' }, 'No price data in brick series.');
    }
    var minP = Math.min.apply(Math, prices);
    var maxP = Math.max.apply(Math, prices);
    var brickSize = Number(bricks[0].brick_size) || 1;
    var range = maxP - minP || brickSize;
    var padding = range * 0.2;
    var chartMin = minP - padding;
    var chartMax = maxP + padding;
    var chartRange = chartMax - chartMin;
    var height = 300;
    var barHeight = function (p) { return ((p - chartMin) / chartRange) * height; };

    return h('svg', {
      className: 'tla-renko-chart',
      width: '100%',
      height: height,
      viewBox: '0 0 640 ' + height,
      style: { width: '100%', maxHeight: '420px', height: 'auto' },
    },
      h('rect', { x: 0, y: 0, width: 640, height: height, fill: 'transparent' }),
      levels.map(function (lv, i) {
        var y = height - barHeight(lv.price);
        return [
          h('line', { key: 'line-' + i, x1: 0, y1: y, x2: 640, y2: y, stroke: lv.color, 'stroke-width': 1, 'stroke-dasharray': '4 3' }),
          h('text', { key: 'label-' + i, x: 8, y: y - 4, fill: lv.color, 'font-size': 10 }, lv.label)
        ];
      }),
      bricks.map(function (b, i) {
        var y = height - barHeight(Number(b.close_price));
        var w = 30;
        var x = i * (w + 2);
        return h('rect', {
          key: b.brick_index || i,
          x: x, y: y - 15, width: w, height: 15,
          fill: isBuy ? 'rgba(76,154,255,0.3)' : 'rgba(255,92,92,0.3)',
          stroke: isBuy ? 'var(--ui-accent,#4c9aff)' : 'var(--ui-danger,#ff5c5c)',
          'stroke-width': 1,
        });
      })
    );
  }

  // ─── Connect tab ───────────────────────────────────────────────────

  function ConnectTab(props) {
    var config = props.config;
    var onSave = props.onSave;
    var _a = useState({ supabase_url: config.supabase_url, supabase_key: config.supabase_key, claim_token: config.claim_token || '' });
    var local = _a[0]; var setLocal = _a[1];

    var handleSubmit = function (e) {
      e.preventDefault();
      onSave({ claim_token: local.claim_token });
    };

    var hasConfig = !!(config.supabase_url && config.supabase_key && config.claim_token);

    return h('div', { className: 'tla-root' },
      h('div', { className: 'tla-header' }, h(TalariaMark, { size: 20 }), ' Talaria · Connect'),
      h('div', { className: 'tla-card' },
        h('h3', null, 'Connection settings'),
        h('div', { className: 'tla-field' },
          h('label', null, 'Supabase URL'),
          h('input', {
            type: 'text',
            value: local.supabase_url || '',
            readOnly: true,
            style: { background: 'rgba(0,0,0,0.03)', cursor: 'not-allowed' },
          }),
          h('div', { className: 'tla-hint' }, 'Pre-filled from defaults. Edit talaria-config.json if you need to override.')
        ),
        h('div', { className: 'tla-field' },
          h('label', null, 'Claim token'),
          h('input', {
            type: 'text',
            placeholder: 'Enter your talaria claim token',
            value: local.claim_token || '',
            onChange: function (e) { setLocal({ supabase_url: local.supabase_url, supabase_key: local.supabase_key, claim_token: e.target.value }); },
          })
        ),
        h('div', { style: { marginTop: 12 } },
          h('button', { className: 'tla-btn', onClick: handleSubmit, disabled: !local.claim_token }, 'Save & connect')
        )
      ),
      hasConfig ? null : h('div', { className: 'tla-banner' },
        'Enter your claim token from the Noble Trading App portal to get started.')
    );
  }

  function SubscribeScreen(props) {
    return h('div', { className: 'tla-root' },
      h('div', { className: 'tla-center' },
        h('div', { className: 'tla-title' }, 'Talaria · Subscribe'),
        h('div', { className: 'tla-banner tla-banner-paywall' },
          'Your claim token is valid, but no active subscription was found.'),
        h('div', { className: 'tla-hint' },
          'Subscribe at nobletradingapp.com to get access to Talaria signal feeds.'),
        props.claim.next_charge_url
          ? h('a', { href: props.claim.next_charge_url, className: 'tla-btn', target: '_blank', rel: 'noopener' }, 'Go to subscription')
          : null,
        h('button', { className: 'tla-btn-secondary', onClick: props.onRetry, style: { marginTop: 8 } }, 'Retry')
      )
    );
  }

  function WaitingScreen(props) {
    return h('div', { className: 'tla-root' },
      h('div', { className: 'tla-center' },
        h('div', { className: 'tla-title' }, 'Payment pending'),
        h('div', { className: 'tla-hint' },
          'Your subscription is being processed. Check back in a few minutes.'),
        h('button', { className: 'tla-btn-secondary', onClick: props.onRetry }, 'Retry')
      )
    );
  }

  function PaywallScreen(props) {
    return h('div', { className: 'tla-root' },
      h('div', { className: 'tla-center' },
        h('div', { className: 'tla-title' }, 'Subscription expired'),
        h('div', { className: 'tla-banner tla-banner-paywall' },
          'Your subscription has expired or was cancelled.'),
        props.claim.next_charge_url
          ? h('a', { href: props.claim.next_charge_url, className: 'tla-btn', target: '_blank', rel: 'noopener' }, 'Renew subscription')
          : null,
        h('button', { className: 'tla-btn-secondary', onClick: props.onRetry, style: { marginTop: 8 } }, 'Retry')
      )
    );
  }

  // ─── TradingView lightweight-charts lazy loader ──────────────────────
  // Returns a promise resolving to window.LightweightCharts when available.
  // In a headless/no-DOM environment resolves to null (graceful fallback).
  var tvScriptLoaded = false;
  var tvScriptLoading = false;
  var tvReadyCallbacks = [];
  function ensureTvCharts() {
    if (typeof window === 'undefined') return Promise.resolve(null);
    if (typeof window.LightweightCharts !== 'undefined') return Promise.resolve(window.LightweightCharts);
    if (tvScriptLoaded) return new Promise(function (resolve) { tvReadyCallbacks.push(resolve); });
    if (tvScriptLoading) return new Promise(function (resolve) { tvReadyCallbacks.push(resolve); });
    tvScriptLoading = true;
    var script = document.createElement('script');
    script.src = TV_LWCHARTS_CDN;
    script.onload = function () {
      tvScriptLoaded = true;
      tvScriptLoading = false;
      var lwc = window.LightweightCharts;
      tvReadyCallbacks.forEach(function (cb) { cb(lwc); });
      tvReadyCallbacks = [];
    };
    script.onerror = function () {
      tvScriptLoading = false;
      tvReadyCallbacks.forEach(function (cb) { cb(null); });
      tvReadyCallbacks = [];
    };
    document.head.appendChild(script);
    return new Promise(function (resolve) { tvReadyCallbacks.push(resolve); });
  }

  // 0.2.11: Fetch TDVA candle data and populate watchlist mini-charts.
  var _tvCandleCache = {};
  function TDVA_CANDLES_URL(sym) {
    return 'https://price-feeds.tradingview-proxy.com/history?symbol=' + encodeURIComponent(sym) + '&resolution=' + TV_TIMEFRAME + '&n=' + TV_BAR_COUNT;
  }
  function fetchTvCandles(sym) {
    if (_tvCandleCache[sym]) return Promise.resolve(_tvCandleCache[sym]);
    if (typeof fetch === 'undefined') return Promise.resolve([]);
    return fetch(TDVA_CANDLES_URL(sym), { signal: (typeof AbortSignal !== 'undefined' && AbortSignal.timeout) ? AbortSignal.timeout(5000) : undefined })
      .then(function (res) { return res.ok ? res.json() : []; })
      .then(function (data) {
        var bars = [];
        if (Array.isArray(data)) bars = data;
        else if (Array.isArray(data.values)) bars = data.values;
        else if (data.t) {
          for (var i = 0; i < data.t.length; i++) {
            bars.push({ time: data.t[i], open: data.o[i], high: data.h[i], low: data.l[i], close: data.c[i] });
          }
        }
        _tvCandleCache[sym] = bars;
        return bars;
      })
      .catch(function () { return []; });
  }

  // ─── Watchlist with TradingView mini-charts (0.2.11) ──────────────────
  function TalariaWatchlist(props) {
    var symbolList = props.symbolList || [];
    var sweeps = props.sweeps || {};
    var activeBrickSym = props.activeBrickSym || '';
    var containerRef = useRef(null);
    var chartRefs = useRef({});
    var _a = useState(false);
    var tvReady = _a[0]; var setTvReady = _a[1];

    // Derive latest sweep row per symbol from the existing 200-row fetch.
    var latestBySym = {};
    for (var _i = 0; _i < (sweeps.data || []).length; _i++) {
      var r = sweeps.data[_i];
      if (!latestBySym[r.symbol]) latestBySym[r.symbol] = r;
    }

    useEffect(function () {
      var cancelled = false;
      ensureTvCharts().then(function (lwc) {
        // setTvReady first — must happen before cancellation (harness stubs
        // call cleanup immediately; in production React defers to unmount).
        setTvReady(!!lwc);
        if (cancelled || !lwc || !containerRef.current) return;
        symbolList.forEach(function (sym) {
            var canvas = containerRef.current && containerRef.current.querySelector('[data-tv-canvas="' + sym + '"]');
            if (canvas && !chartRefs.current[sym]) {
              var chart = lwc.createChart(canvas, {
                width: canvas.clientWidth || 200,
                height: 80,
                layout: { background: { type: 'transparent' }, textColor: 'var(--ui-text-tertiary)' },
                grid: { vertLines: { display: 0 }, horzLines: { display: 0 } },
                rightPriceScale: { scaleMargins: { top: 0, bottom: 1 } },
                timeScale: { visible: false },
              });
              chartRefs.current[sym] = chart;
              // 0.2.11: Fetch TDVA candles and populate the chart with real candle data.
              fetchTvCandles(sym).then(function (bars) {
                if (cancelled || !chartRefs.current[sym]) return;
                if (bars && bars.length) {
                  var candleData = bars.map(function (b) {
                    return {
                      time: b.time || b.t,
                      open: Number(b.open || b.o),
                      high: Number(b.high || b.h),
                      low: Number(b.low || b.l),
                      close: Number(b.close || b.c)
                    };
                  }).filter(function (d) { return d.time && !isNaN(d.open); });
                  if (candleData.length) {
                    var series = chartRefs.current[sym].addCandlestickSeries({
                      upColor: '#26a69a',
                      downColor: '#ef5350',
                      borderDownColor: '#ef5350',
                      borderUpColor: '#26a69a',
                      wickDownColor: '#ef5350',
                      wickUpColor: '#26a69a'
                    });
                    series.setData(candleData);
                  }
                }
              });
            }
          });
      });
      return function () {
        cancelled = true;
        Object.keys(chartRefs.current).forEach(function (sym) {
          if (chartRefs.current[sym]) { chartRefs.current[sym].remove(); delete chartRefs.current[sym]; }
        });
      };
    }, [symbolList, sweeps]);

    if (!symbolList.length) {
      return h('div', { className: 'tla-card' },
        h('h3', null, 'Watchlist'),
        h('div', { className: 'tla-hint' }, 'No symbols in your plan with recent sweep data.'));
    }

    return h('div', { className: 'tla-card' },
      h('h3', null, 'Watchlist'),
      h('div', { className: 'tla-explainer' },
        'Per-symbol mini charts (TradingView lightweight-charts, static historical candles) with live signal levels, regime, and sizing from the latest sweep. The row for the selected Renko symbol is highlighted.'),
      h('div', { ref: containerRef, className: 'tla-watchlist' },
        symbolList.map(function (sym) {
          var row = latestBySym[sym] || {};
          var sig = String(row.signal || '').toLowerCase();
          var isBuy = sig === 'buy';
          var isSell = sig === 'sell';
          var kellyVal = Number(row.effective_kelly != null ? row.effective_kelly : row.kelly_f) || 0;
          var isActive = sym === activeBrickSym;
          var ageMins = row.sweep_timestamp
            ? Math.round((Date.now() - Date.parse(row.sweep_timestamp)) / 60000)
            : null;
          return h('div', {
            key: sym,
            className: cn('tla-watchlist-row', isActive ? 'tla-watchlist-row-active' : ''),
          },
            h('div', {
              'data-tv-canvas': sym,
              className: cn('tla-watchlist-chart', tvReady ? 'tla-watchlist-chart-loaded' : 'tla-watchlist-chart-pending'),
              style: { width: '200px', height: '80px', flexShrink: '0' },
            }),
            h('div', { className: 'tla-watchlist-meta' },
              h('span', { className: 'tla-watchlist-sym' }, sym),
              h('span', {
                className: cn('tla-sig-cell', isBuy ? 'tla-pos' : isSell ? 'tla-neg' : ''),
                style: { color: isBuy ? 'var(--ui-accent,#4c9aff)' : isSell ? 'var(--ui-danger,#ff5c5c)' : 'var(--ui-text-tertiary)' },
              }, sig === 'neutral' || !sig ? '—' : sig.toUpperCase()),
              h('span', { className: 'tla-watchlist-regime' }, fmtRegimeShort(row.regime)),
              kellyVal !== 0 && h('span', { className: 'tla-watchlist-kelly' }, kellyVal > 0 ? '🐂' + kellyVal.toFixed(2) : '🐻' + kellyVal.toFixed(2)),
              h('div', { className: 'tla-watchlist-levels' },
                row.entry_price != null && Number(row.entry_price) > 0
                  ? h('span', { className: 'tla-watchlist-price-entry' }, 'E ' + fmtBrickPrice(row.entry_price))
                  : null,
                row.stop_loss != null && Number(row.stop_loss) > 0
                  ? h('span', { className: 'tla-watchlist-price-sl' }, 'SL ' + fmtBrickPrice(row.stop_loss))
                  : null,
                row.take_profit != null && Number(row.take_profit) > 0
                  ? h('span', { className: 'tla-watchlist-price-tp' }, 'TP ' + fmtBrickPrice(row.take_profit))
                  : null
              ),
              ageMins != null && h('span', { className: 'tla-watchlist-age' },
                ageMins < 1 ? 'just now' : ageMins < 60 ? ageMins + 'm' : Math.round(ageMins / 60) + 'h')
            )
          );
        })
      ),
      h('div', { className: 'tla-hint' },
        'TradingView reference chart; Talaria supplies signal levels, regime, and sizing. · TDVA static candles (no streaming)')
    );
  }

  // 0.2.11: Full-width TV chart panel for the selected symbol.
  function TalariaTvChart(props) {
    var symbol = props.symbol || '';
    var sweeps = props.sweeps || {};
    var containerRef = useRef(null);
    var chartRef = useRef(null);
    var _a = useState(null); var lwc = _a[0]; var setLwc = _a[1];
    var _b = useState(null); var candles = _b[0]; var setCandles = _b[1];
    var _loaded = useState(false); var dataLoaded = _loaded[0]; var setDataLoaded = _loaded[1];
    var _c = useState(false); var ready = _c[0]; var setReady = _c[1];

    // 0.2.11: SVG fallback for loading/no-data states
    var fallbackBars = candles || [];
    var fallbackSvg = null;
    if (!dataLoaded) {
      fallbackSvg = h('svg', { viewBox: '0 0 100 100', preserveAspectRatio: 'none',
        style: { width: '100%', height: '100%', position: 'absolute', top: 0, left: 0 },
        className: 'tla-tv-svg-fallback tla-tv-loading' },
        h('text', { x: '50%', y: '50%', dy: '0.5em', textAnchor: 'middle', dominantBaseline: 'middle',
          fill: 'var(--ui-text-tertiary)', fontSize: '8' }, 'Loading 5M candles…')
      );
    } else if (!fallbackBars.length) {
      fallbackSvg = h('svg', { viewBox: '0 0 100 100', preserveAspectRatio: 'none',
        style: { width: '100%', height: '100%', position: 'absolute', top: 0, left: 0 },
        className: 'tla-tv-svg-fallback tla-tv-no-data' },
        h('text', { x: '50%', y: '50%', dy: '0.5em', textAnchor: 'middle', dominantBaseline: 'middle',
          fill: 'var(--ui-text-tertiary)', fontSize: '7' }, 'No candle data — chart pending…')
      );
    }

    useEffect(function () {
      var cancelled = false;
      ensureTvCharts().then(function (lwcMod) {
        if (!cancelled) setLwc(lwcMod);
      });
      return function () { cancelled = true; };
    }, []);

    useEffect(function () {
      if (!symbol) { setCandles(null); setDataLoaded(false); return; }
      var cancelled = false;
      setDataLoaded(false);
      fetchTvCandles(symbol).then(function (data) {
        if (!cancelled) { setCandles(data); setDataLoaded(true); }
      }).catch(function () { if (!cancelled) { setCandles(null); setDataLoaded(true); } });
      return function () { cancelled = true; };
    }, [symbol]);

    useEffect(function () {
      if (!lwc || !containerRef.current) return;
      var canvas = containerRef.current;
      if (chartRef.current) { try { chartRef.current.remove(); } catch (e) {} chartRef.current = null; }
      var chart = lwc.createChart(canvas, {
        width: canvas.clientWidth || 800, height: 240,
        layout: { background: { type: 'Solid', color: 'transparent' }, textColor: '#aaa' },
        rightPriceScale: { scaleMargins: { top: 0.1, bottom: 0.2 } },
        grid: { vertLines: { color: 'rgba(42,42,42,0.5)' }, horzLines: { color: 'rgba(42,42,42,0.5)' } },
      });
      var series = chart.addCandlestickSeries({
        upColor: '#26a69a', downColor: '#ef5350', borderDownColor: '#ef5350',
        borderUpColor: '#26a69a', wickDownColor: '#ef5350', wickUpColor: '#26a69a',
      });
      if (candles && candles.length) {
        var valid = candles.map(function (c) {
          return {
            time: c.time ? new Date(c.time).getTime() : undefined,
            open: Number(c.open || c.o), high: Number(c.high || c.h),
            low: Number(c.low || c.l), close: Number(c.close || c.c),
          };
        }).filter(function (d) { return !isNaN(d.time) && d.time > 0 && !isNaN(d.open); });
        if (valid.length) {
          var sorted = valid.sort(function (a, b) { return a.time - b.time; });
          series.setData(sorted);
          chart.timeScale().fitContent();
        }
      }
      var sweepRow = (sweeps.data || []).find(function (r) { return r.symbol === symbol; });
      if (sweepRow) {
        var levels = [
          { price: Number(sweepRow.entry_price), color: '#ffeb3b', label: 'ENTRY' },
          { price: Number(sweepRow.stop_loss), color: '#ef5353', label: 'SL' },
          { price: Number(sweepRow.take_profit), color: '#26a69a', label: 'TP' },
        ];
        levels.forEach(function (lv) {
          if (!isNaN(lv.price) && lv.price > 0) {
            chart.addHorizontalLine({ price: lv.price, color: lv.color, lineWidth: 1, axisLabelVisible: true, title: lv.label });
          }
        });
      }
      chartRef.current = chart;
      setReady(true);
      return function () {
        if (chartRef.current) { try { chartRef.current.remove(); } catch (e) {} }
        chartRef.current = null;
      };
    }, [lwc, candles, symbol, sweeps]);

    return h('div', { className: 'tla-card tla-tv-chart-card' },
      h('h3', null, 'TradingView reference chart — ' + (symbol || 'select a symbol')),
      h('div', { className: cn('tla-tv-canvas-wrapper', ready ? 'tla-tv-ready' : 'tla-tv-pending'), ref: containerRef },
        ready ? null : fallbackSvg),
      h('div', { className: 'tla-hint' },
        'TradingView reference chart (lightweight-charts, 5M candles, 60 bars); Talaria supplies signal levels, regime, and sizing')
    );
  }

  // ─── Main dashboard page ───────────────────────────────────────────

  function TalariaPage(props) {
    ensureStyle();
    var config = props.config;
    var claim = props.claim;
    var connected = !!(config.supabase_url && config.supabase_key);
    var isPro = claim.plan_slug === 'precision_pro';
    var _a = useState([]);
    var liveSignals = _a[0]; var setLiveSignals = _a[1];
    var _b = useState([]);
    var paperEvents = _b[0]; var setPaperEvents = _b[1];
    var _c = useState(null);
    var brickSym = _c[0]; var setBrickSym = _c[1];
    // 0.2.11: Two-tab dashboard — Market (live) | Analysis (historical).
    var _d = useState('market');
    var activeTab = _d[0]; var setActiveTab = _d[1];

    // Symbol list — plan-gated via nt_symbol.plan_ids cs. filter.
    var hasPlanUuid = !!claim.plan_uuid;
    var symbols = useSupabaseData(config, 'nt_symbol',
      { select: 'symbol,asset_class', plan_ids: hasPlanUuid ? 'cs.(' + claim.plan_uuid + ')' : undefined },
      connected && hasPlanUuid);
    var planSymbols = (symbols.data || []).map(function (r) { return r.symbol; }).filter(Boolean);
    var assetClassOf = {};
    for (var _i = 0; _i < (symbols.data || []).length; _i++) {
      var r = symbols.data[_i];
      assetClassOf[r.symbol] = r.asset_class || 'other';
    }
    var CLASS_RANK = { commodities: 0, forex: 1, crypto: 2, stocks: 3 };
    var sortByClassThenSymbol = function (a, b) {
      var ra = CLASS_RANK[assetClassOf[a]] != null ? CLASS_RANK[assetClassOf[a]] : 9;
      var rb = CLASS_RANK[assetClassOf[b]] != null ? CLASS_RANK[assetClassOf[b]] : 9;
      return (ra - rb) || a.localeCompare(b);
    };

    // Sweep data
    var sweeps = useSupabaseData(config, 'nt_sweep_result',
      { select: 'symbol,sweep_timestamp,regime,regime_conf,markov_p_up,markov_p_dn,p_win,ev,p_timesfm,kelly_f,effective_kelly,brick_size,sl_bricks,tp_bricks,signal,entry_price,stop_loss,take_profit,qualified,aggression,regime_shift,prev_regime,size_mult', order: 'sweep_timestamp.desc', limit: '200' },
      connected);

    // Active symbols = plan ∩ sweep
    var sweepSyms = [];
    var seen = {};
    for (var _i2 = 0; _i2 < (sweeps.data || []).length; _i2++) {
      var _r = sweeps.data[_i2];
      if (!_r.symbol || seen[_r.symbol]) continue;
      seen[_r.symbol] = true;
      sweepSyms.push(_r.symbol);
    }
    var symbolList = (sweepSyms.length ? planSymbols.filter(function (s) { return sweepSyms.includes(s); }) : planSymbols)
      .slice()
      .sort(sortByClassThenSymbol);

    var activeBrickSym = brickSym || (symbolList[0] || '');
    var bricks = useSupabaseData(config, 'nt_renko_bricks',
      { select: 'symbol,direction,brick_size,open_price,close_price,high,low,brick_index,ts', order: 'session_date.desc,brick_index.desc', limit: '10', symbol: 'eq.' + activeBrickSym },
      connected && !!activeBrickSym);

    var paperPositions = useSupabaseData(config, 'nt_paper_positions',
      { select: 'symbol,direction,status,realized_pnl,r_multiple,open_ts', order: 'open_ts.desc', limit: '20' },
      connected && isPro);
    var paperEquity = useSupabaseData(config, 'v_paper_equity',
      { select: 'day,realized_pnl,cumulative_pnl', order: 'day.desc', limit: '1' },
      connected && isPro);

    var signalHealth = useSupabaseData(config, 'v_talaria_signal_health',
      { select: '*', limit: '20' },
      connected);
    var portStats = useSupabaseData(config, 'v_talaria_portfolio_stats',
      { select: '*', limit: '1' },
      connected && isPro);
    var calib = useSupabaseData(config, 'v_eod_calibration_bias_latest',
      { select: 'day,symbol,avg_predicted_p_win,realized_win_rate,bias,status,bias_raw,status_raw,n' },
      connected);
    var vsOpt = useSupabaseData(config, 'v_paper_vs_optimized_daily',
      { select: 'day,paper_pnl,equal_wt_pnl,paper_minus_equal_wt', order: 'day.desc', limit: '14' },
      connected && isPro);

    // Live Realtime socket
    var wsState = useRealtime(config, connected, claim.plan_slug, {
      onSignal: function (s) {
        setLiveSignals(function (prev) { return [s, ...prev].slice(0, 50); });
        signalStore.addSignal(s);
      },
      onPaper: function (p) { setPaperEvents(function (prev) { return [p, ...prev].slice(0, 50); }); },
    });

    // Mark dashboard active → advance watermark instead of counting unread.
    useEffect(function () {
      signalStore.dashboardActive = true;
      signalStore.markSeen();
      return function () { signalStore.dashboardActive = false; };
    }, []);

    // Subscribe to store updates for qualifiedCount60m.
    var _d = useState(0);
    var setCountTick = _d[1];
    useEffect(function () {
      return signalStore.subscribe(function () { setCountTick(function (t) { return t + 1; }); });
    }, []);

    // 0.2.11: Derived vars for Analysis tab Pro sections
    var vsOptRows = (vsOpt.data || []).slice(0, 14);
    var portRow = (portStats.data || [])[0];

    // Build banner signals (live + seeds)
    var seedSignals = [];
    for (var _i3 = 0; _i3 < (sweeps.data || []).length; _i3++) {
      var sr = sweeps.data[_i3];
      if (sr.qualified && String(sr.signal || '').toLowerCase() !== 'neutral' && sr.kelly_f != null && !isNaN(Number(sr.kelly_f))) {
        seedSignals.push({
          symbol: sr.symbol,
          direction: sr.signal,
          kelly: Number(sr.effective_kelly != null ? sr.effective_kelly : sr.kelly_f) || 0,
          regime: sr.regime,
          ts: sr.sweep_timestamp,
        });
      }
    }
    var bannerSignals = [];
    var seen2 = {};
    for (var _i4 = 0; _i4 < [...liveSignals, ...seedSignals].length; _i4++) {
      var s = _i4 < liveSignals.length ? liveSignals[_i4] : seedSignals[_i4 - liveSignals.length];
      var k = s.symbol + '|' + (s.ts || '');
      if (!seen2[k]) { seen2[k] = true; bannerSignals.push(s); }
    }

    // Renko + ENTRY/SL/TP levels
    var brickWindow = ((bricks.data || []).filter(function (b) { return b.symbol === activeBrickSym; })).reverse();
    var sweepRow = (sweeps.data || []).find(function (r) { return r.symbol === activeBrickSym; });
    // Most-qualified symbol's latest sweep row — for the standalone TimesFM card.
    var ctxRowDash = (function () {
      var latest = {};
      for (var _i = 0; _i < (sweeps.data || []).length; _i++) {
        var _d = sweeps.data[_i];
        if (!latest[_d.symbol]) latest[_d.symbol] = _d;
      }
      var vals = Object.values(latest);
      return vals.find(function (r) { return r.qualified; }) || vals[0] || {};
    })();
    var levels = [];
    if (sweepRow) {
      if (sweepRow.entry_price != null && Number(sweepRow.entry_price) > 0)
        levels.push({ label: 'ENTRY', price: Number(sweepRow.entry_price), color: 'var(--ui-text-primary)' });
      if (sweepRow.stop_loss != null && Number(sweepRow.stop_loss) > 0)
        levels.push({ label: 'SL', price: Number(sweepRow.stop_loss), color: 'var(--ui-danger,#ff5c5c)' });
      if (sweepRow.take_profit != null && Number(sweepRow.take_profit) > 0)
        levels.push({ label: 'TP', price: Number(sweepRow.take_profit), color: 'var(--ui-accent,#4c9aff)' });
    }

    return h('div', { className: 'tla-root' },
      h('div', { className: 'tla-header' }, h(TalariaMark, { size: 20 }), ' Talaria · Noble Trading App'),
      h(HotSignalsBanner, { signals: bannerSignals }),
      h('div', { className: 'tla-grid' },
        h(StatCard, {
          title: 'Plan',
          value: claim.plan_slug === 'precision_pro' ? 'Precision Pro' : 'Signal Scout',
          sub: 'Subscription ' + (claim.sub_status === 'active' ? 'Active' : claim.sub_status === 'grace' ? 'Grace' : 'Inactive') + ' · Token Valid'
        }),
        h(StatCard, {
          title: 'Symbols',
          value: String(symbolList.length || '—'),
          sub: symbols.error ? 'symbol list unavailable (' + symbols.error.message + ')' : (claim.plan_slug === 'precision_pro' ? 'Precision Pro' : 'Signal Scout')
        }),
        h(StatCard, {
          title: 'Realtime',
          value: wsState === 'open' ? 'Live' : wsState === 'connecting' ? 'Connecting' : wsState === 'idle' ? '—' : 'Poll fallback',
          sub: 'signals (' + (isPro ? 'pro' : 'scout') + ')' + (isPro ? ' + portfolio' : '') + ' · REST poll 60s',
          tone: wsState === 'open' ? 'pos' : undefined
        }),
        h(StatCard, {
          title: 'Qualified signals',
          value: String(signalStore.qualifiedCount60m || 0),
          sub: 'qualified signals in the last 60m'
        })
      ),
      // 0.2.11: Tab bar
      h('div', { className: 'tla-tabs' },
        h('button', {
          className: cn('tla-tab-btn', activeTab === 'market' ? 'tla-tab-active' : ''),
          onClick: function () { setActiveTab('market'); },
        }, 'Market'),
        h('button', {
          className: cn('tla-tab-btn', activeTab === 'analysis' ? 'tla-tab-active' : ''),
          onClick: function () { setActiveTab('analysis'); },
        }, 'Analysis')
      ),
      // ─── MARKET TAB (live per-symbol) ──
      activeTab === 'market' && h('div', null,
      // Renko + brick picker
      h('div', { className: 'tla-card' },
        h('h3', null, 'Renko bricks — last 10 (per symbol)'),
        h('div', { className: 'tla-explainer' },
          'The last 10 renko bricks of the selected symbol. ENTRY / SL / TP reference lines come from that symbol\'s latest sweep.'),
        h('div', { className: 'tla-brick-picker' },
          symbolList.map(function (s) {
            return h('button', {
              key: s,
              className: cn('tla-brick-btn', s === activeBrickSym ? 'tla-brick-btn-active' : ''),
              onClick: function () { setBrickSym(s); },
            }, s);
          })
        ),
        h(RenkoBrickChart, { bricks: brickWindow, levels: levels }),
        h('div', { className: 'tla-hint' },
          'ENTRY / SL / TP reference lines from the latest sweep · window = last 10 bricks')
      ),
      // Markov + pattern — ALL plans. Analyzes the same selected symbol (activeBrickSym).
      // brickPattern reads the last 10 bricks (short-term shape); Markov P(up in 3)
      // comes from the server-side Markov engine in the sweep row.
      h('div', { className: 'tla-card' },
        h('h3', null, 'Markov + pattern — ' + (activeBrickSym || 'select a symbol')),
        h('div', { className: 'tla-explainer' },
          'Short-term shape + longer statistical odds for the selected symbol. Brick pattern reads the last 10 bricks; Markov P(up in 3) comes from the sweep row.'),
        h('div', { className: 'tla-grid' },
          h(StatCard, {
            title: 'Brick pattern',
            value: sweepRow ? brickPattern(brickWindow) : '—',
            sub: 'last ' + brickWindow.length + ' bricks · ' + ((sweepRow && sweepRow.regime) || 'regime n/a')
          }),
          h(StatCard, {
            title: 'Markov P(up in 3)',
            value: sweepRow && sweepRow.markov_p_up != null ? (Number(sweepRow.markov_p_up) * 100).toFixed(1) + '%' : '—',
            sub: sweepRow && sweepRow.markov_p_up != null ? 'P(dn) ' + (Number(sweepRow.markov_p_dn || 0) * 100).toFixed(1) + '% · regime ' + ((sweepRow && sweepRow.regime) || 'n/a') : 'no sweep data',
            tone: sweepRow && sweepRow.markov_p_up != null ? (Number(sweepRow.markov_p_up) > 0.5 ? 'pos' : Number(sweepRow.markov_p_up) < 0.5 ? 'neg' : undefined) : undefined
          })
        ),
        h('div', { className: 'tla-hint' },
          'Brick pattern = the last 10 bricks only (short-term shape: 3-push / pullback / chop). Markov P(up in 3) is the server-side Markov probability the next 3-brick move is up. A 50% value means no edge; >50% leans bullish, <50% leans bearish.')
      ),
      // TimesFM forecast — standalone card (moved below Markov + pattern, 2026-08-15).
      // Includes EV / P_win / p_timesfm — all three context cards that were
      // previously below-table inside the kelly table (now consolidated here).
      ctxRowDash.symbol && h('div', { className: 'tla-card' },
        h('h3', null, 'EV / P_win / TimesFM — ' + ctxRowDash.symbol),
        h('div', { className: 'tla-grid' },
          h(StatCard, {
            title: 'EV — ' + ctxRowDash.symbol,
            value: (ctxRowDash.ev != null && ctxRowDash.ev !== '') ? '$' + Number(ctxRowDash.ev).toFixed(2) : '—',
            sub: 'expected value per $ of risk',
            tone: (ctxRowDash.ev != null && ctxRowDash.ev !== '') ? (Number(ctxRowDash.ev) > 0 ? 'pos' : Number(ctxRowDash.ev) < 0 ? 'neg' : undefined) : undefined,
          }),
          h(StatCard, {
            title: 'P_win — ' + ctxRowDash.symbol,
            value: (ctxRowDash.p_win != null && ctxRowDash.p_win !== '') ? fmtKellyPct(ctxRowDash.p_win) : '—',
            sub: 'predicted probability of winning',
            tone: (ctxRowDash.p_win != null && ctxRowDash.p_win !== '') ? (Number(ctxRowDash.p_win) >= 0.6 ? 'pos' : Number(ctxRowDash.p_win) <= 0.4 ? 'neg' : 'warn') : undefined,
          }),
          h(StatCard, {
            title: 'p_timesfm',
            value: (ctxRowDash.p_timesfm != null && ctxRowDash.p_timesfm !== '') ? (Number(ctxRowDash.p_timesfm) > 0.5 ? '\ud83d\udcc8 ' : '\ud83d\udcc9 ') + fmtKellyPct(ctxRowDash.p_timesfm) : '\u23f3 unavailable',
            sub: (ctxRowDash.p_timesfm != null && ctxRowDash.p_timesfm !== '')
              ? Number(ctxRowDash.p_timesfm) > 0.5 ? 'bullish skew > 50%' : 'bearish skew < 50%'
              : 'no TimesFM model run yet',
            tone: (ctxRowDash.p_timesfm != null && ctxRowDash.p_timesfm !== '') ? (Number(ctxRowDash.p_timesfm) > 0.5 ? 'pos' : 'neg') : undefined
          })
        ),
        h('div', { className: 'tla-hint' },
          'TimesFM is a foundation-model forecast of the next price direction, expressed as a probability (p_timesfm). >50% = bullish skew; <50% = bearish skew. For the most-qualified symbol in the Kelly table below.')
      ),
      // Sizing what-if — ALL plans (arithmetic on sweep kelly + equity).
      // Moved to MARKET tab (0.2.11) — it's per-symbol, below EV/P_win/TimesFM.
      h('div', { className: 'tla-card' },
        h('h3', null, 'Sizing what-if — ' + (activeBrickSym || 'select a symbol')),
        h('div', { className: 'tla-explainer' },
          'If the engine sized a trade on the selected symbol right now: baseline = paper equity × effective_kelly × regime multiplier, clipped by drawdown, capped at 5% of equity.'),
        h('div', { className: 'tla-grid' },
          h(StatCard, { title: 'Sizing', value: '—', sub: activeBrickSym || 'select a symbol' })
        )
      ),
      // 0.2.11: Full-width TV chart — renders for activeBrickSym
      h(TalariaTvChart, { symbol: activeBrickSym, sweeps: sweeps }),
      ),  // close Market tab content wrapper
      // ─── ANALYSIS TAB ──
      activeTab === 'analysis' && h('div', null,
      // Kelly table
      h('div', { className: 'tla-card' },
        h('h3', null, 'Kelly by symbol'),
        h('div', { className: 'tla-explainer' },
          'Latest signal per symbol. Table grouped by asset class, sorted by symbol. Effective Kelly = post-EV scaling fraction of the book the engine would risk (blue buy, red sell).'),
        h(TalariaKellyTable, { sweeps: sweeps, symbols: symbols })
      ),
      // Signal health scoreboard
      h('div', { className: 'tla-card' },
        h('h3', null, 'Signal health scoreboard'),
        h('div', { className: 'tla-explainer' },
          '30-day resolved-signal record per symbol. Wilson LB = 95% lower confidence bound on true win rate.'),
        signalHealth.error
          ? h('div', { className: 'tla-hint' }, 'Signal health view not deployed yet (migration 110) — ' + signalHealth.error.message)
          : h(SignalHealthTable, { rows: signalHealth.data || [] })
      ),
      // Calibration bias
      h('div', { className: 'tla-card' },
        h('h3', null, 'Calibration bias (7d)'),
        h('div', { className: 'tla-explainer' },
          'Does predicted win rate match reality? OVERCONFIDENT = model predicted higher than delivered; UNDERCONFIDENT = wins more than predicted. Smaller text below each bias shows the pre-enforcement model output and how much enforcement is masking the true model drift (Δ = raw − enforced; positive = hiding overconfidence).'),
        h(CalibTable, { rows: calib.data || [] })
      ),
      // Paper vs equal-weight — Precision Pro only (0.2.11, in Analysis tab)
      isPro && h('div', { className: 'tla-card' },
        h('h3', null, 'Paper vs equal-weight'),
        h('div', { className: 'tla-explainer' },
          'Is the strategy beating the benchmark? Paper PnL = the ACTUAL paper book (Kelly-sized, realized only when positions close). Equal-wt PnL = THEORETICAL unit-size PnL of every resolved signal — what you would have made betting $1 per signal on every symbol with no regime filter. IMPORTANT: these are different scales AND different timings. A negative delta usually does NOT mean the strategy lost money — it means the benchmark counted signals the paper book had not closed yet that day. Read it as a trend, not an exact comparison.'),
        vsOpt.error
          ? h('div', { className: 'tla-hint' }, 'Comparison view not deployed yet — ' + vsOpt.error.message)
          : vsOptRows.length === 0
            ? h('div', { className: 'tla-hint' }, 'No comparison rows yet.')
            : h('table', { className: cn('tla-table', 'dui-table', 'dui-table-sm') },
                h('thead', null,
                  h('tr', null,
                    h('th', null, 'Day'),
                    h('th', null, 'Paper PnL'),
                    h('th', null, 'Equal-wt PnL'),
                    h('th', null, 'Delta'))),
                h('tbody', null,
                  vsOptRows.map(function (r, i) {
                    return h('tr', { key: (r.day || '') + i },
                      h('td', { className: 'tla-sm' }, String(r.day || '').slice(0, 10)),
                      h('td', { className: Number(r.paper_pnl || 0) >= 0 ? 'tla-pos' : 'tla-neg' }, '$' + Number(r.paper_pnl || 0).toFixed(2)),
                      h('td', null, '$' + Number(r.equal_wt_pnl || 0).toFixed(2)),
                      h('td', {
                        className: Number(r.paper_minus_equal_wt || 0) >= 0 ? 'tla-pos' : 'tla-neg',
                      }, '$' + Number(r.paper_minus_equal_wt || 0).toFixed(2)),
                    );
                  }))
              ),
        h('div', { className: 'tla-hint' },
          'Is the strategy beating the benchmark? Paper PnL = the signal engine\'s Kelly/regime-sized trades. Equal-wt PnL = what you would have made betting the same amount on every symbol with no regime filter. Delta > $0 (green) = the engine beat the equal-weight benchmark that day; Delta < $0 (red) = the benchmark won. · last 14 days')
      ),
      // Portfolio stats — Precision Pro only (0.2.11, in Analysis tab)
      isPro && h('div', { className: 'tla-card' },
        h('h3', null, 'Portfolio stats — Precision Pro'),
        h('div', { className: 'tla-explainer' },
          'What this is: risk-adjusted performance of the CLOSED paper trades in the Paper portfolio section above (Sharpe, Sortino, Calmar, drawdown, profit factor, total PnL). These are computed from the ACTUAL sized paper book — the same +$0.xx number you see in Paper equity — NOT the theoretical Signal health scoreboard. Dash (—) = not enough CLOSED trades yet for a meaningful number, which is expected early on.'),
        portStats.error
          ? h('div', { className: 'tla-hint' }, 'Portfolio stats view not deployed yet (migration 110) — ' + portStats.error.message)
          : portRow
            ? h('div', { className: 'tla-grid' },
                h(StatCard, { title: 'Sharpe', value: portRow.sharpe != null ? Number(portRow.sharpe).toFixed(2) : '—', sub: 'annualized daily' }),
                h(StatCard, { title: 'Sortino', value: portRow.sortino != null ? Number(portRow.sortino).toFixed(2) : '—', sub: 'downside-only' }),
                h(StatCard, { title: 'Calmar', value: portRow.calmar != null ? Number(portRow.calmar).toFixed(2) : '—', sub: 'return / max DD' }),
                h(StatCard, { title: 'Profit factor', value: portRow.profit_factor != null ? Number(portRow.profit_factor).toFixed(2) : '—', sub: 'gross wins / gross losses', tone: portRow.profit_factor != null && Number(portRow.profit_factor) >= 1 ? 'pos' : 'neg' }),
                h(StatCard, { title: 'Total PnL', value: portRow.total_pnl != null ? '$' + Number(portRow.total_pnl).toFixed(2) : '—', sub: portRow.n_trades != null ? portRow.n_trades + ' trades · win rate ' + (portRow.win_rate != null ? (Number(portRow.win_rate) * 100).toFixed(1) + '%' : '—') : '', tone: portRow.total_pnl != null && Number(portRow.total_pnl) >= 0 ? 'pos' : 'neg' }),
              )
            : h('div', { className: 'tla-hint' }, 'No portfolio stats yet — the paper book needs resolved positions.'),
        h('div', { className: 'tla-hint' },
          'Risk-adjusted performance of the paper book over its trading history. Sharpe = reward per unit of volatility; Sortino = same but only counts downside; Calmar = annualized return / max drawdown; Profit factor = gross wins / gross losses (above 1.0 = profitable); Total PnL = cumulative paper profit. Dash (—) = not enough closed trades yet.')
      ),
      ),  // close Analysis tab content wrapper
      // Footer
      h('div', { className: 'tla-hint' },
        'Talaria v' + PLUGIN_VERSION + ' · Copyright - Noble Trading App & Lexington Tech LLC')
    );
  }
  function CalibTable(props) {
    var rows = props.rows || [];
    if (!rows.length) {
      return h('div', { className: 'tla-hint' }, 'No calibration rows yet — resolved signals needed.');
    }
    return h('table', { className: 'tla-table' },
      h('thead', null,
        h('tr', null,
          h('th', null, 'Day'),
          h('th', null, 'Symbol'),
          h('th', null, 'Predicted'),
          h('th', null, 'Realized'),
          h('th', null, 'Bias'),
          h('th', null, 'Status'),
          h('th', null, 'Bias (raw)'),
          h('th', null, 'Status (raw)')
        )
      ),
      h('tbody', null,
        rows.map(function (r, i) {
          return h('tr', { key: (r.day || '') + (r.symbol || '') + i },
            h('td', { className: 'tla-sm' }, String(r.day || '').slice(0, 10)),
            h('td', null, r.symbol || '—'),
            h('td', null, r.avg_predicted_p_win != null ? (Number(r.avg_predicted_p_win) * 100).toFixed(1) + '%' : '—'),
            h('td', null, r.realized_win_rate != null ? (Number(r.realized_win_rate) * 100).toFixed(1) + '%' : '—'),
            h('td', { className: r.bias != null && Number(r.bias) > 0.10 ? 'tla-neg' : r.bias != null && Number(r.bias) < -0.10 ? 'tla-pos' : '' },
              r.bias != null ? Number(r.bias).toFixed(3) : '—',
              // Raw line — small text under the enforced value
              r.bias_raw != null ? h('div', { className: 'tla-sm' },
                'raw ' + Number(r.bias_raw).toFixed(3) + ' · Δ' + (r.bias != null ? (Number(r.bias_raw) - Number(r.bias) >= 0 ? '+' : '') + (Number(r.bias_raw) - Number(r.bias)).toFixed(3) : '—'))
                : null,
              // Raw status line — only when different from enforced
              r.status_raw != null && r.status_raw !== r.status ? h('div', { className: 'tla-sm' }, 'raw: ' + r.status_raw) : null,
            ),
            h('td', null,
              h('span', { className: 'tla-badge',
                style: {
                  background: r.status === 'OVERCONFIDENT' ? 'rgba(255,92,92,0.15)' : r.status === 'UNDERCONFIDENT' ? 'rgba(120,220,120,0.15)' : 'rgba(153,153,153,0.15)',
                  color: r.status === 'OVERCONFIDENT' ? '#ff5c5c' : r.status === 'UNDERCONFIDENT' ? '#78dc78' : 'var(--ui-text-tertiary)',
                } },
                r.status || '—'),
              // Raw status only when different
              r.status_raw != null && r.status_raw !== r.status ? h('div', { className: 'tla-sm' }, 'raw: ' + r.status_raw) : null,
            ),
            h('td', null,
              h('span', { className: 'tla-badge',
                style: {
                  background: r.status === 'OVERCONFIDENT' ? 'rgba(255,92,92,0.15)' : r.status === 'UNDERCONFIDENT' ? 'rgba(120,220,120,0.15)' : 'rgba(153,153,153,0.15)',
                  color: r.status === 'OVERCONFIDENT' ? '#ff5c5c' : r.status === 'UNDERCONFIDENT' ? '#78dc78' : 'var(--ui-text-tertiary)',
                } },
                r.status || '—')
            ),
            // Raw bias (2026-08-23) — pre-enforcement model output, not muted by
            // Bayesian-shrink enforcement. See migration 119 + worklog/
            // 20260823_calibration_bias_panel_raw_vs_enforced_mismatch.md.
            h('td', {
              style: {
                color: r.bias_raw != null && Number(r.bias_raw) >= 0.30 ? '#ff5c5c' : r.bias_raw != null && Number(r.bias_raw) <= -0.20 ? '#78dc78' : undefined,
              } },
              r.bias_raw != null ? Number(r.bias_raw).toFixed(3) : '—'),
            h('td', null,
              h('span', { className: 'tla-badge',
                style: {
                  background: r.status_raw === 'OVERCONFIDENT' ? 'rgba(255,92,92,0.15)' : r.status_raw === 'UNDERCONFIDENT' ? 'rgba(120,220,120,0.15)' : 'rgba(153,153,153,0.15)',
                  color: r.status_raw === 'OVERCONFIDENT' ? '#ff5c5c' : r.status_raw === 'UNDERCONFIDENT' ? '#78dc78' : 'var(--ui-text-tertiary)',
                } },
                r.status_raw || '—')
            )
          );
        })
      )
    );
  }

  // ─── Main component (claim routing) ─────────────────────────────────

  function Talaria() {
    var _a = useConfig();
    var config = _a[0]; var updateConfig = _a[1];
    var _b = useState(null);
    var claim = _b[0]; var setClaim = _b[1];
    var _c = useState('idle');
    var checkPhase = _c[0]; var setCheckPhase = _c[1];
    var _d = useState('');
    var checkMsg = _d[0]; var setCheckMsg = _d[1];

    var runCheck = useCallback(function () {
      if (!config.supabase_url || !config.supabase_key || !config.claim_token) {
        setClaim(null);
        setCheckPhase('idle');
        setCheckMsg('');
        return;
      }
      setCheckPhase('running');
      setCheckMsg('');
      claimCheck(config)
        .then(function (res) {
          setClaim(res);
          setCheckPhase('ok');
        })
        .catch(function (err) {
          setClaim(null);
          setCheckPhase(
            err && err.kind === 'not-deployed' ? 'not-deployed'
              : err && err.kind === 'bad-token' ? 'bad-token'
              : 'error');
          setCheckMsg((err && err.message) || String(err));
        });
    }, [config.supabase_url, config.supabase_key, config.claim_token]);

    // Claim check on mount + every 24h.
    useEffect(function () {
      runCheck();
      var timer = setInterval(runCheck, CLAIM_CHECK_MS);
      return function () { clearInterval(timer); };
    }, [runCheck]);

    // Start the shared 10s poll for widget surfaces.
    startSignalPolling();

    var hasConfig = !!(config.supabase_url && config.supabase_key && config.claim_token);

    if (!hasConfig) {
      return h(ConnectTab, { config: config, onSave: updateConfig, checkPhase: 'idle', checkMsg: '' });
    }
    if (checkPhase === 'running' || checkPhase === 'idle') {
      return h('div', { className: 'tla-root' },
        h('div', { className: 'tla-card' },
          h('h3', null, 'Checking claim…'),
          h('div', { className: 'tla-hint' }, 'Validating claim token against talaria-check…')
        )
      );
    }
    if (checkPhase !== 'ok') {
      return h(ConnectTab, { config: config, onSave: updateConfig, checkPhase: checkPhase, checkMsg: checkMsg });
    }

    var status = String((claim && claim.sub_status) || 'none').toLowerCase();
    if (status === 'none') return h(SubscribeScreen, { claim: claim, onRetry: runCheck });
    if (status === 'pending') return h(WaitingScreen, { claim: claim, onRetry: runCheck });
    if (status === 'expired' || status === 'cancelled') return h(PaywallScreen, { claim: claim, onRetry: runCheck });

    // active | grace
    return h(TalariaPage, { config: config, claim: claim });
  }

  // ─── CSS injection ─────────────────────────────────────────────────

  var STYLE_ID = 'talaria-style';
  var CSS = [
    '.tla-root{display:flex;flex-direction:column;height:100%;gap:12px;padding:16px;overflow:auto;}',
    '.tla-header{display:flex;align-items:center;justify-content:center;padding:10px 0 2px;font-size:1.15rem;font-weight:600;letter-spacing:.02em;border-bottom:1px solid var(--ui-stroke-secondary);margin-bottom:2px;gap:8px;}',
    '.tla-mark{display:inline-block;flex-shrink:0;}',
    '.tla-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:12px;}',
    '.tla-card{background:var(--ui-panel);border:1px solid var(--ui-stroke-secondary);border-radius:8px;padding:12px;display:flex;flex-direction:column;gap:8px;}',
    '.tla-card h3{margin:0;font-size:12px;font-weight:600;color:var(--ui-text-secondary);text-transform:uppercase;letter-spacing:0.04em;}',
    '.tla-card .tla-value{font-size:26px;font-weight:700;color:var(--ui-text-primary);}',
    '.tla-card .tla-sub{font-size:11px;color:var(--ui-text-quaternary);}',
    '.tla-row{display:flex;justify-content:space-between;align-items:baseline;padding:3px 0;font-size:12px;}',
    '.tla-row .tla-k{color:var(--ui-text-tertiary);}',
    '.tla-row .tla-v{color:var(--ui-text-primary);font-variant-numeric:tabular-nums;}',
    '.tla-pos{color:var(--ui-accent,#4c9aff);}',
    '.tla-neg{color:#ff5c5c;}',
    '.tla-table{width:100%;border-collapse:collapse;font-size:11px;}',
    '.tla-table th,.tla-table td{border-bottom:1px solid var(--ui-stroke-secondary);padding:5px 6px;text-align:left;white-space:nowrap;}',
    '.tla-table th{color:var(--ui-text-tertiary);font-weight:600;}',
    '.tla-table .tla-sm{font-size:9px;color:var(--ui-text-secondary);font-variant-numeric:tabular-nums;white-space:nowrap;}',
    '.tla-table tbody tr:hover{background:rgba(0,0,0,0.03);}',
    '.tla-kelly-table .tla-regime-cell{font-size:14px;font-weight:600;}',
    '.tla-kelly-table .tla-agg-cell{font-size:13px;font-weight:600;}',
    '.tla-kelly-table .tla-sig-cell{font-size:13px;font-weight:700;text-transform:uppercase;}',
    '.tla-kelly-table .tla-kelly-cell{font-size:16px;font-weight:700;font-variant-numeric:tabular-nums;}',
    '.tla-kelly-table .tla-kelly-fCell{font-size:9px;color:var(--ui-text-secondary);font-variant-numeric:tabular-nums;}',
    '.tla-kelly-table .tla-pwin-cell{font-size:11px;font-variant-numeric:tabular-nums;}',
    '.tla-kelly-table .tla-ev-cell{font-size:11px;font-variant-numeric:tabular-nums;}',
    '.tla-kelly-table .tla-price-cell{font-size:10px;font-variant-numeric:tabular-nums;}',
    '.tla-kelly-table .tla-conf-cell{font-size:10px;color:var(--ui-text-tertiary);font-variant-numeric:tabular-nums;}',
    '.tla-kelly-table .tla-ts-cell{font-size:9px;color:var(--ui-text-tertiary);font-variant-numeric:tabular-nums;}',
    '.tla-kelly-table .tla-shift-cell{font-size:12px;text-align:center;}',
    '.tla-kelly-table .tla-prev-cell{font-size:11px;color:var(--ui-text-secondary);}',
    '.tla-kelly-table .tla-sizemult-cell{font-size:9px;color:var(--ui-text-secondary);}',
    '.tla-kelly-table .tla-group-header td{font-size:11px;font-weight:600;color:var(--ui-text-tertiary);border-bottom:1px solid var(--ui-stroke-secondary);}',
    '.tla-kelly-table-wrap{overflow-x:auto;}',
    '.tla-context-card .tla-context-value{font-size:20px;font-weight:700;}',
    '.tla-context-card .tla-context-sub{font-size:10px;color:var(--ui-text-quaternary);}',
    '.tla-badge{display:inline-block;padding:1px 8px;border-radius:10px;font-size:10px;font-weight:600;text-transform:uppercase;}',
    '.tla-badge.open{background:rgba(120,220,120,0.15);color:var(--ui-success,#26d374);}',
    '.tla-badge.closed{background:rgba(76,154,255,0.15);color:var(--ui-accent,#4c9aff);}',
    '.tla-badge.opened{background:rgba(76,154,255,0.15);color:var(--ui-accent,#4c9aff);}',
    '.tla-badge.active{background:rgba(120,220,120,0.15);color:var(--ui-success,#26d374);}',
    '.tla-badge.grace{background:rgba(240,180,60,0.15);color:var(--ui-warning,#e8b93a);}',
    '.tla-hot{display:flex;flex-wrap:wrap;gap:8px;align-items:stretch;margin-top:8px;}',
    '.tla-hot-card h3{margin-bottom:2px;}',
    '.tla-hot-ts{display:block;font-size:10px;color:var(--ui-text-quaternary);margin-bottom:2px;}',
    '.tla-hot-chip{display:flex;flex-direction-row;align-items:center;gap:6px;padding:6px 10px;border-radius:8px;border:1px solid var(--ui-stroke-secondary);}',
    '.tla-hot-chip .tla-hot-sym{font-size:13px;font-weight:700;color:var(--ui-text-primary);}',
    '.tla-hot-chip .tla-hot-kelly{font-size:11px;font-variant-numeric:tabular-nums;color:var(--ui-text-secondary);margin-left:4px;}',
    '.tla-hot-chip .tla-hot-dir{font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:0.06em;padding:2px 5px;border-radius:4px;}',
    '.tla-hot-chip .tla-hot-regime{font-size:10px;color:var(--ui-text-tertiary);margin-left:2px;white-space:nowrap;}',
    '.tla-hot-buy{background:rgba(76,154,255,0.10);border-color:rgba(76,154,255,0.35);}',
    '.tla-hot-buy .tla-hot-dir{color:var(--ui-button-text,#fff);background:var(--ui-accent,#4c9aff);}',
    '.tla-hot-sell{background:rgba(255,92,92,0.10);border-color:rgba(255,92,92,0.35);}',
    '.tla-hot-sell .tla-hot-dir{color:var(--ui-button-text,#fff);background:var(--ui-danger,#ff5c5c);}',
    '.tla-err{color:var(--ui-danger,#ff5c5c);font-size:12px;padding:8px;}',
    '.tla-ok{color:var(--ui-success,#26d374);font-size:12px;}',
    '.tla-hint{color:var(--ui-text-quaternary);font-size:11px;}',
    '.tla-explainer{color:var(--ui-text-secondary);font-size:11px;line-height:1.55;background:rgba(0,0,0,0.02);border-left:3px solid var(--ui-accent,#4c9aff);padding:7px 10px;margin:8px 0 10px;border-radius:0 6px 6px 0;}',
    '.tla-field{display:flex;flex-direction:column;gap:4px;margin-bottom:10px;}',
    '.tla-field label{font-size:11px;color:var(--ui-text-tertiary);}',
    '.tla-field input{background:var(--ui-panel);border:1px solid var(--ui-stroke-secondary);color:var(--ui-text-primary);border-radius:6px;padding:7px 10px;font-size:12px;font-family:inherit;}',
    '.tla-btn{background:var(--ui-accent,#4c9aff);color:var(--ui-button-text,#fff);border:none;border-radius:6px;padding:8px 16px;font-size:12px;font-weight:600;cursor:pointer;font-family:inherit;text-decoration:none;display:inline-block;}',
    '.tla-btn:hover{opacity:0.9;}',
    '.tla-btn-secondary{background:transparent;border:1px solid var(--ui-stroke-secondary);color:var(--ui-text-secondary);}',
    '.tla-btn-secondary:hover{border-color:var(--ui-accent,#4c9aff);color:var(--ui-accent,#4c9aff);opacity:1;}',
    '.tla-banner{display:flex;align-items:center;gap:8px;padding:8px 12px;border-radius:8px;font-size:12px;background:rgba(240,180,60,0.10);border:1px solid rgba(240,180,60,0.35);color:var(--ui-warning,#e8b93a);}',
    '.tla-banner-paywall{background:rgba(255,92,92,0.10);border-color:rgba(255,92,92,0.35);color:var(--ui-danger,#ff5c5c);}',
    '.tla-center{display:flex;flex-direction:column;align-items:center;justify-content:center;height:100%;gap:14px;padding:24px;text-align:center;}',
    '.tla-title{font-size:18px;font-weight:700;color:var(--ui-text-primary);}',
    '.tla-brick-picker{display:flex;flex-wrap:wrap;gap:8px;margin:8px 0 10px;}',
    '.tla-brick-btn{background:transparent;border:1px solid var(--ui-stroke-secondary);border-radius:8px;color:var(--ui-text-secondary);padding:6px 14px;font-size:12px;font-weight:600;cursor:pointer;font-family:inherit;letter-spacing:0.03em;}',
    '.tla-brick-btn:hover{border-color:var(--ui-accent,#4c9aff);color:var(--ui-accent,#4c9aff);}',
    '.tla-brick-btn-active{background:rgba(76,154,255,0.18);border-color:var(--ui-accent,#4c9aff);color:var(--ui-accent,#4c9aff);}',
    '.tla-mini-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:8px;}',
    '.tla-inline{display:flex;flex-wrap:wrap;gap:12px;align-items:center;font-size:12px;}',
    '.tla-badge.overconfident{background:rgba(255,92,92,0.15);color:var(--ui-danger,#ff5c5c);}',
    '.tla-badge.underconfident{background:rgba(120,220,120,0.15);color:var(--ui-success,#26d374);}',
    '.tla-badge.calibrated{background:rgba(153,153,153,0.15);color:var(--ui-text-tertiary);}',
    '.tla-badge.sig{background:rgba(120,220,120,0.15);color:var(--ui-success,#26d374);}',
    // 0.2.11: Tab bar + watchlist CSS
    '.tla-tabs{display:flex;gap:4px;margin:8px 0 4px;padding-bottom:4px;border-bottom:1px solid var(--ui-stroke-secondary);}',
    '.tla-tab-btn{background:transparent;border:1px solid var(--ui-stroke-secondary);border-radius:6px;color:var(--ui-text-secondary);padding:6px 16px;font-size:12px;font-weight:600;cursor:pointer;font-family:inherit;letter-spacing:.02em;}',
    '.tla-tab-btn:hover{border-color:var(--ui-accent,#4c9aff);color:var(--ui-accent,#4c9aff);opacity:0.9;}',
    '.tla-tab-active{background:rgba(76,154,255,0.18);border-color:var(--ui-accent,#4c9aff);color:var(--ui-accent,#4c9aff);}',
    '.tla-watchlist{display:flex;flex-direction:column;gap:6px;}',
    '.tla-watchlist-row{display:flex;align-items:center;gap:8px;padding:6px 8px;border-radius:6px;border:1px solid var(--ui-stroke-secondary);}',
    '.tla-watchlist-row-active{background:rgba(76,154,255,0.08);border-color:var(--ui-accent,#4c9aff);}',
    '.tla-watchlist-chart{flex-shrink:0;}',
    '.tla-watchlist-chart-placeholder{width:200px;height:80px;display:flex;align-items:center;justify-content:center;color:var(--ui-text-tertiary);font-size:10px;}',
    '.tla-watchlist-meta{display:flex;align-items:center;gap:6px;font-size:11px;}',
    '.tla-watchlist-sym{font-weight:700;color:var(--ui-text-primary);}',
    '.tla-watchlist-regime{font-size:9px;color:var(--ui-text-tertiary);}',
    '.tla-watchlist-kelly{font-size:9px;font-variant-numeric:tabular-nums;}',
    '.tla-watchlist-levels{display:flex;align-items:center;gap:6px;font-size:9px;font-variant-numeric:tabular-nums;}',
    '.tla-watchlist-price-entry{color:var(--ui-text-primary);}',
    '.tla-watchlist-price-sl{color:#ff5c5c;}',
    '.tla-watchlist-price-tp{color:var(--ui-accent,#4c9aff);}',
    '.tla-watchlist-age{font-size:9px;color:var(--ui-text-quaternary);margin-left:auto;}',
  ];

  var _styleInjected = false;
  function ensureStyle() {
    if (_styleInjected) return;
    _styleInjected = true;
    try {
      if (document.getElementById(STYLE_ID)) return;
      var style = document.createElement('style');
      style.id = STYLE_ID;
      style.textContent = CSS.join('');
      document.head.appendChild(style);
    } catch (e) {}
  }

  // ─── Registration ──────────────────────────────────────────────────

  // Dashboard plugins register via window.__HERMES_PLUGINS__.register(name, Component).
  // The web dashboard's PluginPage renders the registered component inside
  // the app shell at the route defined by manifest.tab.path (/talaria).
  if (window.__HERMES_PLUGINS__ && typeof window.__HERMES_PLUGINS__.register === 'function') {
    window.__HERMES_PLUGINS__.register('talaria', Talaria);
  }

})();
