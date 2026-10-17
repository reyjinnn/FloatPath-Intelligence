# Simulation Mathematical Specification

**Scope:** arithmetic model and versioned assumptions. **Not** a legal certification engine.

## Definitions
`T` = total listed shares before action (`int > 0`); `F` = sum of shares held by verified eligible holders; `p` = target ratio in `[0,1)`; `x` = newly transferred or issued integer shares.

Ratio `r = F/T` exactly as rational for rule comparison; display rounded only. Output includes provenance and classification completeness.

## Simple transfer under strict conditions
Transfer `x` shares *from ineligible holder(s) to eligible holder(s)*, with eligibility remaining valid for all resulting positions and no other side effects: `T' = T`, `F' = F + x`, required `x = max(0, ceil(p*T - F))`.

**Crucial:** A single buyer receiving 50m out of 1bn shares may hit a candidate ≥5% exclusion threshold, so the familiar 10% → 15% slider is **not sufficient**. Split among multiple independently eligible recipients or mark assumption invalid; re-evaluate each recipient after all transactions. The actual 5% legal rule must be verified by domain reviewer.

## New-share issuance under strict conditions
Issue `x` shares to investors verified eligible *after issuance*. `T'=T+x`, `F'=F+x`; find `x >= (p*T - F)/(1-p)` rounded **up to integer**. Example T=1,000,000,000, F=100,000,000, p=.15 → ceil(50,000,000/.85) = **58,823,530** new shares. If recipient becomes ineligible, this formula is invalid, use ledger recomputation.

## General ledger recomputation (production path)
1. Copy base holder balances.
2. Apply action atomically: transfers conserve total, issuance increases total exactly.
3. Recompute *every* owner group ownership fraction `shares_i/T'`.
4. Run versioned eligibility evaluator; if any material required fact `UNKNOWN`, return `REQUIRES_VERIFICATION` and eligible total as unknown or lower/upper bound.
5. Sum `F' = Σ shares_i * eligible_indicator_i` only for fully verified eligibility.
6. Compute ratio exact (rational Decimal). Check other approved criteria and output warnings.

## Invariants
- `T' > 0`, `shares_i >= 0`, all integer.
- Transfer: `Σshares_i' = Σshares_i`; issuance: `Σshares_i' = Σshares_i + x`.
- No account can sell more shares than owned.
- No negative or duplicate allocation from same transaction id.
- No full legal conclusion with unresolved eligibility, issuer scope, or unverified rules.
- `price * shares` computed in Decimal, with currency/rounding strategy recorded.

## Dilution definition
For each legacy holder, `old_pct = old_shares/T`, `new_pct = post_shares/(T+x)`; `percentage_point_change = (new_pct-old_pct)*100`. Report percentages with explicit display precision, never re-round for rule comparison.

## Feasibility warnings
Approval, lockup, liquidity, price, investor demand, rights/preemption, corporate action legal route, insider restrictions, beneficial owner, tax/transaction costs, partial execution. These are not inferred by math engine.

## Engine outputs
`total_shares`, `eligible_shares_if_known`, `ratio_if_known`, `numeric_target_status`, `rule_version`, `unresolved_constraints`, `warnings`, `calculations`, `data_hash`, `scenario_hash`.
