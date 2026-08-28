"""
Talaria Remote Gateway — Dashboard Plugin Backend API

Mounted at /api/plugins/talaria/ by hermes_cli/web_server.py::_mount_plugin_api_routes().
Serves as a thin proxy + health layer for the Talaria dashboard plugin.

The plugin frontend talks DIRECTLY to Supabase (same as the desktop
plugin) for live data. This backend layer provides:

  GET  /api/plugins/talaria/health          — liveness check
  GET  /api/plugins/talaria/config          — default Supabase URL/key + plan defaults
  POST /api/plugins/talaria/claim-check     — proxy for talaria-check Edge Function
  GET  /api/plugins/talaria/symbols         — proxy: nt_symbol list for a plan
  GET  /api/plugins/talaria/sweeps/latest   — proxy: latest sweep results
  GET  /api/plugins/talaria/signals/count   — proxy: count qualified signals in window
  POST /api/plugins/talaria/signal-cache  — write latest signal to JSON file
  GET  /api/plugins/talaria/signal-cache  — read latest signal from JSON file

Security: plugin HTTP routes go through the dashboard's session-token
auth middleware (web_server.auth_middleware) just like core API routes.
The WebSocket /events endpoint (if needed) would use the same
_ws_auth_ok gate as the kanban plugin.

NOTE: The frontend currently calls Supabase REST directly (CORS-enabled
on the Supabase project), so these proxy endpoints are OPTIONAL — they
exist for deployments behind a strict firewall that blocks direct
Supabase access from the browser.
"""

from __future__ import annotations

import json
import logging
import os
import urllib.parse
from pathlib import Path
from typing import Any, Optional

from fastapi import APIRouter, HTTPException, Query, status
from fastapi.responses import JSONResponse
from pydantic import BaseModel

log = logging.getLogger(__name__)
router = APIRouter()

# ─── Constants (mirror the frontend plugin) ──────────────────────────

PLUGIN_VERSION = "0.2.8-remote"

DEFAULT_SUPABASE_URL = os.environ.get(
    "SUPABASE_URL",
    "https://pcvscowltlrxzgxjurcr.supabase.co",
)
DEFAULT_ANON_KEY = os.environ.get(
    "SUPABASE_ANON_KEY",
    "sb_publishable_cYfseJa9z0qss0g_Y594wA_lXrWVBsa",
)


# ─── Health ──────────────────────────────────────────────────────────

class HealthResponse(BaseModel):
    ok: bool
    version: str
    supabase_url: str
    has_anon_key: bool
    has_claim_token: bool


@router.get("/health", response_model=HealthResponse)
async def health():
    """Liveness probe for the Talaria plugin backend."""
    return HealthResponse(
        ok=True,
        version=PLUGIN_VERSION,
        supabase_url=DEFAULT_SUPABASE_URL,
        has_anon_key=bool(DEFAULT_ANON_KEY),
        has_claim_token=False,  # claim tokens are user-local, never server-side
    )


# ─── Config defaults ─────────────────────────────────────────────────

class ConfigResponse(BaseModel):
    supabase_url: str
    # We never expose the anon key to unauthenticated callers — the
    # frontend uses its own embedded default. This field is for reference.
    anon_key_masked: str
    plans: dict[str, Any]


@router.get("/config", response_model=ConfigResponse)
async def config():
    """Return default Supabase config + plan metadata.

    The frontend already knows these defaults (they're constants in the
    plugin bundle), but providing them here lets the backend override
    them per-deployment (e.g., an enterprise self-hosted Supabase).
    """
    return ConfigResponse(
        supabase_url=DEFAULT_SUPABASE_URL,
        anon_key_masked="***",
        plans={
            "signal_scout": {
                "label": "Signal Scout",
                "price": "$199/mo",
                "symbols": 10,
            },
            "precision_pro": {
                "label": "Precision Pro",
                "price": "$599/mo",
                "symbols": 20,
                "most_popular": True,
            },
        },
    )


# ─── Claim check proxy ───────────────────────────────────────────────

