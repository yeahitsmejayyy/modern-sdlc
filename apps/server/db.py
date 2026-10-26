import os

import psycopg

DATABASE_URL = os.environ.get("DATABASE_URL", "postgresql://app:app@localhost:5432/app")


def connect() -> psycopg.Connection:
    # A fresh connection per request: simple, and plenty fast for a demo.
    # Used as `with connect() as conn:` it commits on success and closes after.
    return psycopg.connect(DATABASE_URL)


def create_tables() -> None:
    with connect() as conn:
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS pings (
                id         SERIAL PRIMARY KEY,
                created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
                commit     TEXT NOT NULL
            )
            """
        )
        # Logged-in browsers. Only a hash of the cookie is stored, so a leaked
        # table can't be replayed as sessions.
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS sessions (
                token_hash TEXT PRIMARY KEY,
                created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
                expires_at TIMESTAMPTZ NOT NULL,
                ip         TEXT,
                user_agent TEXT
            )
            """
        )
        # Every login, failure, lockout and logout: the audit log, and what the
        # lockout counts.
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS auth_events (
                id         SERIAL PRIMARY KEY,
                created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
                event      TEXT NOT NULL,
                ip         TEXT,
                user_agent TEXT
            )
            """
        )
        conn.execute("CREATE INDEX IF NOT EXISTS auth_events_ip_time ON auth_events (ip, created_at)")
