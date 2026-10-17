"""Independent synthetic expectations: CALC-001..016, DATA/RULE and PROP-001..012."""
import copy
import csv
from dataclasses import FrozenInstanceError
from decimal import Decimal, localcontext
import json
from pathlib import Path
import random
import unittest
from uuid import UUID

from packages.engine import (
    ENGINE_VERSION, EngineError, Holder, Snapshot, apply_issuance, apply_transfer,
    assess_numeric_target, simulate, snapshot_from_dict, snapshot_hash,
    snapshot_to_dict, validate_snapshot,
)

ROOT = Path(__file__).resolve().parents[1]
MAX_SAFE = 9007199254740991


def holder(ref, shares, eligibility="ELIGIBLE", holder_type="ORGANIZATION", **facts):
    return dict(holder_ref=ref, shares=shares, eligibility=eligibility,
                holder_type=holder_type, evidence_ref="fixture://tests/" + ref, **facts)


def ledger(eligible=100000000, total=1000000000, sid=350):
    return dict(id="DEMO-TEST", as_of_date="2026-10-17", total_shares=total,
                board="DEMO_STANDARD", sid_count=sid, holders=[
                    holder("SELLER", total - eligible, "INELIGIBLE"),
                    holder("ELIGIBLE-BUCKET", eligible, holder_type="AGGREGATE"),
                ])


def allocation(ref, shares, eligibility="ELIGIBLE", **facts):
    return dict(holder_ref=ref, shares=shares, eligibility=eligibility,
                evidence_ref="fixture://tests/" + ref, **facts)