@router.post("/claim-check")
async def claim_check(
    token: str,
):
    """Proxy for the talaria-check Edge Function.

    Forwards the claim token to the Supabase Edge Function and returns
    the subscription status. This exists for deployments where the
    browser cannot reach Supabase directly (strict firewall).

    The frontend normally calls the Edge Function directly; this proxy
    is an optional fallback.
    """
    if not token:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Missing claim token",
        )

    base = DEFAULT_SUPABASE_URL.rstrip("/")
    fn_url = f"{base}/functions/v1/talaria-check"

    import httpx

    async with httpx.AsyncClient() as client:
        try:
            resp = await client.post(
                fn_url,
                headers={
                    "apikey": DEFAULT_ANON_KEY,
                    "Authorization": f"Bearer {DEFAULT_ANON_KEY}",
                    "Content-Type": "application/json",
                },
                json={"token": token},
                timeout=10.0,
            )
        except httpx.ConnectError:
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail="talaria-check Edge Function unreachable",
            )
        except httpx.TimeoutException:
            raise HTTPException(
                status_code=status.HTTP_504_GATEWAY_TIMEOUT,
                detail="talaria-check timed out",
            )

    if resp.status_code == 404:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="talaria-check Edge Function not deployed",
        )
    if resp.status_code == 401:
        body = resp.json() if resp.content else {}
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"Claim token rejected ({body.get('error', 'invalid_claim')})",
        )

    return JSONResponse(
        status_code=resp.status_code,
        content=resp.json() if resp.content else {},
    )


# ─── Symbol list proxy ────────────────────────────────────────────────

@router.get("/symbols")
async def symbols(plan_uuid: Optional[str] = Query(None)):
    """Proxy: fetch the plan-gated symbol list from Supabase.

    GET /api/plugins/talaria/symbols?plan_uuid=<uuid>
    → forwards to /rest/v1/nt_symbol?select=symbol,asset_class&plan_ids=cs.{uuid}
    """
    if not DEFAULT_ANON_KEY or DEFAULT_ANON_KEY == "***":
        raise HTTPException(
            status_code=status.HTTP_501_NOT_IMPLEMENTED,
            detail="Supabase anon key not configured on backend",
        )

    params = {"select": "symbol,asset_class"}
    if plan_uuid:
        params["plan_ids"] = f"cs.({plan_uuid})"

    qs = urllib.parse.urlencode(params)
    url = f"{DEFAULT_SUPABASE_URL.rstrip('/')}/rest/v1/nt_symbol?{qs}"

    import httpx

    async with httpx.AsyncClient() as client:
        try:
            resp = await client.get(
                url,
                headers={
                    "apikey": DEFAULT_ANON_KEY,
                    "Authorization": f"Bearer {DEFAULT_ANON_KEY}",
                    "Accept": "application/json",
                },
                timeout=10.0,
            )
        except httpx.RequestError as e:
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail=f"Supabase request failed: {e}",
            )

    if not resp.is_success:
        raise HTTPException(
            status_code=resp.status_code,
            detail=resp.text[:200],
        )

    return resp.json()


# ─── Sweep results proxy ─────────────────────────────────────────────

@router.get("/sweeps/latest")
async def sweeps_latest(limit: int = Query(200, ge=1, le=1000)):
    """Proxy: fetch the latest sweep results.

    GET /api/plugins/talaria/sweeps/latest?limit=200
    → forwards to /rest/v1/nt_sweep_result?...
    """
    if not DEFAULT_ANON_KEY or DEFAULT_ANON_KEY == "***":
        raise HTTPException(
            status_code=status.HTTP_501_NOT_IMPLEMENTED,
            detail="Supabase anon key not configured on backend",
        )

    params = {
        "select": "symbol,sweep_timestamp,regime,regime_conf,markov_p_up,markov_p_dn,p_win,ev,p_timesfm,kelly_f,effective_kelly,brick_size,sl_bricks,tp_bricks,signal,entry_price,stop_loss,take_profit,qualified,aggression,regime_shift,prev_regime,size_mult",
        "order": "sweep_timestamp.desc",
        "limit": str(limit),
    }

    qs = urllib.parse.urlencode(params)
    url = f"{DEFAULT_SUPABASE_URL.rstrip('/')}/rest/v1/nt_sweep_result?{qs}"

    import httpx

    async with httpx.AsyncClient() as client:
        try:
            resp = await client.get(
                url,
                headers={
                    "apikey": DEFAULT_ANON_KEY,
                    "Authorization": f"Bearer {DEFAULT_ANON_KEY}",
                    "Accept": "application/json",
                },
                timeout=10.0,
            )
        except httpx.RequestError as e:
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail=f"Supabase request failed: {e}",
            )

    if not resp.is_success:
        raise HTTPException(
            status_code=resp.status_code,
            detail=resp.text[:200],
        )

    return resp.json()


