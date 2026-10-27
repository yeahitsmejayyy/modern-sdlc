from contextlib import asynccontextmanager

from mcp.server.mcpserver import MCPServer
from mcp.server.transport_security import TransportSecuritySettings
from starlette.requests import Request
from starlette.responses import JSONResponse

from auth import api_token, log_event, matches
from db import connect
from pings import Health, PingRecord, PingResponse, check_health, recent_pings, record_ping

# The same three actions as the REST API, as MCP tools, at /mcp. Any MCP client
# (Claude Code, Claude Desktop, ...) connects once and discovers them itself.
# Callers send the environment's API_TOKEN, exactly like agents calling the API.
#
#   claude mcp add --transport http sdlc https://<host>/mcp \
#     --header "Authorization: Bearer $SDLC_TOKEN"
server = MCPServer(
    name="sdlc",
    instructions="Tools for modern-sdlc, a demo app whose server records pings in Postgres.",
)


@server.tool()
def ping() -> PingResponse:
    """Records a new ping in this environment's database. Use when asked to ping,
    poke, hit or test the server. Returns the ping's number (also the total so far),
    the server's 7-character commit and the time it was served (UTC)."""
    return record_ping()


@server.tool()
def list_pings() -> list[PingRecord]:
    """Reads the 10 most recent pings, newest first, each with its id, time (UTC)
    and the commit of the server that recorded it. Use for recent activity or history."""
    return recent_pings()


@server.tool()
def health() -> Health:
    """Checks whether the server and its database are up. ok and db both true
    means healthy. commit is the build that's running."""
    return check_health()


@asynccontextmanager
async def serving():
    """Runs MCP's request handling while the app runs. Built fresh on each start,
    since one can only run once (and the tests start the app many times).

    Stateless JSON over HTTP: no sessions to keep, so every request stands alone,
    like the REST API. The Host check is off: the token is what protects /mcp."""
    server.streamable_http_app(
        stateless_http=True,
        json_response=True,
        transport_security=TransportSecuritySettings(enable_dns_rebinding_protection=False),
    )
    async with server.session_manager.run():
        yield


class Endpoint:
    """/mcp itself: refuses anything without the API token, then hands over to MCP.
    A raw ASGI app (a class, not a function), so Starlette passes the request
    through untouched rather than treating it as a normal route handler."""

    async def __call__(self, scope, receive, send):
        request = Request(scope)
        header = request.headers.get("authorization", "")
        if not (header.startswith("Bearer ") and matches(header.removeprefix("Bearer "), api_token())):
            if header:
                with connect() as conn:
                    log_event(conn, "api_token_rejected", request)
            return await JSONResponse({"detail": "Invalid API token"}, status_code=401)(scope, receive, send)
        await server.session_manager.handle_request(scope, receive, send)


endpoint = Endpoint()
