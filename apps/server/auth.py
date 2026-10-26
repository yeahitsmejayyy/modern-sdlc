import hashlib
import hmac
import os
import secrets
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, HTTPException, Request, Response
from pydantic import BaseModel

from db import connect

# One shared password per environment, for people, and one API token, for agents.
# Both come from the environment. Empty means that way in is switched off: a
# deployed container never falls back to a default password.
COOKIE = "sdlc_session"
SESSION_LENGTH = timedelta(days=7)
MAX_FAILURES = 5
LOCKOUT = timedelta(minutes=15)


def app_password() -> str:
    return os.environ.get("APP_PASSWORD", "")


def api_token() -> str:
    return os.environ.get("API_TOKEN", "")


def matches(given: str, expected: str) -> bool:
    # Constant-time, so response timing doesn't reveal how much of a guess was right.
    return bool(expected) and hmac.compare_digest(given.encode(), expected.encode())


def client_ip(request: Request) -> str:
    # Caddy puts the visitor's address first in X-Forwarded-For.
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


def hash_token(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def log_event(conn, event: str, request: Request) -> None:
    conn.execute(
        "INSERT INTO auth_events (event, ip, user_agent) VALUES (%s, %s, %s)",
        (event, client_ip(request), request.headers.get("user-agent", "")[:300]),
    )


def locked_until(conn, ip: str) -> datetime | None:
    """5 failures from one IP within 15 minutes lock it for 15 minutes after the last one."""
    rows = conn.execute(
        """
        SELECT created_at FROM auth_events
        WHERE ip = %s AND event = 'login_failed' AND created_at > now() - %s
        ORDER BY created_at DESC LIMIT %s
        """,
        (ip, LOCKOUT, MAX_FAILURES),
    ).fetchall()
    if len(rows) < MAX_FAILURES:
        return None
    return rows[0][0] + LOCKOUT


def has_session(request: Request) -> bool:
    token = request.cookies.get(COOKIE)
    if not token:
        return False
    with connect() as conn:
        row = conn.execute(
            "SELECT 1 FROM sessions WHERE token_hash = %s AND expires_at > now()",
            (hash_token(token),),
        ).fetchone()
    return row is not None


def require_auth(request: Request) -> None:
    """A FastAPI dependency: a logged-in browser, or an agent with the API token."""
    header = request.headers.get("authorization", "")
    if header.startswith("Bearer "):
        if matches(header.removeprefix("Bearer "), api_token()):
            return
        with connect() as conn:
            log_event(conn, "api_token_rejected", request)
        raise HTTPException(401, "Invalid API token")
    if has_session(request):
        return
    raise HTTPException(401, "Log in first")


# --- routes -----------------------------------------------------------------------

router = APIRouter(prefix="/api/auth")


class Login(BaseModel):
    password: str


class Me(BaseModel):
    authenticated: bool


class AuthEvent(BaseModel):
    id: int
    createdAt: datetime
    event: str
    ip: str | None
    userAgent: str | None


def locked_response(until: datetime) -> HTTPException:
    seconds = max(1, int((until - datetime.now(timezone.utc)).total_seconds()))
    return HTTPException(
        429,
        {"error": "locked", "retryAfter": seconds},
        headers={"Retry-After": str(seconds)},
    )


@router.post("/login", status_code=204)
def login(body: Login, request: Request) -> Response:
    if not app_password():
        raise HTTPException(503, "Login isn't set up on this server")

    ip = client_ip(request)
    token = None
    # Decide inside the transaction, raise after it: an exception inside
    # `with connect()` would roll back the event we just logged.
    with connect() as conn:
        until = locked_until(conn, ip)
        if until:
            log_event(conn, "login_locked", request)
        elif matches(body.password, app_password()):
            token = secrets.token_urlsafe(32)
            conn.execute("DELETE FROM sessions WHERE expires_at <= now()")
            conn.execute(
                "INSERT INTO sessions (token_hash, expires_at, ip, user_agent) VALUES (%s, now() + %s, %s, %s)",
                (hash_token(token), SESSION_LENGTH, ip, request.headers.get("user-agent", "")[:300]),
            )
            log_event(conn, "login_ok", request)
        else:
            log_event(conn, "login_failed", request)
            until = locked_until(conn, ip)

    if until:
        raise locked_response(until)
    if not token:
        raise HTTPException(401, "Wrong password")

    response = Response(status_code=204)
    response.set_cookie(
        COOKIE,
        token,
        max_age=int(SESSION_LENGTH.total_seconds()),
        httponly=True,
        samesite="lax",
        # Secure whenever the visitor came in over HTTPS (Caddy says so); plain
        # HTTP is only ever local dev.
        secure=request.headers.get("x-forwarded-proto", request.url.scheme) == "https",
    )
    return response


@router.post("/logout", status_code=204)
def logout(request: Request) -> Response:
    token = request.cookies.get(COOKIE)
    if token:
        with connect() as conn:
            conn.execute("DELETE FROM sessions WHERE token_hash = %s", (hash_token(token),))
            log_event(conn, "logout", request)
    response = Response(status_code=204)
    response.delete_cookie(COOKIE)
    return response


@router.get("/me")
def me(request: Request) -> Me:
    if not has_session(request):
        raise HTTPException(401, "Log in first")
    return Me(authenticated=True)


@router.get("/events")
def events(request: Request) -> list[AuthEvent]:
    require_auth(request)
    with connect() as conn:
        rows = conn.execute(
            "SELECT id, created_at, event, ip, user_agent FROM auth_events ORDER BY id DESC LIMIT 50"
        ).fetchall()
    return [AuthEvent(id=i, createdAt=t, event=e, ip=ip, userAgent=ua) for i, t, e, ip, ua in rows]
