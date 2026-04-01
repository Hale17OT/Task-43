# JusticeOps

Legal services coordination platform for LAN-only environments. Manages bookings, availability, reviews, credit scoring, and compliance workflows across Client, Lawyer, and Administrator roles.

## Prerequisites

- Node.js 20+
- Docker & Docker Compose
- (Optional) PostgreSQL 16 for local development without Docker

## Quick Start (Docker)

```bash
# Start all services (PostgreSQL, backend, frontend)
docker compose up --build -d

# Verify
curl http://localhost:4200/api/health
```

- **Frontend:** http://localhost:4200
- **Backend API:** http://localhost:3000 (also proxied via frontend at /api)
- **PostgreSQL:** localhost:5433

### Default Seed Credentials

All seeded users use password `SecurePass1!`:

| Username    | Role        | Organization       |
|-------------|-------------|--------------------|
| superadmin  | super_admin | Justice Partners   |
| admin1      | admin       | Justice Partners   |
| lawyer1     | lawyer      | Justice Partners   |
| lawyer2     | lawyer      | Justice Partners   |
| client1     | client      | Justice Partners   |
| client2     | client      | Justice Partners   |

## Environment Variables

All variables have built-in development defaults. No `.env` file is needed for local development. Override via shell environment or Docker Compose for production:

| Variable       | Default                                              | Description            |
|---------------|------------------------------------------------------|------------------------|
| DATABASE_URL  | postgresql://justiceops:devpassword@localhost:5432/justiceops | PostgreSQL connection |
| JWT_SECRET    | dev-jwt-secret-change-in-production-min32chars       | JWT signing key        |
| ENCRYPTION_KEY| dev-encryption-key-change-in-prd                         | AES encryption key     |
| NODE_ENV      | development                                          | Environment            |
| PORT          | 3000                                                 | Backend port           |

## Quick Start (Local, no Docker)

Requires a local PostgreSQL 16 instance.

```bash
# 1. Create database and user
psql -U postgres -c "CREATE USER justiceops WITH PASSWORD 'devpassword';"
psql -U postgres -c "CREATE DATABASE justiceops OWNER justiceops;"
psql -U postgres -c "CREATE EXTENSION IF NOT EXISTS \"uuid-ossp\";" -d justiceops

# 2. Install dependencies, migrate, seed, and start backend
# All config has sensible development defaults — no .env file needed.
cd backend
npm install
npm run migrate
npm run seed
npm run dev            # Starts on http://localhost:3000

# 4. In a second terminal — install and start frontend
cd frontend
npm install --legacy-peer-deps
npm start              # Starts on http://localhost:4200
# Dev server proxies /api/* to backend on :3000 via proxy.conf.json
```

### Smoke Test (no Docker)

```bash
# Health check
curl http://localhost:3000/api/health

# Login
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin1","password":"SecurePass1!"}'
```

## Running Tests

### Backend Tests
```bash
cd backend
npm install
npm test                    # All tests (real-DB tests skip gracefully without DATABASE_URL)
npm run test:unit           # Domain/application only
npm run test:integration    # Infrastructure/API — REQUIRES DATABASE_URL (hard-fails if missing)
npm run test:db             # Real-DB security tests only — REQUIRES DATABASE_URL
```

**Behavior difference:**
- `npm test` — runs all suites; real-DB tests are **skipped** when `DATABASE_URL` is not set (safe for local dev iteration).
- `npm run test:integration` — runs infrastructure + API tests and **hard-fails** when `DATABASE_URL` is not set (mandatory release gate).
- `npm run test:db` — runs only the real-DB security suite and **hard-fails** without `DATABASE_URL`.

### Running Real-DB Integration Tests

Security-critical tests (session revocation, RLS tenant isolation, idempotency TTL, advisory lock concurrency) require a real PostgreSQL instance:

```bash
cd backend
DATABASE_URL=postgresql://justiceops:devpassword@localhost:5432/justiceops npm run test:integration
```

These tests are **mandatory for release**. CI pipelines must provide `DATABASE_URL` and run `test:integration`.

### Frontend Unit Tests
```bash
cd frontend
npm install --legacy-peer-deps
npm test -- --watch=false --browsers=ChromeHeadless
```

### E2E Tests (Playwright)

Requires the full stack running via Docker:

```bash
docker compose up --build -d

cd e2e
npm install
npx playwright install chromium
npx playwright test
```

## Architecture

```
backend/
  src/
    api/          # Fastify routes, plugins (JWT, RBAC, RLS, audit, rate-limit), Zod schemas
    application/  # Use cases (login, logout)
    domain/       # Entities, value objects, repository ports
    infrastructure/ # Knex repositories, migrations, seeds, encryption, logging
    config/       # App configuration, credit rules
    workers/      # Job worker (poll-based), cron scheduler
frontend/
  src/app/
    core/         # Auth service, guards, interceptors, models
    features/     # Client, Lawyer, Admin, Reviews, Reports, Notifications
    layout/       # Shell, sidebar, header
    shared/       # Star rating, shimmer loader, policy banner, notification bell
e2e/
  tests/          # Playwright specs (auth, client, lawyer, admin, reviews, security)
```

### Key Design Decisions

- **Row-Level Security (RLS):** PostgreSQL policies enforce org/user isolation at the DB level. The org-isolation Fastify plugin sets session variables per request.
- **Token Bucket Rate Limiting:** Per-user (20/min) and per-org (200/min) limits on booking creation.
- **Idempotency:** Booking creation uses client-generated idempotency keys to prevent duplicates.
- **Credit Score System:** Automated penalties (no-show: -10, late cancel: -5) and bonuses (5-streak: +2) with dispute escrow.
- **Session Nonce:** Each login generates a unique session nonce; new logins revoke previous sessions.
- **Job Queue:** PostgreSQL-backed with `FOR UPDATE SKIP LOCKED`, exponential backoff, dead letter after max attempts.
