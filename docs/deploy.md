# Deploying

Every merge to `main` goes live on its own. This page explains how, what it
needs, and how to undo a bad deploy.

## The flow

`.github/workflows/deploy.yml` runs on every push to `main`:

1. **ci**: runs `ci.yml`, the same checks as every PR. If they fail, nothing ships.
2. **build**: builds the `server` and `web` images once, tags each with the full
   commit SHA (and `latest`), and pushes them to GitHub Container Registry
   (`ghcr.io/yeahitsmejayyy/modern-sdlc-server` and `-web`). The SHA is baked
   into the server image as `GIT_COMMIT`.
3. **deploy**: copies `compose.yaml` to `/opt/modern-sdlc` on the VPS, writes
   the server's `.env` (`TAG`, `DOMAIN`, `POSTGRES_PASSWORD`), pulls the images
   for that tag, and restarts the containers. The server never builds anything;
   it only pulls what CI built.
4. **verify**: polls `https://$DOMAIN/health` for up to 60 seconds until it
   reports `db: true` and the first 7 characters of the deployed SHA.

The database lives in the `pgdata` volume, so it survives every deploy.

## Secrets and variables

All of these live in the GitHub repo under **Settings → Secrets and variables → Actions**.
The deploy job also uses the **`production`** environment (Settings → Environments).

| Name | Kind | Value |
|------|------|-------|
| `VPS_HOST` | Secret | The server's IP address |
| `VPS_USER` | Secret | `deploy` (created by `scripts/bootstrap-vps.sh`) |
| `VPS_SSH_KEY` | Secret | The **private** deploy key (`~/.ssh/modern_sdlc_deploy`) |
| `POSTGRES_PASSWORD` | Secret | A long random password. Set it once and don't change it: Postgres only reads it when the volume is first created |
| `DOMAIN` | Variable | The site's domain, e.g. `sdlc.itspjbell.com` (an `A` record pointing at the VPS) |

The images are pulled with the deploy job's own short-lived `GITHUB_TOKEN`, so
they can stay private. Nothing else is stored on the server except its `.env`
(mode 600, readable only by `deploy`).

## Rolling back

Every build is still in the registry under its commit SHA, so a rollback is
just a deploy of an older tag. It skips CI and the build:

```bash
gh run list --workflow deploy.yml --status success   # find the last good deploy
gh workflow run deploy.yml -f tag=<full commit SHA>
```

The verify job then confirms `/health` reports that commit. Data is untouched.
The next push to `main` deploys forward again.

## ⚠️ Never run `docker compose down -v` on the server

`down` removes the containers, which is harmless; the next deploy recreates them.
`-v` also deletes the **volumes**: the whole database, and Caddy's HTTPS
certificates. There is no undo. If you need to stop the app, use
`docker compose down` without `-v`.
