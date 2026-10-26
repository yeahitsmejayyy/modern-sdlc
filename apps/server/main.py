import os
from contextlib import asynccontextmanager
from datetime import datetime, timezone

import psycopg
from fastapi import Depends, FastAPI
from fastapi.responses import JSONResponse
from pydantic import BaseModel

from auth import require_auth, router as auth_router
from db import connect, create_tables


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


@asynccontextmanager
async def lifespan(app: FastAPI):
    create_tables()
    yield


app = FastAPI(lifespan=lifespan)
app.include_router(auth_router)


@app.post("/api/ping", dependencies=[Depends(require_auth)])
def ping() -> PingResponse:
    with connect() as conn:
        conn.execute("INSERT INTO pings (commit) VALUES (%s)", (COMMIT,))
        (count,) = conn.execute("SELECT count(*) FROM pings").fetchone()
    return PingResponse(
        message="pong from the VPS 🐳🚀",
        servedAt=datetime.now(timezone.utc),
        commit=COMMIT,
        count=count,
    )


@app.get("/api/pings", dependencies=[Depends(require_auth)])
def pings() -> list[PingRecord]:
    with connect() as conn:
        rows = conn.execute(
            "SELECT id, created_at, commit FROM pings ORDER BY id DESC LIMIT 10"
        ).fetchall()
    return [PingRecord(id=id, createdAt=created_at, commit=commit) for id, created_at, commit in rows]


# Public on purpose: the deploy's verify job reads it, and it reveals nothing private.
@app.get("/health", response_model=Health)
def health():
    try:
        with connect() as conn:
            conn.execute("SELECT 1")
    except psycopg.Error:
        return JSONResponse(status_code=503, content={"ok": False, "db": False, "commit": COMMIT})
    return Health(ok=True, db=True, commit=COMMIT)
