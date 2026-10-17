"""Tests for workspace product flow, sessions, RBAC, CSRF, and seeding."""
import copy
from datetime import datetime, timedelta, timezone
import json
from pathlib import Path
import tempfile
import unittest
from uuid import UUID, uuid4

from fastapi.testclient import TestClient
from sqlalchemy import text

from apps.api.auth import COOKIE_NAME, create_user
from apps.api.main import create_app
from packages import engine
from scripts.manage_workspace import seed_workspace

CATALOG_PATH = Path(__file__).resolve().parents[1] / "datasets" / "synthetic" / "companies.json"
ORIGIN = "http://localhost:3000"


class WorkspaceTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.url = "sqlite:///" + str(Path(self.temp.name) / "workspace.sqlite")
        self.app = create_app(
            database_url=self.url,
            analyst_token="test-analyst-token",
            reviewer_token="test-reviewer-token",
            public_demo=False,
            allowed_origins=[ORIGIN],
        )
        self.context = TestClient(self.app)
        self.client = self.context.__enter__()
        self.catalog = json.loads(CATALOG_PATH.read_text("utf-8"))

        # Create real users in DB
        self.analyst_user = create_user(self.app.state.db, "analyst_alice", "password123456", "analyst")
        self.reviewer_user = create_user(self.app.state.db, "reviewer_bob", "password654321", "reviewer")

    def tearDown(self):
        self.context.__exit__(None, None, None)
        self.temp.cleanup()

    def login_client(self, username="analyst_alice", password="password123456"):
        client = TestClient(self.app)
        res = client.post(
            "/api/v1/auth/login",
            json={"username": username, "password": password},
            headers={"Origin": ORIGIN},
        )
        self.assertEqual(res.status_code, 200, res.text)
        return client, res.json()

    def test_public_routes_disabled_by_default(self):
        res = self.client.get("/api/v1/demo/companies")
        self.assertEqual(res.status_code, 404)
        self.assertEqual(res.json()["code"], "NOT_FOUND")

        res = self.client.post("/api/v1/demo/simulations", json={"company_id": "DEMO-001", "action": {}})
        self.assertEqual(res.status_code, 404)

        res = self.client.post("/api/v1/demo/reports", json={"company_id": "DEMO-001", "actions": []})
        self.assertEqual(res.status_code, 404)

    def test_auth_login_logout_and_session_cycle(self):
        # Bad password
        bad_pw = self.client.post(
            "/api/v1/auth/login",
            json={"username": "analyst_alice", "password": "wrongpassword!"},
            headers={"Origin": ORIGIN},
        )
        self.assertEqual(bad_pw.status_code, 401)
        self.assertEqual(bad_pw.json()["code"], "UNAUTHORIZED")

        # Unknown user
        bad_user = self.client.post(
            "/api/v1/auth/login",
            json={"username": "nonexistent_user", "password": "password123456"},
            headers={"Origin": ORIGIN},
        )
        self.assertEqual(bad_user.status_code, 401)
        self.assertEqual(bad_user.json()["code"], "UNAUTHORIZED")

        # Successful login
        res = self.client.post(
            "/api/v1/auth/login",
            json={"username": "analyst_alice", "password": "password123456"},
            headers={"Origin": ORIGIN},
        )
        self.assertEqual(res.status_code, 200)
        data = res.json()
        self.assertEqual(data["user"]["username"], "analyst_alice")
        self.assertEqual(data["user"]["role"], "analyst")
        self.assertEqual(data["workspace"]["data_mode"], "SYNTHETIC")
        self.assertNotIn("token", data)
        self.assertIn(COOKIE_NAME, res.cookies)
        self.assertEqual(res.headers["cache-control"], "no-store")

        # GET /api/v1/auth/session
        sess_res = self.client.get("/api/v1/auth/session")
        self.assertEqual(sess_res.status_code, 200)
        self.assertEqual(sess_res.json()["user"]["username"], "analyst_alice")

        # Logout
        logout_res = self.client.post("/api/v1/auth/logout", headers={"Origin": ORIGIN})
        self.assertEqual(logout_res.status_code, 200)

        # GET session after logout -> 401
        after_res = self.client.get("/api/v1/auth/session")
        self.assertEqual(after_res.status_code, 401)

    def test_session_expiry_and_tampering(self):
        client, _ = self.login_client("analyst_alice", "password123456")

        # Session tampering
        client.cookies.clear()
        client.cookies.set(COOKIE_NAME, "tampered" + "a" * 35)
        bad_token = client.get("/api/v1/auth/session")
        self.assertEqual(bad_token.status_code, 401)

        # Expired session
        client, _ = self.login_client("analyst_alice", "password123456")
        past = (datetime.now(timezone.utc) - timedelta(hours=1)).isoformat()
        with self.app.state.db.begin() as conn:
            conn.execute(text("UPDATE workspace_sessions SET expires_at=:past"), {"past": past})

        expired = client.get("/api/v1/auth/session")
        self.assertEqual(expired.status_code, 401)

    def test_csrf_origin_checks_for_cookie_and_bearer(self):
        client, _ = self.login_client("analyst_alice", "password123456")

        # Seed workspace so companies exist
        seed_workspace(self.app.state.db)
        comp_id = self.catalog[0]["id"]

        action = {
            "action_type": "NEW_ISSUANCE",
            "price_idr_per_share": "100.00",
            "allocations": [
                {
                    "holder_ref": "DEMO-NEW-INV",
                    "shares": 1000,
                    "eligibility": "ELIGIBLE",
                    "evidence_ref": "fixture://demo-001/controller",
                }
            ],
        }

        # 1. Cookie mutation without Origin -> 403
        no_origin = client.post(f"/api/v1/workspace/companies/{comp_id}/scenarios", json=action)
        self.assertEqual(no_origin.status_code, 403)
        self.assertEqual(no_origin.json()["code"], "CSRF_ORIGIN_REJECTED")

        # 2. Cookie mutation with disallowed Origin -> 403
        bad_origin = client.post(
            f"/api/v1/workspace/companies/{comp_id}/scenarios",
            json=action,
            headers={"Origin": "https://malicious.example.com"},
        )
        self.assertEqual(bad_origin.status_code, 403)
        self.assertEqual(bad_origin.json()["code"], "CSRF_ORIGIN_REJECTED")

        # 3. Cookie mutation with allowed Origin -> 201
        ok_origin = client.post(
            f"/api/v1/workspace/companies/{comp_id}/scenarios",
            json=action,
            headers={"Origin": ORIGIN},
        )
        self.assertEqual(ok_origin.status_code, 201)

        # 4. Bearer mutation without Origin -> succeeds (no ambient credential)
        bearer_client = TestClient(self.app)
        bearer_ok = bearer_client.post(
            f"/api/v1/workspace/companies/{comp_id}/scenarios",
            json=action,
            headers={"Authorization": "Bearer test-analyst-token"},
        )
        self.assertEqual(bearer_ok.status_code, 201)

    def test_rbac_session_analyst_cannot_review_or_lock(self):
        analyst_client, _ = self.login_client("analyst_alice", "password123456")
        reviewer_client, _ = self.login_client("reviewer_bob", "password654321")

        # Create company and draft snapshot as analyst
        comp = analyst_client.post(
            "/api/v1/companies",
            json={"code": "DEMO-001", "legal_name": "DEMO TEST CO"},
            headers={"Origin": ORIGIN},
        )
        self.assertEqual(comp.status_code, 201)
        cid = comp.json()["id"]

        snap_data = copy.deepcopy(self.catalog[0]["snapshot"])
        snap = analyst_client.post(
            f"/api/v1/companies/{cid}/snapshots",
            json=snap_data,
            headers={"Origin": ORIGIN},
        )
        self.assertEqual(snap.status_code, 201)
        sid = snap.json()["id"]

        # Analyst attempts lock -> 403
        lock_fail = analyst_client.post(f"/api/v1/snapshots/{sid}:lock", headers={"Origin": ORIGIN})
        self.assertEqual(lock_fail.status_code, 403)
        self.assertEqual(lock_fail.json()["code"], "FORBIDDEN")

        # Reviewer attempts lock -> 200
        lock_ok = reviewer_client.post(f"/api/v1/snapshots/{sid}:lock", headers={"Origin": ORIGIN})
        self.assertEqual(lock_ok.status_code, 200)
        self.assertEqual(lock_ok.json()["status"], "LOCKED")

    def test_seed_workspace_idempotence_and_metadata(self):
        # Run seed first time
        first = seed_workspace(self.app.state.db)
        self.assertEqual(first["companies"], 5)
        self.assertEqual(first["snapshots"], 5)

        # Run seed second time -> zero new inserts, no trigger violations
        second = seed_workspace(self.app.state.db)
        self.assertEqual(second["companies"], 0)
        self.assertEqual(second["snapshots"], 0)

        # Verify presentation code and neutral UI attributes
        analyst_client, _ = self.login_client("analyst_alice", "password123456")
        res = analyst_client.get("/api/v1/workspace/companies")
        self.assertEqual(res.status_code, 200)
        companies = res.json()
        self.assertEqual(len(companies), 5)

        presentation_codes = [c["presentation_code"] for c in companies]
        self.assertIn("ARIF-SYN", presentation_codes)
        self.assertIn("BALO-SYN", presentation_codes)

        # Confirm original internal codes preserved
        internal_codes = [c["code"] for c in companies]
        self.assertIn("DEMO-001", internal_codes)

        # Confirm data_mode is SYNTHETIC
        for c in companies:
            self.assertEqual(c["data_mode"], "SYNTHETIC")
            self.assertTrue(c["demo"])
            self.assertIn("snapshot", c)
            self.assertIn("assessment", c)

    def test_workspace_company_lookups_and_scenarios(self):
        seed_workspace(self.app.state.db)
        analyst_client, _ = self.login_client("analyst_alice", "password123456")

        # Lookup by code
        res_code = analyst_client.get("/api/v1/workspace/companies/DEMO-001")
        self.assertEqual(res_code.status_code, 200)
        company = res_code.json()
        self.assertEqual(company["code"], "DEMO-001")
        self.assertEqual(company["presentation_code"], "ARIF-SYN")

        # Lookup by UUID
        res_uuid = analyst_client.get(f"/api/v1/workspace/companies/{company['id']}")
        self.assertEqual(res_uuid.status_code, 200)
        self.assertEqual(res_uuid.json()["id"], company["id"])

        # List scenarios
        scen_res = analyst_client.get(f"/api/v1/workspace/companies/{company['id']}/scenarios")
        self.assertEqual(scen_res.status_code, 200)
        scenarios = scen_res.json()
        self.assertGreaterEqual(len(scenarios), 1)

        # List reports
        rep_res = analyst_client.get(f"/api/v1/workspace/companies/{company['id']}/reports")
        self.assertEqual(rep_res.status_code, 200)
        reports = rep_res.json()
        self.assertGreaterEqual(len(reports), 1)

    def test_holdings_edit_and_review_workflow(self):
        analyst_client, _ = self.login_client("analyst_alice", "password123456")
        reviewer_client, _ = self.login_client("reviewer_bob", "password654321")

        comp = analyst_client.post(
            "/api/v1/companies",
            json={"code": "DEMO-001", "legal_name": "DEMO HOLDINGS WORKFLOW"},
            headers={"Origin": ORIGIN},
        )
        cid = comp.json()["id"]

        snap_data = copy.deepcopy(self.catalog[0]["snapshot"])
        snap = analyst_client.post(
            f"/api/v1/companies/{cid}/snapshots",
            json=snap_data,
            headers={"Origin": ORIGIN},
        )
        sid = snap.json()["id"]

        # Modify holdings on DRAFT
        new_holders = copy.deepcopy(snap_data["holders"])
        new_holders[0]["shares"] -= 1000
        new_holders[1]["shares"] += 1000

        patch_res = analyst_client.patch(
            f"/api/v1/snapshots/{sid}/holdings",
            json={"holders": new_holders},
            headers={"Origin": ORIGIN},
        )
        self.assertEqual(patch_res.status_code, 200, patch_res.text)
        updated_holders = patch_res.json()["snapshot"]["holders"]
        self.assertEqual(updated_holders[0]["shares"], new_holders[0]["shares"])

        # Validate holdings
        val_res = analyst_client.post(f"/api/v1/snapshots/{sid}:validate", headers={"Origin": ORIGIN})
        self.assertEqual(val_res.status_code, 200)
        self.assertEqual(val_res.json()["assessment_status"], "SIMULATION_ONLY")

        # Lock snapshot
        lock_res = reviewer_client.post(f"/api/v1/snapshots/{sid}:lock", headers={"Origin": ORIGIN})
        self.assertEqual(lock_res.status_code, 200)

        # Attempt to edit after lock -> 409
        edit_locked = analyst_client.patch(
            f"/api/v1/snapshots/{sid}/holdings",
            json={"holders": new_holders},
            headers={"Origin": ORIGIN},
        )
        self.assertEqual(edit_locked.status_code, 409)
        self.assertEqual(edit_locked.json()["code"], "SNAPSHOT_LOCKED")

    def test_import_unreconciled_rollback(self):
        analyst_client, _ = self.login_client("analyst_alice", "password123456")

        comp = analyst_client.post(
            "/api/v1/companies",
            json={"code": "DEMO-001", "legal_name": "DEMO IMPORT TEST"},
            headers={"Origin": ORIGIN},
        )
        cid = comp.json()["id"]

        snap_data = copy.deepcopy(self.catalog[0]["snapshot"])
        snap = analyst_client.post(
            f"/api/v1/companies/{cid}/snapshots",
            json=snap_data,
            headers={"Origin": ORIGIN},
        )
        sid = snap.json()["id"]

        # CSV with share_count that doesn't sum to total_shares
        bad_csv = (
            "holder_ref,holder_type,share_count,controller,controller_affiliate,director_commissioner,treasury,restricted,eligibility_state,evidence_ref\n"
            "CTRL-1,ORGANIZATION,100,TRUE,FALSE,FALSE,FALSE,FALSE,INELIGIBLE,fixture://demo-001/controller\n"
        )
        import_res = analyst_client.post(
            f"/api/v1/snapshots/{sid}/holdings:import",
            json={"csv_content": bad_csv},
            headers={"Origin": ORIGIN},
        )
        self.assertEqual(import_res.status_code, 422)
        self.assertEqual(import_res.json()["code"], "SNAPSHOT_RECONCILIATION_FAILED")

        # Verify DB payload was not modified
        current = analyst_client.get(f"/api/v1/snapshots/{sid}")
        self.assertEqual(len(current.json()["snapshot"]["holders"]), len(snap_data["holders"]))

    def test_unknown_status_propagation(self):
        analyst_client, _ = self.login_client("analyst_alice", "password123456")
        reviewer_client, _ = self.login_client("reviewer_bob", "password654321")

        comp = analyst_client.post(
            "/api/v1/companies",
            json={"code": "DEMO-001", "legal_name": "DEMO UNKNOWN STATUS"},
            headers={"Origin": ORIGIN},
        )
        cid = comp.json()["id"]

        snap_data = copy.deepcopy(self.catalog[0]["snapshot"])
        # Set sid_count to None so engine produces REQUIRES_VERIFICATION
        snap_data["sid_count"] = None

        snap = analyst_client.post(
            f"/api/v1/companies/{cid}/snapshots",
            json=snap_data,
            headers={"Origin": ORIGIN},
        )
        sid = snap.json()["id"]

        val_res = analyst_client.post(f"/api/v1/snapshots/{sid}:validate", headers={"Origin": ORIGIN})
        self.assertEqual(val_res.status_code, 200)
        self.assertEqual(val_res.json()["assessment_status"], "REQUIRES_VERIFICATION")

        lock_res = reviewer_client.post(f"/api/v1/snapshots/{sid}:lock", headers={"Origin": ORIGIN})
        self.assertEqual(lock_res.status_code, 200)
        self.assertEqual(lock_res.json()["assessment_status"], "REQUIRES_VERIFICATION")

    def test_enterprise_roles_rbac_and_user_management(self):
        admin_user = create_user(self.app.state.db, "admin_boss", "passwordAdmin123!", "admin")
        viewer_user = create_user(self.app.state.db, "viewer_guest", "passwordViewer123!", "viewer")

        admin_client, _ = self.login_client("admin_boss", "passwordAdmin123!")
        viewer_client, _ = self.login_client("viewer_guest", "passwordViewer123!")
        analyst_client, _ = self.login_client("analyst_alice", "password123456")
        reviewer_client, _ = self.login_client("reviewer_bob", "password654321")

        # 1. Admin can list users
        users_res = admin_client.get("/api/v1/workspace/users")
        self.assertEqual(users_res.status_code, 200)
        usernames = [u["username"] for u in users_res.json()]
        self.assertIn("admin_boss", usernames)
        self.assertIn("analyst_alice", usernames)

        # 2. Non-admin cannot list users
        for client in (analyst_client, reviewer_client, viewer_client):
            self.assertEqual(client.get("/api/v1/workspace/users").status_code, 403)

        # 3. Admin can create new user
        new_user_res = admin_client.post(
            "/api/v1/workspace/users",
            json={"username": "new_analyst_carol", "password": "passwordStrong123!", "role": "analyst"},
            headers={"Origin": ORIGIN},
        )
        self.assertEqual(new_user_res.status_code, 201)
        new_uid = new_user_res.json()["id"]

        # 4. Admin can update user role
        patch_res = admin_client.patch(
            f"/api/v1/workspace/users/{new_uid}",
            json={"role": "reviewer"},
            headers={"Origin": ORIGIN},
        )
        self.assertEqual(patch_res.status_code, 200)
        self.assertEqual(patch_res.json()["role"], "reviewer")

        # 5. Admin cannot demote last admin
        bad_demote = admin_client.patch(
            f"/api/v1/workspace/users/{admin_user['id']}",
            json={"role": "analyst"},
            headers={"Origin": ORIGIN},
        )
        self.assertEqual(bad_demote.status_code, 400)

        # 6. Audit trail access
        for client in (admin_client, reviewer_client, viewer_client):
            audit_res = client.get("/api/v1/workspace/audit-events")
            self.assertEqual(audit_res.status_code, 200)
            self.assertIsInstance(audit_res.json(), list)
            self.assertGreater(len(audit_res.json()), 0)

        # Analyst cannot access audit events
        self.assertEqual(analyst_client.get("/api/v1/workspace/audit-events").status_code, 403)

        # 7. Viewer read-only restrictions
        seed_workspace(self.app.state.db)
        companies_res = viewer_client.get("/api/v1/workspace/companies")
        self.assertEqual(companies_res.status_code, 200)
        cid = companies_res.json()[0]["id"]
        sid = companies_res.json()[0]["snapshot"]["id"]

        # Viewer mutation attempts blocked with 403
        self.assertEqual(viewer_client.post(
            "/api/v1/companies",
            json={"code": "DEMO-001", "legal_name": "DEMO BLOCKED"},
            headers={"Origin": ORIGIN},
        ).status_code, 403)
        self.assertEqual(viewer_client.post(
            f"/api/v1/companies/{cid}/snapshots",
            json=self.catalog[0]["snapshot"],
            headers={"Origin": ORIGIN},
        ).status_code, 403)
        self.assertEqual(viewer_client.post(
            f"/api/v1/snapshots/{sid}/holdings:review",
            json={"holders": self.catalog[0]["snapshot"]["holders"]},
            headers={"Origin": ORIGIN},
        ).status_code, 403)
        self.assertEqual(viewer_client.post(
            f"/api/v1/snapshots/{sid}:lock",
            headers={"Origin": ORIGIN},
        ).status_code, 403)
        self.assertEqual(viewer_client.post(
            f"/api/v1/snapshots/{sid}/scenarios",
            json={"action_type": "NEW_ISSUANCE", "allocations": [{"holder_ref": "DEMO-001-SEED-INV", "shares": 1000, "eligibility": "ELIGIBLE", "evidence_ref": "fixture://demo-001/controller"}]},
            headers={"Origin": ORIGIN},
        ).status_code, 403)



if __name__ == "__main__":
    unittest.main()
