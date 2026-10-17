"""Synthetic-only deterministic arithmetic. See README.md for input and rule assumptions."""
from dataclasses import asdict, dataclass, replace
from datetime import date
from decimal import Context, Decimal, ROUND_HALF_UP, localcontext
import hashlib
import json
import re
from typing import Optional

ENGINE_VERSION = "0.1.0"
MAX_SAFE_INTEGER = 9007199254740991
MAX_HOLDERS = 10000
FLAGS = ("controller", "controller_affiliate", "director_commissioner", "treasury", "restricted")
_ELIGIBILITY = ("ELIGIBLE", "INELIGIBLE", "UNKNOWN")
_HOLDER_TYPES = ("ORGANIZATION", "PERSON", "AGGREGATE")
_FLAG_VALUES = ("TRUE", "FALSE", "UNKNOWN")
_HOLDER_REQUIRED = {"holder_ref", "shares", "eligibility", "holder_type"}
_HOLDER_KEYS = _HOLDER_REQUIRED | set(FLAGS) | {"evidence_ref", "source_as_of_date"}
_SNAPSHOT_KEYS = {"id", "as_of_date", "total_shares", "board", "sid_count", "holders"}
_ALLOCATION_KEYS = {"holder_ref", "shares", "eligibility", "holder_type", "evidence_ref", "flags"} | set(FLAGS)
_RULE_ASSUMPTIONS = {
    "rule_set_id": "DEMO_NUMERIC_15",
    "rule_version": "demo-2026-15pct-v1",
    "rule_status": "DRAFT",
    "target_ratio": "0.15",
    "supported_board": "DEMO_STANDARD",
    "candidate_ownership_ratio": "0.05",
    "candidate_ownership_status": "UNVERIFIED_UNKNOWN_NOT_LEGAL_EXCLUSION",
    "aggregate_policy": "FIXTURE_ONLY_NO_RECIPIENT_ALLOCATIONS",
    "eligibility_policy": "ASSERTED_FACTS_WITH_EFFECTIVE_UNKNOWN_ON_UNKNOWN_FLAGS",
    "source_date_policy": "OPTIONAL_SOURCE_DATE_MUST_EQUAL_SNAPSHOT_DATE",
    "other_legal_criteria": "DISABLED_PENDING_REVIEW",
    "display": "18_FRACTIONAL_DIGITS_HALF_UP_NOT_DECISION_AUTHORITY",
    "maximum_price_idr_per_share": str(MAX_SAFE_INTEGER),
}
_DECIMAL_CONTEXT = Context(prec=100, rounding=ROUND_HALF_UP)
_DISPLAY_UNIT = Decimal("0.000000000000000001")
_PRICE_PATTERN = re.compile(r"(?:0|[1-9][0-9]{0,15})(?:\.[0-9]{1,2})?", re.ASCII)
_DATE_PATTERN = re.compile(r"[0-9]{4}-[0-9]{2}-[0-9]{2}", re.ASCII)


class EngineError(ValueError):
    def __init__(self, code: str, detail: str):
        self.code = code
        self.detail = detail
        super().__init__(detail)


def _fail(code, detail):
    raise EngineError(code, detail)


def _keys(value, allowed, required, path):
    if type(value) is not dict:
        _fail("INVALID_INPUT", path + " must be an object.")
    if any(type(key) is not str for key in value) or set(value) - allowed:
        _fail("INVALID_INPUT", path + " contains unknown fields.")
    if required - set(value):
        _fail("INVALID_INPUT", path + " is missing required fields.")


def _text(value, path, maximum=200):
    if (type(value) is not str or not value or len(value) > maximum
            or value != value.strip() or any(ord(char) < 32 or ord(char) == 127 for char in value)):
        _fail("INVALID_INPUT", path + " must be a nonempty, bounded string without surrounding whitespace or controls.")


