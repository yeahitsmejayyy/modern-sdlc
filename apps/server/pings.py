import os
from datetime import datetime, timezone

import psycopg
from pydantic import BaseModel

from db import connect

# What the app does, as plain functions. The REST routes (main.py) and the MCP
# tools (mcp_server.py) both call these, so the logic lives in one place.


def short_commit(sha: str | None) -> str:
    return (sha or "")[:7] or "local"


# Baked into the image at build time; "local" when running on your laptop.
COMMIT = short_commit(os.environ.get("GIT_COMMIT"))


# The API contract. Field names are the JSON keys, so they're camelCase.
# packages/schema mirrors these as TypeScript types.
class PingResponse(BaseModel):
    message: str
    servedAt: datetime
    commit: str
    count: int


class PingRecord(BaseModel):
    id: int
    createdAt: datetime
    commit: str


class Health(BaseModel):
    ok: bool
    db: bool
    commit: str


def record_ping() -> PingResponse:
    with connect() as conn:
        conn.execute("INSERT INTO pings (commit) VALUES (%s)", (COMMIT,))
        (count,) = conn.execute("SELECT count(*) FROM pings").fetchone()
    return PingResponse(
        message="pong from the VPS 🐳🚀",
        servedAt=datetime.now(timezone.utc),
        commit=COMMIT,
        count=count,
    )


def recent_pings() -> list[PingRecord]:
    with connect() as conn:
        rows = conn.execute(
            "SELECT id, created_at, commit FROM pings ORDER BY id DESC LIMIT 10"
        ).fetchall()
    return [PingRecord(id=id, createdAt=created_at, commit=commit) for id, created_at, commit in rows]


def check_health() -> Health:
    try:
        with connect() as conn:
            conn.execute("SELECT 1")
    except psycopg.Error:
        return Health(ok=False, db=False, commit=COMMIT)
    return Health(ok=True, db=True, commit=COMMIT)
