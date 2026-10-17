# Synthetic engine v0.1.0

Python 3.10 stdlib only. `__init__.py` exports the requested public functions,
`ENGINE_VERSION`, and frozen/slotted `Snapshot`/`Holder` dataclasses. Functions
return fresh JSON-compatible dictionaries; snapshots contain only immutable
values. No network, clock, random source, mutable input alias, or LLM is used.

## Input interpretations

- Required snapshot keys: `id`, `as_of_date`, `total_shares`, `board`,
  `sid_count`, `holders`. Required holder keys: `holder_ref`, `shares`,
  `eligibility`, `holder_type`. Known eligibility requires `evidence_ref`.
  Missing flags default to `FALSE`; all supplied flags are strict
  `TRUE`/`FALSE`/`UNKNOWN` strings. Unknown keys and boolean integers fail.
- **DATA-002:** optional `source_as_of_date` is accepted on the snapshot and
  each holder. Every supplied source date must equal snapshot `as_of_date`.
  Dates are ISO calendar dates. Source dates are retained in round trips and
  hashes. An omitted source date asserts no additional date; it does not invent
  provenance. Mixed sources must be reconciled outside this engine.
- All integers and summed share counts are bounded by `9007199254740991`.
  Total shares must be positive; holdings and SID counts may be zero. There are
  at most 10,000 holders/allocations. SID count is never inferred from row count.
- New recipients require explicit eligibility (including `UNKNOWN`) and a
  nonempty evidence reference. `holder_type` defaults to `ORGANIZATION` in
  allocations. Existing recipients may repeat identical facts but cannot change
  any existing fact or evidence, including unresolved facts.
- Allocation flags can be flat or nested under `flags`; specifying the same
  flag in both places is rejected. Canonical actions flatten flags, sort
  allocations, omit redundant existing-holder facts, and remove zero issuance
  allocations. Zero issuance validates supplied data but creates no holder.
- Transfers require at least one positive allocation; duplicate recipients,
  self transfers, and overselling fail atomically. Fixture aggregate holders
  may supply a transfer but cannot receive allocations. New aggregates are
  forbidden. Baseline aggregates require `fixture://` evidence.
- Prices must be plain decimal strings, between `0` and `9007199254740991`
  inclusive, with at most two decimals. No sign, whitespace, leading-zero
  integer, exponent, infinity, or NaN is accepted. Canonical price and gross
  cash estimate use two decimals. Cash is price times allocated shares for
  either action; missing price returns null. No fees or execution assumptions.

## Classification and arithmetic

Eligibility in the snapshot is the immutable evidence-backed **assertion**,
not a legal verdict. Effective eligibility is recomputed from every holder's
post-action balance and the post-action denominator. Any unknown flag makes
that holder effectively unknown. An asserted eligible nonaggregate holder at
or above the **unverified candidate 5%** boundary becomes effectively unknown,
never legally ineligible. Its shares enter the upper bound but not the lower
bound. Snapshot assertions are retained so subsequent denominator changes can
be evaluated without destroying facts. Material means a positive share count.

`AGGREGATE` is a deliberate fixture-only assumption that bypasses the individual
5% guard; it provides no real holder-count/SID evidence. Real beneficial-owner
aggregation, exemptions, share classes, and regulatory thresholds are not
implemented. Add those only with reviewed source clauses and golden tests.

`eligible_shares` and `free_float_ratio` are null whenever positive shares have
unknown effective eligibility; numeric status is then `UNKNOWN` even if the
bounds happen to lie on one side of the target. Otherwise the exact target is
compared with integer arithmetic: `100 * eligible >= 15 * total`.

Ratios and percentage-point changes are display-only decimal strings with
18 fractional digits, half-up rounding, and trailing zeros removed. Dilution
lists every legacy holder, not new recipients. Percentage-point changes are
calculated from exact integer fractions, not rounded displayed ratios. Decimal
operations use a private 100-digit context, independent of the caller's context.

All rules remain `DRAFT`. Complete demo assessments are `SIMULATION_ONLY`;
material unknowns or missing SID produce `REQUIRES_VERIFICATION`. A non-demo
board produces `UNSUPPORTED_RULE` with precedence over missing facts. Known SID
counts are not checked against the unverified candidate minimum. No legal
compliance status is emitted. Transaction feasibility is always unresolved.

## Canonical hashes

Hashes are lowercase SHA-256 hex prefixed `sha256:` over ASCII-escaped, sorted-key,
compact UTF-8 JSON. Holders and allocations are sorted by stable references.
There is no execution timestamp. Snapshot hash includes the entire snapshot
(including source dates/evidence) and the versioned numeric/rule assumptions.
Input hash includes baseline data hash, canonical action, and engine version.
Result hash covers every result field except `result_hash` itself. A zero issue
preserves the baseline data hash; a scenario/result hash still identifies its
canonical action and version.

## Fixtures and verification

`datasets/synthetic/companies.json` contains five fixed-ID synthetic companies;
`shareholdings.csv` is DEMO-001 with the canonical CSV import header. Fixtures
are not generated by engine output. No real issuer identity or PII is present.

Coverage: CALC-001..016, DATA-001/002, RULE-001/002, candidate threshold below/at/
above boundaries, issuance denominator reevaluation, and deterministic generated
PROP-001..012 checks (`random.Random(20261017)`). Expectations for golden arithmetic
are hardcoded independently. No independent legal reviewer sign-off is claimed.

```sh
python -m unittest discover -s tests -p test_engine.py -v
```
