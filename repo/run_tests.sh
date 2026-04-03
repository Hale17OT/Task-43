#!/bin/bash
set -e

echo "=== JusticeOps Test Suite ==="
echo ""

# Detect execution mode: Docker or Local
# Pass --local to run without Docker, or set USE_LOCAL=1.
USE_LOCAL="${USE_LOCAL:-0}"
if [[ "$1" == "--local" ]]; then
  USE_LOCAL=1
fi

FAILED=0

if [[ "$USE_LOCAL" == "1" ]]; then
  echo "Running in LOCAL mode"
  echo ""

  echo "[1/4] Backend Unit Tests..."
  (cd backend && npx vitest run src/domain src/application 2>&1) || FAILED=1
  echo ""

  echo "[2/4] Backend Integration Tests..."
  if [ -z "$DATABASE_URL" ]; then
    echo "WARNING: DATABASE_URL not set — real-DB tests will be skipped."
    echo "For release validation, set DATABASE_URL and re-run."
    (cd backend && npx vitest run src/infrastructure src/api 2>&1) || FAILED=1
  else
    echo "DATABASE_URL set — running with REQUIRE_DB_TESTS=1 (mandatory gate)."
    (cd backend && REQUIRE_DB_TESTS=1 npx vitest run src/infrastructure src/api 2>&1) || FAILED=1
  fi
  echo ""

  echo "[3/4] Frontend Unit Tests..."
  (cd frontend && npx ng test --watch=false --browsers=ChromeHeadless 2>&1) || FAILED=1
  echo ""

  echo "[4/4] E2E Tests (Playwright)..."
  echo "SKIPPED — E2E tests require the full stack running via Docker."
  echo "Run 'docker compose up --build -d' then 'cd e2e && npx playwright test'."
  echo ""
else
  echo "Running in DOCKER mode"
  echo ""

  echo "[1/4] Backend Unit Tests..."
  docker compose exec -T backend npx vitest run src/domain src/application 2>&1 || FAILED=1
  echo ""

  echo "[2/4] Backend Integration Tests..."
  docker compose exec -T -e REQUIRE_DB_TESTS=1 backend npx vitest run src/infrastructure src/api 2>&1 || FAILED=1
  echo ""

  echo "[3/4] Frontend Unit Tests..."
  if docker compose run --rm frontend-test 2>&1; then
    echo "Frontend tests passed."
  else
    echo "FAIL: Frontend tests failed."
    FAILED=1
  fi
  echo ""

  echo "[4/4] E2E Tests (Playwright)..."
  if docker compose run --rm e2e 2>&1; then
    echo "E2E tests passed."
  else
    echo "FAIL: E2E tests failed."
    FAILED=1
  fi
  echo ""
fi

if [ "$FAILED" -ne 0 ]; then
  echo "=== SOME TESTS FAILED ==="
  exit 1
fi

echo "=== ALL TESTS PASSED ==="
