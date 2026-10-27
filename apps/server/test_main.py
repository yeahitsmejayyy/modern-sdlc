import anyio
import httpx2
import pytest
from fastapi.testclient import TestClient
from mcp import Client
from mcp.client.streamable_http import streamable_http_client

from db import connect
from main import COMMIT, app, short_commit

PASSWORD = "test-password"
TOKEN = "test-token"
AGENT = {"Authorization": f"Bearer {TOKEN}"}


# These tests run against the real Postgres at DATABASE_URL, and empty its
# tables before each test.
@pytest.fixture
def client(monkeypatch):
    monkeypatch.setenv("APP_PASSWORD", PASSWORD)
    monkeypatch.setenv("API_TOKEN", TOKEN)
    with TestClient(app) as client:  # entering runs the lifespan, which creates the tables
        with connect() as conn:
            conn.execute("TRUNCATE pings, sessions, auth_events RESTART IDENTITY")
        yield client


def events():
    with connect() as conn:
        return [e for (e,) in conn.execute("SELECT event FROM auth_events ORDER BY id").fetchall()]


def login(client, password=PASSWORD, ip="203.0.113.7"):
    return client.post("/api/auth/login", json={"password": password}, headers={"X-Forwarded-For": ip})


# --- the app ----------------------------------------------------------------------


def test_health_is_public(client):
    res = client.get("/health")
    assert res.status_code == 200
    assert res.json() == {"ok": True, "db": True, "commit": COMMIT}


def test_ping_and_pings_need_auth(client):
    assert client.post("/api/ping").status_code == 401
    assert client.get("/api/pings").status_code == 401


def test_ping_increments_count(client):
    first = client.post("/api/ping", headers=AGENT).json()
    second = client.post("/api/ping", headers=AGENT).json()

    assert first["message"] == "pong from the VPS 🐳🚀"
    assert first["commit"] == COMMIT
    assert "servedAt" in first
    assert first["count"] == 1
    assert second["count"] == 2


def test_pings_newest_first_and_limited_to_10(client):
    for _ in range(12):
        client.post("/api/ping", headers=AGENT)

    rows = client.get("/api/pings", headers=AGENT).json()

    assert len(rows) == 10
    assert [row["id"] for row in rows] == list(range(12, 2, -1))
    assert set(rows[0]) == {"id", "createdAt", "commit"}


def test_commit_fallback():
    assert short_commit(None) == "local"
    assert short_commit("") == "local"
    assert short_commit("0092279abcdef") == "0092279"


def test_unknown_route_is_404(client):
    assert client.get("/nope").status_code == 404


# --- logging in -------------------------------------------------------------------


def test_login_sets_a_session_that_opens_the_api(client):
    res = login(client)
    assert res.status_code == 204
    cookie = res.headers["set-cookie"]
    assert "sdlc_session=" in cookie and "HttpOnly" in cookie and "SameSite=lax" in cookie

    assert client.get("/api/auth/me").json() == {"authenticated": True}
    assert client.post("/api/ping").status_code == 200
    assert events() == ["login_ok"]


def test_session_cookie_is_secure_over_https(client):
    res = client.post(
        "/api/auth/login", json={"password": PASSWORD}, headers={"X-Forwarded-Proto": "https"}
    )
    assert "Secure" in res.headers["set-cookie"]


def test_only_a_hash_of_the_session_is_stored(client):
    login(client)
    token = client.cookies.get("sdlc_session")
    with connect() as conn:
        (stored,) = conn.execute("SELECT token_hash FROM sessions").fetchone()
    assert token and stored != token


def test_wrong_password_is_refused_and_logged(client):
    res = login(client, "nope")
    assert res.status_code == 401
    assert client.get("/api/auth/me").status_code == 401
    assert events() == ["login_failed"]


def test_logout_ends_the_session(client):
    login(client)
    assert client.post("/api/auth/logout").status_code == 204
    assert client.get("/api/auth/me").status_code == 401
    assert client.post("/api/ping").status_code == 401
    assert events() == ["login_ok", "logout"]


def test_login_is_off_without_a_password(client, monkeypatch):
    monkeypatch.setenv("APP_PASSWORD", "")
    assert login(client, "").status_code == 503
    assert login(client, "anything").status_code == 503


# --- lockout ----------------------------------------------------------------------


def test_five_failures_lock_the_ip(client):
    codes = [login(client, "nope").status_code for _ in range(5)]
    assert codes == [401, 401, 401, 401, 429]

    # Locked: even the right password is refused, and that attempt is logged too.
    res = login(client)
    assert res.status_code == 429
    assert 0 < int(res.headers["Retry-After"]) <= 15 * 60
    assert res.json()["detail"]["error"] == "locked"
    assert events() == ["login_failed"] * 5 + ["login_locked"]


def test_lockout_is_per_ip(client):
    for _ in range(5):
        login(client, "nope", ip="198.51.100.1")
    assert login(client, ip="198.51.100.1").status_code == 429
    assert login(client, ip="198.51.100.2").status_code == 204


def test_lockout_ends_after_15_minutes(client):
    for _ in range(5):
        login(client, "nope")
    with connect() as conn:
        conn.execute("UPDATE auth_events SET created_at = created_at - interval '16 minutes'")
    assert login(client).status_code == 204


# --- agents and the log -----------------------------------------------------------


def test_wrong_api_token_is_refused_and_logged(client):
    res = client.post("/api/ping", headers={"Authorization": "Bearer nope"})
    assert res.status_code == 401
    assert events() == ["api_token_rejected"]


