"""FR-002/012: reviewer approval binds to the exact persisted snapshot payload."""
import copy
import hashlib
import json
import os
from pathlib import Path
import tempfile
import unittest

from fastapi.testclient import TestClient
from sqlalchemy import text

from apps.api.main import create_app
from packages import engine

CATALOG = Path(__file__).resolve().parents[1] / "datasets" / "synthetic" / "companies.json"
ANALYST = {"Authorization": "Bearer test-analyst-token"}
REVIEWER = {"Authorization": "Bearer test-reviewer-token"}
ORIGIN = "http://localhost:3000"


class ReviewPreconditionChecks:
    def setUp(self):
        if self.postgres:
            self.url = os.environ["FLOATPATH_TEST_POSTGRES_URL"]
        else:
            temp = tempfile.TemporaryDirectory()
            self.addCleanup(temp.cleanup)
            self.url = "sqlite:///" + str(Path(temp.name) / "review.sqlite")
        self.app = create_app(database_url=self.url, analyst_token="test-analyst-token",
                              reviewer_token="test-reviewer-token", allowed_origins=[ORIGIN])
        self.context = TestClient(self.app)
        self.client = self.context.__enter__()
        self.addCleanup(self.context.__exit__, None, None, None)
        self.fixture = json.loads(CATALOG.read_text("utf-8"))[0]
        company = self.client.post("/api/v1/companies", headers=ANALYST,
                                   json={"legal_name": "DEMO REVIEW CHECK", "code": self.fixture["code"]})
        self.assertEqual(company.status_code, 201, company.text)
        self.company_id = company.json()["id"]
        # PostgreSQL checks require an isolated disposable DB, like test_postgres.py.
        if self.postgres:
            self.addCleanup(self.clean_postgres_records)
        payload = copy.deepcopy(self.fixture["snapshot"])
        payload.pop("id", None)
        created = self.client.post(f"/api/v1/companies/{self.company_id}/snapshots",
                                   headers=ANALYST, json=payload)
        self.assertEqual(created.status_code, 201, created.text)
        self.created = created.json()
        self.path = f"/api/v1/snapshots/{self.created['id']}"

    def clean_postgres_records(self):
        with self.app.state.db.begin() as connection:
            # Transactional trigger changes keep immutable records protected outside cleanup.
            connection.execute(text("ALTER TABLE snapshots DISABLE TRIGGER snapshots_immutable"))
            connection.execute(text("ALTER TABLE audit_events DISABLE TRIGGER audit_immutable"))
            connection.execute(text(
                "DELETE FROM audit_events WHERE entity_id=:company OR entity_id IN "
                "(SELECT id FROM snapshots WHERE company_id=:company)"
            ), {"company": self.company_id})
            connection.execute(text("DELETE FROM snapshots WHERE company_id=:company"), {"company": self.company_id})
            connection.execute(text("DELETE FROM companies WHERE id=:company"), {"company": self.company_id})
            connection.execute(text("ALTER TABLE snapshots ENABLE TRIGGER snapshots_immutable"))
            connection.execute(text("ALTER TABLE audit_events ENABLE TRIGGER audit_immutable"))

    def get_snapshot(self):
        response = self.client.get(self.path, headers=REVIEWER)
        self.assertEqual(response.status_code, 200, response.text)
        return response.json()

    def post(self, suffix, expected=None):
        headers = dict(REVIEWER)
        if expected is not None:
            headers["If-Match"] = expected
        return self.client.post(self.path + suffix, headers=headers)

    def save_changed_draft(self):
        holders = copy.deepcopy(self.get_snapshot()["snapshot"]["holders"])
        holders[0]["shares"] -= 1
        holders[1]["shares"] += 1
        saved = self.client.patch(self.path + "/holdings", headers=ANALYST, json={"holders": holders})
        self.assertEqual(saved.status_code, 200, saved.text)
        return saved.json()

    def lock_audits(self):
        with self.app.state.db.connect() as connection:
            return connection.execute(text(
                "SELECT COUNT(*) FROM audit_events WHERE entity_id=:id AND action='LOCK_SNAPSHOT'"
            ), {"id": self.created["id"]}).scalar_one()

    def assert_changed(self, response):
        self.assertEqual(response.status_code, 409, response.text)
        self.assertEqual(response.json()["code"], "SNAPSHOT_CHANGED")
        self.assertEqual(response.headers["content-type"], "application/problem+json")

    def test_hashes_match_exact_persisted_payload_and_lock_preserves_engine_hash(self):
        reviewed = self.get_snapshot()
        self.assertEqual(reviewed, self.created)
        canonical = json.dumps(reviewed["snapshot"], sort_keys=True, separators=(",", ":"), ensure_ascii=True)
        expected = "sha256:" + hashlib.sha256(canonical.encode("utf-8")).hexdigest()
        self.assertEqual(reviewed["content_hash"], expected)
        validated = self.post(":validate", '"' + expected + '"')
        self.assertEqual(validated.status_code, 200, validated.text)
        self.assertTrue(validated.json()["valid"])
        self.assertEqual(validated.json()["validation_hash"], expected)
        locked = self.post(":lock", expected)
        self.assertEqual(locked.status_code, 200, locked.text)
        self.assertEqual(locked.json()["status"], "LOCKED")
        engine_hash = engine.snapshot_hash(engine.snapshot_from_dict(reviewed["snapshot"]))
        self.assertEqual(locked.json()["data_hash"], engine_hash)
        after = self.get_snapshot()
        self.assertEqual(after["content_hash"], expected)
        self.assertEqual(after["snapshot"], reviewed["snapshot"])
        self.assertEqual(self.lock_audits(), 1)
        replay = self.post(":lock", expected)
        self.assertEqual(replay.status_code, 409, replay.text)
        self.assertEqual(replay.json()["code"], "SNAPSHOT_LOCKED")
        self.assertEqual(self.get_snapshot(), after)
        self.assertEqual(self.lock_audits(), 1)

    def test_interleaved_save_rejects_stale_validation_and_lock_without_writes(self):
        reviewed = self.get_snapshot()
        validated = self.post(":validate", reviewed["content_hash"])
        self.assertEqual(validated.status_code, 200, validated.text)
        saved = self.save_changed_draft()
        self.assertNotEqual(saved["content_hash"], reviewed["content_hash"])
        self.assertEqual(saved["status"], "DRAFT")
        self.assertIsNone(saved["data_hash"])
        self.assertIsNone(saved["locked_at"])
        self.assert_changed(self.post(":validate", reviewed["content_hash"]))
        self.assert_changed(self.post(":lock", validated.json()["validation_hash"]))
        self.assertEqual(self.get_snapshot(), saved)
        self.assertEqual(self.lock_audits(), 0)
        refreshed = self.post(":validate", saved["content_hash"])
        self.assertEqual(refreshed.status_code, 200, refreshed.text)
        locked = self.post(":lock", '"' + refreshed.json()["validation_hash"] + '"')
        self.assertEqual(locked.status_code, 200, locked.text)
        self.assertEqual(self.get_snapshot()["snapshot"], saved["snapshot"])
        self.assertEqual(self.lock_audits(), 1)

    def test_non_numeric_payload_change_also_invalidates_review(self):
        reviewed = self.get_snapshot()
        holders = list(reversed(reviewed["snapshot"]["holders"]))
        saved = self.client.patch(self.path + "/holdings", headers=ANALYST, json={"holders": holders})
        self.assertEqual(saved.status_code, 200, saved.text)
        # Engine normalization sorts holders; review binding must preserve persisted list order.
        self.assertEqual(engine.snapshot_hash(engine.snapshot_from_dict(reviewed["snapshot"])),
                         engine.snapshot_hash(engine.snapshot_from_dict(saved.json()["snapshot"])))
        self.assertNotEqual(reviewed["content_hash"], saved.json()["content_hash"])
        self.assert_changed(self.post(":lock", reviewed["content_hash"]))
        self.assertEqual(self.get_snapshot(), saved.json())
        self.assertEqual(self.lock_audits(), 0)

    def test_invalid_preconditions_cannot_bypass_binding(self):
        before = self.get_snapshot()
        valid = before["content_hash"]
        for value in ("", "*", "W/\"" + valid + "\"", valid + "," + valid,
                      '"' + valid, valid + '"', "sha256:" + "A" * 64, "sha256:bad"):
            for suffix in (":validate", ":lock"):
                with self.subTest(value=value, suffix=suffix):
                    response = self.post(suffix, value)
                    self.assertEqual(response.status_code, 400, response.text)
                    self.assertEqual(response.json()["code"], "INVALID_IF_MATCH")
        duplicate = self.client.post(self.path + ":lock", headers=[
            *REVIEWER.items(), ("If-Match", valid), ("If-Match", valid),
        ])
        self.assertEqual(duplicate.status_code, 400, duplicate.text)
        self.assertEqual(duplicate.json()["code"], "INVALID_IF_MATCH")
        self.assertEqual(self.get_snapshot(), before)
        self.assertEqual(self.lock_audits(), 0)

    def test_headerless_legacy_clients_remain_supported(self):
        validated = self.post(":validate")
        self.assertEqual(validated.status_code, 200, validated.text)
        self.assertEqual(validated.json()["validation_hash"], self.created["content_hash"])
        saved = self.save_changed_draft()
        locked = self.post(":lock")
        self.assertEqual(locked.status_code, 200, locked.text)
        self.assertEqual(self.get_snapshot()["snapshot"], saved["snapshot"])

    def test_browser_preflight_allows_if_match(self):
        response = self.client.options(self.path + ":lock", headers={
            "Origin": ORIGIN, "Access-Control-Request-Method": "POST",
            "Access-Control-Request-Headers": "authorization,if-match",
        })
        self.assertEqual(response.status_code, 200, response.text)
        self.assertIn("if-match", response.headers["access-control-allow-headers"].lower())


class SQLiteReviewPreconditionTests(ReviewPreconditionChecks, unittest.TestCase):
    postgres = False


@unittest.skipUnless(os.getenv("FLOATPATH_TEST_POSTGRES_URL"), "Disposable PostgreSQL URL not configured")
class PostgresReviewPreconditionTests(ReviewPreconditionChecks, unittest.TestCase):
    postgres = True


if __name__ == "__main__":
    unittest.main()