def _integer(value, path, positive=False, type_code="NON_INTEGER_SHARES", negative_code="INVALID_SHARE_COUNT"):
    if type(value) is not int:
        _fail(type_code, path + " must be an integer; booleans are not integers here.")
    if value < 0 or (positive and value == 0):
        _fail(negative_code, path + " is outside its nonnegative/positive share-count range.")
    if value > MAX_SAFE_INTEGER:
        _fail("ARITHMETIC_OVERFLOW", path + " exceeds the JavaScript-safe integer ceiling.")


def _sum_safe(values):
    total = sum(values)
    if total > MAX_SAFE_INTEGER:
        _fail("ARITHMETIC_OVERFLOW", "The sum of share counts exceeds the JavaScript-safe integer ceiling.")
    return total


def _iso_date(value, path):
    if type(value) is not str or not _DATE_PATTERN.fullmatch(value):
        _fail("INVALID_INPUT", path + " must be a YYYY-MM-DD date.")
    try:
        date.fromisoformat(value)
    except ValueError:
        _fail("INVALID_INPUT", path + " is not a calendar date.")


def _enum(value, allowed, path):
    if type(value) is not str or value not in allowed:
        _fail("INVALID_INPUT", path + " has an unsupported value.")


@dataclass(frozen=True, slots=True)
class Holder:
    holder_ref: str
    shares: int
    eligibility: str
    holder_type: str = "ORGANIZATION"
    evidence_ref: Optional[str] = None
    controller: str = "FALSE"
    controller_affiliate: str = "FALSE"
    director_commissioner: str = "FALSE"
    treasury: str = "FALSE"
    restricted: str = "FALSE"
    source_as_of_date: Optional[str] = None

    def __post_init__(self):
        _validate_holder(self)


@dataclass(frozen=True, slots=True)
class Snapshot:
    id: str
    as_of_date: str
    total_shares: int
    board: str
    sid_count: Optional[int]
    holders: tuple[Holder, ...]
    source_as_of_date: Optional[str] = None

    def __post_init__(self):
        validate_snapshot(self)


def _validate_holder(holder):
    if type(holder) is not Holder:
        _fail("INVALID_INPUT", "holders must contain Holder instances.")
    _text(holder.holder_ref, "holder_ref", 64)
    _integer(holder.shares, "shares")
    _enum(holder.eligibility, _ELIGIBILITY, "eligibility")
    _enum(holder.holder_type, _HOLDER_TYPES, "holder_type")
    for flag in FLAGS:
        _enum(getattr(holder, flag), _FLAG_VALUES, flag)
    if holder.evidence_ref is None:
        if holder.eligibility != "UNKNOWN" or holder.holder_type == "AGGREGATE":
            _fail("DOCUMENT_SOURCE_MISSING", "Known eligibility and aggregate fixtures require an evidence reference.")
    else:
        if type(holder.evidence_ref) is not str or not holder.evidence_ref:
            _fail("DOCUMENT_SOURCE_MISSING", "evidence_ref must be a nonempty evidence reference.")
        _text(holder.evidence_ref, "evidence_ref", 512)
    if (holder.holder_type == "AGGREGATE" and
            not holder.evidence_ref.startswith("fixture://")):
        _fail("DOCUMENT_SOURCE_MISSING", "AGGREGATE is permitted only with fixture:// evidence.")
    if holder.eligibility == "ELIGIBLE" and any(getattr(holder, flag) == "TRUE" for flag in FLAGS):
        _fail("ELIGIBILITY_CONFLICT", "An ELIGIBLE assertion conflicts with a TRUE exclusion flag.")
    if holder.source_as_of_date is not None:
        _iso_date(holder.source_as_of_date, "holder.source_as_of_date")


