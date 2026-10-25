FROM python:3.12-slim

# uv comes from its official image, pinned to the version used locally.
COPY --from=ghcr.io/astral-sh/uv:0.12.11 /uv /usr/local/bin/uv

WORKDIR /app

# Dependencies first, so this layer stays cached until the lockfile changes.
COPY pyproject.toml uv.lock .python-version ./
RUN uv sync --frozen --no-dev
ENV PATH="/app/.venv/bin:$PATH"

COPY main.py db.py ./

# CI passes the commit SHA; /health and /api/ping report it.
ARG GIT_COMMIT=local
ENV GIT_COMMIT=$GIT_COMMIT

RUN useradd --system app
USER app

EXPOSE 8000
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
