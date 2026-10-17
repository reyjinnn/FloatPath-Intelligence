# Core System Sequence Diagrams

## 1. CSV import + locked snapshot
```mermaid
sequenceDiagram
  participant U as Analyst
  participant W as Web
  participant A as FastAPI
  participant D as PostgreSQL
  U->>W: Upload CSV
  W->>A: POST /imports with validated file
  A->>A: Quarantine, parse, schema/checksum validation
  A->>D: Save draft import and row diagnostics
  A-->>W: Import candidate + discrepancies
  U->>W: Review and confirm
  W->>A: POST lock snapshot
  A->>A: Reconcile shares + facts
  A->>D: Create immutable snapshot + audit record
  A-->>W: Snapshot ID + status
```

## 2. Deterministic scenario
```mermaid
sequenceDiagram
  participant U as Analyst
  participant W as Web
  participant A as API
  participant E as Rule/Scenario Engine
  participant D as Database
  U->>W: Choose transfer/issuance
  W->>A: POST scenario (snapshot ID, inputs)
  A->>D: Fetch locked snapshot + rule version
  A->>E: Validate, apply ledger changes
  E->>E: Reclassify post-state, calculate exact ratio
  E-->>A: Typed scenario result + missing facts
  A->>D: Store immutable result + hashes
  A-->>W: Result with simulation disclaimer
```

## 3. AI candidate extraction + review
```mermaid
sequenceDiagram
  participant U as Analyst
  participant A as API
  participant Q as Quarantine/Parser
  participant L as OpenAI API
  participant D as Database
  U->>A: Upload authorized PDF
  A->>Q: Validate & extract bounded text
  Q-->>A: Segments, page mappings
  A->>L: Structured extraction (no secrets beyond authorized content)
  L-->>A: Candidate schema
  A->>A: Validate page evidence and types
  A->>D: Store candidate PENDING_REVIEW
  A-->>U: Candidate values + citations
  U->>A: Explicit accept/correct/reject
  A->>D: Save revision + evidence + audit
```

## Failure principles
- If model unavailable, manual ingestion and deterministic scenario still work.
- If data or rules unknown, return actionable missing facts, not success.
- Every tenant-specific query must apply server-side authorization and tenant scope.
- Never perform stock trades, external filing, or sending emails from these sequences.
