#!/usr/bin/env bash
# Runs Prettier on TypeScript/TSX files after Claude edits them
# Keeps diffs clean and avoids lint failures in CI

set -euo pipefail

# The file path is passed as the first argument by the hook runner
FILE="${1:-}"

if [ -z "$FILE" ]; then
  exit 0
fi

# Only format TS/TSX/JS/JSX/JSON/CSS
if [[ "$FILE" =~ \.(ts|tsx|js|jsx|json|css)$ ]]; then
  # Confirm prettier is available
  if command -v npx &>/dev/null; then
    npx prettier --write "$FILE" --log-level warn 2>/dev/null || true
  fi
fi

exit 0
