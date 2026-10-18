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
| Edit draft holdings / CSV import | ❌ Denied (403) | ✅ Allowed | ✅ Allowed | ✅ Allowed |
| Lock immutable snapshot | ❌ Denied (403) | ❌ Denied (403) | ✅ Allowed (SHA-256 + If-Match) | ✅ Allowed (SHA-256 + If-Match) |
| Create & run scenarios | ❌ Denied (403) | ✅ Allowed | ✅ Allowed | ✅ Allowed |
| Compare scenarios & view reports | Read | Read / Generate | Read / Generate | Read / Generate |
| View Audit Trail (`/audit`) | ✅ Allowed | ❌ Denied (403) | ✅ Allowed | ✅ Allowed |
| Manage Users & Roles (`/team`) | ❌ Denied (403) | ❌ Denied (403) | ❌ Denied (403) | ✅ Allowed |

## Client Navigation & Operational Enforcements
- Dynamic Sidebar & Route Guards (`apps/web/src/access.ts`): Navigation items are rendered only for authorized roles. Unknown roles and unregistered screens are denied by default. Direct URL navigation to forbidden routes displays an explicit "Access denied" panel without fetching protected entities.
- Company Context (FR-013): Opening a company only enables links for that company; it never changes the server-supplied role. Viewer ledger navigation is labeled as read-only, and snapshot lock controls render only for Reviewer/Admin. Regression tests cover all four roles through company selection, company-menu navigation, reload, and forbidden direct routes.
- Reviewer Lock Precondition Binding (FR-002/FR-012): Locking requires reviewer modal confirmation and passes the canonical `content_hash` via `If-Match`. Interleaved changes by other users result in `409 SNAPSHOT_CHANGED`, preventing unseen edits from being locked.
- Interactive Feedback: Persistent, accessible HTML5 `<dialog>` modals for lock and navigation warnings, drawers for holder and audit inspection, and bounded toast notifications.

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
