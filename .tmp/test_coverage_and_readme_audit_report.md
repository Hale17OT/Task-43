# Test Coverage Audit

## Backend Endpoint Inventory

Static source of truth:

- `backend/src/api/server.ts`
- `backend/src/api/routes/*.routes.ts`

Total unique endpoints (`METHOD + PATH`): **58**

1. `GET /api/health`
2. `GET /api/time`
3. `POST /api/auth/login`
4. `POST /api/auth/logout`
5. `GET /api/auth/me`
6. `GET /api/users`
7. `POST /api/users`
8. `PATCH /api/users/:id`
9. `DELETE /api/users/:id`
10. `GET /api/organizations`
11. `POST /api/organizations`
12. `PATCH /api/organizations/:id`
13. `GET /api/lawyers`
14. `GET /api/availability`
15. `POST /api/availability`
16. `PATCH /api/availability/:id`
17. `DELETE /api/availability/:id`
18. `GET /api/bookings`
19. `GET /api/bookings/:id`
20. `POST /api/bookings`
21. `PATCH /api/bookings/:id/confirm`
22. `PATCH /api/bookings/:id/decline`
23. `PATCH /api/bookings/:id/cancel`
24. `PATCH /api/bookings/:id/complete`
25. `PATCH /api/bookings/:id/no-show`
26. `PATCH /api/bookings/:id/reschedule`
27. `GET /api/reviews`
28. `POST /api/reviews`
29. `GET /api/disputes`
30. `POST /api/disputes`
31. `PATCH /api/disputes/:id/resolve`
32. `GET /api/credit/:userId`
33. `GET /api/notifications`
34. `PATCH /api/notifications/:id/read`
35. `PATCH /api/notifications/read-all`
36. `GET /api/jobs`
37. `GET /api/jobs/:id`
38. `GET /api/reports/dashboard`
39. `GET /api/reports/export`
40. `GET /api/report-subscriptions`
41. `POST /api/report-subscriptions`
42. `PATCH /api/report-subscriptions/:id`
43. `DELETE /api/report-subscriptions/:id`
44. `GET /api/admin/system-status`
45. `POST /api/admin/confirm-key-backup`
46. `GET /api/admin/audit-log`
47. `GET /api/webhooks`
48. `POST /api/webhooks`
49. `PATCH /api/webhooks/:id`
50. `POST /api/webhooks/:id/rotate-secret`
51. `GET /api/config/dictionaries`
52. `POST /api/config/dictionaries`
53. `PATCH /api/config/dictionaries/:id`
54. `DELETE /api/config/dictionaries/:id`
55. `GET /api/config/workflow-steps`
56. `POST /api/config/workflow-steps`
57. `PATCH /api/config/workflow-steps/:id`
58. `DELETE /api/config/workflow-steps/:id`

## API Test Mapping Table

Legend:

- `true no-mock HTTP`: real HTTP layer and no mocking in route execution path.
- `HTTP with mocking`: HTTP-style test with mocked DB/dependencies.

