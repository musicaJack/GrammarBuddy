#!/usr/bin/env bash
# Smoke tests after deploy (run on server or any machine with curl).
set -euo pipefail

BASE_URL="${GRAMMARBUDDY_BASE_URL:-https://www.beingdigital.cn/GrammerBuddy}"

check() {
  local name="$1"
  local url="$2"
  local code
  code="$(curl -s -o /dev/null -w "%{http_code}" "$url" || echo "000")"
  if [[ "$code" == "200" ]]; then
    echo "OK   $name ($code)"
  else
    echo "FAIL $name ($code) $url"
    return 1
  fi
}

echo "=== GrammarBuddy verify ==="
echo "Base: $BASE_URL"
echo ""

FAIL=0
check "health"  "$BASE_URL/health"  || FAIL=1
check "version" "$BASE_URL/api/version" || FAIL=1
check "lessons" "$BASE_URL/api/lessons" || FAIL=1
check "index"   "$BASE_URL/" || FAIL=1

if [[ "$FAIL" == "0" ]]; then
  echo ""
  echo "All checks passed."
else
  echo ""
  echo "Some checks failed."
  exit 1
fi
