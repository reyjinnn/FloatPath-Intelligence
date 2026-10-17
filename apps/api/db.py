"""Versioned SQL migration; no schema creation outside the migration."""
from contextlib import contextmanager
from pathlib import Path

from sqlalchemy import create_engine, event, inspect, text
from sqlalchemy.engine import Engine
from sqlalchemy.pool import StaticPool


def get_engine(url: str) -> Engine:
    if url.startswith("postgres://"):
        url = "postgresql+psycopg2://" + url[len("postgres://"):]
    options = {}
    if url.startswith("sqlite:"):
        options["connect_args"] = {"check_same_thread": False, "timeout": 15}
        if url.endswith(":memory:"):
            options["poolclass"] = StaticPool
    engine = create_engine(url, **options)
    if engine.dialect.name not in {"sqlite", "postgresql"}:
        raise ValueError("Only SQLite and PostgreSQL are supported")
    if engine.dialect.name == "sqlite":
        @event.listens_for(engine, "connect")
        def enable_foreign_keys(connection, _):
            connection.execute("PRAGMA foreign_keys = ON")
    return engine


def run_migrations(engine: Engine) -> None:
    source = (Path(__file__).parent / "migrations" / "001_initial.sql").read_text("utf-8")
    with engine.begin() as connection:
        if engine.dialect.name == "postgresql":
            connection.execute(text("SELECT pg_advisory_xact_lock(70461001)"))
        if inspect(connection).has_table("schema_versions"):
            versions = connection.execute(text("SELECT version FROM schema_versions ORDER BY version")).scalars().all()
            if versions == [1]:
                return
            raise RuntimeError("Unsupported or incomplete database schema version")
        dialect = "common"
        pending = []

        def flush():
            statement = "\n".join(pending).strip()
            if statement and dialect in {"common", engine.dialect.name}:
                connection.execute(text(statement))
            pending.clear()

        for line in source.splitlines():
            if line.startswith("-- dialect:"):
                flush()
                dialect = line.partition(":")[2]
            elif line == "-- statement":
                flush()
            else:
                pending.append(line)
        flush()
        connection.execute(text("INSERT INTO schema_versions VALUES (1, CURRENT_TIMESTAMP)"))


@contextmanager
def write_transaction(engine: Engine):
    """Serialize synthetic writes so locking/import/replay cannot race."""
    with engine.connect() as connection:
        if engine.dialect.name == "sqlite":
            connection.exec_driver_sql("BEGIN IMMEDIATE")
        else:
            connection.begin()
            connection.execute(text("SELECT pg_advisory_xact_lock(70461002)"))
        try:
            yield connection
            connection.commit()
        except BaseException:
            connection.rollback()
            raise