def validate_snapshot(snapshot: Snapshot) -> None:
    if type(snapshot) is not Snapshot:
        _fail("INVALID_INPUT", "snapshot must be a Snapshot instance.")
    _text(snapshot.id, "id")
    _iso_date(snapshot.as_of_date, "as_of_date")
    _integer(snapshot.total_shares, "total_shares", positive=True)
    _text(snapshot.board, "board", 64)
    if snapshot.sid_count is not None:
        _integer(snapshot.sid_count, "sid_count", type_code="INVALID_INPUT", negative_code="INVALID_INPUT")
    if type(snapshot.holders) is not tuple:
        _fail("INVALID_INPUT", "Snapshot.holders must be an immutable tuple.")
    if len(snapshot.holders) > MAX_HOLDERS:
        _fail("HOLDER_LIMIT_EXCEEDED", "A snapshot supports at most 10000 holders.")
    if snapshot.source_as_of_date is not None:
        _iso_date(snapshot.source_as_of_date, "source_as_of_date")
        if snapshot.source_as_of_date != snapshot.as_of_date:
            _fail("DATE_MISMATCH", "Snapshot source date differs from its as_of_date; reconcile sources first.")
    refs = set()
    for holder in snapshot.holders:
        _validate_holder(holder)
        if holder.holder_ref in refs:
            _fail("DUPLICATE_HOLDER", "Holder references must be unique within a snapshot.")
        refs.add(holder.holder_ref)
        if holder.source_as_of_date is not None and holder.source_as_of_date != snapshot.as_of_date:
            _fail("DATE_MISMATCH", "Holder source date differs from the snapshot date; reconcile sources first.")
    if _sum_safe(holder.shares for holder in snapshot.holders) != snapshot.total_shares:
        _fail("DATA_RECONCILIATION_FAILED", "Holder balances must exactly reconcile to total_shares; no implicit bucket is created.")


def snapshot_from_dict(data: dict) -> Snapshot:
    _keys(data, _SNAPSHOT_KEYS | {"source_as_of_date"}, _SNAPSHOT_KEYS, "snapshot")
    if type(data["holders"]) is not list:
        _fail("INVALID_INPUT", "holders must be a list.")
    if len(data["holders"]) > MAX_HOLDERS:
        _fail("HOLDER_LIMIT_EXCEEDED", "A snapshot supports at most 10000 holders.")
    holders = []
    for entry in data["holders"]:
        _keys(entry, _HOLDER_KEYS, _HOLDER_REQUIRED, "holder")
        if "source_as_of_date" in entry:
            _iso_date(entry["source_as_of_date"], "holder.source_as_of_date")
        holders.append(Holder(**entry))
    if "source_as_of_date" in data:
        _iso_date(data["source_as_of_date"], "source_as_of_date")
    return Snapshot(**{**data, "holders": tuple(sorted(holders, key=lambda holder: holder.holder_ref))})


def _holder_dict(holder):
    result = asdict(holder)
    if holder.source_as_of_date is None:
        del result["source_as_of_date"]
    # Missing evidence is meaningful only for an explicitly UNKNOWN assertion.
    if holder.evidence_ref is None:
        del result["evidence_ref"]
    return result


def snapshot_to_dict(snapshot: Snapshot) -> dict:
    validate_snapshot(snapshot)
    result = {
        "id": snapshot.id, "as_of_date": snapshot.as_of_date,
        "total_shares": snapshot.total_shares, "board": snapshot.board,
        "sid_count": snapshot.sid_count,
        "holders": [_holder_dict(holder) for holder in sorted(snapshot.holders, key=lambda holder: holder.holder_ref)],
    }
    if snapshot.source_as_of_date is not None:
        result["source_as_of_date"] = snapshot.source_as_of_date
    return result


def _hash(value):
    canonical = json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=True, allow_nan=False)
    return "sha256:" + hashlib.sha256(canonical.encode("utf-8")).hexdigest()


def snapshot_hash(snapshot: Snapshot) -> str:
    return _hash({"snapshot": snapshot_to_dict(snapshot), "rule_assumptions": _RULE_ASSUMPTIONS})


