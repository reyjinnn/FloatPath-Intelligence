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
    migrations = sorted((Path(__file__).parent / "migrations").glob("[0-9][0-9][0-9]_*.sql"))
    expected = [int(path.name.partition("_")[0]) for path in migrations]
    if expected != list(range(1, len(expected) + 1)):
        raise RuntimeError("Migration versions must be consecutive")
    with engine.begin() as connection:
        if engine.dialect.name == "sqlite":
            connection.exec_driver_sql("BEGIN IMMEDIATE")
        if engine.dialect.name == "postgresql":
            connection.execute(text("SELECT pg_advisory_xact_lock(70461001)"))
        versions = (connection.execute(text("SELECT version FROM schema_versions ORDER BY version")).scalars().all()
                    if inspect(connection).has_table("schema_versions") else [])
        if versions != expected[:len(versions)] or len(versions) > len(expected):
            raise RuntimeError("Unsupported or incomplete database schema version")
        for path in migrations[len(versions):]:
            dialect = "common"
            pending = []

            def flush():
                statement = "\n".join(pending).strip()
                if statement and dialect in {"common", engine.dialect.name}:
                    connection.execute(text(statement))
                pending.clear()

            for line in path.read_text("utf-8").splitlines():
                if line.startswith("-- dialect:"):
                    flush()
                    dialect = line.partition(":")[2].strip()
                elif line == "-- statement":
                    flush()
                else:
                    pending.append(line)
            flush()
            connection.execute(text("INSERT INTO schema_versions VALUES (:version, CAST(CURRENT_TIMESTAMP AS TEXT))"),
                               {"version": int(path.name.partition("_")[0])})


@contextmanager
def write_transaction(engine: Engine):
    """Serialize synthetic writes so locking/import/replay cannot race."""
    with engine.connect() as connection:
        if engine.dialect.name == "sqlite":
            connection.exec_driver_sql("BEGIN IMMEDIATE")
            trans = None
        else:
            trans = connection.begin()
            connection.execute(text("SELECT pg_advisory_xact_lock(70461002)"))
        try:
            yield connection
            if trans is not None:
                trans.commit()
            else:
                connection.commit()
        except BaseException:
            if trans is not None:
                trans.rollback()
            else:
                connection.rollback()
            raise

