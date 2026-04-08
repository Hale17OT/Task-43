# Newest Recheck - Prior Issue Status

Static recheck against the newest changes currently in the working tree.

## Verification

1) **High - Multi-tenant login ambiguity after per-org username change**  
**Status:** Fixed  
**Why:** Login lookup is deterministic/global via username hash, with global uniqueness intent preserved in migration path.  
**Evidence:** `backend/src/application/auth/login-use-case.ts:46`, `backend/src/infrastructure/database/repositories/user-repository.ts:41`, `backend/src/infrastructure/database/migrations/013_enforce_global_username_uniqueness.ts:4`, `backend/src/infrastructure/database/migrations/016_encrypt_username.ts:27`

2) **High - Webhook destination unrestricted (SSRF/data egress)**  
**Status:** Fixed (for the originally reported condition), with residual risk posture caveat  
**Why:** Validation is no longer plain `z.string().url()`; URL safety checks now include scheme enforcement, blocked metadata targets, DNS resolution, and dispatch-time revalidation.  
**Evidence:** `backend/src/api/routes/webhooks.routes.ts:5`, `backend/src/api/routes/webhooks.routes.ts:7`, `backend/src/api/routes/webhooks.routes.ts:75`, `backend/src/infrastructure/webhooks/url-validator.ts:30`, `backend/src/infrastructure/webhooks/dispatcher.ts:40`  
**Caveat:** Policy still permits many hosts by design (to support on-prem/LAN).

3) **Medium - Frontend session bootstrap fail-open on network errors**  
**Status:** Fixed  
**Evidence:** `frontend/src/app/core/services/auth.service.ts:63`, `frontend/src/app/core/services/auth.service.ts:67`, `frontend/src/app/core/services/auth.service.ts:68`

4) **Medium - User creation uniqueness check conflicts with per-org model**  
**Status:** Fixed  
**Why:** Current model is not per-org uniqueness; route check and DB uniqueness strategy are aligned.  
**Evidence:** `backend/src/api/routes/users.routes.ts:87`, `backend/src/infrastructure/database/migrations/013_enforce_global_username_uniqueness.ts:26`, `backend/src/infrastructure/database/migrations/016_encrypt_username.ts:27`

5) **Medium - `system_config.value` JSON handling inconsistent/broken**  
**Status:** Fixed  
**Evidence:** `backend/src/infrastructure/database/migrations/001_organizations_and_users.ts:38`, `backend/src/api/routes/admin.routes.ts:14`, `backend/src/api/routes/admin.routes.ts:26`

6) **Medium - Missing direct auth route test coverage**  
**Status:** Fixed (existence and baseline contract checks)  
**Evidence:** `backend/src/api/routes/auth.routes.test.ts:1`, `backend/src/api/routes/auth.routes.test.ts:61`, `backend/src/api/routes/auth.routes.test.ts:155`, `backend/src/api/routes/auth.routes.test.ts:177`

7) **Low - Unused Angular scaffold file**  
**Status:** Fixed  
**Evidence:** `frontend/src/app/app.component.html` is absent; root still uses inline template at `frontend/src/app/app.component.ts:10`

8) **High - Webhook validation blocks required local/on-prem endpoints**  
**Status:** Fixed  
**Why:** Validator explicitly allows private/LAN/localhost and only blocks metadata/link-local abuse targets.  
**Evidence:** `backend/src/infrastructure/webhooks/url-validator.ts:11`, `backend/src/infrastructure/webhooks/url-validator.ts:21`, `backend/src/infrastructure/webhooks/url-validator.ts:42`

9) **Medium - Historical migration behavior changed; upgrade divergence risk**  
**Status:** Fixed (statically addressed)  
**Evidence:** forward reconciliation migration exists to normalize uniqueness state: `backend/src/infrastructure/database/migrations/013_enforce_global_username_uniqueness.ts:15`, `backend/src/infrastructure/database/migrations/013_enforce_global_username_uniqueness.ts:17`, `backend/src/infrastructure/database/migrations/013_enforce_global_username_uniqueness.ts:26`

## Final tally
- Fixed: 1, 2, 3, 4, 5, 6, 7, 8, 9
- No previously listed item remains open based on static evidence in current source.
