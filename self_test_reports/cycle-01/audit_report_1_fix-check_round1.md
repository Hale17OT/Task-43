# Issue Fix Verification (Static Recheck)

Reviewed against current repository state (static-only, no runtime execution).

## Results by Previously Reported Issue

1. **Multi-tenant login ambiguity after per-org username change**  
   - **Status:** **Fixed in current source baseline** (with migration-history caveat)  
   - **Why:** `011` no longer switches to `(org_id, username)` uniqueness; comments explicitly preserve global username uniqueness to match username-only login path.  
   - **Evidence:** `backend/src/infrastructure/database/migrations/011_rls_gaps_and_username_uniqueness.ts:4`, `backend/src/application/auth/login-use-case.ts:46`, `backend/src/infrastructure/database/repositories/user-repository.ts:31`

2. **Webhook destination unrestricted (SSRF / egress risk)**  
   - **Status:** **Partially fixed, but replaced by opposite requirement-fit defect**  
   - **Why:** URL validation now blocks localhost/private/internal ranges and non-http(s), so “unrestricted” risk is reduced; however this now blocks prompt-required on-prem/local endpoints.  
   - **Evidence:** `backend/src/api/routes/webhooks.routes.ts:10`, `backend/src/api/routes/webhooks.routes.ts:17`, `backend/src/api/routes/webhooks.routes.ts:35`, `backend/src/infrastructure/webhooks/dispatcher.ts:42`

3. **Frontend session bootstrap fail-open on network errors**  
   - **Status:** **Fixed**  
   - **Why:** On `/api/auth/me` error `status===0`, code now clears in-memory auth user/permissions before marking session ready.  
   - **Evidence:** `frontend/src/app/core/services/auth.service.ts:63`, `frontend/src/app/core/services/auth.service.ts:67`

4. **User creation uniqueness check conflicts with per-org username model**  
   - **Status:** **Fixed in current source baseline**  
   - **Why:** Since uniqueness is now kept global in current migration source, global existence check in `/api/users` is consistent with schema intent.  
   - **Evidence:** `backend/src/infrastructure/database/migrations/011_rls_gaps_and_username_uniqueness.ts:4`, `backend/src/api/routes/users.routes.ts:87`

5. **`system_config.value` JSON handling inconsistent/broken**  
   - **Status:** **Fixed**  
   - **Why:** Insert/update now write native JSON objects (not stringified JSON strings), matching read access pattern `config?.value?.confirmed`.  
   - **Evidence:** `backend/src/infrastructure/database/migrations/001_organizations_and_users.ts:38`, `backend/src/api/routes/admin.routes.ts:14`, `backend/src/api/routes/admin.routes.ts:26`

6. **Missing direct auth route tests**  
   - **Status:** **Partially fixed**  
   - **Why:** New `auth.routes.test.ts` exists and covers key validation/contract checks; however many tests are mock-heavy and do not fully cover real route integration semantics (e.g., complete success/lockout/rate-limit/session revocation flows under app harness).  
   - **Evidence:** `backend/src/api/routes/auth.routes.test.ts:55`, `backend/src/api/routes/auth.routes.test.ts:122`, `backend/src/api/routes/auth.routes.test.ts:175`

7. **Unused Angular scaffold file (`app.component.html`)**  
   - **Status:** **Fixed**  
   - **Why:** File is deleted from current tree; root component remains inline template usage.  
   - **Evidence:** `frontend/src/app/app.component.ts:10` and file absence from git status (`D frontend/src/app/app.component.html`)

8. **Webhook validation blocks required local/on-prem endpoints**  
   - **Status:** **Not fixed (still present)**  
   - **Why:** Validator explicitly denies private/local hosts and private RFC1918 ranges, conflicting with local/on-prem webhook requirement in air-gapped environments.  
   - **Evidence:** `backend/src/api/routes/webhooks.routes.ts:17`, `backend/src/api/routes/webhooks.routes.ts:25`, `backend/src/api/routes/webhooks.routes.ts:35`

9. **Historical migration behavior changed; upgrade-state divergence risk**  
   - **Status:** **Not fixed**  
   - **Why:** Historical migration `011` behavior has been altered in source, but no new forward migration is present to reconcile environments that may already have applied prior `011` logic.  
   - **Evidence:** `backend/src/infrastructure/database/migrations/011_rls_gaps_and_username_uniqueness.ts:4`; migrations list contains no explicit follow-up reconciliation migration beyond `012` (`backend/src/infrastructure/database/migrations/012_add_missing_indexes.ts:1`)

## Net Summary
- **Fully fixed:** 4 issues (3, 5, 7, and baseline consistency portion of 1/4)
- **Partially fixed:** 2 issues (2, 6)
- **Still open:** 2 issues (8, 9)
- **Caveat:** Issue 1/4 are source-consistent now, but deployment state may still vary due to issue 9.
