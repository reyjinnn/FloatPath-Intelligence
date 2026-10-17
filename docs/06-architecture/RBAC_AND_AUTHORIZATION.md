# Authorization, Demo Isolation, and Tenant Access Matrix

## Mode split
- `PUBLIC_SANDBOX`: static synthetic content and optionally backend calculations with enforced synthetic fixture IDs; no account and no real document upload.
- `PRIVATE_PILOT`: authenticated issuer/BAE workspace, explicit data processing agreement and authorized tenant setup before real uploads.

## Roles
`DEMO_VIEWER`, `ANALYST`, `REVIEWER`, `TENANT_ADMIN`, `PLATFORM_ADMIN` (internal only).

| Capability | Demo viewer | Analyst | Reviewer | Tenant admin | Platform admin |
|---|---|---|---|---|---|
| View synthetic demos | Read | Read | Read | Read | Read |
| View own tenant snapshot | No | Read | Read | Read | Support only by explicit audited access |
| Draft/import own tenant | No | Write | Write | Write | No by default |
| Lock reviewed snapshot | No | No | Approve | Approve | No by default |
| Simulate own tenant | Synthetic only | Yes | Yes | Yes | No by default |
| Generate draft memo | Synthetic only | Yes | Yes | Yes | No by default |
| Finalize decision memo | No | No | Yes | Yes | No by default |
| Manage tenant user | No | No | No | Yes | Platform provisioning only |
| Access another tenant | No | No | No | No | No by default |

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
