#!/usr/bin/env bash
# Writes src/integrations/supabase/types.ts with the Supabase CLI's own generator (the pg-meta bundled with the pinned
# CLI), the same way everywhere it runs, so a PR's file and main's file are byte-equal for the same schema:
#   --local       from the local database (`supabase db start` applies supabase/migrations first). CI's types-gen on
#                 pull requests; also the one-command local regenerate when Docker is running.
#   --production  from the production database through the session pooler. Needs SUPABASE_ACCESS_TOKEN and
#                 SUPABASE_DB_PASSWORD, so only main / push jobs run it (types-fresh, the Regenerate workflow).
# Never `--project-id`: that is Supabase's server-side generator, which prints a different format (#652).
# Bumping the CLI pin (ci.yml and regenerate-supabase-types.yml, kept equal by ci-types-push-guard.test.ts) can change
# the output: regenerate in the same PR.
set -euo pipefail

PROJECT_REF=qhcjpfbxfcltjbiuknyt
OUT=src/integrations/supabase/types.ts
SCHEMAS=public,graphql_public

case "${1:-}" in
  --local)
    supabase gen types typescript --local --schema "$SCHEMAS" > "$OUT"
    ;;
  --production)
    : "${SUPABASE_ACCESS_TOKEN:?SUPABASE_ACCESS_TOKEN is required}" "${SUPABASE_DB_PASSWORD:?SUPABASE_DB_PASSWORD is required}"
    # The direct db.<ref> host is IPv6-only, which GitHub runners cannot reach; the pooler host is read from the
    # Management API rather than hard-coded (its aws-N prefix differs per project). Port 5432 is session mode.
    pooler=$(curl -fsS -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" \
      "https://api.supabase.com/v1/projects/$PROJECT_REF/config/database/pooler" |
      jq -r '(map(select(.database_type == "PRIMARY")) + .)[0] | "\(.db_user // "") \(.db_host // "")"')
    read -r user host <<< "$pooler" || true
    if [ -z "${user:-}" ] || [ -z "${host:-}" ]; then
      echo "::error::Could not read the database pooler host from the Management API." >&2
      exit 1
    fi
    password=$(printf '%s' "$SUPABASE_DB_PASSWORD" | jq -sRr @uri)
    url="postgresql://$user:$password@$host:5432/postgres"
    if [ -n "${GITHUB_ACTIONS:-}" ]; then
      echo "::add-mask::$password"
      echo "::add-mask::$url"
    fi
    supabase gen types typescript --db-url "$url" --schema "$SCHEMAS" > "$OUT"
    ;;
  *)
    echo "usage: $0 --local | --production" >&2
    exit 2
    ;;
esac

bunx prettier --write "$OUT" > /dev/null
