# Deploying

Every push goes live on its own. The branch decides where:

| Push to | Environment | URL |
|---|---|---|
| `main` | **production** | https://sdlc.itspjbell.com |
| any other branch | **staging** | https://sdlc-staging.itspjbell.com |

So the everyday loop is: push a branch → try it on staging → open a PR → merge →
it's on production. This page explains how, what it needs, and how to undo a
bad deploy in either environment.

## The flow

`.github/workflows/deploy.yml` runs on every push:

1. **ci**: runs `ci.yml`, the same checks as every PR. If they fail, nothing ships.
2. **build**: builds the `server` and `web` images once, tags each with the full
   commit SHA, and pushes them to GitHub Container Registry
   (`ghcr.io/yeahitsmejayyy/modern-sdlc-server` and `-web`). Only `main` also
   moves the `latest` tag. The SHA is baked into the server image as `GIT_COMMIT`.
3. **deploy**: picks the environment from the branch, copies the compose files
   to that environment's folder on the VPS, writes its `.env`, pulls the images
   for that tag, and restarts that stack. The server never builds anything; it
   only pulls what CI built.
4. **verify (production)** or **verify (staging)**: polls `https://$DOMAIN/health`
   for up to 60 seconds until it reports `db: true` and the first 7 characters of
   the deployed SHA.

Each environment has its own deploy queue: a staging deploy never waits for a
production one, and no deploy is ever cancelled halfway. Staging is shared, so
the last branch pushed is the one that's live there; `/health` always tells you
which commit that is.

## Two gates

- **Production only accepts `main`.** The `production` GitHub environment is
  restricted to the `main` branch, so a feature branch can't deploy there even if
  `deploy.yml` were edited to try.
- **Nothing merges without passing staging.** `main` requires three checks:
  `web`, `server` and **`verify (staging)`**. That last one comes from the
  branch's own push, so a PR can't merge until its exact commit has been live and
  healthy on staging. Push another commit and the PR waits for that one too.

## One server, two stacks

Both environments run on the same VPS as separate Compose projects, each with its
own containers, network and database volume:

| | Production | Staging |
|---|---|---|
| Folder | `/opt/modern-sdlc` | `/opt/modern-sdlc-staging` |
| Compose project | `modern-sdlc` | `modern-sdlc-staging` |
| Compose files | `compose.yaml` | `compose.yaml` + `compose.staging.yaml` |
| Public ports | 80, 443 | none |

Only one container can own ports 80 and 443, so **production's Caddy is the front
door for both domains**. It serves production itself and hands every
`sdlc-staging` request to staging's own Caddy over a shared Docker network called
`edge` (see `apps/web/Caddyfile`). HTTPS for both domains ends at production's
Caddy. If staging is down, its URL returns 502 and production is unaffected.

Each folder's `.env` sets `COMPOSE_PROJECT_NAME` and `COMPOSE_FILE`, so plain
`docker compose ps`, `logs` or `exec` run in that folder always target the right
stack.

## Secrets and variables

These live in the GitHub repo under **Settings → Secrets and variables → Actions**
(repo level) and **Settings → Environments** (per environment).

| Name | Kind | Scope | Value |
|---|---|---|---|
| `VPS_HOST` | Secret | Repo | The server's IP address |
| `VPS_USER` | Secret | Repo | `deploy` (created by `scripts/bootstrap-vps.sh`) |
| `VPS_SSH_KEY` | Secret | Repo | The **private** deploy key (`~/.ssh/modern_sdlc_deploy`) |
| `DOMAIN` | Variable | `production` | `sdlc.itspjbell.com` |
| `DOMAIN` | Variable | `staging` | `sdlc-staging.itspjbell.com` |
| `STAGING_DOMAIN` | Variable | `production` | `sdlc-staging.itspjbell.com`, so production's Caddy knows the second site |
| `POSTGRES_PASSWORD` | Secret | `production` | Production's database password |
| `POSTGRES_PASSWORD` | Secret | `staging` | A different password for staging's database |

The server, user and key are shared because both stacks live on the same box as
the same user. Set each `POSTGRES_PASSWORD` once and don't change it: Postgres only
reads it when that environment's volume is first created.

`STAGING_DOMAIN` belongs to production only. If staging's Caddy were given it, it
would try to get a certificate for a domain that production's Caddy answers.

The images are pulled with the deploy job's own short-lived `GITHUB_TOKEN`, so
they can stay private. Nothing else is stored on the server except each stack's
`.env` (mode 600, readable only by `deploy`).

## Rolling back

Every build is still in the registry under its commit SHA, so a rollback is just
a deploy of an older tag. It skips CI and the build:

```bash
gh run list --workflow deploy.yml --status success   # find the last good deploy
gh workflow run deploy.yml -f environment=production -f tag=<full commit SHA>
gh workflow run deploy.yml -f environment=staging -f tag=<full commit SHA>
```

Run these from `main` (the default). GitHub refuses a production deploy started
from any other branch. The verify job then confirms `/health` reports that
commit. Data is untouched. The next push deploys forward again.

## ⚠️ Never run `docker compose down -v` on the server

In either `/opt/modern-sdlc` or `/opt/modern-sdlc-staging`, `down` removes the
containers, which is harmless; the next deploy recreates them. `-v` also deletes
the **volumes**: that environment's whole database, and in production, Caddy's
HTTPS certificates for both domains. There is no undo. If you need to stop a
stack, use `docker compose down` without `-v`.
