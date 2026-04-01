#!/bin/bash
set -e

echo "=== JusticeOps Test Suite ==="
echo ""

FAILED=0

echo "[1/5] Backend Unit Tests..."
docker compose exec -T backend npx vitest run src/domain src/application 2>&1 || FAILED=1
echo ""

echo "[2/5] Backend Integration Tests..."
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

if [ "$FAILED" -ne 0 ]; then
  echo "=== SOME TESTS FAILED ==="
  exit 1
fi

echo "=== ALL TESTS PASSED ==="