def _effective_eligibility(holder, total):
    # ponytail: fixture aggregates bypass individual ownership; replace with reviewed owner-group rules when licensed evidence exists.
    # Facts stay immutable: this is a candidate arithmetic guard, not a legal exclusion.
    if any(getattr(holder, flag) == "UNKNOWN" for flag in FLAGS):
        return "UNKNOWN", "OWNERSHIP_CLASSIFICATION_UNKNOWN:" + holder.holder_ref
    if (holder.eligibility == "ELIGIBLE" and holder.holder_type != "AGGREGATE"
            and 20 * holder.shares >= total):
        return "UNKNOWN", "CANDIDATE_5_PERCENT_UNVERIFIED:" + holder.holder_ref
    if holder.eligibility == "UNKNOWN":
        return "UNKNOWN", "OWNERSHIP_CLASSIFICATION_UNKNOWN:" + holder.holder_ref
    return holder.eligibility, None


def _ratio_string(numerator, denominator):
    # Display only; all decisions use integer cross multiplication.
    with localcontext(_DECIMAL_CONTEXT):
        value = (Decimal(numerator) / Decimal(denominator)).quantize(_DISPLAY_UNIT)
    if value.is_zero():
        return "0"
    return format(value, "f").rstrip("0").rstrip(".")


def assess_numeric_target(snapshot: Snapshot) -> dict:
    validate_snapshot(snapshot)
    lower, upper = 0, 0
    warnings = {"RULE_UNVERIFIED", "NOT_A_LEGAL_COMPLIANCE_DETERMINATION"}
    unresolved = {"LEGAL_RULE_PROFILE_REVIEW", "TRANSACTION_FEASIBILITY_NOT_ASSESSED"}
    material_unknown = False
    for holder in snapshot.holders:
        eligibility, warning = _effective_eligibility(holder, snapshot.total_shares)
        if holder.holder_type == "AGGREGATE":
            warnings.add("SYNTHETIC_AGGREGATE_ASSUMPTION:" + holder.holder_ref)
        if eligibility == "ELIGIBLE":
            lower += holder.shares
            upper += holder.shares
        elif eligibility == "UNKNOWN":
            upper += holder.shares
            if holder.shares:
                material_unknown = True
                warnings.add(warning)
                unresolved.add(warning)
    status = "REQUIRES_VERIFICATION" if material_unknown else "SIMULATION_ONLY"
    if snapshot.sid_count is None:
        warnings.add("SID_UNVERIFIED")
        unresolved.add("SID_UNVERIFIED")
        status = "REQUIRES_VERIFICATION"
    if snapshot.board != "DEMO_STANDARD":
        warnings.add("UNSUPPORTED_BOARD")
        unresolved.add("UNSUPPORTED_BOARD")
        status = "UNSUPPORTED_RULE"
    known = not material_unknown
    return {
        "total_shares": snapshot.total_shares,
        "eligible_shares": lower if known else None,
        "eligible_lower_bound": lower, "eligible_upper_bound": upper,
        "free_float_ratio": _ratio_string(lower, snapshot.total_shares) if known else None,
        "numeric_target_status": ("PASS_NUMERIC" if 100 * lower >= 15 * snapshot.total_shares else "BELOW_TARGET") if known else "UNKNOWN",
        "assessment_status": status,
        "rule_set_id": _RULE_ASSUMPTIONS["rule_set_id"],
        "rule_version": _RULE_ASSUMPTIONS["rule_version"],
        "rule_status": "DRAFT", "target_ratio": "0.15",
        "warnings": sorted(warnings), "unresolved_constraints": sorted(unresolved),
        "data_hash": snapshot_hash(snapshot),
    }


