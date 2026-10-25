import pytest
from fastapi.testclient import TestClient

from db import connect
from main import COMMIT, app, short_commit


# These tests run against the real Postgres at DATABASE_URL, and empty the
# pings table before each test.
@pytest.fixture
def client():
    with TestClient(app) as client:  # entering runs the lifespan, which creates the table
        with connect() as conn:
            conn.execute("TRUNCATE pings RESTART IDENTITY")
        yield client


def test_health(client):
    res = client.get("/health")
    assert res.status_code == 200
    assert res.json() == {"ok": True, "db": True, "commit": COMMIT}


def test_ping_increments_count(client):
    first = client.post("/api/ping").json()
    second = client.post("/api/ping").json()

    assert first["message"] == "pong 👋"
    assert first["commit"] == COMMIT
    assert "servedAt" in first
    assert first["count"] == 1
    assert second["count"] == 2


def test_pings_newest_first_and_limited_to_10(client):
    for _ in range(12):
        client.post("/api/ping")

    rows = client.get("/api/pings").json()

    assert len(rows) == 10
    assert [row["id"] for row in rows] == list(range(12, 2, -1))
    assert set(rows[0]) == {"id", "createdAt", "commit"}


def test_commit_fallback():
    assert short_commit(None) == "local"
    assert short_commit("") == "local"
    assert short_commit("0092279abcdef") == "0092279"


def test_unknown_route_is_404(client):
    assert client.get("/nope").status_code == 404