| Endpoint | Covered | Test type | Test files | Evidence |
|---|---|---|---|---|
| `GET /api/health` | yes | true no-mock HTTP | `e2e/tests/08-api-security.spec.ts` | `health endpoint is publicly accessible` |
| `GET /api/time` | yes | true no-mock HTTP | `e2e/tests/08-api-security.spec.ts` | `time sync endpoint is publicly accessible` |
| `POST /api/auth/login` | yes | true no-mock HTTP | `backend/src/api/routes/real-db-integration.test.ts`, `e2e/tests/12-lockout-policy.spec.ts` | `session revocation...` test uses real `/api/auth/login` |
| `POST /api/auth/logout` | yes | true no-mock HTTP | `e2e/tests/14-full-platform-walkthrough-video.spec.ts` | cleanup step posts logout |
| `GET /api/auth/me` | yes | true no-mock HTTP | `backend/src/api/routes/real-db-integration.test.ts`, `e2e/tests/helpers.ts` | auth helper validates `/api/auth/me` |
| `GET /api/users` | yes | true no-mock HTTP | `e2e/tests/10-api-integrity.spec.ts` | sanitization test hits endpoint |
| `POST /api/users` | yes | true no-mock HTTP | `e2e/tests/14-full-platform-walkthrough-video.spec.ts` | walkthrough user create |
| `PATCH /api/users/:id` | yes | true no-mock HTTP | `e2e/tests/14-full-platform-walkthrough-video.spec.ts` | walkthrough user patch |
| `DELETE /api/users/:id` | yes | true no-mock HTTP | `e2e/tests/14-full-platform-walkthrough-video.spec.ts` | cleanup step deletes user |
| `GET /api/organizations` | yes | true no-mock HTTP | `e2e/tests/08-api-security.spec.ts` | super-admin access check |
| `POST /api/organizations` | yes | true no-mock HTTP | `e2e/tests/14-full-platform-walkthrough-video.spec.ts` | walkthrough org create |
| `PATCH /api/organizations/:id` | yes | true no-mock HTTP | `e2e/tests/14-full-platform-walkthrough-video.spec.ts` | walkthrough org patch |
| `GET /api/lawyers` | yes | true no-mock HTTP | `e2e/tests/15-lawyers-directory.spec.ts` | full endpoint suite with auth + payload checks |
| `GET /api/availability` | yes | true no-mock HTTP | `e2e/tests/14-full-platform-walkthrough-video.spec.ts` | walkthrough availability list |
| `POST /api/availability` | yes | true no-mock HTTP | `e2e/tests/14-full-platform-walkthrough-video.spec.ts` | walkthrough availability create |
| `PATCH /api/availability/:id` | yes | true no-mock HTTP | `e2e/tests/14-full-platform-walkthrough-video.spec.ts` | walkthrough availability patch |
| `DELETE /api/availability/:id` | yes | true no-mock HTTP | `e2e/tests/14-full-platform-walkthrough-video.spec.ts` | walkthrough availability delete |
| `GET /api/bookings` | yes | true no-mock HTTP | `backend/src/api/routes/real-db-integration.test.ts`, `e2e/tests/08-api-security.spec.ts` | real-db RLS test and security test |
| `GET /api/bookings/:id` | yes | true no-mock HTTP | `e2e/tests/14-full-platform-walkthrough-video.spec.ts` | walkthrough booking-by-id |
| `POST /api/bookings` | yes | true no-mock HTTP | `backend/src/api/routes/real-db-integration.test.ts`, `e2e/tests/10-api-integrity.spec.ts` | idempotency tests |
| `PATCH /api/bookings/:id/confirm` | yes | true no-mock HTTP | `e2e/tests/04-lawyer-flow.spec.ts` | confirm flow |
| `PATCH /api/bookings/:id/decline` | yes | true no-mock HTTP | `e2e/tests/04-lawyer-flow.spec.ts` | decline flow |
| `PATCH /api/bookings/:id/cancel` | yes | true no-mock HTTP | `e2e/tests/14-full-platform-walkthrough-video.spec.ts` | cancel call |
| `PATCH /api/bookings/:id/complete` | yes | true no-mock HTTP | `e2e/tests/04-lawyer-flow.spec.ts` | complete flow |
| `PATCH /api/bookings/:id/no-show` | yes | true no-mock HTTP | `e2e/tests/14-full-platform-walkthrough-video.spec.ts` | no-show call |
| `PATCH /api/bookings/:id/reschedule` | yes | true no-mock HTTP | `e2e/tests/10-api-integrity.spec.ts` | reschedule idempotency test |
| `GET /api/reviews` | yes | true no-mock HTTP | `e2e/tests/08-api-security.spec.ts` | query access controls |
| `POST /api/reviews` | yes | true no-mock HTTP | `e2e/tests/14-full-platform-walkthrough-video.spec.ts` | review creation |
| `GET /api/disputes` | yes | true no-mock HTTP | `e2e/tests/09-arbitration-subscriptions.spec.ts` | disputes query tests |
| `POST /api/disputes` | yes | true no-mock HTTP | `e2e/tests/09-arbitration-subscriptions.spec.ts` | dispute creation |
| `PATCH /api/disputes/:id/resolve` | yes | true no-mock HTTP | `e2e/tests/09-arbitration-subscriptions.spec.ts` | dispute resolution |
| `GET /api/credit/:userId` | yes | true no-mock HTTP | `e2e/tests/14-full-platform-walkthrough-video.spec.ts` | credit calls |
| `GET /api/notifications` | yes | true no-mock HTTP | `e2e/tests/14-full-platform-walkthrough-video.spec.ts` | notifications list |
| `PATCH /api/notifications/:id/read` | yes | true no-mock HTTP | `e2e/tests/14-full-platform-walkthrough-video.spec.ts` | mark read |
| `PATCH /api/notifications/read-all` | yes | true no-mock HTTP | `e2e/tests/14-full-platform-walkthrough-video.spec.ts` | mark all read |
| `GET /api/jobs` | yes | true no-mock HTTP | `e2e/tests/14-full-platform-walkthrough-video.spec.ts` | jobs list |
| `GET /api/jobs/:id` | yes | true no-mock HTTP | `e2e/tests/14-full-platform-walkthrough-video.spec.ts` | job detail |
| `GET /api/reports/dashboard` | yes | true no-mock HTTP | `e2e/tests/14-full-platform-walkthrough-video.spec.ts` | dashboard metrics call |
| `GET /api/reports/export` | yes | true no-mock HTTP | `e2e/tests/14-full-platform-walkthrough-video.spec.ts` | export csv/xlsx |
| `GET /api/report-subscriptions` | yes | true no-mock HTTP | `e2e/tests/14-full-platform-walkthrough-video.spec.ts` | subscriptions list |
| `POST /api/report-subscriptions` | yes | true no-mock HTTP | `e2e/tests/09-arbitration-subscriptions.spec.ts` | subscription create |
| `PATCH /api/report-subscriptions/:id` | yes | true no-mock HTTP | `e2e/tests/09-arbitration-subscriptions.spec.ts` | subscription update |
| `DELETE /api/report-subscriptions/:id` | yes | true no-mock HTTP | `e2e/tests/09-arbitration-subscriptions.spec.ts` | subscription delete |
| `GET /api/admin/system-status` | yes | true no-mock HTTP | `e2e/tests/14-full-platform-walkthrough-video.spec.ts` | system-status call |
| `POST /api/admin/confirm-key-backup` | yes | true no-mock HTTP | `e2e/tests/14-full-platform-walkthrough-video.spec.ts` | key backup confirm call |
| `GET /api/admin/audit-log` | yes | true no-mock HTTP | `e2e/tests/14-full-platform-walkthrough-video.spec.ts` | audit-log call |
| `GET /api/webhooks` | yes | true no-mock HTTP | `e2e/tests/14-full-platform-walkthrough-video.spec.ts` | webhook list |
| `POST /api/webhooks` | yes | true no-mock HTTP | `e2e/tests/14-full-platform-walkthrough-video.spec.ts` | webhook create |
| `PATCH /api/webhooks/:id` | yes | true no-mock HTTP | `e2e/tests/14-full-platform-walkthrough-video.spec.ts` | webhook patch |
| `POST /api/webhooks/:id/rotate-secret` | yes | true no-mock HTTP | `e2e/tests/14-full-platform-walkthrough-video.spec.ts` | rotate secret |
| `GET /api/config/dictionaries` | yes | true no-mock HTTP | `e2e/tests/14-full-platform-walkthrough-video.spec.ts` | dictionaries list |
| `POST /api/config/dictionaries` | yes | true no-mock HTTP | `e2e/tests/14-full-platform-walkthrough-video.spec.ts` | dictionary create |
| `PATCH /api/config/dictionaries/:id` | yes | true no-mock HTTP | `e2e/tests/14-full-platform-walkthrough-video.spec.ts` | dictionary patch |
| `DELETE /api/config/dictionaries/:id` | yes | true no-mock HTTP | `e2e/tests/14-full-platform-walkthrough-video.spec.ts` | dictionary delete |
| `GET /api/config/workflow-steps` | yes | true no-mock HTTP | `e2e/tests/14-full-platform-walkthrough-video.spec.ts` | workflow list |
| `POST /api/config/workflow-steps` | yes | true no-mock HTTP | `e2e/tests/14-full-platform-walkthrough-video.spec.ts` | workflow create |
| `PATCH /api/config/workflow-steps/:id` | yes | true no-mock HTTP | `e2e/tests/14-full-platform-walkthrough-video.spec.ts` | workflow patch |
| `DELETE /api/config/workflow-steps/:id` | yes | true no-mock HTTP | `e2e/tests/14-full-platform-walkthrough-video.spec.ts` | workflow delete |