class EngineTests(unittest.TestCase):
    def setUp(self):
        self.base = snapshot_from_dict(ledger())

    def reject(self, code, function, *args):
        with self.assertRaises(EngineError) as error:
            function(*args)
        self.assertEqual(error.exception.code, code)
        self.assertTrue(error.exception.detail)
        self.assertIsInstance(error.exception, ValueError)

    def test_CALC_001_baseline(self):
        result = assess_numeric_target(self.base)
        self.assertEqual(result["eligible_shares"], 100000000)
        self.assertEqual(result["free_float_ratio"], "0.1")
        self.assertEqual(result["numeric_target_status"], "BELOW_TARGET")
        self.assertEqual(result["assessment_status"], "SIMULATION_ONLY")

    def test_CALC_002_transfer_to_two_verified_recipients(self):
        post = apply_transfer(self.base, "SELLER", [allocation("A", 25000000), allocation("B", 25000000)])
        result = assess_numeric_target(post)
        self.assertEqual(post.total_shares, 1000000000)
        self.assertEqual(result["eligible_shares"], 150000000)
        self.assertEqual(result["free_float_ratio"], "0.15")
        self.assertEqual(result["numeric_target_status"], "PASS_NUMERIC")

    def test_CALC_003_minimum_issuance(self):
        post = apply_issuance(self.base, [allocation("A", 30000000), allocation("B", 28823530)])
        result = assess_numeric_target(post)
        self.assertEqual(post.total_shares, 1058823530)
        self.assertEqual(result["eligible_shares"], 158823530)
        self.assertEqual(result["numeric_target_status"], "PASS_NUMERIC")
        self.assertGreaterEqual(100 * 158823530, 15 * 1058823530)

    def test_CALC_004_one_share_below_minimum(self):
        post = apply_issuance(self.base, [allocation("A", 30000000), allocation("B", 28823529)])
        result = assess_numeric_target(post)
        self.assertEqual(result["eligible_shares"], 158823529)
        self.assertEqual(post.total_shares, 1058823529)
        self.assertEqual(result["numeric_target_status"], "BELOW_TARGET")

    def test_CALC_005_eligible_to_eligible(self):
        data = ledger(eligible=60000000)
        data["holders"].extend([holder("A", 30000000), holder("B", 10000000)])
        data["holders"][0]["shares"] -= 40000000
        post = apply_transfer(snapshot_from_dict(data), "A", [{"holder_ref": "B", "shares": 20000000}])
        self.assertEqual(assess_numeric_target(post)["eligible_shares"], 100000000)
        self.assertEqual(assess_numeric_target(post)["free_float_ratio"], "0.1")

    def test_CALC_006_ineligible_recipient(self):
        post = apply_transfer(self.base, "SELLER", [allocation("A", 10000000, "INELIGIBLE")])
        self.assertEqual(assess_numeric_target(post)["eligible_shares"], 100000000)
        post = apply_transfer(self.base, "ELIGIBLE-BUCKET", [allocation("A", 10000000, "INELIGIBLE")])
        self.assertEqual(assess_numeric_target(post)["eligible_shares"], 90000000)

    def test_CALC_007_ineligible_issuance_and_dilution(self):
        result = simulate(self.base, dict(action_type="NEW_ISSUANCE", allocations=[allocation("A", 50000000, "INELIGIBLE")]))
        self.assertEqual(result["snapshot"]["total_shares"], 1050000000)
        self.assertEqual(result["assessment"]["eligible_shares"], 100000000)
        self.assertEqual(result["assessment"]["free_float_ratio"], "0.095238095238095238")
        dilution = {row["holder_ref"]: row for row in result["dilution_by_holder"]}
        self.assertEqual(dilution["SELLER"]["old_ratio"], "0.9")
        self.assertEqual(dilution["SELLER"]["new_ratio"], "0.857142857142857143")
        self.assertEqual(dilution["SELLER"]["percentage_point_change"], "-4.285714285714285714")
        self.assertIsNone(result["cash_estimate_idr"])

    def test_CALC_008_insufficient_balance_atomic(self):
        before = snapshot_hash(self.base)
        self.reject("INSUFFICIENT_SELLER_BALANCE", apply_transfer, self.base, "SELLER", [allocation("A", 1000000001)])
        self.assertEqual(snapshot_hash(self.base), before)
        self.assertEqual(self.base.holders, snapshot_from_dict(ledger()).holders)

    def test_CALC_009_invalid_shares(self):
        for shares in (-1, 1.5, Decimal("1"), "1", True, None, MAX_SAFE + 1):
            with self.subTest(shares=shares):
                with self.assertRaises(EngineError):
                    apply_transfer(self.base, "SELLER", [allocation("A", shares)])
        self.reject("INVALID_SHARE_COUNT", apply_transfer, self.base, "SELLER", [allocation("A", 0)])

    def test_CALC_010_zero_issuance_is_baseline(self):
        for allocations in ([], [allocation("A", 0)], [{"holder_ref": "SELLER", "shares": 0}]):
            post = apply_issuance(self.base, allocations)
            self.assertEqual(snapshot_to_dict(post), snapshot_to_dict(self.base))
            self.assertEqual(snapshot_hash(post), snapshot_hash(self.base))

    def test_CALC_011_unknown_recipient(self):
        post = apply_transfer(self.base, "SELLER", [allocation("A", 25000000, "UNKNOWN")])
        result = assess_numeric_target(post)
        self.assertIsNone(result["eligible_shares"])
        self.assertIsNone(result["free_float_ratio"])
        self.assertEqual(result["eligible_lower_bound"], 100000000)
        self.assertEqual(result["eligible_upper_bound"], 125000000)
        self.assertEqual(result["numeric_target_status"], "UNKNOWN")
        self.assertEqual(result["assessment_status"], "REQUIRES_VERIFICATION")

    def test_CALC_012_exact_target(self):
        result = assess_numeric_target(snapshot_from_dict(ledger(150000000)))
        self.assertEqual(result["free_float_ratio"], "0.15")
        self.assertEqual(result["numeric_target_status"], "PASS_NUMERIC")

    def test_CALC_013_no_rounding_false_pass(self):
        result = assess_numeric_target(snapshot_from_dict(ledger(149999999)))
        self.assertEqual(result["free_float_ratio"], "0.149999999")
        self.assertEqual(result["numeric_target_status"], "BELOW_TARGET")

    def test_CALC_014_hash_determinism_and_permutation(self):
        action = dict(action_type="TRANSFER", seller_ref="SELLER", allocations=[allocation("B", 25000000), allocation("A", 25000000)])
        first = simulate(self.base, action)
        self.assertEqual(first, simulate(self.base, action))
        shuffled = snapshot_to_dict(self.base)
        shuffled["holders"].reverse()
        action["allocations"].reverse()
        second = simulate(snapshot_from_dict(shuffled), action)
        self.assertEqual(first, second)
        self.assertEqual(first["engine_version"], ENGINE_VERSION)
        self.assertRegex(first["result_hash"], r"^sha256:[0-9a-f]{64}$")

    def test_CALC_015_multi_recipient_debit_once(self):
        post = apply_transfer(self.base, "SELLER", [allocation("A", 25000000), allocation("B", 25000000)])
        self.assertEqual(sum(row.shares for row in post.holders), 1000000000)
        self.assertEqual(next(row.shares for row in post.holders if row.holder_ref == "SELLER"), 850000000)

    def test_CALC_016_unknown_sid(self):
        result = assess_numeric_target(snapshot_from_dict(ledger(60000000, 400000000, None)))
        self.assertEqual(result["numeric_target_status"], "PASS_NUMERIC")
        self.assertEqual(result["assessment_status"], "REQUIRES_VERIFICATION")
        self.assertIn("SID_UNVERIFIED", result["warnings"])

    def test_DATA_001_reconciliation(self):
        data = ledger()
        data["holders"][0]["shares"] -= 1000000
        self.reject("DATA_RECONCILIATION_FAILED", snapshot_from_dict, data)

    def test_DATA_002_source_dates(self):
        for at_holder in (False, True):
            data = ledger()
            target = data["holders"][0] if at_holder else data
            target["source_as_of_date"] = "2026-10-16"
            self.reject("DATE_MISMATCH", snapshot_from_dict, data)
            target["source_as_of_date"] = "2026-10-17"
            post = snapshot_from_dict(data)
            self.assertEqual(snapshot_to_dict(post)["holders"][0 if at_holder else 1].get("source_as_of_date"), None)
            self.assertNotEqual(snapshot_hash(post), snapshot_hash(self.base))

    def test_RULE_001_draft_never_legal_verdict(self):
        result = assess_numeric_target(snapshot_from_dict(ledger(170000000)))
        self.assertEqual(result["rule_set_id"], "DEMO_NUMERIC_15")
        self.assertEqual(result["rule_version"], "demo-2026-15pct-v1")
        self.assertEqual(result["rule_status"], "DRAFT")
        self.assertEqual(result["target_ratio"], "0.15")
        self.assertIn("RULE_UNVERIFIED", result["warnings"])
        self.assertEqual(result["assessment_status"], "SIMULATION_ONLY")
        self.assertNotIn("COMPLIANT", json.dumps(result))

    def test_RULE_002_unsupported_board(self):
        data = ledger(150000000)
        data["board"] = "DEMO_UNSUPPORTED"
        result = assess_numeric_target(snapshot_from_dict(data))
        self.assertEqual(result["assessment_status"], "UNSUPPORTED_RULE")
        self.assertIn("UNSUPPORTED_BOARD", result["warnings"])

    def test_threshold_below_exact_and_above(self):
        for shares in (49999999, 50000000, 50000001):
            for kind in ("PERSON", "ORGANIZATION"):
                with self.subTest(shares=shares, holder_type=kind):
                    post = apply_transfer(self.base, "SELLER", [allocation("A", shares, holder_type=kind)])
                    result = assess_numeric_target(post)
                    if shares < 50000000:
                        self.assertEqual(result["eligible_shares"], 149999999)
                    else:
                        self.assertIsNone(result["eligible_shares"])
                        self.assertEqual(result["eligible_lower_bound"], 100000000)
                        self.assertEqual(result["eligible_upper_bound"], 100000000 + shares)
                        self.assertEqual(result["assessment_status"], "REQUIRES_VERIFICATION")
                        self.assertIn("CANDIDATE_5_PERCENT_UNVERIFIED:A", result["warnings"])

    def test_existing_recipient_threshold_and_full_ledger_reevaluation(self):
        data = ledger()
        data["holders"].append(holder("A", 49000000))
        data["holders"][0]["shares"] -= 49000000
        pre = snapshot_from_dict(data)
        post = apply_transfer(pre, "SELLER", [{"holder_ref": "A", "shares": 1000000}])
        self.assertIsNone(assess_numeric_target(post)["eligible_shares"])
        # An unrelated issuance lowers A below 5%; preserve facts, reevaluate all rows.
        post = apply_issuance(post, [allocation("INELIGIBLE-NEW", 100000000, "INELIGIBLE")])
        self.assertEqual(assess_numeric_target(post)["eligible_shares"], 150000000)
        self.assertEqual(assess_numeric_target(pre)["eligible_shares"], 149000000)

    def test_unknown_flags_and_conflicting_exclusions(self):
        for flag in ("controller", "controller_affiliate", "director_commissioner", "treasury", "restricted"):
            data = ledger()
            data["holders"].append(holder("A", 1, **{flag: "UNKNOWN"}))
            data["holders"][0]["shares"] -= 1
            result = assess_numeric_target(snapshot_from_dict(data))
            self.assertIsNone(result["eligible_shares"])
            data["holders"][-1][flag] = "TRUE"
            self.reject("ELIGIBILITY_CONFLICT", snapshot_from_dict, data)
        data = ledger()
        data["holders"].append(holder("ZERO-UNKNOWN", 0, "UNKNOWN"))
        self.assertEqual(assess_numeric_target(snapshot_from_dict(data))["eligible_shares"], 100000000)

    def test_no_overwriting_existing_facts(self):
        for facts in ({"eligibility": "ELIGIBLE"}, {"holder_type": "PERSON"},
                      {"evidence_ref": "fixture://different"}, {"controller": "TRUE"},
                      {"flags": {"restricted": "UNKNOWN"}}):
            with self.subTest(facts=facts):
                self.reject("VERIFIED_FACT_CONFLICT", apply_issuance, self.base,
                            [dict(holder_ref="SELLER", shares=1, **facts)])
        post = apply_issuance(self.base, [dict(holder_ref="SELLER", shares=1, eligibility="INELIGIBLE")])
        self.assertEqual(assess_numeric_target(post)["eligible_shares"], 100000000)

    def test_aggregate_fixture_cannot_receive_or_be_created(self):
        self.reject("AGGREGATE_ALLOCATION_UNSUPPORTED", apply_transfer, self.base, "SELLER",
                    [dict(holder_ref="ELIGIBLE-BUCKET", shares=1)])
        self.reject("AGGREGATE_ALLOCATION_UNSUPPORTED", apply_issuance, self.base,
                    [allocation("NEW-BUCKET", 1, holder_type="AGGREGATE")])
        data = ledger()
        data["holders"][1]["evidence_ref"] = "document:unverified"
        self.reject("DOCUMENT_SOURCE_MISSING", snapshot_from_dict, data)

    def test_new_holders_require_explicit_eligibility_and_evidence(self):
        for entry in ({"holder_ref": "A", "shares": 1},
                      {"holder_ref": "A", "shares": 1, "eligibility": "ELIGIBLE"},
                      {"holder_ref": "A", "shares": 1, "eligibility": "UNKNOWN", "evidence_ref": ""}):
            with self.assertRaises(EngineError):
                apply_issuance(self.base, [entry])
        data = ledger()
        del data["holders"][0]["evidence_ref"]
        self.reject("DOCUMENT_SOURCE_MISSING", snapshot_from_dict, data)

    def test_unknown_fields_and_bad_types_at_every_boundary(self):
        for target in ("snapshot", "holder"):
            data = ledger()
            (data if target == "snapshot" else data["holders"][0])["free_float_ratio"] = "0.99"
            self.reject("INVALID_INPUT", snapshot_from_dict, data)
        for value in (True, "1000000000", 1000000000.0, MAX_SAFE + 1, 0, -1):
            data = ledger()
            data["total_shares"] = value
            with self.assertRaises(EngineError):
                snapshot_from_dict(data)
        for value in (True, -1, 3.0, "350"):
            data = ledger()
            data["sid_count"] = value
            self.reject("INVALID_INPUT", snapshot_from_dict, data)
        data = ledger()
        data["sid_count"] = MAX_SAFE + 1
        self.reject("ARITHMETIC_OVERFLOW", snapshot_from_dict, data)
        for value in (True, "false", 0, None):
            data = ledger()
            data["holders"][0]["controller"] = value
            self.reject("INVALID_INPUT", snapshot_from_dict, data)
        for data in (None, [], {"id": "x"}):
            self.reject("INVALID_INPUT", snapshot_from_dict, data)
        for action in ({"action_type": "DELETE", "allocations": []},
                       {"action_type": "NEW_ISSUANCE", "allocations": [], "free_float_ratio": "1"},
                       {"action_type": "NEW_ISSUANCE", "allocations": [], "seller_ref": "SELLER"},
                       {"action_type": "TRANSFER", "allocations": []}):
            self.reject("INVALID_INPUT", simulate, self.base, action)
        self.reject("INVALID_INPUT", apply_issuance, self.base, [dict(holder_ref="SELLER", shares=1, flags={"magic": "FALSE"})])
        self.reject("INVALID_INPUT", apply_issuance, self.base, [dict(holder_ref="SELLER", shares=1, controller="FALSE", flags={"controller": "FALSE"})])

    def test_duplicate_self_and_unknown_seller(self):
        entries = [allocation("A", 1), allocation("A", 2)]
        self.reject("DUPLICATE_ALLOCATION", apply_transfer, self.base, "SELLER", entries)
        self.reject("DUPLICATE_ALLOCATION", apply_issuance, self.base, entries)
        self.reject("SELF_TRANSFER", apply_transfer, self.base, "SELLER", [{"holder_ref": "SELLER", "shares": 1}])
        self.reject("UNKNOWN_SELLER", apply_transfer, self.base, "MISSING", [allocation("A", 1)])
        self.reject("INVALID_INPUT", apply_transfer, self.base, "SELLER", [])
        data = ledger()
        data["holders"].append(copy.deepcopy(data["holders"][1]))
        self.reject("DUPLICATE_HOLDER", snapshot_from_dict, data)

    def test_immutable_dataclasses_and_round_trip(self):
        with self.assertRaises(FrozenInstanceError):
            self.base.total_shares = 1
        with self.assertRaises(FrozenInstanceError):
            self.base.holders[0].shares = 1
        with self.assertRaises(EngineError):
            Holder("X", True, "UNKNOWN", "PERSON")
        with self.assertRaises(EngineError):
            Snapshot("X", "2026-10-17", 1, "DEMO_STANDARD", None, [])
        validate_snapshot(self.base)
        exported = snapshot_to_dict(self.base)
        self.assertEqual(snapshot_from_dict(exported), self.base)
        exported["holders"][0]["shares"] = 0
        self.assertEqual(snapshot_hash(self.base), snapshot_hash(snapshot_from_dict(ledger())))
        self.reject("INVALID_INPUT", validate_snapshot, {})

    def test_limits_and_safe_sum_overflow(self):
        data = ledger(0, MAX_SAFE)
        base = snapshot_from_dict(data)
        self.reject("ARITHMETIC_OVERFLOW", apply_issuance, base, [allocation("A", 1)])
        post = apply_transfer(base, "SELLER", [allocation("A", MAX_SAFE)])
        self.assertEqual(post.total_shares, MAX_SAFE)
        data["holders"].append(holder("TOO-MUCH", 1))
        self.reject("ARITHMETIC_OVERFLOW", snapshot_from_dict, data)
        data = ledger(0, 1)
        data["holders"] = [holder("H" + str(i), int(i == 0), "INELIGIBLE") for i in range(10000)]
        base = snapshot_from_dict(data)
        self.reject("HOLDER_LIMIT_EXCEEDED", apply_issuance, base, [allocation("NEW", 1)])
        data["holders"].append(holder("OVER", 0, "UNKNOWN"))
        self.reject("HOLDER_LIMIT_EXCEEDED", snapshot_from_dict, data)

    def test_price_cash_and_context_independence(self):
        action = dict(action_type="NEW_ISSUANCE", allocations=[allocation("A", 30000000), allocation("B", 28823530)], price_idr_per_share="250.25")
        result = simulate(self.base, action)
        self.assertEqual(result["cash_estimate_idr"], "14720588382.50")
        self.assertEqual(result["action"]["price_idr_per_share"], "250.25")
        for price in (250, 250.0, Decimal("250"), "NaN", "Infinity", "-0.01", "1.001", "1e2", "+1", " 1", "01", "9007199254740992", "1e999999"):
            with self.subTest(price=price):
                action["price_idr_per_share"] = price
                self.reject("INVALID_PRICE", simulate, self.base, action)
        action["price_idr_per_share"] = "250.25"
        with localcontext() as context:
            context.prec = 3
            self.assertEqual(simulate(self.base, action), result)
        action["price_idr_per_share"] = "0"
        self.assertEqual(simulate(self.base, action)["cash_estimate_idr"], "0.00")
        action["price_idr_per_share"] = str(MAX_SAFE)
        self.assertEqual(simulate(self.base, action)["cash_estimate_idr"], "529835255577234326318230.00")

    def test_dates_and_hash_provenance(self):
        for value in ("2026-02-30", "20261017", "2026-1-01", True):
            data = ledger()
            data["as_of_date"] = value
            self.reject("INVALID_INPUT", snapshot_from_dict, data)
        for field, value in (("as_of_date", "2026-10-16"), ("board", "OTHER"), ("sid_count", None), ("id", "OTHER")):
            data = ledger()
            data[field] = value
            self.assertNotEqual(snapshot_hash(snapshot_from_dict(data)), snapshot_hash(self.base))
        data = ledger()
        data["holders"][0]["evidence_ref"] = "fixture://new"
        self.assertNotEqual(snapshot_hash(snapshot_from_dict(data)), snapshot_hash(self.base))

    def test_synthetic_catalog_and_csv(self):
        catalog = json.loads((ROOT / "datasets/synthetic/companies.json").read_text(encoding="utf-8"))
        self.assertEqual(len(catalog), 5)
        self.assertEqual(len({company["id"] for company in catalog}), 5)
        for index, company in enumerate(catalog, 1):
            UUID(company["id"])
            self.assertEqual(company["code"], "DEMO-" + str(index).zfill(3))
            self.assertTrue(company["demo"])
            self.assertTrue(company["legal_name"].startswith("DEMO "))
            self.assertEqual(company["board"], "DEMO_STANDARD")
            validate_snapshot(snapshot_from_dict(company["snapshot"]))
        expected = [(1000000000, 100000000, "BELOW_TARGET"), (1000000000, 170000000, "PASS_NUMERIC"),
                    (1000000000, None, "UNKNOWN"), (1000000000, 140000000, "BELOW_TARGET"),
                    (400000000, 60000000, "PASS_NUMERIC")]
        for company, (total, eligible, status) in zip(catalog, expected):
            result = assess_numeric_target(snapshot_from_dict(company["snapshot"]))
            self.assertEqual((result["total_shares"], result["eligible_shares"], result["numeric_target_status"]), (total, eligible, status))
        third = assess_numeric_target(snapshot_from_dict(catalog[2]["snapshot"]))
        self.assertEqual((third["eligible_lower_bound"], third["eligible_upper_bound"]), (120000000, 140000000))
        first = {row["holder_ref"]: row for row in catalog[0]["snapshot"]["holders"]}
        self.assertEqual({key: row["shares"] for key, row in first.items()}, {"CTRL-1": 850000000, "ELIGIBLE-BUCKET": 100000000, "TRANSFER-SELLER": 50000000})
        with (ROOT / "datasets/synthetic/shareholdings.csv").open(encoding="utf-8", newline="") as source:
            reader = csv.DictReader(source)
            self.assertEqual(reader.fieldnames, "holder_ref,holder_type,share_count,controller,controller_affiliate,director_commissioner,treasury,restricted,eligibility_state,evidence_ref".split(","))
            rows = list(reader)
        self.assertEqual(len(rows), 3)
        for row in rows:
            source = first[row["holder_ref"]]
            self.assertEqual(int(row["share_count"]), source["shares"])
            self.assertEqual(row["eligibility_state"], source["eligibility"])
            self.assertEqual(row["evidence_ref"], source["evidence_ref"])
            for flag in ("controller", "controller_affiliate", "director_commissioner", "treasury", "restricted"):
                self.assertEqual(row[flag], source.get(flag, "FALSE"))

    def test_generated_invariants_PROP_001_through_012(self):
        rng = random.Random(20261017)
        for trial in range(120):
            total = rng.randint(1000, 10**12)
            count = rng.randint(2, 30)
            cuts = sorted(rng.randrange(total + 1) for _ in range(count - 1))
            amounts = [b - a for a, b in zip([0] + cuts, cuts + [total])]
            rows = [holder("H" + str(i), shares, rng.choice(("ELIGIBLE", "INELIGIBLE", "UNKNOWN"))) for i, shares in enumerate(amounts)]
            data = dict(id="DEMO-GENERATED", as_of_date="2026-10-17", total_shares=total,
                        board="DEMO_STANDARD", sid_count=350, holders=rows)
            pre = snapshot_from_dict(data)
            before = snapshot_hash(pre)
            seller = next(row for row in pre.holders if row.shares > 0)
            amount = rng.randint(1, seller.shares)
            action = dict(action_type="TRANSFER", seller_ref=seller.holder_ref, allocations=[allocation("NEW", amount)])
            result = simulate(pre, action)
            post = snapshot_from_dict(result["snapshot"])
            self.assertEqual(post.total_shares, total)
            self.assertEqual(sum(row.shares for row in post.holders), total)
            self.assertTrue(all(type(row.shares) is int and row.shares >= 0 for row in post.holders))
            self.assertEqual(simulate(pre, action), result)
            self.assertEqual(snapshot_hash(pre), before)
            issued = rng.randint(0, 1000000)
            post = apply_issuance(pre, [allocation("NEW", issued, "INELIGIBLE")])
            self.assertEqual(post.total_shares, total + issued)
            self.assertEqual(sum(row.shares for row in post.holders), total + issued)
            assessment = assess_numeric_target(post)
            lower, upper = assessment["eligible_lower_bound"], assessment["eligible_upper_bound"]
            self.assertTrue(0 <= lower <= upper <= post.total_shares)
            self.assertNotEqual(assessment["assessment_status"], "COMPLIANT")
            if assessment["eligible_shares"] is not None:
                self.assertEqual(assessment["numeric_target_status"] == "PASS_NUMERIC", 100 * lower >= 15 * post.total_shares)
                self.assertTrue(Decimal("0") <= Decimal(assessment["free_float_ratio"]) <= Decimal("1"))
            else:
                self.assertEqual(assessment["numeric_target_status"], "UNKNOWN")
                self.assertEqual(assessment["assessment_status"], "REQUIRES_VERIFICATION")
            rng.shuffle(data["holders"])
            self.assertEqual(snapshot_hash(snapshot_from_dict(data)), before)
            self.reject("INSUFFICIENT_SELLER_BALANCE", apply_transfer, pre, seller.holder_ref, [allocation("NEW", seller.shares + 1)])
        # Generated exact-target cases, including values near the JS-safe ceiling.
        for total in [rng.randint(1, 10**12) for _ in range(60)] + [MAX_SAFE]:
            minimum = (15 * total + 99) // 100
            for eligible, expected in ((minimum - 1, "BELOW_TARGET"), (minimum, "PASS_NUMERIC")):
                result = assess_numeric_target(snapshot_from_dict(ledger(eligible, total)))
                self.assertEqual(result["numeric_target_status"], expected)
        for _ in range(60):
            total = rng.randint(10000, 10**12)
            amount = rng.randint(1, max(1, total // 100))
            data = ledger(0, total)
            data["holders"].extend([holder("A", amount), holder("B", amount)])
            data["holders"][0]["shares"] -= 2 * amount
            pre = snapshot_from_dict(data)
            post = apply_transfer(pre, "A", [{"holder_ref": "B", "shares": amount}])
            self.assertEqual(assess_numeric_target(post)["eligible_shares"], 2 * amount)


if __name__ == "__main__":
    unittest.main()
