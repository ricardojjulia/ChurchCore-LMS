#!/usr/bin/env bash
# Blocks commits of sensitive files before they reach git

set -euo pipefail

STAGED=$(git diff --cached --name-only 2>/dev/null || true)

if [ -z "$STAGED" ]; then
  exit 0
fi

BLOCKED=0

# Block .env files
if echo "$STAGED" | grep -qE '^\.env(\.|$)'; then
  echo "BLOCKED: .env file staged. Remove with: git reset HEAD .env"
  BLOCKED=1
fi

# Block .env.local and .env.*.local
if echo "$STAGED" | grep -qE '\.env\.(local|development\.local|test\.local|production\.local)$'; then
  echo "BLOCKED: .env.local file staged. Remove with: git reset HEAD <file>"
  BLOCKED=1
fi

# Block service role key patterns in any file
for FILE in $STAGED; do
  if [ -f "$FILE" ] && grep -qE 'service_role|SUPABASE_SERVICE_ROLE_KEY' "$FILE" 2>/dev/null; then
    # Allow migration files — they may reference the role name but not the key value
    if [[ "$FILE" != supabase/migrations/* ]]; then
      echo "BLOCKED: $FILE contains service_role reference — check for key leakage"
      BLOCKED=1
    fi
  fi
done

# Block Stripe secret key patterns
for FILE in $STAGED; do
  if [ -f "$FILE" ] && grep -qE 'sk_live_[a-zA-Z0-9]+' "$FILE" 2>/dev/null; then
    echo "BLOCKED: $FILE may contain a live Stripe secret key"
    BLOCKED=1
  fi
done

# Block hardcoded test credentials
for FILE in $STAGED; do
  if [ -f "$FILE" ] && grep -qE '(password|passwd)\s*[:=]\s*["\x27][^"]+["\x27]' "$FILE" 2>/dev/null; then
    # Only flag in test files that are not using env vars
    if [[ "$FILE" == *test* || "$FILE" == *spec* ]] && ! grep -q 'process\.env\.' "$FILE" 2>/dev/null; then
      echo "BLOCKED: $FILE may contain hardcoded credentials in a test file — use process.env"
      BLOCKED=1
    fi
  fi
done

if [ "$BLOCKED" -eq 1 ]; then
  echo ""
  echo "Commit blocked by ChurchCore LMS pre-commit hook."
  echo "Fix the issues above and try again."
  exit 1
fi

exit 0