## Coverage Summary

- Total endpoints: **58**
- Endpoints with HTTP tests: **58**
- Endpoints with TRUE no-mock tests: **58**
- HTTP coverage %: **100.00%**
- True API coverage %: **100.00%**

## Unit Test Summary

Unit/non-HTTP test files include:

- `backend/src/application/auth/login-use-case.test.ts`
- `backend/src/application/auth/logout-use-case.test.ts`
- `backend/src/domain/entities/user.test.ts`
- `backend/src/domain/entities/booking.test.ts`
- `backend/src/domain/value-objects/password.test.ts`
- `backend/src/domain/value-objects/credit-score.test.ts`
- `backend/src/infrastructure/encryption/encryption.test.ts`
- `backend/src/workers/job-worker.test.ts`
- `backend/src/workers/scheduler.test.ts`
- `backend/src/api/routes/auth.routes.test.ts` (direct route handler invocation)
- `backend/src/api/plugins/authorize.plugin.test.ts`
- `backend/src/api/plugins/rate-limit.plugin.test.ts`
- `backend/src/api/plugins/org-isolation.plugin.test.ts`
- `backend/src/api/plugins/jwt-auth.plugin.test.ts`

Covered module classes:

- Controllers/routes: full breadth (all route families have dedicated route tests).
- Services/use-cases: login + logout use cases.
- Repositories: mainly indirect through route/e2e tests; direct repository unit tests not found.
- Auth/guards/middleware/plugins: now includes direct tests for `authorize`, `rate-limit`, `org-isolation` contract, and `jwt-auth` contract.

