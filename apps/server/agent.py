import json
import os
import urllib.parse
import urllib.request
from typing import Literal

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel

from auth import client_ip, has_session, log_event
from db import connect

# Hands the logged-in browser a short-lived pass to start one conversation with
# the voice agent (Edith). The ElevenLabs key never leaves the server, and the
# agent only accepts these passes, so nobody can run it from another site.
#
# POST /api/agent/session {mode: "voice" | "chat"}
#   → { token } for voice (WebRTC), or { signedUrl } for chat (WebSocket, text only)
PER_IP_PER_HOUR = 6
DAILY_CAP = 24  # Default for AGENT_DAILY_CAP: passes per UTC day across everyone.

ELEVENLABS = "https://api.elevenlabs.io/v1/convai/conversation"

router = APIRouter(prefix="/api/agent")


class SessionRequest(BaseModel):
    mode: Literal["voice", "chat"]


class SessionPass(BaseModel):
    token: str | None = None
    signedUrl: str | None = None


def same_origin(request: Request) -> bool:
    """The page asking must be this site. Behind Caddy the real host is X-Forwarded-Host."""
    origin = request.headers.get("origin")
    if not origin:
        return False
    host = request.headers.get("x-forwarded-host") or request.headers.get("host", "")
    return urllib.parse.urlsplit(origin).netloc == host.split(",")[0].strip()


def fetch_pass(mode: str, api_key: str, agent_id: str) -> str | None:
    """Asks ElevenLabs for one pass. Swapped out in tests."""
    path, field = ("token", "token") if mode == "voice" else ("get-signed-url", "signed_url")
    url = f"{ELEVENLABS}/{path}?agent_id={urllib.parse.quote(agent_id)}"
    req = urllib.request.Request(url, headers={"xi-api-key": api_key})
    with urllib.request.urlopen(req, timeout=10) as res:
        return json.load(res).get(field)


@router.post("/session", response_model_exclude_none=True)
def session(body: SessionRequest, request: Request) -> SessionPass:
    if not has_session(request):
        raise HTTPException(401, "Log in first")
    if not same_origin(request):
        raise HTTPException(403, "Only this site can start a conversation")

    api_key = os.environ.get("ELEVENLABS_API_KEY", "")
    agent_id = os.environ.get("ELEVENLABS_AGENT_ID", "")
    if not api_key or not agent_id:
        raise HTTPException(503, "The agent isn't set up on this server")

    # Limits, counted from the auth log so they hold across restarts.
    cap = int(os.environ.get("AGENT_DAILY_CAP") or DAILY_CAP)
    with connect() as conn:
        (recent,) = conn.execute(
            "SELECT count(*) FROM auth_events WHERE event = 'agent_session' AND ip = %s AND created_at > now() - interval '1 hour'",
            (client_ip(request),),
        ).fetchone()
        (today,) = conn.execute(
            "SELECT count(*) FROM auth_events WHERE event = 'agent_session' AND created_at >= date_trunc('day', now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC'"
        ).fetchone()
    if recent >= PER_IP_PER_HOUR:
        raise HTTPException(429, {"error": "busy", "reason": "rate"})
    if today >= cap:
        raise HTTPException(429, {"error": "busy", "reason": "daily"})

    try:
        issued = fetch_pass(body.mode, api_key, agent_id)
    except Exception as e:  # network error, or ElevenLabs said no
        print(f"[agent] ElevenLabs refused a {body.mode} pass: {e}", flush=True)
        issued = None
    if not issued:
        raise HTTPException(502, "ElevenLabs didn't issue a pass")

    with connect() as conn:
        log_event(conn, "agent_session", request)
    return SessionPass(token=issued) if body.mode == "voice" else SessionPass(signedUrl=issued)
