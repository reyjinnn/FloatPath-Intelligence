# Authorization, Demo Isolation, and Tenant Access Matrix

## Mode split
- `PUBLIC_SANDBOX`: static synthetic content and optionally backend calculations with enforced synthetic fixture IDs; no account and no real document upload.
- `PRIVATE_PILOT`: authenticated issuer/BAE workspace, explicit data processing agreement and authorized tenant setup before real uploads.

## Roles
Workspace role names implemented in database constraints and session verification:
- `viewer`: Auditor / External observer (read-only across workspace, inspect audit trail, no mutations)
- `analyst`: Financial / Data analyst (draft revisions, CSV import, create and compare scenarios; forbidden from locking official snapshots or viewing audit trail)
- `reviewer`: Compliance / Quality reviewer (authorized to review, validate, and lock immutable SHA-256 snapshots, full simulation and report creation, inspect audit trail)
- `admin`: Workspace administrator (all reviewer privileges plus workspace user provisioning and role assignment, inspect audit trail)

| Capability | Viewer (`viewer`) | Analyst (`analyst`) | Reviewer (`reviewer`) | Workspace Admin (`admin`) |
|---|---|---|---|---|
| View companies & holdings | Read | Read | Read | Read |
| Edit draft holdings / CSV import | ❌ Ditolak (403) | ✅ Diizinkan | ✅ Diizinkan | ✅ Diizinkan |
| Lock immutable snapshot | ❌ Ditolak (403) | ❌ Ditolak (403) | ✅ Diizinkan (SHA-256) | ✅ Diizinkan (SHA-256) |
| Create & run scenarios | ❌ Ditolak (403) | ✅ Diizinkan | ✅ Diizinkan | ✅ Diizinkan |
| Compare scenarios & view reports | Read | Read / Generate | Read / Generate | Read / Generate |
| View Audit Trail (`/audit`) | ✅ Diizinkan | ❌ Ditolak (403) | ✅ Diizinkan | ✅ Diizinkan |
| Manage Users & Roles (`/team`) | ❌ Ditolak (403) | ❌ Ditolak (403) | ❌ Ditolak (403) | ✅ Diizinkan |

## Authentication controls for pilot
- OIDC compatible provider or secure session implementation; MFA for privileged roles.
- JWT/session contains signed tenant and role claims, but resource `tenant_id` is rechecked server-side.
- Prefer stable opaque IDs, not user-controlled predictable enumeration as sole access control.
- Audit authorization denials without disclosing private resource metadata.
- Cross-tenant document/object storage key policies; ephemeral signed URLs authorized per object.

## Test matrix
1. Analyst tenant A requests tenant B report by ID → blocked, no response payload leakage.
2. Demo viewer tries POST a real document → blocked.
3. Reviewer cannot finalize an unbalanced snapshot.
4. Admin tenant A cannot change tenant B user roles.
5. Privileged support access (if ever introduced) requires explicit consent, ticket, expiry, logging.
6. Logout/revoked role/session denies use after policy-defined session invalidation.