Important modules still not directly tested:

- `backend/src/api/plugins/audit.plugin.ts` (no dedicated test file found).
- `backend/src/infrastructure/database/repositories/*.ts` direct unit suites not found.

## Tests Check

- **API test classification**
  1. True no-mock HTTP: Playwright endpoint tests (`e2e/tests/*.spec.ts`) and real DB tests (`backend/src/api/routes/real-db-integration.test.ts`).
  2. HTTP with mocking: backend route tests built on `buildTestApp` + in-memory `createMockDb` (`backend/src/api/test-helpers.ts`).
  3. Non-HTTP: unit/plugin tests and direct handler tests.

- **Mock detection**
  - `vi.mock('bcrypt', ...)` in `backend/src/application/auth/login-use-case.test.ts`.
  - In-memory DB/test harness mocks in `backend/src/api/test-helpers.ts` (`createMockDb`, mocked query chain, mocked `db.raw`).
  - Direct handler bypass in `backend/src/api/routes/auth.routes.test.ts` (`createMockApp`, direct `handler` invocation).

- **Depth/sufficiency**
  - Success paths: strong across all endpoint families.
  - Failure/validation/authz: strong with explicit 401/403/404/409/422 assertions across route/e2e suites.
  - Security/edge: present (lockout, session revocation, idempotency TTL, advisory lock, role isolation).
  - Remaining weakness: some broad walkthrough checks still use `res.ok()` with limited payload assertions in `e2e/tests/14-full-platform-walkthrough-video.spec.ts`.

- **Observability check**
  - Strong examples: `e2e/tests/15-lawyers-directory.spec.ts` and route suites with explicit payload key assertions.
  - Weak zones: walkthrough test sections where request/response semantics are not deeply asserted.

- **`run_tests.sh` check**
  - Docker mode remains the default and audit-compliant (`run_tests.sh:67-95`) - **OK**.
  - Local mode now hard-gated by `JUSTICEOPS_ALLOW_LOCAL=1` and still enforces `DATABASE_URL` for integration (`run_tests.sh:23-35`, `run_tests.sh:48-56`) - **improved; acceptable under strict governance guardrails**.

- **End-to-end expectation**
  - Fullstack FE<->BE tests exist and cover API paths extensively.
  - Endpoint-level true no-mock coverage is complete.

## Test Coverage Score (0-100)

**94 / 100**

## Score Rationale

- Full endpoint HTTP coverage and full true no-mock API endpoint coverage.
- New direct tests for plugins and logout use case closed prior gaps.
- Score not perfect due to shallow assertion depth in parts of the long walkthrough and missing direct repository + audit-plugin unit suites.

## Key Gaps

1. Add direct tests for `backend/src/api/plugins/audit.plugin.ts`.
2. Add direct repository-level tests for critical data-access classes.
3. Increase semantic response assertions in walkthrough e2e sequences.

## Confidence & Assumptions

- Confidence: **high**.
- Assumptions:
  - Static inspection only; no runtime execution.
  - Endpoint counted only with explicit request evidence for exact `METHOD + PATH`.
  - UI-only actions without explicit endpoint calls were not counted.

# README Audit

## High Priority Issues

- None.

## Medium Priority Issues

- Command style is mixed (`docker-compose` vs `docker compose`) across examples (`README.md:19`, `README.md:104-114`, `README.md:160-162`), which can cause minor operator confusion.

## Low Priority Issues

- Troubleshooting command uses `tail` (`README.md:154-155`), which is shell-dependent on some Windows environments.

## Hard Gate Failures

- None.

Hard-gate checks:

- Project type declaration at top: **PASS** (`README.md:3`, fullstack).
- Required location `repo/README.md`: **PASS**.
- Startup includes `docker-compose up`: **PASS** (`README.md:19`).
- Access method with URL + port: **PASS** (`README.md:44-50`).
- Verification method: **PASS** (`README.md:55-68`, plus browser login step at `README.md:70`).
- Environment rules (no runtime local installs/manual DB setup): **PASS** (Docker-only guidance).
- Demo credentials with roles + password: **PASS** (`README.md:72-84`).

## README Verdict (PASS / PARTIAL PASS / FAIL)

**PASS**
