# Rule Engine Design — Safe by Default

## Boundaries
A rule set is an immutable data artifact approved by domain reviewer. Engine logic interprets versioned predicates without accepting arbitrary Python/JS strings from DB. MVP uses a small typed DSL/config, never `eval`.

## Proposed rule schema
```yaml
id: FF-MIN-PCT
version: draft-2026-01
status: DRAFT
source_id: SRC-002
source_section: PENDING_VERIFICATION
scope:
  board: DEMO_STANDARD
  assessment_type: SIMULATION
parameters:
  target_ratio: '0.15'
  eligibility_profile: SYNTHETIC_REVIEWED
calendar:
  effective_from: '2026-03-31'
review:
  reviewer: null
  signed_at: null
```

## Evaluation outcome
`PASS_NUMERIC`, `FAIL_NUMERIC`, `NEEDS_DATA`, `RULE_UNVERIFIED`, `OUT_OF_SCOPE` per criterion. Aggregate status never `COMPLIANT` in public demo.

## Rule registry
Effective intervals non-overlapping per scope; historical version immutable; default deny when scope missing. Each source clause and test case link stored. Warn on snapshot date newer than source by configured freshness threshold (do not silently assume a universal threshold).

## Pseudocode
```python
def assess(snapshot, rule_set):
    if not rule_set.verified or not rule_set.applies(snapshot):
        return "RULE_UNVERIFIED_OR_OUT_OF_SCOPE"
    issues = validate_snapshot(snapshot)
    if issues:
        return {"status": "NEEDS_DATA", "issues": issues}
    eligible = classify_all(snapshot.holdings, rule_set)
    if eligible.has_unknown:
        return {"status": "NEEDS_DATA", "issues": eligible.unknowns}
    return evaluate_criteria(rule_set, eligible, snapshot)
```

## Revalidation triggers
Change legal source, board, as-of date, holder affiliation, snapshot value, issuer exception, newly discovered beneficial ownership, issuance altering ownership threshold.