def _prepare_allocations(snapshot, allocations, issuance, seller_ref=None):
    if type(allocations) is not list:
        _fail("INVALID_INPUT", "allocations must be a list.")
    if len(allocations) > MAX_HOLDERS:
        _fail("HOLDER_LIMIT_EXCEEDED", "An action supports at most 10000 allocations.")
    if not issuance and not allocations:
        _fail("INVALID_INPUT", "A transfer requires at least one positive allocation.")
    holders = {holder.holder_ref: holder for holder in snapshot.holders}
    seen = set()
    prepared = []
    for entry in allocations:
        _keys(entry, _ALLOCATION_KEYS, {"holder_ref", "shares"}, "allocation")
        ref = entry["holder_ref"]
        _text(ref, "allocation.holder_ref", 64)
        if ref in seen:
            _fail("DUPLICATE_ALLOCATION", "Each recipient may appear only once in an action.")
        seen.add(ref)
        if not issuance and ref == seller_ref:
            _fail("SELF_TRANSFER", "A seller cannot be its own transfer recipient.")
        _integer(entry["shares"], "allocation.shares", positive=not issuance,
                 negative_code="NEGATIVE_ISSUANCE" if issuance else "INVALID_SHARE_COUNT")
        facts = {key: value for key, value in entry.items() if key not in ("holder_ref", "shares", "flags")}
        if "flags" in entry:
            _keys(entry["flags"], set(FLAGS), set(), "allocation.flags")
            if set(entry["flags"]) & set(facts):
                _fail("INVALID_INPUT", "Supply each flag once, either flat or inside flags.")
            facts.update(entry["flags"])
        for flag in FLAGS:
            if flag in facts:
                _enum(facts[flag], _FLAG_VALUES, "allocation." + flag)
        for field, choices in (("eligibility", _ELIGIBILITY), ("holder_type", _HOLDER_TYPES)):
            if field in facts:
                _enum(facts[field], choices, "allocation." + field)
        if "evidence_ref" in facts:
            if type(facts["evidence_ref"]) is not str or not facts["evidence_ref"]:
                _fail("DOCUMENT_SOURCE_MISSING", "New or supplied eligibility evidence must be a nonempty string.")
            _text(facts["evidence_ref"], "allocation.evidence_ref", 512)
        existing = holders.get(ref)
        if existing is not None:
            if any(value != getattr(existing, key) for key, value in facts.items()):
                _fail("VERIFIED_FACT_CONFLICT", "Allocations cannot overwrite an existing holder's asserted facts or evidence.")
            recipient = existing
            canonical = {"holder_ref": ref, "shares": entry["shares"]}
        else:
            if "eligibility" not in facts:
                _fail("UNKNOWN_RECIPIENT_ELIGIBILITY", "A new recipient requires explicit eligibility, including UNKNOWN when unresolved.")
            if "evidence_ref" not in facts:
                _fail("DOCUMENT_SOURCE_MISSING", "A new recipient requires explicit supporting evidence.")
            recipient = Holder(holder_ref=ref, shares=0, **facts)
            canonical = _holder_dict(recipient)
            canonical["shares"] = entry["shares"]
        if recipient.holder_type == "AGGREGATE":
            _fail("AGGREGATE_ALLOCATION_UNSUPPORTED", "Synthetic aggregate buckets cannot receive allocations; supply individual recipients.")
        # CALC-010: validate even zero allocations, but never create zero-action rows.
        if entry["shares"]:
            prepared.append((recipient, entry["shares"], canonical))
    return sorted(prepared, key=lambda item: item[0].holder_ref)


def _apply(snapshot, allocations, issuance, seller_ref=None):
    validate_snapshot(snapshot)
    holders = {holder.holder_ref: holder for holder in snapshot.holders}
    if not issuance:
        _text(seller_ref, "seller_ref", 64)
        if seller_ref not in holders:
            _fail("UNKNOWN_SELLER", "seller_ref must identify a holder in the baseline snapshot.")
    prepared = _prepare_allocations(snapshot, allocations, issuance, seller_ref)
    amount = _sum_safe(item[1] for item in prepared)
    total = _sum_safe((snapshot.total_shares, amount)) if issuance else snapshot.total_shares
    if not issuance and amount > holders[seller_ref].shares:
        _fail("INSUFFICIENT_SELLER_BALANCE", "Sum of allocations exceeds the seller's baseline balance.")
    if not amount:
        return snapshot, []
    if not issuance:
        holders[seller_ref] = replace(holders[seller_ref], shares=holders[seller_ref].shares - amount)
    for recipient, shares, _ in prepared:
        holders[recipient.holder_ref] = replace(recipient, shares=_sum_safe((recipient.shares, shares)))
    post = replace(snapshot, total_shares=total, holders=tuple(sorted(holders.values(), key=lambda holder: holder.holder_ref)))
    # Reevaluate the entire ledger, including unchanged holders under a new denominator.
    # Effective classifications are derived, never persisted over reviewer assertions.
    for holder in post.holders:
        _effective_eligibility(holder, post.total_shares)
    return post, [item[2] for item in prepared]


