# Agents

People use the app with a password. Agents (Edith, Claude Code, a script) get in
with a **token** instead, and use the same three actions people have:

| Tool | What it does | Returns |
|---|---|---|
| `ping` | Records a new ping | `{ message, servedAt, commit, count }` |
| `list_pings` | Reads the 10 latest pings, newest first | `[{ id, createdAt, commit }]` |
| `health` | Checks the server and its database | `{ ok, db, commit }` |

The logic lives once, in `apps/server/pings.py`. Every way in below calls it.

## The ways in

| Way in | Where | Who uses it | Auth |
|---|---|---|---|
| The **ask edith** widget | the web app | people, talking to Edith | the visitor's login |
| **REST** | `/api/ping`, `/api/pings`, `/health` | Edith's webhook tools, scripts | `Authorization: Bearer <token>` |
| **MCP** | `/mcp` | Claude Code, Claude Desktop, any MCP client | `Authorization: Bearer <token>` |
| **The `sdlc` CLI** | `scripts/sdlc.ts` | you, or Claude Code in a terminal | `SDLC_TOKEN` |

- **REST** is the plain API. Any HTTP client can call it.
- **MCP** wraps the same actions as tools an agent discovers on its own: connect
  once, and the client lists `ping`, `list_pings` and `health` with their
  descriptions. It answers plain JSON (no streaming, no sessions).
- **The CLI** is a thin client over REST, for a person at a terminal.

How Edith herself is wired (her `ping` runs in the browser; `list_pings` and
`health` call staging's REST API) is in [deploy.md](deploy.md#talking-to-edith).

## Two kinds of token

| Token | Secret | Can |
|---|---|---|
| Full | `API_TOKEN` | ping, list pings, health |
| Read-only | `API_READ_TOKEN` | list pings, health |

A read-only token gets a 403 from `POST /api/ping`, and over MCP it doesn't even
see `ping`: the server hides it from the tool list and refuses it if it's called
anyway. Give an agent the read token unless it needs to change something.

Each environment has its own pair, set as GitHub environment secrets (see
[deploy.md](deploy.md#secrets-and-variables)). `/health` needs no token at all.

## Claude Code

The repo's `.mcp.json` defines three MCP servers. Claude Code asks once to enable
them the first time you open the repo.

| Server | URL | Token from |
|---|---|---|
| `sdlc-local` | http://localhost:8000/mcp | `local` (`bun run dev` sets it) |
| `sdlc-staging` | https://sdlc-staging.itspjbell.com/mcp | `SDLC_STAGING_TOKEN` |
| `sdlc-staging-read` | same | `SDLC_STAGING_READ_TOKEN` |

The tokens aren't in the file: Claude Code fills in `${SDLC_STAGING_TOKEN}` from
its environment. Put them in the `env` section of `~/.claude/settings.json`; the
terminal and the desktop app both read that. (A shell `export` only reaches
Claude Code started from that shell.) Check with `/mcp`.

Production isn't in `.mcp.json`, so nobody enables it by accident. Add it for
yourself only:

```bash
claude mcp add --scope user --transport http sdlc-production https://sdlc.itspjbell.com/mcp \
  --header "Authorization: Bearer \${SDLC_PRODUCTION_TOKEN}"
```

## The CLI

```bash
bun run sdlc health --env staging
SDLC_TOKEN=local bun run sdlc ping
SDLC_TOKEN="$SDLC_STAGING_READ_TOKEN" bun run sdlc pings --env staging --json
```

- `--env` is `local` (the default), `staging` or `production`.
- `--json` prints the raw response, for scripts and agents.
- The token comes from `SDLC_TOKEN`, never a flag, so it stays out of shell history.
- It exits non-zero with a message when something fails (no token, a wrong one,
  a read-only token trying to ping, the server unreachable).
- `bun run --silent sdlc …` hides Bun's own `$ bun scripts/sdlc.ts` line.

## Rotating a token

Do this if a token leaks, or just now and then. The example is staging's
`API_TOKEN`; the read token and production work the same way.

1. **Make one and set it.** `tr -d` drops the trailing newline, which an HTTP
   header can't contain:

   ```bash
   openssl rand -hex 32 | tr -d '\n' | gh secret set API_TOKEN --env staging
   ```

2. **Redeploy** the build that's already live, so the server reads the new
   secret. `tag` is the **full** SHA of that build: `/health` shows its first 7
   characters, and `git rev-parse` turns those into the full one:

   ```bash
   gh workflow run deploy.yml -f environment=staging -f tag=$(git rev-parse <commit from /health>)
   ```

3. **Update everything that sends it.** The old token stops working at once.
   - **Edith:** in ElevenLabs, Workspace Settings → Workspace Secrets → **Add
     secret** (secrets can't be edited), with the value `Bearer <token>`. Point
     `list_pings` and `health` → Headers → Authorization at it, then delete the
     old secret.
   - **Claude Code:** the new value in `~/.claude/settings.json`, then restart it.
   - **The CLI:** whatever sets `SDLC_TOKEN`.
