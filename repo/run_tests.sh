#!/bin/bash
set -e

echo "=== JusticeOps Test Suite ==="
echo ""

# -----------------------------------------------------------------------------
# Execution mode governance.
#
# Docker is the ONLY supported mode for governed/audit/CI runs. The local mode
# exists solely as a developer convenience and is hard-gated behind an opt-in:
#   - pass `--local` explicitly AND
#   - set `JUSTICEOPS_ALLOW_LOCAL=1` in the environment
# Without both, any attempt to use local mode errors out so governed workflows
# cannot silently skip the real-DB integration gate.
# -----------------------------------------------------------------------------

REQUESTED_LOCAL=0
if [[ "$1" == "--local" ]] || [[ "${USE_LOCAL:-0}" == "1" ]]; then
  REQUESTED_LOCAL=1
fi

if [[ "$REQUESTED_LOCAL" == "1" && "${JUSTICEOPS_ALLOW_LOCAL:-0}" != "1" ]]; then
  echo "ERROR: local mode is disabled under the strict Docker-only policy."
  echo ""
  echo "Governed test runs MUST execute inside Docker so the real-DB"
  echo "integration gate (REQUIRE_DB_TESTS=1) is always enforced."
  echo ""
  echo "If you are a developer and understand the policy, re-run with:"
  echo "  JUSTICEOPS_ALLOW_LOCAL=1 ./run_tests.sh --local"
  echo ""
  echo "Otherwise run the default Docker-mode suite:"
  echo "  ./run_tests.sh"
  exit 2
fi

FAILED=0

if [[ "$REQUESTED_LOCAL" == "1" ]]; then
  echo "Running in LOCAL mode (developer opt-in via JUSTICEOPS_ALLOW_LOCAL=1)"
  echo "WARNING: local mode is NOT audit-compliant."
  echo ""

  echo "[1/4] Backend Unit Tests..."
  (cd backend && npx vitest run src/domain src/application 2>&1) || FAILED=1
  echo ""

  echo "[2/4] Backend Integration Tests..."
  # Even in local mode, do not let the real-DB gate be silently skipped.
  if [ -z "$DATABASE_URL" ]; then
    echo "ERROR: DATABASE_URL is required for integration tests even in local mode."
    echo "Set DATABASE_URL to a running PostgreSQL 16 instance and retry."
    FAILED=1
  else
    (cd backend && REQUIRE_DB_TESTS=1 npx vitest run src/infrastructure src/api 2>&1) || FAILED=1
  fi
  echo ""

  echo "[3/4] Frontend Unit Tests..."
  (cd frontend && npx ng test --watch=false --browsers=ChromeHeadless 2>&1) || FAILED=1
  echo ""

  echo "[4/4] E2E Tests (Playwright)..."
  echo "SKIPPED in local mode — E2E requires the Docker stack. Run ./run_tests.sh (Docker mode) for full coverage."
  echo ""
else
  echo "Running in DOCKER mode (default, audit-compliant)"
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
