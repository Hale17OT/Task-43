# Recheck After Latest Changes (Static)

Scope: Re-validated the same 4 previously reported issues against the current repository state (static only, no runtime/tests executed).

## 1) High — Sensitive identifier encryption-at-rest scope
- Status: **Partially Fixed (still open)**
- Fixed evidence:
  - `session_nonce` now encrypted and queried via deterministic hash: `backend/src/infrastructure/database/repositories/session-repository.ts:55`, `backend/src/infrastructure/database/repositories/session-repository.ts:56`, `backend/src/infrastructure/database/repositories/session-repository.ts:33`
  - `token_jti` now encrypted: `backend/src/infrastructure/database/repositories/session-repository.ts:57`
  - `ip_address` audit field encrypted before insert: `backend/src/api/plugins/audit.plugin.ts:33`
  - supporting migration for nonce hash added: `backend/src/infrastructure/database/migrations/014_encrypt_session_nonce.ts:9`
- Remaining gap evidence:
  - Identifier-bearing fields still persisted in plaintext schema/flow (e.g., usernames and audit entity id):
    - `backend/src/infrastructure/database/migrations/001_organizations_and_users.ts:16`
    - `backend/src/infrastructure/database/migrations/006_audit_webhooks_config.ts:9`
- Conclusion: Substantial progress, but the original “notes and identifiers encrypted at rest” scope is not fully demonstrated across identifier classes.
- Manual verification required: confirm migration 014 is applied and legacy session rows are backfilled in target DB.

## 2) High — Org admins modifying global config dictionary entries
- Status: **Fixed (static code-level), runtime migration application cannot be confirmed statically**
- Evidence of fix:
  - Route-level restriction for non-super-admin updates/deletes to `org_id = current org`:
    - `backend/src/api/routes/config.routes.ts:89`
    - `backend/src/api/routes/config.routes.ts:91`
    - `backend/src/api/routes/config.routes.ts:110`
    - `backend/src/api/routes/config.routes.ts:111`
  - New RLS `WITH CHECK` policy added to block org-scoped writes to global rows (`org_id IS NULL`):
    - `backend/src/infrastructure/database/migrations/015_config_rls_with_check.ts:23`
    - `backend/src/infrastructure/database/migrations/015_config_rls_with_check.ts:26`
- Conclusion: The previously reported authorization boundary defect is addressed in code and migration design.
- Manual verification required: ensure migration 015 has executed in deployed DB.

## 3) Medium — Lawyer dashboard “today” filtering backend contract gap
- Status: **Fixed**
- Evidence:
  - Frontend still sends `date`: `frontend/src/app/features/lawyer/lawyer-dashboard.component.ts:105`
  - Backend now explicitly handles `query.date` and converts to `from/to` range:
    - `backend/src/api/routes/bookings.routes.ts:37`
    - `backend/src/api/routes/bookings.routes.ts:39`
    - `backend/src/api/routes/bookings.routes.ts:40`

## 4) Medium — Weak e2e authorization assertions
- Status: **Fixed**
- Evidence:
  - Client test now requires redirect away from admin and to client dashboard:
    - `e2e/tests/01-auth.spec.ts:78`
    - `e2e/tests/01-auth.spec.ts:80`
  - Lawyer test now requires redirect away from client and to lawyer dashboard:
    - `e2e/tests/01-auth.spec.ts:91`
    - `e2e/tests/01-auth.spec.ts:92`

## Final Recheck Summary
- Fixed: **3 / 4** (#2, #3, #4)
- Partially fixed / still open: **1 / 4** (#1)
