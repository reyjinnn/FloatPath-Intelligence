# Rule-to-Code Traceability & Approval Ledger

## Source hierarchy
1. Official BEI regulation PDFs, amendments, SEs and effective dates (primary legal text).
2. OJK/KSEI authoritative official releases as confirmation/context, **not** clause-level replacement.
3. Advisor summaries/secondary sources as discovery aids only.
4. Case-specific issuer evidence and exceptions, verified separately.

Official OJK statement: https://ojk.go.id/id/berita-dan-kegiatan/siaran-pers/Pages/OJK-BEI-dan-KSEI-Tuntaskan-Empat-Agenda-Reformasi-Transparansi-Pasar-Modal-Indonesia.aspx

## Required matrix fields
`rule_id | primary_source_url | document_version | source_clause/page | official_effective_date | applicable_board | applies_to | condition | deterministic_implementation | expected fixture IDs | reviewer | reviewed_on | approval_state | source_checksum`

| Rule ID | Current state | Needed before rule activation | Engine behavior |
|---|---|---|---|
| FF-BASE-001 | Arithmetic | Independent proof + engine tests | `SIMULATION_ONLY` |
| FF-MIN-PCT | Headline confirmed, scope pending | Official clause + exception mapping + review | Numeric target only |
| FF-MIN-SHARES | Candidate | Verify primary text and applicability | Not a certified verdict |
| FF-SID-COUNT | Candidate | Verify source definition and SID measurement | Unknown/unverified |
| FF-ELIGIBILITY | Candidate | Clause-to-field exclusion mapping, nominee rules | Tri-state |
| FF-TRANSITION | Candidate | Exact dates, reference capitalization and board, exceptions | Disable definitive results |
| FF-BOARD | Candidate | Board-specific applicability | Unsupported if unknown |

## Implementation gate
- A rule is **DRAFT** until primary text, page/clause, signed reviewer and fixtures are recorded.
- Promote to **VERIFIED** only with independent review and complete cases: positive, negative, boundary, unknown.
- Changes create a new immutable version; do not overwrite historical results.
- Production compliance label is disabled for this product pending domain/legal approval and accepted product scope.

## Open questions
- Which shareholder aggregation and exclusions apply to the *actual* board and assessment date?
- How to count reported SID, nominee/beneficial owner, treasury/locked shares?
- How are exemptions/issuer-specific approvals represented?
- What historical threshold applies to each transition group?
- Is any intended memo legally regulated as investment/corporate advisory content?
