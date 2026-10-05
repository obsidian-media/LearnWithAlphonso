#!/usr/bin/env bash
# Reads KEY=VALUE lines on stdin and appends each to $GITHUB_ENV, emitting
# `::add-mask::VALUE` first so GitHub redacts the value from every later log
# line.
#
# Why: values appended to $GITHUB_ENV are NOT secrets to GitHub. A demo
# account's refresh token written there printed in the clear in every later
# step's env dump of a public repository's job log (BACKLOG 0.0-aa, seen in
# run 36683940433). Pipe a secret-bearing command through this instead of
# `>> "$GITHUB_ENV"`:
#
#   bun scripts/mint-demo-session.ts --email "$EMAIL" | bash scripts/export-masked-env.sh
#
# Tested by src/lib/export-masked-env.test.ts.
set -euo pipefail

: "${GITHUB_ENV:?GITHUB_ENV must be set (this script only makes sense inside a GitHub Actions step)}"

# `|| [ -n "$key" ]` keeps a final line that has no trailing newline.
while IFS='=' read -r key value || [ -n "$key" ]; do
  [ -n "$key" ] || continue
  # An empty value has nothing to hide, and masking "" is a no-op at best.
  if [ -n "$value" ]; then
    echo "::add-mask::$value"
  fi
  printf '%s=%s\n' "$key" "$value" >> "$GITHUB_ENV"
done