def test_api_token_is_off_when_unset(client, monkeypatch):
    monkeypatch.setenv("API_TOKEN", "")
    assert client.post("/api/ping", headers={"Authorization": "Bearer "}).status_code == 401


def test_auth_log_needs_auth_and_lists_newest_first(client):
    assert client.get("/api/auth/events").status_code == 401
    login(client, "nope")
    login(client)

    log = client.get("/api/auth/events").json()

    assert [e["event"] for e in log] == ["login_ok", "login_failed"]
    assert log[0]["ip"] == "203.0.113.7"
    assert set(log[0]) == {"id", "createdAt", "event", "ip", "userAgent"}


# --- agent session passes ---------------------------------------------------------

import agent  # noqa: E402

SITE = {"Origin": "http://testserver"}


@pytest.fixture
def elevenlabs(monkeypatch):
    """A fake ElevenLabs: records each request and hands back a pass."""
    monkeypatch.setenv("ELEVENLABS_API_KEY", "test-key")
    monkeypatch.setenv("ELEVENLABS_AGENT_ID", "agent_test")
    calls = []

    def fake(mode, api_key, agent_id):
        calls.append((mode, api_key, agent_id))
        return f"{mode}-pass"

    monkeypatch.setattr(agent, "fetch_pass", fake)
    return calls


def start(client, mode="voice", ip="203.0.113.7", origin=SITE):
    return client.post("/api/agent/session", json={"mode": mode}, headers={**origin, "X-Forwarded-For": ip})


def test_session_needs_a_login(client, elevenlabs):
    assert start(client).status_code == 401
    # The agent token is for tools, not for starting conversations.
    res = client.post("/api/agent/session", json={"mode": "voice"}, headers={**SITE, **AGENT})
    assert res.status_code == 401
    assert elevenlabs == []


def test_voice_gets_a_token_and_chat_a_signed_url(client, elevenlabs):
    login(client)
    assert start(client, "voice").json() == {"token": "voice-pass"}
    assert start(client, "chat").json() == {"signedUrl": "chat-pass"}
    assert elevenlabs == [("voice", "test-key", "agent_test"), ("chat", "test-key", "agent_test")]
    assert events().count("agent_session") == 2


def test_session_refuses_other_sites(client, elevenlabs):
    login(client)
    assert start(client, origin={"Origin": "https://evil.example"}).status_code == 403
    assert start(client, origin={}).status_code == 403
    assert elevenlabs == []


def test_session_is_off_without_config(client, monkeypatch):
    login(client)
    monkeypatch.setenv("ELEVENLABS_API_KEY", "")
    assert start(client).status_code == 503


def test_session_reports_an_elevenlabs_failure(client, elevenlabs, monkeypatch):
    login(client)

    def refuse(*_):
        raise OSError("401 Unauthorized")

    monkeypatch.setattr(agent, "fetch_pass", refuse)
    assert start(client).status_code == 502
    assert "agent_session" not in events()


def test_six_sessions_per_ip_per_hour(client, elevenlabs):
    login(client)
    codes = [start(client).status_code for _ in range(7)]
    assert codes == [200] * 6 + [429]
    assert start(client, ip="198.51.100.9").status_code == 200


def test_hourly_cap_from_env(client, elevenlabs, monkeypatch):
    login(client)
    monkeypatch.setenv("AGENT_HOURLY_CAP", "2")
    codes = [start(client).status_code for _ in range(3)]
    assert codes == [200, 200, 429]


def test_daily_cap_across_everyone(client, elevenlabs, monkeypatch):
    login(client)
    monkeypatch.setenv("AGENT_DAILY_CAP", "2")
    codes = [start(client, ip=f"198.51.100.{i}").status_code for i in range(3)]
    assert codes == [200, 200, 429]
    assert start(client).json()["detail"] == {"error": "busy", "reason": "daily"}


# --- MCP at /mcp ------------------------------------------------------------------


def with_mcp(check):
    """Runs `check(client)` against /mcp through a real MCP client, in-process."""

    async def run():
        async with app.router.lifespan_context(app):
            http = httpx2.AsyncClient(transport=httpx2.ASGITransport(app=app), headers=AGENT)
            async with http, Client(streamable_http_client("http://test/mcp", http_client=http)) as mcp:
                return await check(mcp)

    return anyio.run(run)


def test_mcp_lists_the_three_tools(client):
    async def check(mcp):
        return sorted(tool.name for tool in (await mcp.list_tools()).tools)

    assert with_mcp(check) == ["health", "list_pings", "ping"]


def test_mcp_tools_match_the_api(client):
    async def check(mcp):
        first = (await mcp.call_tool("ping")).structured_content
        second = (await mcp.call_tool("ping")).structured_content
        recent = (await mcp.call_tool("list_pings")).structured_content
        health = (await mcp.call_tool("health")).structured_content
        return first, second, recent, health

    first, second, recent, health = with_mcp(check)
    assert first["message"] == "pong from the VPS 🐳🚀"
    assert (first["count"], second["count"], first["commit"]) == (1, 2, COMMIT)
    assert [row["id"] for row in recent["result"]] == [2, 1]
    assert health == {"ok": True, "db": True, "commit": COMMIT}
    # The MCP pings are real rows: the REST API sees them too.
    assert len(client.get("/api/pings", headers=AGENT).json()) == 2


def test_mcp_needs_the_api_token(client):
    assert client.post("/mcp", json={}).status_code == 401
    assert client.post("/mcp", json={}, headers={"Authorization": "Bearer wrong"}).status_code == 401
    assert events() == ["api_token_rejected"]
