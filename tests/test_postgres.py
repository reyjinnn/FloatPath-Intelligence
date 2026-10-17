"""Opt-in real PostgreSQL smoke checks. Use an isolated, disposable database."""
import os
import unittest
from uuid import uuid4

from sqlalchemy import text
from sqlalchemy.exc import DBAPIError

from apps.api.db import get_engine, run_migrations, write_transaction


@unittest.skipUnless(os.getenv("FLOATPATH_TEST_POSTGRES_URL"), "Disposable PostgreSQL URL not configured")
class PostgresTests(unittest.TestCase):
    def test_migrations_atomic_writes_and_immutable_triggers(self):
        database = get_engine(os.environ["FLOATPATH_TEST_POSTGRES_URL"])
        self.addCleanup(database.dispose)
        run_migrations(database)
        run_migrations(database)
        company_id, snapshot_id, audit_id = (str(uuid4()) for _ in range(3))

        def cleanup_test_records():
            try:
                with database.connect() as conn:
                    conn.execute(text("ALTER TABLE snapshots DISABLE TRIGGER snapshots_immutable;"))
                    conn.execute(text("ALTER TABLE audit_events DISABLE TRIGGER audit_immutable;"))
                    conn.execute(text("DELETE FROM audit_events WHERE id=:id;"), {"id": audit_id})
                    conn.execute(text("DELETE FROM snapshots WHERE id=:id;"), {"id": snapshot_id})
                    conn.execute(text("DELETE FROM companies WHERE id=:id;"), {"id": company_id})
                    conn.execute(text("ALTER TABLE audit_events ENABLE TRIGGER audit_immutable;"))
                    conn.execute(text("ALTER TABLE snapshots ENABLE TRIGGER snapshots_immutable;"))
                    conn.commit()
            except Exception:
                pass

        self.addCleanup(cleanup_test_records)

        with write_transaction(database) as connection:
            versions = connection.execute(text("SELECT version FROM schema_versions ORDER BY version")).scalars().all()
            self.assertEqual(versions, list(range(1, max(versions) + 1)))
            connection.execute(text(
                "INSERT INTO companies VALUES (:id, 'synthetic', 'TEST-PG-001', 'DEMO POSTGRES CHECK', 'DEMO_STANDARD', '2026-10-17')"
            ), {"id": company_id})
            connection.execute(text(
                "INSERT INTO snapshots (id,company_id,workspace_id,total_shares,payload,status,created_at) "
                "VALUES (:id,:company,'synthetic',1000,'{}','DRAFT','2026-10-17')"
            ), {"id": snapshot_id, "company": company_id})
        with self.assertRaisesRegex(ValueError, "intentional rollback"):
            with write_transaction(database) as connection:
                connection.execute(text("UPDATE snapshots SET total_shares=2000 WHERE id=:id"), {"id": snapshot_id})
                raise ValueError("intentional rollback")
        with write_transaction(database) as connection:
            self.assertEqual(connection.execute(text("SELECT total_shares FROM snapshots WHERE id=:id"), {"id": snapshot_id}).scalar_one(), 1000)
            connection.execute(text(
                "UPDATE snapshots SET status='LOCKED',data_hash='sha256:synthetic-check',locked_at='2026-10-17' WHERE id=:id"
            ), {"id": snapshot_id})
            connection.execute(text(
                "INSERT INTO audit_events VALUES (:id,'synthetic','test','POSTGRES_CHECK',:entity,NULL,NULL,'test','2026-10-17')"
            ), {"id": audit_id, "entity": snapshot_id})
        for statement, identifier in (
            ("UPDATE snapshots SET payload='changed' WHERE id=:id", snapshot_id),
            ("DELETE FROM snapshots WHERE id=:id", snapshot_id),
            ("DELETE FROM audit_events WHERE id=:id", audit_id),
        ):
            with self.subTest(statement=statement):
                with self.assertRaises(DBAPIError), write_transaction(database) as connection:
                    connection.execute(text(statement), {"id": identifier})


if __name__ == "__main__":
    unittest.main()
