# JusticeOps Design

## Overview

JusticeOps is a LAN-oriented legal coordination platform with role-based workflows for clients, lawyers, admins, and super admins. The system is split into:

- `frontend/`: Angular standalone SPA (route-level lazy loading, guards, HTTP interceptors).
- `backend/`: Fastify + Knex + PostgreSQL API with layered architecture.
- `e2e/`: Playwright end-to-end suite.

Primary business capabilities include booking lifecycle management, lawyer availability, reviews/disputes, credit scoring, notifications, reporting, configuration dictionaries/workflow steps, webhook dispatch, and background jobs.

## Backend Architecture

Backend code is organized by layers:

- `api/`: Fastify server, route handlers, request schemas (Zod), and security plugins.
- `application/`: Use cases (`login`, `logout`).
- `domain/`: Entities and value objects (`booking`, `review`, `user`, `credit-score`, `password`) plus domain rules.
- `infrastructure/`: Database connection/repositories/migrations/seeds, encryption, logging, webhook dispatcher.
- `workers/`: Polling worker and cron scheduler for async jobs.

Server bootstrap (`backend/src/main.ts`) loads config, runs migrations, conditionally seeds data, starts Fastify, starts worker/scheduler, and handles graceful shutdown.

## Frontend Architecture

Frontend uses Angular standalone components with lazy-loaded feature routes in `frontend/src/app/app.routes.ts`.

- `core/`: auth, guards, interceptors, and typed interfaces.
- `features/`: role-oriented pages (client/lawyer/admin/reviews/reports/notifications).
- `layout/`: shell + sidebar + header.
- `shared/`: reusable components (notification bell, policy banner, star rating, export button, shimmer).

Runtime flow:

- App renders `ShellComponent` (`frontend/src/app/layout/shell/shell.component.ts`).
- `AuthService` validates stored token via `/api/auth/me` before route decisions.
- Guards enforce both role and server-provided permission checks.
- Interceptors attach JWT and normalize error handling.

## Security Model

Security is enforced across API, app, and database layers:

1. JWT auth with 24h expiry (`jwt-auth.plugin.ts`) and per-login session nonce/JTI.
2. Session revocation by nonce validation against `user_sessions` on every authenticated request.
3. RBAC (`authorize.plugin.ts`) at route level.
4. Permission-gated UI routes in frontend (`permissionGuard(...)`).
5. PostgreSQL RLS is the core tenant boundary (migrations `007-009`).
6. Per-request transaction and `SET LOCAL` context vars (`app.current_org_id`, `app.current_role`, `app.current_user_id`, `app.bypass_rls`) via `org-isolation.plugin.ts`.
7. Audit log writes for mutating API calls through `audit.plugin.ts`; table is immutable by DB triggers.
8. Encrypted sensitive fields:
   - booking cancellation reason (`bookings.cancellation_reason_enc`)
   - webhook secrets (`webhook_configs.secret`)

## Data Design (Core Tables)

Main relational entities from migrations:

- Identity/tenancy: `organizations`, `users`, `user_sessions`, `system_config`
- Booking domain: `availability`, `bookings`
- Reputation domain: `reviews`, `disputes`, `credit_score_history`
- Ops domain: `jobs`, `notifications`, `report_subscriptions`
- Integration/config: `webhook_configs`, `config_dictionaries`, `workflow_steps`, `audit_log`
- Platform support: `idempotency_registry`, `rate_limit_buckets`

Notable invariants:

- User role enum: `client | lawyer | admin | super_admin`
- Booking status enum: `pending | confirmed | completed | cancelled | no_show | declined | rescheduled`
- Credit score bounded to `[0,100]`
- One review per booking per reviewer (`unique(booking_id, reviewer_id)`)
- Scoped idempotency key uniqueness: `(key, user_id, method, path)`

## Booking and Credit Rules

Rules are enforced in route/domain logic:

- Booking creation requires idempotency key and passes credit threshold (`CREDIT_THRESHOLD = 20`).
- Consultation conflicts are prevented by advisory lock + conflict check.
- Milestone capacity is protected with advisory lock and lawyer daily capacity checks.
- Late cancellation (within 2h) applies `-5` credit penalty.
- No-show after 10-minute grace applies `-10` penalty.
- Late milestone completion applies `-5` penalty to lawyer.
- 5 on-time completion streak applies `+2` bonus.
- Dispute filing escrows penalties temporarily, then applies or restores based on resolution.

## Reliability and Async Processing

Job infrastructure (`jobs` table + worker + scheduler):

- Polling worker claims jobs in batches (`FOR UPDATE SKIP LOCKED` pattern in repo layer).
- Retries use attempts/max-attempts with backoff (repo logic).
- Supports job idempotency by `idempotency_key`.
- Scheduler enqueues:
  - daily report-generation jobs at 8:00
  - idempotency-vacuum job at 2:00

Webhook dispatch is asynchronous and non-blocking for user-facing flows.

## API Design Characteristics

- Base path: `/api/*`
- Consistent error envelope via global handler:
  - `{ error, message, details?, retryAfterSeconds? }`
- Validation failures return `422 VALIDATION_ERROR` with Zod issue details.
- Pagination pattern on many list endpoints: `page`, `limit` with `{ data, total }`.
- Multi-tenant scoping combines role rules and DB-level RLS.
