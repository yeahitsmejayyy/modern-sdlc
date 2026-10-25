# modern-sdlc

An educational monorepo that walks the full software development lifecycle:
local dev → GitHub → CI → container images → automated deploy to a single VPS
(Hostinger KVM 1).

**Minimal and readable above all.** This is teaching material. Every file should
be understandable by someone reading it for the first time. If a change adds
code, config, or a dependency, it has to earn its place.

## Layout

```
apps/       things that run — each one becomes a container and owns its Dockerfile
packages/   shared code consumed by apps
docs/       written explanations of each lifecycle stage
scripts/    small helper scripts (deploy, etc.)
```

The root only wires things together: workspaces, the shared `tsconfig.base.json`,
and root scripts that delegate to apps with `bun --filter`.

## Production topology

Three containers on one VPS. Only `web` is exposed to the internet.

| Container | Image                     | Role                                                                    |
|-----------|---------------------------|-------------------------------------------------------------------------|
| `web`     | Caddy (built from apps/web) | Serves the static build; proxies `/api/*` and `/health` to `server:8000` |
| `server`  | built from apps/server    | FastAPI on port 8000                                                    |
| `db`      | official `postgres:17`    | Data persisted in a named volume                                        |

## Apps

### apps/web — `@app/web`
- Vite + React + TypeScript.
- Uses `@app/ui` for components and `@app/schema` for API types.
- Calls the API with **relative paths** (`/api/ping`, `/health`) so the same
  build works everywhere.
- In dev, Vite proxies `/api` and `/health` to `http://localhost:8000`.

### apps/server — `@app/server`
- Python 3.12 + FastAPI, managed with **uv**.
- psycopg 3 with plain SQL. No ORM.
- Reads `DATABASE_URL` from the environment.
- Its `package.json` exists only to hold scripts that call `uv`, so the root can
  drive it with `bun --filter`.

## Packages

- **packages/ui — `@app/ui`**: shadcn/ui components + Tailwind v4.
- **packages/schema — `@app/schema`**: TypeScript types that mirror the server's
  Pydantic models. When a model changes, change its mirror in the same commit.

## API contract

JSON is camelCase. SQL is snake_case.

| Method | Path         | Response                                                  |
|--------|--------------|-----------------------------------------------------------|
| POST   | `/api/ping`  | `{ message, servedAt, commit, count }`                    |
| GET    | `/api/pings` | `[{ id, createdAt, commit }]` — latest 10                 |
| GET    | `/health`    | `{ ok, db, commit }`                                      |

## Images and releases

- Images are pushed to GHCR and tagged with the commit SHA.
- `GIT_COMMIT` is baked into the server image at build time; it's what `commit`
  reports in the API responses above.

## Conventions

- **Bun** for JavaScript/TypeScript. **uv** for Python.
- Root scripts use `bun --filter <workspace>`.
- No extra dependencies unless asked.
- One small commit per step.