def apply_transfer(snapshot: Snapshot, seller_ref: str, allocations: list[dict]) -> Snapshot:
    return _apply(snapshot, allocations, False, seller_ref)[0]


def apply_issuance(snapshot: Snapshot, allocations: list[dict]) -> Snapshot:
    return _apply(snapshot, allocations, True)[0]


def _price(value):
    if type(value) is not str or len(value) > 19 or not _PRICE_PATTERN.fullmatch(value):
        _fail("INVALID_PRICE", "price_idr_per_share must be a plain nonnegative decimal string with at most two decimals.")
    result = Decimal(value)
    if not result.is_finite() or result > MAX_SAFE_INTEGER:
        _fail("INVALID_PRICE", "price_idr_per_share exceeds the finite nonnegative price ceiling.")
    return result


def simulate(snapshot: Snapshot, action: dict) -> dict:
    validate_snapshot(snapshot)
    _keys(action, {"action_type", "seller_ref", "allocations", "price_idr_per_share"},
          {"action_type", "allocations"}, "action")
    _enum(action["action_type"], ("TRANSFER", "NEW_ISSUANCE"), "action_type")
    issuance = action["action_type"] == "NEW_ISSUANCE"
    if (issuance and "seller_ref" in action) or (not issuance and "seller_ref" not in action):
        _fail("INVALID_INPUT", "Only TRANSFER actions require and accept seller_ref.")
    price = _price(action["price_idr_per_share"]) if "price_idr_per_share" in action else None
    post, canonical_allocations = _apply(snapshot, action["allocations"], issuance, action.get("seller_ref"))
    canonical_action = {"action_type": action["action_type"], "allocations": canonical_allocations}
    if not issuance:
        canonical_action["seller_ref"] = action["seller_ref"]
    if price is not None:
        canonical_action["price_idr_per_share"] = format(price, ".2f")
    after = {holder.holder_ref: holder for holder in post.holders}
    dilution = []
    for old in sorted(snapshot.holders, key=lambda holder: holder.holder_ref):
        new = after[old.holder_ref]
        dilution.append({
            "holder_ref": old.holder_ref,
            "old_ratio": _ratio_string(old.shares, snapshot.total_shares),
            "new_ratio": _ratio_string(new.shares, post.total_shares),
            "percentage_point_change": _ratio_string(100 * (new.shares * snapshot.total_shares - old.shares * post.total_shares),
                                                     snapshot.total_shares * post.total_shares),
        })
    cash = None
    if price is not None:
        with localcontext(_DECIMAL_CONTEXT):
            cash = format(price * sum(entry["shares"] for entry in canonical_allocations), ".2f")
    result = {
        "input_hash": _hash({"data_hash": snapshot_hash(snapshot), "action": canonical_action, "engine_version": ENGINE_VERSION}),
        "engine_version": ENGINE_VERSION,
        "action": canonical_action, "snapshot": snapshot_to_dict(post),
        "assessment": assess_numeric_target(post),
        "dilution_by_holder": dilution, "cash_estimate_idr": cash,
    }
    result["result_hash"] = _hash(result)
    return result


__all__ = [
    "ENGINE_VERSION", "EngineError", "Holder", "Snapshot", "snapshot_from_dict",
    "snapshot_to_dict", "validate_snapshot", "apply_transfer", "apply_issuance",
    "assess_numeric_target", "simulate", "snapshot_hash",
]
