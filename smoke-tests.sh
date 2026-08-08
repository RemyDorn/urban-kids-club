#!/usr/bin/env bash
# UKC Smoke-Tests — kritische Endpoints + Wire-Verify
# Usage:
#   ./smoke-tests.sh                  → run against prod (no token)
#   BASE=http://localhost:3013 ./smoke-tests.sh
#   PROVIDER_TOKEN=xxx PARENT_TOKEN=yyy ./smoke-tests.sh    → mit echten Tokens
#
# Prüft dass alle Endpoints existieren (kein 404), Auth korrekt zieht (401 ohne Token),
# und mit Token die wichtigsten Endpoints 200 zurückgeben.

set -uo pipefail

BASE="${BASE:-https://app.urbankids.club}"
PROVIDER_TOKEN="${PROVIDER_TOKEN:-}"
PARENT_TOKEN="${PARENT_TOKEN:-}"

TEST_PROVIDER_ID="ccdd8df9-eb4c-425c-852c-1dff788576a6"
SOCIALY_PROVIDER_ID="dbd95cd4-48a8-4af3-9c89-12d5f69421d9"

GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m'

PASS=0; FAIL=0; SKIP=0

check() {
  local name="$1" method="$2" path="$3" expected="$4"
  local headers=("${@:5}")
  local args=(-s -o /dev/null -w '%{http_code}' -X "$method")
  for h in "${headers[@]}"; do args+=(-H "$h"); done
  args+=("$BASE$path")
  local code=$(curl "${args[@]}")
  if [[ "$code" == "$expected" ]]; then
    printf "${GREEN}OK${NC}   %3s  %s\n" "$code" "$name"; PASS=$((PASS+1))
  else
    printf "${RED}FAIL${NC} %3s  %s (expected %s)\n" "$code" "$name" "$expected"; FAIL=$((FAIL+1))
  fi
}

skip() { printf "${YELLOW}SKIP${NC}        %s\n" "$1"; SKIP=$((SKIP+1)); }

echo "=== UKC Smoke Tests against $BASE ==="
echo ""

echo "--- Public / Health ---"
check "GET  /api/health"                  GET  "/api/health"                                200
check "GET  /api/openapi.json"            GET  "/api/openapi.json"                          200
check "GET  /dashboard-v3"                GET  "/dashboard-v3"                              200
check "GET  /portal/"                     GET  "/portal/"                                   200

echo ""
echo "--- Provider endpoints (no token → 401) ---"
for path in \
  "/api/me" \
  "/api/providers/$TEST_PROVIDER_ID" \
  "/api/providers/$TEST_PROVIDER_ID/settings" \
  "/api/providers/$TEST_PROVIDER_ID/team" \
  "/api/providers/$TEST_PROVIDER_ID/course-blocks" \
  "/api/providers/$TEST_PROVIDER_ID/available-credits" \
  "/api/providers/$TEST_PROVIDER_ID/activities" \
  "/api/providers/$TEST_PROVIDER_ID/bookings" \
  "/api/today-cancellations" \
  "/api/activity-feed" \
  "/api/messages/threads" \
  "/api/opening-hours" \
  "/api/invoices/x"
do
  check "GET  $path" GET "$path" 401
done

echo ""
echo "--- Portal endpoints (no token → 401) ---"
for path in \
  "/api/portal/me" \
  "/api/portal/bookings" \
  "/api/portal/credits" \
  "/api/portal/credits/history" \
  "/api/portal/crew" \
  "/api/portal/discover" \
  "/api/portal/addup-slots" \
  "/api/portal/messages" \
  "/api/portal/me/children" \
  "/api/portal/invoices"
do
  check "GET  $path" GET "$path" 401
done

echo ""
echo "--- POST endpoints existence (no token → 401, not 404) ---"
check "POST /api/portal/credits/x/redeem"     POST "/api/portal/credits/x/redeem"      401
check "POST /api/portal/credits/request"      POST "/api/portal/credits/request"       401
check "POST /api/portal/sessions/cancel-late" POST "/api/portal/sessions/cancel-late"  401
check "POST /api/portal/bookings/x/cancel"    POST "/api/portal/bookings/x/cancel"     401
check "POST /api/sessions/x/cancel"           POST "/api/sessions/x/cancel"            401
check "POST /api/sessions/x/mark-attendance"  POST "/api/sessions/x/mark-attendance"   401
check "POST /api/credits/x/book-makeup"       POST "/api/credits/x/book-makeup"        401

echo ""
echo "--- Authed Provider Tests ---"
if [[ -n "$PROVIDER_TOKEN" ]]; then
  AUTH=("Authorization: Bearer $PROVIDER_TOKEN")
  check "GET  /api/me"                                       GET "/api/me"                                            200 "${AUTH[@]}"
  check "GET  /api/providers/$TEST_PROVIDER_ID/settings"     GET "/api/providers/$TEST_PROVIDER_ID/settings"          200 "${AUTH[@]}"
  check "GET  /api/today-cancellations"                      GET "/api/today-cancellations"                           200 "${AUTH[@]}"
  check "GET  /api/activity-feed"                            GET "/api/activity-feed"                                 200 "${AUTH[@]}"
  check "GET  /api/messages/threads"                         GET "/api/messages/threads"                              200 "${AUTH[@]}"
  check "GET  /api/providers/$TEST_PROVIDER_ID/available-credits" GET "/api/providers/$TEST_PROVIDER_ID/available-credits" 200 "${AUTH[@]}"
else
  skip "Provider authed tests (set PROVIDER_TOKEN=...)"
fi

echo ""
echo "--- Authed Parent Tests ---"
if [[ -n "$PARENT_TOKEN" ]]; then
  AUTH=("Authorization: Bearer $PARENT_TOKEN")
  check "GET  /api/portal/me"               GET "/api/portal/me"                            200 "${AUTH[@]}"
  check "GET  /api/portal/bookings"         GET "/api/portal/bookings"                      200 "${AUTH[@]}"
  check "GET  /api/portal/credits"          GET "/api/portal/credits"                       200 "${AUTH[@]}"
  check "GET  /api/portal/crew"             GET "/api/portal/crew"                          200 "${AUTH[@]}"
  check "GET  /api/portal/discover"         GET "/api/portal/discover"                      200 "${AUTH[@]}"
  check "GET  /api/portal/addup-slots"      GET "/api/portal/addup-slots"                   200 "${AUTH[@]}"
else
  skip "Parent authed tests (set PARENT_TOKEN=...)"
fi

echo ""
echo "==============================="
printf "PASS=${GREEN}%d${NC}  FAIL=${RED}%d${NC}  SKIP=${YELLOW}%d${NC}\n" "$PASS" "$FAIL" "$SKIP"
echo "==============================="

if [[ "$FAIL" -gt 0 ]]; then exit 1; fi
exit 0
