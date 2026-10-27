from contextlib import asynccontextmanager

from fastapi import HTTPException
from mcp.server.mcpserver import MCPServer
from mcp.server.transport_security import TransportSecuritySettings
from mcp.shared.exceptions import MCPError
from mcp_types import INVALID_PARAMS, ToolAnnotations
from starlette.requests import Request
from starlette.responses import JSONResponse

from auth import FULL, READ, agent_access
from pings import Health, PingRecord, PingResponse, check_health, recent_pings, record_ping

# The same three actions as the REST API, as MCP tools, at /mcp. Any MCP client
# (Claude Code, Claude Desktop, ...) connects once and discovers them itself.
# Callers send an agent token, exactly like agents calling the API, and each token
# gets its own set of tools. The read token can't even see ping.
TOOLS = {
    FULL: {"ping", "list_pings", "health"},
    READ: {"list_pings", "health"},
}


async def only_allowed_tools(ctx, call_next):
    """Hides the tools a token can't use, and refuses them if they're called anyway."""
    allowed = ctx.request.state.tools
    name = (ctx.params or {}).get("name")
    if ctx.method == "tools/call" and name not in allowed:
        raise MCPError(INVALID_PARAMS, f"This token can't use {name}")
    result = await call_next(ctx)
    if ctx.method == "tools/list":
        result["tools"] = [tool for tool in result["tools"] if tool["name"] in allowed]
    return result


server = MCPServer(
    name="sdlc",
    instructions="Tools for modern-sdlc, a demo app whose server records pings in Postgres.",
    middleware=[only_allowed_tools],
)

# Hints for the agent (not rules): which tools only read, so it can ask first for the rest.
READS = ToolAnnotations(read_only_hint=True)


@server.tool(annotations=ToolAnnotations(read_only_hint=False, destructive_hint=False))
def ping() -> PingResponse:
    """Records a new ping in this environment's database. Use when asked to ping,
    poke, hit or test the server. Returns the ping's number (also the total so far),
    the server's 7-character commit and the time it was served (UTC)."""
    return record_ping()


@server.tool(annotations=READS)
def list_pings() -> list[PingRecord]:
    """Reads the 10 most recent pings, newest first, each with its id, time (UTC)
    and the commit of the server that recorded it. Use for recent activity or history."""
    return recent_pings()


@server.tool(annotations=READS)
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
    """/mcp itself: refuses anything without an agent token, notes which tools that
    token may use, then hands over to MCP. A raw ASGI app (a class, not a function),
    so Starlette passes the request through untouched rather than treating it as a
    normal route handler."""

    async def __call__(self, scope, receive, send):
        try:
            access = agent_access(Request(scope))  # logs a wrong token
        except HTTPException:
            access = None
        if access is None:
            return await JSONResponse({"detail": "Invalid API token"}, status_code=401)(scope, receive, send)
        scope.setdefault("state", {})["tools"] = TOOLS[access]
        await server.session_manager.handle_request(scope, receive, send)


endpoint = Endpoint()
