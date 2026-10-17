# Calculation Engine Interfaces, Algorithms and Contracts

## Non-negotiable invariants
- Integer units of whole shares (`int`, database bigint/numeric as required). Money with `Decimal`; percentages compared exactly as fractions/cross multiplication.
- No client-supplied `free_float_ratio` accepted as calculated truth.
- A transfer never changes total listed shares; an issuance adds new listed shares.
- No holder may have negative holdings; every share must be accounted for or explicitly reconciled as a permitted source bucket.
- Eligibility is recalculated using **post-state holdings**; never assume eligible recipient stays eligible.
- `UNKNOWN` is never coerced into eligible or ineligible for a definitive assessment.
- Draft regulatory rules cannot produce a legally binding compliance certificate.

## Types (pseudo-Python)
```python
from dataclasses import dataclass
from enum import StrEnum
from decimal import Decimal

class Eligibility(StrEnum):
    ELIGIBLE = 'ELIGIBLE'
    INELIGIBLE = 'INELIGIBLE'
    UNKNOWN = 'UNKNOWN'

@dataclass(frozen=True)
class Holder:
    id: str
    shares: int
    verified_facts: dict  # strong typed model in implementation

@dataclass(frozen=True)
class Snapshot:
    id: str
    as_of: str
    total_shares: int
    holders: tuple[Holder, ...]
    source_hash: str

@dataclass(frozen=True)
class RuleContext:
    profile_id: str
    version: str
    status: str
    effective_date: str
    eligibility_rule: str

@dataclass(frozen=True)
class Result:
    total_shares: int
    eligible_shares: int | None
    numerator_known: bool
    missing_facts: tuple[str, ...]
    arithmetic_status: str
    regulatory_status: str
```

## `validate_snapshot(snapshot)`
1. Verify total >0, share counts integers ≥0, unique IDs, snapshot date not mixed with other imports.
2. Verify sum(holders.shares)==snapshot.total_shares or return reconciliation failure.
3. Validate unknown facts explicitly; do not invent rest-of-market holdings.
4. Return typed errors `{code, path, expected, actual_safe}`; never log sensitive raw document content.

## `simulate_transfer(snapshot, seller_id, buyer_id, shares, rules)`
1. Require `shares > 0`, seller≠buyer, seller balance≥shares, receiver may be a *defined* holder or authorized new holder.
2. Apply debit/credit to copy of ledger, keep total exactly constant.
3. Invoke `classify_all(post_state, rules)` for every changed/affected holder; aggregate controllers/affiliates as required by approved rule.
4. Compute eligible shares **from full post-state**. If any required eligibility fact unknown, return range/UNKNOWN state, not a scalar assertion.
5. Compare actual numerator/denominator with scenario target; persist immutable result and pre/post hashes.

## `simulate_issuance(snapshot, allocations, rules)`
1. Require integer positive allocation(s), authorized issued total and no duplicate ID unless deliberate combine semantics specified.
2. Set `T' = T + sum(allocations.shares)`; add to recipients' balances.
3. Reclassify all holders under post-state denominator, not only recipients; source and affiliation can change classification.
4. Recalculate F' from all eligible holders; return holder-level deltas and dilution.
5. No issuance to a single unknown investor may be assumed to increase free float.

## Target-gap helpers (illustrative arithmetic only)
When verified eligible shares are F, target fraction is a/b, total shares T:
- Block transfer from ineligible to eligible keeping classifications fixed: `x_min = max(0, ceil(a*T/b)-F)`.
- Issue shares to eligible investor(s) keeping classifications fixed: `x_min = max(0, ceil((a*T-b*F)/(b-a)))`; valid only when `b>a`.
- For arbitrary transfers/allocations use simulation search with reclassification, **not** simple closed form.
- Evaluate target exactly: `b*eligible_shares >= a*total_shares` rather than comparing rounded UI percentages.

## Errors and status contracts
`INVALID_INPUT`, `INSUFFICIENT_SHARES`, `SNAPSHOT_UNBALANCED`, `ELIGIBILITY_UNKNOWN`, `RULE_NOT_VERIFIED`, `BOARD_UNSUPPORTED`, `SCENARIO_CONFLICT`, `SIMULATION_ONLY`.
See [API status](../06-architecture/ERROR_AND_STATUS_CODES.md) and [golden tests](../09-quality/GOLDEN_TEST_CASES.md).
