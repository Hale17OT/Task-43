# Recheck Results (Current Snapshot)

Static re-review of the same 4 previously reported issues.

## 1) High — Sensitive identifier encryption-at-rest only partially implemented
- Status: **Fixed (codebase), with migration-application manual check**
- Evidence of closure:
  - Username stored encrypted + hash lookup only: `backend/src/infrastructure/database/repositories/user-repository.ts:69`, `backend/src/infrastructure/database/repositories/user-repository.ts:44`
  - Session nonce/JTI/IP/workstation stored encrypted + hash lookup for nonce: `backend/src/infrastructure/database/repositories/session-repository.ts:51`, `backend/src/infrastructure/database/repositories/session-repository.ts:53`, `backend/src/infrastructure/database/repositories/session-repository.ts:35`
  - Audit entity ID and IP encrypted at write time: `backend/src/api/plugins/audit.plugin.ts:31`, `backend/src/api/plugins/audit.plugin.ts:34`
  - Audit schema adapted to encrypted entity IDs (`uuid` -> `text`): `backend/src/infrastructure/database/migrations/017_audit_entity_id_to_text.ts:8`, `backend/src/infrastructure/database/migrations/017_audit_entity_id_to_text.ts:19`
  - Legacy plaintext backfill encryption migration present: `backend/src/infrastructure/database/migrations/018_encrypt_legacy_plaintext.ts:21`, `backend/src/infrastructure/database/migrations/018_encrypt_legacy_plaintext.ts:31`
- Note: **Manual Verification Required** to confirm migrations 017/018 have been executed in the target DB.

## 2) High — Org-scoped admins can modify global config dictionary entries
- Status: **Fixed**
- Evidence:
  - Route-level restriction limits non-super-admin update/delete to `org_id = current org`: `backend/src/api/routes/config.routes.ts:89`, `backend/src/api/routes/config.routes.ts:91`, `backend/src/api/routes/config.routes.ts:110`, `backend/src/api/routes/config.routes.ts:111`
  - RLS `WITH CHECK` blocks org-scoped writes to global rows (`org_id IS NULL`): `backend/src/infrastructure/database/migrations/015_config_rls_with_check.ts:23`, `backend/src/infrastructure/database/migrations/015_config_rls_with_check.ts:26`

## 3) Medium — Lawyer dashboard "today" filtering not enforced by backend API
- Status: **Fixed**
- Evidence:
  - Frontend sends `date`: `frontend/src/app/features/lawyer/lawyer-dashboard.component.ts:105`
  - Backend handles `query.date` and derives day-bound `from/to`: `backend/src/api/routes/bookings.routes.ts:37`, `backend/src/api/routes/bookings.routes.ts:39`, `backend/src/api/routes/bookings.routes.ts:40`

## 4) Medium — e2e authorization checks weak / permissive
- Status: **Fixed**
- Evidence:
  - Client route-guard test now asserts redirect to own dashboard and denied banner text: `e2e/tests/01-auth.spec.ts:78`, `e2e/tests/01-auth.spec.ts:82`, `e2e/tests/01-auth.spec.ts:83`
  - Lawyer route-guard test now asserts redirect to own dashboard and denied banner text: `e2e/tests/01-auth.spec.ts:94`, `e2e/tests/01-auth.spec.ts:98`, `e2e/tests/01-auth.spec.ts:99`

## Final Summary
- **Fixed:** 4 / 4
- **Manual verification boundary:** migration execution state in deployed database cannot be confirmed statically.
