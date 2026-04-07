# Issue Recheck Results (Static)

Reviewed only the four previously reported issues against current code changes.

## 1) High — Sensitive identifier encryption-at-rest scope
- Status: **Partially Fixed (still open)**
- What changed:
  - Session metadata now encrypted at write/decrypted on read (`ip_address`, `workstation_id`): `backend/src/infrastructure/database/repositories/session-repository.ts:46`
  - Audit log now encrypts request IP before persistence: `backend/src/api/plugins/audit.plugin.ts:33`
  - Existing encrypted flows remain for review/dispute text: `backend/src/infrastructure/database/repositories/review-repository.ts:114`, `backend/src/infrastructure/database/repositories/review-repository.ts:148`
- What remains:
  - Core identifier-bearing fields are still stored plaintext in schema (e.g., `users.username`, `user_sessions.session_nonce`, `user_sessions.token_jti`, `audit_log.entity_id`):
    - `backend/src/infrastructure/database/migrations/001_organizations_and_users.ts:16`
    - `backend/src/infrastructure/database/migrations/002_sessions_and_idempotency.ts:7`
    - `backend/src/infrastructure/database/migrations/002_sessions_and_idempotency.ts:8`
    - `backend/src/infrastructure/database/migrations/006_audit_webhooks_config.ts:9`
- Conclusion: The issue is improved but not fully closed against the original “notes and identifiers encrypted at rest” scope.

## 2) High — Org admins modifying global config dictionary entries
- Status: **Partially Fixed (route fixed, policy hardening missing)**
- What changed:
  - Route-level PATCH now restricts non-super-admin updates to own org entries only (`org_id = current org`):
    - `backend/src/api/routes/config.routes.ts:89`
    - `backend/src/api/routes/config.routes.ts:91`
- Remaining gap:
  - RLS policy for `config_dictionaries` still allows visibility of global rows (`org_id IS NULL`) and does not define `WITH CHECK` for update invariants:
    - `backend/src/infrastructure/database/migrations/011_rls_gaps_and_username_uniqueness.ts:12`
    - `backend/src/infrastructure/database/migrations/011_rls_gaps_and_username_uniqueness.ts:16`
- Conclusion: Main API path is fixed; defense-in-depth at DB policy level is still incomplete.

## 3) Medium — Lawyer dashboard “today” filter mismatch
- Status: **Fixed**
- Evidence:
  - Frontend sends `date` param: `frontend/src/app/features/lawyer/lawyer-dashboard.component.ts:105`
  - Backend now supports `query.date` and maps it to `from/to` filters:
    - `backend/src/api/routes/bookings.routes.ts:37`
    - `backend/src/api/routes/bookings.routes.ts:39`
    - `backend/src/api/routes/bookings.routes.ts:40`
- Conclusion: Contract mismatch addressed.

## 4) Medium — Weak e2e authorization assertions
- Status: **Fixed**
- Evidence:
  - Client/admin-route assertion now rejects admin URL and requires client dashboard:
    - `e2e/tests/01-auth.spec.ts:78`
    - `e2e/tests/01-auth.spec.ts:80`
  - Lawyer/client-route assertion now rejects client URL and requires lawyer dashboard:
    - `e2e/tests/01-auth.spec.ts:91`
    - `e2e/tests/01-auth.spec.ts:92`
- Conclusion: Assertions are now deterministic and no longer pass on unauthorized outcomes.

## Final Recheck Summary
- Fixed: **2 / 4** (Issues #3, #4)
- Partially fixed / still open: **2 / 4** (Issues #1, #2)
