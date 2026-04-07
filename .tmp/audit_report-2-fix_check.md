# Issue Recheck (Latest Changes) — Static Only

## 1) High: Sensitive identifier encryption-at-rest only partially implemented
- Status: **Partially fixed (still not fully closed)**
- Fixed evidence:
  - Username encryption + hash lookup implemented: `backend/src/infrastructure/database/repositories/user-repository.ts:71`, `backend/src/infrastructure/database/repositories/user-repository.ts:72`, `backend/src/infrastructure/database/repositories/user-repository.ts:45`
  - Session nonce/token JTI encryption + hash lookup implemented: `backend/src/infrastructure/database/repositories/session-repository.ts:55`, `backend/src/infrastructure/database/repositories/session-repository.ts:57`, `backend/src/infrastructure/database/repositories/session-repository.ts:33`
  - Audit entity ID and IP encrypted before insert: `backend/src/api/plugins/audit.plugin.ts:31`, `backend/src/api/plugins/audit.plugin.ts:34`
  - Schema mismatch for encrypted audit entity ID addressed by migration: `backend/src/infrastructure/database/migrations/017_audit_entity_id_to_text.ts:8`, `backend/src/infrastructure/database/migrations/017_audit_entity_id_to_text.ts:19`
- Remaining gap evidence:
  - Migration backfills hashes but does not encrypt existing plaintext username/session values in-place:
    - `backend/src/infrastructure/database/migrations/016_encrypt_username.ts:20`
    - `backend/src/infrastructure/database/migrations/014_encrypt_session_nonce.ts:16`
  - Repositories still explicitly support legacy plaintext rows (indicates old plaintext can remain):
    - `backend/src/infrastructure/database/repositories/user-repository.ts:12`
    - `backend/src/infrastructure/database/repositories/session-repository.ts:38`
- Recheck conclusion: materially improved, but original finding remains partially open until full at-rest backfill/encryption coverage is completed for existing identifier data.

## 2) High: Org-scoped admins can modify global config dictionary entries
- Status: **Fixed (code-level)**
- Evidence:
  - Route-level update/delete restricted to own org for non-super-admin:
    - `backend/src/api/routes/config.routes.ts:89`
    - `backend/src/api/routes/config.routes.ts:91`
    - `backend/src/api/routes/config.routes.ts:110`
    - `backend/src/api/routes/config.routes.ts:111`
  - RLS `WITH CHECK` added to prevent org-scoped writes to `org_id IS NULL` global rows:
    - `backend/src/infrastructure/database/migrations/015_config_rls_with_check.ts:23`
    - `backend/src/infrastructure/database/migrations/015_config_rls_with_check.ts:26`

## 3) Medium: Lawyer dashboard “today” filter not enforced by backend
- Status: **Fixed**
- Evidence:
  - Frontend sends `date`: `frontend/src/app/features/lawyer/lawyer-dashboard.component.ts:105`
  - Backend supports `date` and maps to day-range `from/to`: `backend/src/api/routes/bookings.routes.ts:37`, `backend/src/api/routes/bookings.routes.ts:39`, `backend/src/api/routes/bookings.routes.ts:40`

## 4) Medium: Weak e2e authorization assertions
- Status: **Fixed**
- Evidence:
  - Client/admin check now rejects admin URL and requires client dashboard: `e2e/tests/01-auth.spec.ts:78`, `e2e/tests/01-auth.spec.ts:80`
  - Lawyer/client check now rejects client URL and requires lawyer dashboard: `e2e/tests/01-auth.spec.ts:91`, `e2e/tests/01-auth.spec.ts:92`

## Final Summary
- Fixed: **3 / 4** (#2, #3, #4)
- Partially fixed / still open: **1 / 4** (#1)

Manual verification required for final closure of #1: confirm all existing production rows are re-encrypted (not just hash-augmented) after migrations.