# ─── Qualified signal count proxy ─────────────────────────────────────

@router.get("/signals/count")
async def signals_count(minutes: int = Query(60, ge=1, le=1440)):
    """Proxy: count qualified signals in the last N minutes.

    GET /api/plugins/talaria/signals/count?minutes=60
    → forwards to /rest/v1/nt_sweep_result?...&Prefer: count=exact
    """
    if not DEFAULT_ANON_KEY or DEFAULT_ANON_KEY == "***":
        raise HTTPException(
            status_code=status.HTTP_501_NOT_IMPLEMENTED,
            detail="Supabase anon key not configured on backend",
        )

    from datetime import datetime, timedelta, timezone

    cutoff = (datetime.now(timezone.utc) - timedelta(minutes=minutes)).isoformat()[:19]
    params = {
        "qualified": "eq.true",
        f"sweep_timestamp": f"gte.{cutoff}",
        "select": "id",
    }

    qs = urllib.parse.urlencode(params)
    url = f"{DEFAULT_SUPABASE_URL.rstrip('/')}/rest/v1/nt_sweep_result?{qs}"

    import httpx

    async with httpx.AsyncClient() as client:
        try:
            resp = await client.get(
                url,
                headers={
                    "apikey": DEFAULT_ANON_KEY,
                    "Authorization": f"Bearer {DEFAULT_ANON_KEY}",
                    "Accept": "application/json",
                    "Prefer": "count=exact",
                },
                timeout=10.0,
            )
        except httpx.RequestError as e:
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail=f"Supabase request failed: {e}",
            )

    if not resp.is_success:
        raise HTTPException(
            status_code=resp.status_code,
            detail=resp.text[:200],
        )

    count_str = resp.headers.get("X-Total-Count", "0")
    return {"count": int(count_str) if count_str.isdigit() else 0, "minutes": minutes}


# ─── Signal cache (agent-readable) ──────────────────────────────────────
# Writes a JSON snapshot of the latest signal to the OS filesystem so the
# Hermes agent can read exact entry/SL/TP/Kelly values without DOM scraping
# or vision OCR. Mounted via the same /api/plugins/talaria/ prefix.
#
# Files are NOT created in git — they are runtime caches written to
# ~/.hermes/talaria/latest_signal.json at runtime.

SIGNAL_CACHE_DIR = Path(os.path.expanduser("~/.hermes/talaria"))
SIGNAL_CACHE_FILE = SIGNAL_CACHE_DIR / "latest_signal.json"


class SignalCacheRequest(BaseModel):
    symbol: str
    direction: str
    kelly: float | None = None
    regime: str | None = None
    entry: float | None = None
    sl: float | None = None
    tp: float | None = None
    ts: str | None = None
    cached_at: str | None = None


@router.post("/signal-cache")
async def write_signal_cache(req: SignalCacheRequest):
    """Write latest signal data to JSON file on OS filesystem."""
    try:
        SIGNAL_CACHE_DIR.mkdir(parents=True, exist_ok=True)
        data = req.model_dump()
        SIGNAL_CACHE_FILE.write_text(
            json.dumps(data, indent=2), encoding="utf-8"
        )
        log.info(f"Signal cache written: {req.symbol} @ {req.entry}")
        return JSONResponse({"ok": True, "path": str(SIGNAL_CACHE_FILE)})
    except Exception as e:
        log.error(f"Failed to write signal cache: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/signal-cache")
async def read_signal_cache():
    """Read latest signal data from JSON file."""
    try:
        if not SIGNAL_CACHE_FILE.exists():
            raise HTTPException(status_code=404, detail="No signal cache found")
        data = json.loads(SIGNAL_CACHE_FILE.read_text(encoding="utf-8"))
        return JSONResponse(data)
    except HTTPException:
        raise
    except Exception as e:
        log.error(f"Failed to read signal cache: {e}")
        raise HTTPException(status_code=500, detail=str(e))
