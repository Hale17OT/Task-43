# Issue Fix Verification After Newest Changes (Static)

Reassessed against current working tree only (no runtime/test execution).

## Status per reported issue

1. **High — Multi-tenant login ambiguity after per-org username change**  
   **Result:** **Fixed**  
   **Evidence:** Global username uniqueness is explicitly preserved (`backend/src/infrastructure/database/migrations/011_rls_gaps_and_username_uniqueness.ts:4`), login still resolves by username (`backend/src/application/auth/login-use-case.ts:46`), repo lookup matches that (`backend/src/infrastructure/database/repositories/user-repository.ts:31`).

2. **High — Webhook destination unrestricted (SSRF/data egress risk)**  
   **Result:** **Partially Fixed**  
   **Evidence:** URL is no longer plain `z.string().url()`; it now uses refined validation with scheme checks and metadata endpoint blocking (`backend/src/api/routes/webhooks.routes.ts:16`, `backend/src/api/routes/webhooks.routes.ts:30`).  
   **Note:** This is improved but still not a strict allowlist/CIDR policy as originally recommended.

3. **Medium — Frontend session bootstrap fail-open on network errors**  
   **Result:** **Fixed**  
   **Evidence:** On `/api/auth/me` network error, trusted local auth state is cleared before ready signal (`frontend/src/app/core/services/auth.service.ts:63`, `frontend/src/app/core/services/auth.service.ts:67`).

4. **Medium — User creation uniqueness check conflicts with per-org username model**  
   **Result:** **Fixed**  
   **Evidence:** Current schema intent is global uniqueness (not per-org), so global existence check is consistent (`backend/src/infrastructure/database/migrations/011_rls_gaps_and_username_uniqueness.ts:4`, `backend/src/api/routes/users.routes.ts:87`).

5. **Medium — `system_config.value` JSON handling inconsistent/broken**  
   **Result:** **Fixed**  
   **Evidence:** Native JSON object stored in migration and update paths (`backend/src/infrastructure/database/migrations/001_organizations_and_users.ts:38`, `backend/src/api/routes/admin.routes.ts:26`), read path expects object (`backend/src/api/routes/admin.routes.ts:14`).

6. **Medium — Missing direct auth route tests**  
   **Result:** **Fixed (baseline), quality gap remains**  
   **Evidence:** Dedicated route test file now exists (`backend/src/api/routes/auth.routes.test.ts:1`) with login validation and route-guard checks (`backend/src/api/routes/auth.routes.test.ts:55`, `backend/src/api/routes/auth.routes.test.ts:148`).  
   **Note:** Coverage depth is still moderate due heavy mocking.

7. **Low — Unused Angular scaffold file**  
   **Result:** **Fixed**  
   **Evidence:** `frontend/src/app/app.component.html` removed from current tree; root component uses inline template (`frontend/src/app/app.component.ts:10`).

8. **High — Webhook validation blocks local/on-prem endpoints**  
   **Result:** **Fixed**  
   **Evidence:** Validator now explicitly allows private/LAN/local destinations and only blocks cloud metadata endpoints (`backend/src/api/routes/webhooks.routes.ts:7`, `backend/src/api/routes/webhooks.routes.ts:23`, `backend/src/api/routes/webhooks.routes.ts:31`).

9. **Medium — Historical migration behavior changed; upgrade-state divergence risk**  
   **Result:** **Fixed (statically addressed)**  
   **Evidence:** New reconciliation migration added to normalize constraint state across histories (`backend/src/infrastructure/database/migrations/013_enforce_global_username_uniqueness.ts:4`, `backend/src/infrastructure/database/migrations/013_enforce_global_username_uniqueness.ts:17`, `backend/src/infrastructure/database/migrations/013_enforce_global_username_uniqueness.ts:26`).  
   **Manual verification required:** confirm migration executes successfully on previously migrated environments.

## Summary
- **Fixed:** 1, 3, 4, 5, 6 (baseline), 7, 8, 9
- **Partially fixed:** 2 (improved validation, not full allowlist/CIDR hardening)
