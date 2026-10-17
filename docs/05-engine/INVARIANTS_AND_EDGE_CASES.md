# Mathematical Invariants, Edge Cases & Property Tests

## Preconditions
T>0; holder shares integer >=0; sum holder balances == T; no duplicate holder IDs; signed baseline version and applicable scope. If any condition unknown, refuse verified result.

## Properties for random ledgers
1. **Transfer conservation:** for legal transfer A→B amount x≤A, `sum(post)=sum(pre)` exactly.
2. **Issuance conservation:** issuing x shares gives `T'=T+x`; never silently create legacy holder shares.
3. **Non-negativity:** no holder ends with negative shares, no fractional shares.
4. **Determinism:** same input hash + versioned rule set + engine version → same canonical output hash.
5. **Ratio bounds:** if all classifications verified, 0≤F≤T and 0≤F/T≤1.
6. **Eligibility sensitivity:** if buyer crosses threshold under **reviewed rules**, reevaluation may reduce F; simple `F+x` is not always valid.
7. **Invariant under eligible→eligible transfer:** provided neither changes eligibility, total eligible F unchanged.
8. **Monotonicity cannot be assumed:** issuance to ineligible holder increases denominator and may reduce ratio; a distribution can alter eligibility.
9. **Exact target:** store rational comparisons; display percentage rounded only for UI.
10. **Historical reproducibility:** old rules/data snapshots never mutated by new evaluations.

## Hard boundaries
- T near 64-bit limits: prevent overflow on `T+x`; use checked arbitrary Python ints and DB constraints.
- `p=1`: simple issuance formula invalid (division by zero), return infeasible/out of scope.
- `p=0`: required transfer/issuance zero.
- Missing price: no assumed fundraising cash estimate; null with reason.
- Multiple share classes: unless verified share-class definition supported, refuse generalization.
- Holder aggregation: an aggregate `<5% public` bucket cannot prove individual ownership after action; preserve unknown where appropriate.
- Buyer at exactly candidate 5%: subject to verified rule text and exception logic; test both sides of boundary.
- Snapshot SID counts unrelated to holder rows; never infer count.
- Lock-ups, options, convertibles, treasury reissuance, off-market constraints: out of scope until rules verified.

## Property-based test ideas
Generate partitions of T into N holders, eligibility flags, distributions and issuances; assert arithmetic invariants and safe failure if flags become unknown. Use Hypothesis with fixed seed in CI but broaden seeds in nightly/manual QA. Never generate 'legal expected status' from unapproved rules.
