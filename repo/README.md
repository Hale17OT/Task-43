# JusticeOps

**Project type:** fullstack (backend + frontend + PostgreSQL + E2E)

Legal services coordination platform. Manages bookings, availability, reviews, credit scoring, and compliance workflows across Client, Lawyer, and Administrator roles.

Docker is the required runtime for this project. All development, testing, and demo flows run inside containers via Docker Compose — no local Node.js or PostgreSQL install is expected or supported.

## Prerequisites

- Docker Engine 24+
- Docker Compose v2 (bundled with Docker Desktop)

That is the complete list. No Node.js, no npm, no local PostgreSQL.

## Quick Start

```bash
docker-compose up
```

That single command builds and starts PostgreSQL, the backend API, and the Angular frontend. First build takes a few minutes while images compile; subsequent starts are fast.

To run detached:

```bash
docker-compose up -d
```

To shut down:

```bash
docker-compose down
```

To reset state (database volume, built images):

```bash
docker-compose down -v
```

## Access

| Service             | URL                          | Port |
|---------------------|------------------------------|------|
| Frontend (Angular)  | http://localhost:4200        | 4200 |
| Backend API (direct)| http://localhost:3000        | 3000 |
| Backend API (proxy) | http://localhost:4200/api    | 4200 |
| PostgreSQL          | localhost:5433               | 5433 |

The frontend proxies `/api/*` to the backend, so the browser only needs port 4200.

## Verification

After `docker-compose up`, confirm the stack is healthy:

```bash
# Health check (via frontend proxy)
curl http://localhost:4200/api/health

# Time endpoint (public)
curl http://localhost:4200/api/time

# Login as a seeded user
curl -X POST http://localhost:4200/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin1","password":"SecurePass1!"}'
```

Open http://localhost:4200 in a browser and log in with any seeded credential below.

## Demo Credentials

All seeded users share the password `SecurePass1!`:

| Username    | Role        | Organization     |
|-------------|-------------|------------------|
| superadmin  | super_admin | Justice Partners |
| admin1      | admin       | Justice Partners |
| lawyer1     | lawyer      | Justice Partners |
| lawyer2     | lawyer      | Justice Partners |
| client1     | client      | Justice Partners |
| client2     | client      | Justice Partners |

## Testing

All tests run inside Docker. Use the provided script from the repo root:

```bash
./run_tests.sh
```

The script:

1. Runs backend **unit tests** inside the `backend` container.
2. Runs backend **integration tests** inside the `backend` container with `REQUIRE_DB_TESTS=1` — real-DB security tests (RLS, session revocation, idempotency TTL, advisory locks) are a mandatory gate.
3. Runs **frontend unit tests** in a dedicated `frontend-test` image (Karma + headless Chromium).
4. Runs **E2E tests** (Playwright) in a dedicated `e2e` image against the live stack.

Individual suites (stack must already be up via `docker-compose up -d`):

```bash
# Backend unit tests
docker compose exec -T backend npx vitest run src/domain src/application

# Backend integration tests (real PostgreSQL)
docker compose exec -T -e REQUIRE_DB_TESTS=1 backend npx vitest run src/infrastructure src/api

# Frontend unit tests
docker compose run --rm frontend-test

# E2E tests (Playwright)
docker compose run --rm e2e
```

The integration suite hard-fails if the real-DB gate is not set; this is intentional and prevents silent loss of security-critical coverage.

## Architecture

```
backend/     Fastify API (routes, plugins, Zod schemas, use cases, Knex repositories, workers)
frontend/    Angular 19 SPA (role-scoped features, shell, routing)
e2e/         Playwright specs driving the live stack over HTTP
docker-compose.yml     PostgreSQL 16 + backend + frontend + test profiles
```

Services declared in `docker-compose.yml`:

- `db` — PostgreSQL 16 (alpine), volume `pgdata`, healthcheck gates dependents.
- `backend` — Fastify on port 3000; runs migrations and seeds at startup.
- `frontend` — nginx serving the built Angular bundle; proxies `/api/*` to `backend`.
- `frontend-test` — test profile; headless Chromium + Karma for Angular unit tests.
- `e2e` — test profile; Playwright + Chromium driving the live stack.

## Key Design Decisions

- **Row-Level Security (RLS):** PostgreSQL policies enforce org and user isolation at the DB layer; the Fastify `org-isolation` plugin sets session variables per request.
- **Token bucket rate limiting:** Per-user (20/min) and per-org (200/min) limits on booking creation.
- **Idempotency:** Booking creation uses client-generated idempotency keys with a TTL-backed registry.
- **Credit score system:** Automated penalties (no-show: -10, late cancel: -5) and bonuses (5-streak: +2) with dispute escrow.
- **Session nonce:** Each login generates a unique session nonce; a new login revokes the previous session.
- **Job queue:** PostgreSQL-backed with `FOR UPDATE SKIP LOCKED`, exponential backoff, and a dead-letter path after max attempts.

## Troubleshooting

All commands below are Docker-first.

**"Port already in use"** — another process is bound to 3000, 4200, or 5433. Stop it, or edit the port mapping in `docker-compose.yml`.

**Frontend can't reach the backend** — confirm services are up:

```bash
docker compose ps
docker compose logs backend | tail -50
```

**Reset everything (drop database, rebuild images)**:

```bash
docker-compose down -v
docker-compose up --build
```

**Inspect database state**:

```bash
docker compose exec db psql -U justiceops -d justiceops -c "SELECT username, role FROM users;"
```

**E2E test artifacts (screenshots, traces)** land under `e2e/test-results/` after a run. Copy them out of the container workspace if needed.

**Migrations or seeds failed at startup** — check backend logs:

```bash
docker compose logs backend
```

The backend container runs migrations and seeds on boot; a failure there will prevent the API from listening.
