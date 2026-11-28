#!/bin/sh
# Vercel "Ignored Build Step" (vercel.json: ignoreCommand). Exit 0 = SKIP the build, exit 1 = BUILD.
# Runs for both Vercel projects (web and admin), which build from this same repo root.
#
# Rule 1: anything that is not a production build (every PR and branch preview) is skipped. Nobody opens preview
#         deployments: PR checks run in GitHub Actions and production is promoted by scripts/promote-vercel.ts.
# Rule 2: a production (main) build is skipped only when EVERY file changed since the last built commit
#         ($VERCEL_GIT_PREVIOUS_SHA) is on the skip list below. Any other path, an unknown previous commit or a
#         failing git diff means BUILD: production is never skipped on uncertainty.
#
# The decision logic and this list are mirrored in src/lib/vercel-ignore-build.ts; a test compares the two and runs
# this script against real git repositories. Change both together. Prints one line (no secrets) saying what it chose.

SKIP_PREFIXES="ios/ android/ docs/ .github/ .claude/ supabase/migrations/ supabase/functions/"

if [ "$VERCEL_ENV" != "production" ]; then
  echo "vercel-ignore-build: skip (VERCEL_ENV=${VERCEL_ENV:-unset} is not production)"
  exit 0
fi

if [ -z "$VERCEL_GIT_PREVIOUS_SHA" ]; then
  echo "vercel-ignore-build: build (no previous deployed commit to compare with)"
  exit 1
fi

if ! changed=$(git diff --name-only "$VERCEL_GIT_PREVIOUS_SHA" "${VERCEL_GIT_COMMIT_SHA:-HEAD}" 2>/dev/null); then
  echo "vercel-ignore-build: build (git diff failed, cannot tell what changed)"
  exit 1
fi

if [ -z "$changed" ]; then
  echo "vercel-ignore-build: build (empty change list, treated as unknown)"
  exit 1
fi

# Newline-separated; paths with spaces survive because only the newline splits.
OLD_IFS=$IFS
NL='
'
IFS=$NL
for file in $changed; do
  skippable=0
  case "$file" in
    */*)
      # The prefix list is space-separated, so split it with the default IFS, not the newline one.
      IFS=$OLD_IFS
      for prefix in $SKIP_PREFIXES; do
        case "$file" in
          "$prefix"*) skippable=1 ;;
        esac
      done
      IFS=$NL
      ;;
    *.md) skippable=1 ;;
  esac
  if [ "$skippable" -eq 0 ]; then
    IFS=$OLD_IFS
    echo "vercel-ignore-build: build ($file is used by the web or admin build)"
    exit 1
  fi
done
IFS=$OLD_IFS

echo "vercel-ignore-build: skip (only native, docs, CI and database files changed)"
exit 0
