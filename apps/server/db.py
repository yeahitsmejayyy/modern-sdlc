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
