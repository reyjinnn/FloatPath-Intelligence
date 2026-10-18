"""Synthetic-only credential management and UUID boundary regression tests."""
from contextlib import redirect_stdout
from io import StringIO
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
from uuid import UUID, uuid4

from fastapi.testclient import TestClient
from sqlalchemy import text

from apps.api.auth import create_user, hash_password, verify_password
from apps.api.db import get_engine, run_migrations
from apps.api.main import create_app
from scripts import manage_workspace

ORIGIN = "http://localhost:3000"
# A non-secret fixture matching the length of the requested shared demo password.
SHORT_DEMO_PASSWORD = "D" * 10 + "!"
STRONG_PASSWORD = "SyntheticOnlyTestPassword!"


class BackendSecurityTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.url = "sqlite:///" + str(Path(self.temp.name) / "security.sqlite")
        self.db = get_engine(self.url)
        run_migrations(self.db)

    def tearDown(self):
        self.db.dispose()
        self.temp.cleanup()

    def rows(self, table):
        with self.db.connect() as connection:
            return [dict(row) for row in connection.execute(text(f"SELECT * FROM {table} ORDER BY id")).mappings()]

    def test_general_password_policy_remains_at_least_twelve_characters(self):
        for password in ("a" * 8, SHORT_DEMO_PASSWORD, "a" * 257):
            with self.subTest(length=len(password)):
                with self.assertRaises(ValueError):
                    hash_password(password)
                with self.assertRaises(ValueError):
                    create_user(self.db, "rejected", password, "viewer")
        encoded = hash_password(STRONG_PASSWORD)
        self.assertTrue(verify_password(STRONG_PASSWORD, encoded))
        self.assertNotIn(STRONG_PASSWORD, encoded)
        self.assertNotEqual(encoded, hash_password(STRONG_PASSWORD))

    def test_seed_never_changes_credentials_roles_sessions_or_history(self):
        create_user(self.db, "admin", STRONG_PASSWORD, "viewer")
        with patch.dict("os.environ", {"FLOATPATH_DEMO_PASSWORD": SHORT_DEMO_PASSWORD}):
            first = manage_workspace.seed_workspace(self.db)
        self.assertEqual(first["companies"], 5)
        self.assertEqual(first["users"], 0)
        before_users = self.rows("workspace_users")
        before_audit = self.rows("audit_events")
        with self.db.begin() as connection:
            connection.execute(text(
                "INSERT INTO workspace_sessions VALUES (:token, :user, :expires, :created)"
            ), {"token": "a" * 64, "user": before_users[0]["id"],
                "expires": "2099-01-01T00:00:00+00:00", "created": "2026-01-01T00:00:00+00:00"})
        second = manage_workspace.seed_workspace(self.db)
        self.assertTrue(all(value == 0 for value in second.values()))
        self.assertEqual(self.rows("workspace_users"), before_users)
        self.assertEqual(self.rows("audit_events"), before_audit)
        with self.db.connect() as connection:
            self.assertEqual(connection.execute(text("SELECT count(*) FROM workspace_sessions")).scalar_one(), 1)

    def test_demo_credentials_require_explicit_short_policy_and_do_not_overwrite(self):
        original = create_user(self.db, "admin", STRONG_PASSWORD, "viewer")
        before = self.rows("workspace_users")
        with self.assertRaises(ValueError):
            manage_workspace.configure_demo_credentials(self.db, SHORT_DEMO_PASSWORD)
        with self.assertRaises(ValueError):
            manage_workspace.configure_demo_credentials(self.db, "a" * 10, allow_short_demo_password=True)
        self.assertEqual(self.rows("workspace_users"), before)
        result = manage_workspace.configure_demo_credentials(
            self.db, SHORT_DEMO_PASSWORD, allow_short_demo_password=True,
        )
        self.assertEqual(result, {"created": 3, "rotated": 0, "skipped": 1, "sessions_revoked": 0})
        users = self.rows("workspace_users")
        self.assertEqual(len(users), 4)
        self.assertEqual(len({user["password_hash"] for user in users}), 4)
        for user in users:
            if user["id"] == original["id"]:
                self.assertEqual(user, before[0])
            else:
                self.assertTrue(verify_password(SHORT_DEMO_PASSWORD, user["password_hash"]))
                self.assertNotIn(SHORT_DEMO_PASSWORD, user["password_hash"])
        before_audit = self.rows("audit_events")
        again = manage_workspace.configure_demo_credentials(
            self.db, STRONG_PASSWORD,
        )
        self.assertEqual(again["skipped"], 4)
        self.assertEqual(self.rows("workspace_users"), users)
        self.assertEqual(self.rows("audit_events"), before_audit)

    def test_explicit_demo_rotation_revokes_sessions_preserves_roles_and_is_audited(self):
        original = create_user(self.db, "admin", STRONG_PASSWORD, "viewer")
        other = create_user(self.db, "not_a_demo_account", STRONG_PASSWORD, "analyst")
        app = create_app(database_url=self.url, analyst_token="", reviewer_token="", allowed_origins=[ORIGIN])
        with TestClient(app) as demo_client, TestClient(app) as other_client:
            for client, username in ((demo_client, "admin"), (other_client, "not_a_demo_account")):
                login = client.post("/api/v1/auth/login", headers={"Origin": ORIGIN},
                                    json={"username": username, "password": STRONG_PASSWORD})
                self.assertEqual(login.status_code, 200)
            result = manage_workspace.configure_demo_credentials(
                self.db, SHORT_DEMO_PASSWORD, reset_existing=True, allow_short_demo_password=True,
            )
            self.assertEqual(result, {"created": 3, "rotated": 1, "skipped": 0, "sessions_revoked": 1})
            self.assertEqual(demo_client.get("/api/v1/auth/session").status_code, 401)
            self.assertEqual(other_client.get("/api/v1/auth/session").status_code, 200)
            self.assertEqual(demo_client.post("/api/v1/auth/login", headers={"Origin": ORIGIN},
                                             json={"username": "admin", "password": STRONG_PASSWORD}).status_code, 401)
            fresh = demo_client.post("/api/v1/auth/login", headers={"Origin": ORIGIN},
                                     json={"username": "admin", "password": SHORT_DEMO_PASSWORD})
            self.assertEqual(fresh.status_code, 200)
            self.assertEqual(fresh.json()["user"], original)
            # General API creation cannot use the CLI-only exception.
            create_user(self.db, "manager", STRONG_PASSWORD, "admin")
            demo_client.post("/api/v1/auth/login", headers={"Origin": ORIGIN},
                             json={"username": "manager", "password": STRONG_PASSWORD})
            rejected = demo_client.post("/api/v1/workspace/users", headers={"Origin": ORIGIN},
                                        json={"username": "too_short", "password": SHORT_DEMO_PASSWORD, "role": "viewer"})
            self.assertEqual(rejected.status_code, 422)
        events = self.rows("audit_events")
        rotations = [event for event in events if event["action"] == "ROTATE_DEMO_CREDENTIAL"]
        self.assertEqual(len(rotations), 1)
        self.assertEqual(rotations[0]["entity_id"], original["id"])
        for event in events:
            for key in ("id", "entity_id", "actor_id", "correlation_id"):
                self.assertEqual(str(UUID(event[key])), event[key])
        self.assertNotIn(SHORT_DEMO_PASSWORD, json.dumps(events))
        self.assertNotIn(STRONG_PASSWORD, json.dumps(events))
        with self.db.connect() as connection:
            other_row = connection.execute(text("SELECT * FROM workspace_users WHERE id=:id"), other).mappings().one()
        self.assertTrue(verify_password(STRONG_PASSWORD, other_row["password_hash"]))

    def test_rotation_rolls_back_password_and_sessions_when_audit_fails(self):
        user = create_user(self.db, "admin", STRONG_PASSWORD, "admin")
        with self.db.begin() as connection:
            connection.execute(text("INSERT INTO workspace_sessions VALUES ('test-session-hash', :id, '2099', '2026')"), user)
            connection.execute(text(
                "CREATE TRIGGER reject_demo_audit BEFORE INSERT ON audit_events "
                "BEGIN SELECT RAISE(ABORT, 'test audit unavailable'); END"
            ))
        before = self.rows("workspace_users")
        from sqlalchemy.exc import IntegrityError
        with self.assertRaises(IntegrityError):
            manage_workspace.configure_demo_credentials(self.db, STRONG_PASSWORD + "rotated", reset_existing=True)
        self.assertEqual(self.rows("workspace_users"), before)
        with self.db.connect() as connection:
            self.assertEqual(connection.execute(text("SELECT count(*) FROM workspace_sessions")).scalar_one(), 1)

    def test_cli_uses_env_only_for_explicit_demo_command_and_never_echoes_password(self):
        output = StringIO()
        with patch.dict("os.environ", {"FLOATPATH_DEMO_PASSWORD": SHORT_DEMO_PASSWORD}), \
                patch("sys.argv", ["manage_workspace.py", "demo-credentials", "--allow-short-demo-password",
                                   "--database-url", self.url]), \
                patch("getpass.getpass", side_effect=AssertionError("No interactive prompt expected")), \
                redirect_stdout(output):
            manage_workspace.main()
        self.assertNotIn(SHORT_DEMO_PASSWORD, output.getvalue())
        self.assertIn("SYNTHETIC", output.getvalue())
        self.assertEqual(len(self.rows("workspace_users")), 4)

    def test_new_entity_actor_and_correlation_ids_are_uuid_without_rewriting_history(self):
        manage_workspace.seed_workspace(self.db)
        before = self.rows("audit_events")
        for table in ("companies", "snapshots", "assessments", "scenarios", "reports", "audit_events"):
            for row in self.rows(table):
                self.assertEqual(str(UUID(row["id"])), row["id"])
                if table == "audit_events":
                    for key in ("actor_id", "entity_id", "correlation_id"):
                        self.assertEqual(str(UUID(row[key])), row[key])
        app = create_app(database_url=self.url, analyst_token="test-analyst-token", reviewer_token="test-reviewer-token",
                         allowed_origins=[ORIGIN], public_demo=True)
        with TestClient(app) as client:
            supplied = str(uuid4())
            for value in (supplied, "legacy-request-label", ""):
                response = client.post("/api/v1/companies", headers={"Authorization": "Bearer test-analyst-token",
                                                                     "X-Correlation-ID": value},
                                       json={"legal_name": "DEMO UUID TEST"})
                self.assertEqual(response.status_code, 201)
                correlation = response.headers["x-correlation-id"]
                self.assertEqual(str(UUID(correlation)), correlation)
                if value == supplied:
                    self.assertEqual(correlation, supplied)
            for token in ("test-analyst-token", "test-reviewer-token"):
                denied = client.get("/api/v1/workspace/users", headers={"Authorization": "Bearer " + token})
                self.assertEqual(denied.status_code, 403)
            action = {"action_type": "NEW_ISSUANCE", "allocations": [{"holder_ref": "UUID-TEST", "shares": 1,
                       "eligibility": "ELIGIBLE", "evidence_ref": "fixture://demo-001/controller"}]}
            scenario_response = client.post("/api/v1/demo/simulations", json={"company_id": "DEMO-001", "action": action})
            report_response = client.post("/api/v1/demo/reports", json={"company_id": "DEMO-001", "actions": [action]})
            self.assertEqual(scenario_response.status_code, 200, scenario_response.text)
            self.assertEqual(report_response.status_code, 200, report_response.text)
            scenario, report = scenario_response.json(), report_response.json()
            self.assertEqual(str(UUID(scenario["scenario_id"])), scenario["scenario_id"])
            self.assertEqual(str(UUID(report["id"])), report["id"])
            self.assertTrue(scenario["result_hash"].startswith("sha256:"))
        after = self.rows("audit_events")
        by_id = {row["id"]: row for row in after}
        self.assertTrue(all(by_id[row["id"]] == row for row in before))
        for event in after:
            for key in ("id", "actor_id", "entity_id", "correlation_id"):
                self.assertEqual(str(UUID(event[key])), event[key])


if __name__ == "__main__":
    unittest.main()
