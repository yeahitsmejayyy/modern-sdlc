from contextlib import asynccontextmanager

from fastapi import Depends, FastAPI
from fastapi.responses import JSONResponse

from agent import router as agent_router
from auth import require_auth, require_read, router as auth_router
from db import create_tables
from mcp_server import endpoint as mcp_endpoint, serving as mcp_serving
from pings import COMMIT, Health, PingRecord, PingResponse, check_health, recent_pings, record_ping, short_commit  # noqa: F401 (tests import these from main)


@asynccontextmanager
async def lifespan(app: FastAPI):
    create_tables()
    async with mcp_serving():  # request handling for /mcp
        yield


app = FastAPI(lifespan=lifespan)
app.include_router(auth_router)
app.include_router(agent_router)
app.add_route("/mcp", mcp_endpoint, methods=["GET", "POST", "DELETE"])


@app.post("/api/ping", dependencies=[Depends(require_auth)])
def ping() -> PingResponse:
    return record_ping()


@app.get("/api/pings", dependencies=[Depends(require_read)])
def pings() -> list[PingRecord]:
    return recent_pings()


# Public on purpose: the deploy's verify job reads it, and it reveals nothing private.
@app.get("/health", response_model=Health)
def health():
    result = check_health()
    return result if result.ok else JSONResponse(status_code=503, content=result.model_dump())
