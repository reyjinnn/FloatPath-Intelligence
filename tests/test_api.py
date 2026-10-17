"""FR-001/002/007/009/012/013: actual engine + disposable SQLite integration."""
import copy
import csv
import io
import json
from pathlib import Path
import tempfile
import unittest
from decimal import Decimal

from fastapi.testclient import TestClient
from sqlalchemy import text
from sqlalchemy.exc import DBAPIError

from apps.api.main import create_app
from packages import engine

CATALOG = Path(__file__).resolve().parents[1] / "datasets" / "synthetic" / "companies.json"
ANALYST = {"Authorization": "Bearer test-analyst-token"}
REVIEWER = {"Authorization": "Bearer test-reviewer-token"}
HEADER = ["holder_ref", "holder_type", "share_count", "controller", "controller_affiliate",
          "director_commissioner", "treasury", "restricted", "eligibility_state", "evidence_ref"]


def csv_for(snapshot):
    output = io.StringIO(newline="")
    writer = csv.writer(output)
    writer.writerow(HEADER)
    for holder in snapshot["holders"]:
        writer.writerow([holder.get(k, "FALSE") if k not in {"share_count", "eligibility_state"}
                         else holder["shares" if k == "share_count" else "eligibility"] for k in HEADER])
    return output.getvalue()


class ApiTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.url = "sqlite:///" + str(Path(self.temp.name) / "api.sqlite")
        self.app = self.make_app()
        self.context = TestClient(self.app)
        self.client = self.context.__enter__()
        self.fixture = json.loads(CATALOG.read_text("utf-8"))[0]
        self.snapshot = copy.deepcopy(self.fixture["snapshot"])

    def make_app(self):
        return create_app(database_url=self.url, analyst_token="test-analyst-token",
                          reviewer_token="test-reviewer-token", public_demo=True)

    def tearDown(self):
        self.context.__exit__(None, None, None)
        self.temp.cleanup()

    def post(self, path, body=None, headers=None):
        return self.client.post("/api/v1/" + path, json=body,
                                headers=headers if headers is not None else ANALYST)

    def draft(self, snapshot=None):
        company = self.post("companies", {"legal_name": "DEMO TEST", "code": self.fixture["code"]})
        self.assertEqual(company.status_code, 201, company.text)
        payload = copy.deepcopy(snapshot or self.snapshot)
        payload.pop("id", None)
        response = self.post(f"companies/{company.json()['id']}/snapshots", payload)
        self.assertEqual(response.status_code, 201, response.text)
        return response.json()["id"], company.json()["id"]

    def locked(self):
        snapshot_id, company_id = self.draft()
        response = self.post(f"snapshots/{snapshot_id}:lock", headers=REVIEWER)
        self.assertEqual(response.status_code, 200, response.text)
        return snapshot_id, company_id

    def action(self):
        return {"action_type": "NEW_ISSUANCE", "price_idr_per_share": "250.00",
                "allocations": [{"holder_ref": "DEMO-NEW-HOLDER", "shares": 1000,
                                 "eligibility": "ELIGIBLE", "evidence_ref": "fixture://demo-001/controller"}]}

    def count(self, table):
        with self.app.state.db.connect() as connection:
            return connection.execute(text(f"SELECT COUNT(*) FROM {table}")).scalar_one()

    def assert_problem(self, response, status):
        self.assertEqual(response.status_code, status, response.text)
        self.assertEqual(response.headers["content-type"], "application/problem+json")
        self.assertEqual(response.json()["correlation_id"], response.headers["x-correlation-id"])
        self.assertEqual(response.json()["status"], status)

    def test_public_catalog_actual_simulation_and_report(self):
        catalog = self.client.get("/api/v1/demo/companies")
        self.assertEqual(catalog.status_code, 200)
        self.assertEqual(len(catalog.json()), 5)
        self.assertIn("x-correlation-id", catalog.headers)
        detail = self.client.get("/api/v1/demo/companies/DEMO-001")
        self.assertEqual(detail.status_code, 200, detail.text)
        self.assertEqual(Decimal(detail.json()["assessment"]["free_float_ratio"]), Decimal("0.1"))
        action = self.action()
        expected = engine.simulate(engine.snapshot_from_dict(self.snapshot), action)
        result = self.post("demo/simulations", {"company_id": "DEMO-001", "action": action}, {})
        self.assertEqual(result.status_code, 200, result.text)
        for key in ("input_hash", "result_hash", "assessment", "cash_estimate_idr", "dilution_by_holder"):
            self.assertEqual(result.json()[key], expected[key])
        self.assertEqual(Decimal(result.json()["cash_estimate_idr"]), Decimal("250000"))
        again = self.post("demo/simulations", {"company_id": "DEMO-001", "action": action}, {})
        self.assertEqual(result.json(), again.json())
        report = self.post("demo/reports", {"company_id": "DEMO-001", "actions": [action, action]}, {})
        self.assertEqual(report.status_code, 200, report.text)
        self.assertEqual(report.json()["watermark"], "SIMULATION_ONLY")
        for value in (expected["input_hash"], expected["result_hash"]):
            self.assertIn(value, report.json()["markdown_content"])
        self.assertIn("Scenario B", report.json()["markdown_content"])
        self.assertEqual(self.count("scenarios"), 0)
        self.assertEqual(self.count("reports"), 0)
        self.assertEqual(self.client.get("/api/v1/rulesets").json()[0]["status"], "DRAFT")

    def test_auth_roles_no_default_tokens_and_private_enumeration(self):
        self.assert_problem(self.client.get("/api/v1/companies/unknown"), 401)
        self.assert_problem(self.post("companies", {"legal_name": "DEMO TEST"}, {}), 401)
        snapshot_id, company_id = self.draft()
        self.assert_problem(self.post(f"snapshots/{snapshot_id}:lock"), 403)
        self.assert_problem(self.client.get(f"/api/v1/demo/companies/{company_id}"), 404)
        self.assert_problem(self.client.get(f"/api/v1/snapshots/{snapshot_id}"), 401)
        unconfigured = create_app(database_url=self.url, analyst_token="", reviewer_token="")
        with TestClient(unconfigured) as client:
            response = client.get(f"/api/v1/companies/{company_id}", headers=ANALYST)
            self.assert_problem(response, 401)
        for path in ("documents", "documents/anything:extract"):
            self.assert_problem(self.post(path), 503)

    def test_strict_numbers_extras_and_source_isolation(self):
        snapshot_id, company_id = self.draft()
        for total in (1.0, True, "1000", 9007199254740992):
            bad = copy.deepcopy(self.snapshot)
            bad.pop("id", None)
            bad["total_shares"] = total
            self.assert_problem(self.post(f"companies/{company_id}/snapshots", bad), 422)
        action = self.action()
        for shares in (1.5, True, "1", 9007199254740992):
            action["allocations"][0]["shares"] = shares
            self.assert_problem(self.post("demo/simulations", {"company_id": "DEMO-001", "action": action}, {}), 422)
        action = self.action()
        action["free_float_ratio"] = "1"
        self.assert_problem(self.post("demo/simulations", {"company_id": "DEMO-001", "action": action}, {}), 422)
        for source in ("https://example.org/private", "fixture://not-an-approved-fixture", "file:///secret"):
            action = self.action()
            action["allocations"][0]["evidence_ref"] = source
            response = self.post("demo/simulations", {"company_id": "DEMO-001", "action": action}, {})
            self.assert_problem(response, 422)
        self.assert_problem(self.post("companies", {"legal_name": "Real Issuer"}), 422)

    def test_csv_atomic_replacement_rejection_and_idempotency(self):
        draft = copy.deepcopy(self.snapshot)
        draft["holders"] = []
        snapshot_id, _ = self.draft(draft)
        path = f"snapshots/{snapshot_id}/holdings:import"
        content = csv_for(self.snapshot)
        headers = {**ANALYST, "Idempotency-Key": "import-1"}
        first = self.post(path, {"csv_content": content}, headers)
        self.assertEqual(first.status_code, 200, first.text)
        audits = self.count("audit_events")
        replay = self.post(path, {"csv_content": content}, headers)
        self.assertEqual(replay.json(), first.json())
        self.assertEqual(audits, self.count("audit_events"))
        self.assert_problem(self.post(path, {"csv_content": content + "\n"}, headers), 409)
        rows = content.splitlines()
        formula = content.replace(self.snapshot["holders"][0]["holder_ref"], "=FORMULA", 1)
        bad_cases = ["wrong,header\n", '"unclosed', formula,
                     content + rows[1] + "\n", content.replace(",TRUE,", ",INVALID,", 1),
                     content.replace("fixture://", "https://", 1),
                     "x" * (5 * 1024 * 1024 + 1)]
        for bad in bad_cases:
            with self.subTest(csv=bad[:40]):
                response = self.post(path, {"csv_content": bad})
                self.assert_problem(response, 422)
                current = self.client.get(f"/api/v1/snapshots/{snapshot_id}", headers=ANALYST)
                self.assertEqual(len(current.json()["snapshot"]["holders"]), len(self.snapshot["holders"]))
        # Non-UTF-8 bytes payload
        raw_bad = b'{"csv_content":"holder_ref\xff"}'
        res_utf8 = self.client.post("/api/v1/" + path, content=raw_bad, headers={"Content-Type": "application/json", **ANALYST})
        self.assert_problem(res_utf8, 400)
        mismatch = content.replace("evidence_ref", "evidence_ref,as_of_date", 1)
        mismatch = "\n".join([mismatch.splitlines()[0]] + [line + ",2020-01-01" for line in mismatch.splitlines()[1:]])
        self.assert_problem(self.post(path, {"csv_content": mismatch}), 422)
        self.assertEqual(self.post(f"snapshots/{snapshot_id}:validate").status_code, 200)

    def test_unbalanced_draft_validation_lock_and_immutable_snapshot(self):
        bad = copy.deepcopy(self.snapshot)
        bad["holders"][0]["shares"] -= 1
        snapshot_id, _ = self.draft(bad)
        self.assert_problem(self.post(f"snapshots/{snapshot_id}:validate"), 422)
        self.assert_problem(self.post(f"snapshots/{snapshot_id}:lock", headers=REVIEWER), 422)
        self.assert_problem(self.post(f"snapshots/{snapshot_id}/scenarios", self.action()), 409)
        snapshot_id, _ = self.locked()
        baseline = self.client.get(f"/api/v1/snapshots/{snapshot_id}", headers=ANALYST).json()
        self.assert_problem(self.post(f"snapshots/{snapshot_id}/holdings:import", {"csv_content": csv_for(self.snapshot)}), 409)
        self.assert_problem(self.post(f"snapshots/{snapshot_id}:lock", headers=REVIEWER), 409)
        with self.assertRaises(DBAPIError), self.app.state.db.begin() as connection:
            connection.execute(text("UPDATE snapshots SET payload='{}' WHERE id=:id"), {"id": snapshot_id})
        after = self.client.get(f"/api/v1/snapshots/{snapshot_id}", headers=ANALYST).json()
        self.assertEqual(baseline, after)
        assessment = self.post(f"snapshots/{snapshot_id}/assessments")
        self.assertEqual(assessment.status_code, 201, assessment.text)
        self.assertEqual(assessment.json()["assessment_status"], "SIMULATION_ONLY")

    def test_scenarios_reports_replay_rollback_comparison_and_reopen(self):
        snapshot_id, company_id = self.locked()
        path = f"snapshots/{snapshot_id}/scenarios"
        baseline = self.client.get(f"/api/v1/snapshots/{snapshot_id}", headers=ANALYST).json()
        headers = {**ANALYST, "Idempotency-Key": "scenario-1"}
        bad = {"action_type": "TRANSFER", "seller_ref": "DEMO-ABSENT", "allocations": self.action()["allocations"]}
        before = self.count("audit_events")
        self.assert_problem(self.post(path, bad, headers), 422)
        self.assertEqual(self.count("scenarios"), 0)
        self.assertEqual(self.count("idempotency_records"), 0)
        self.assertEqual(self.count("audit_events"), before)
        first = self.post(path, self.action(), headers)
        self.assertEqual(first.status_code, 201, first.text)
        self.assertEqual(first.json(), self.post(path, self.action(), headers).json())
        changed = self.action()
        changed["allocations"][0]["shares"] += 1
        self.assert_problem(self.post(path, changed, headers), 409)
        second = self.post(path, changed)
        self.assertEqual(second.status_code, 201, second.text)
        ids = [first.json()["id"], second.json()["id"]]
        compared = self.post("scenario-comparisons", {"scenario_ids": ids})
        self.assertEqual(compared.status_code, 200, compared.text)
        self.assertEqual([s["scenario_id"] for s in compared.json()["scenarios"]], ids)
        report_headers = {**ANALYST, "Idempotency-Key": "report-1"}
        report = self.post("reports", {"scenario_ids": ids}, report_headers)
        self.assertEqual(report.status_code, 201, report.text)
        self.assertEqual(report.json(), self.post("reports", {"scenario_ids": ids}, report_headers).json())
        self.assert_problem(self.post("reports", {"scenario_ids": ids[:1]}, report_headers), 409)
        self.assertEqual(baseline, self.client.get(f"/api/v1/snapshots/{snapshot_id}", headers=ANALYST).json())
        for table in ("scenarios", "reports", "audit_events", "assessments"):
            if self.count(table):
                with self.assertRaises(DBAPIError), self.app.state.db.begin() as connection:
                    connection.execute(text(f"DELETE FROM {table}"))
        other = self.make_app()
        with TestClient(other) as reopened:
            self.assertEqual(reopened.get(f"/api/v1/companies/{company_id}", headers=ANALYST).status_code, 200)
            result = reopened.get(f"/api/v1/scenarios/{ids[0]}/result", headers=ANALYST)
            self.assertEqual(result.json()["result_hash"], first.json()["result_hash"])
            self.assertEqual(reopened.get(f"/api/v1/reports/{report.json()['id']}", headers=ANALYST).json()["markdown_content"], report.json()["markdown_content"])
            with other.state.db.connect() as connection:
                self.assertEqual(connection.execute(text("SELECT version FROM schema_versions ORDER BY version")).scalars().all(), [1, 2, 3])

    def test_cors_and_problem_consistency(self):
        response = self.client.get("/health", headers={"Origin": "http://localhost:3000"})
        self.assertEqual(response.headers["access-control-allow-origin"], "http://localhost:3000")
        response = self.client.get("/health", headers={"Origin": "https://untrusted.invalid"})
        self.assertNotIn("access-control-allow-origin", response.headers)
        self.assert_problem(self.client.get("/not-a-route"), 404)
        response = self.client.post("/api/v1/demo/simulations", content=b'{"bad":"\xff"}', headers={"Content-Type": "application/json"})
        self.assert_problem(response, 400)
        with self.assertRaises(ValueError):
            create_app(database_url=self.url, allowed_origins=["https://example.com/path"])


if __name__ == "__main__":
    unittest.main()
