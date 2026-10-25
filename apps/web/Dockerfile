# Built from the repo root (see compose.yaml), because the app needs the
# workspace: the root lockfile and packages/ui + packages/schema.

# Stage 1: build the static site with Bun.
FROM oven/bun:1.3.14 AS build
WORKDIR /repo
COPY . .
RUN bun install --frozen-lockfile
RUN bun --filter @app/web build

# Stage 2: serve it with Caddy. Only the built files make it into this image.
FROM caddy:2-alpine
COPY apps/web/Caddyfile /etc/caddy/Caddyfile
COPY --from=build /repo/apps/web/dist /srv
