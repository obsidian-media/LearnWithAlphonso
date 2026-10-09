## What changed and why

<!-- Describe the change and the reasoning behind it. -->

## Checklist

- [ ] `bun run lint`, `bunx tsc --noEmit`, and `bun run test` pass locally (CI also runs these)
- [ ] **This PR adds a file under `supabase/migrations/`** — `deploy-supabase` in `ci.yml` applies it (and redeploys the Edge Functions) when this merges to `main`, so check that its version sorts after the newest migration on `main` and after anything it depends on (`supabase db push` refuses an older file; the CI guard catches duplicate versions, not wrong order). A new table must `GRANT` what its policies allow or carry a `-- client-grants: none` marker (`docs/database-privileges.md`). After the deploy, run the `regenerate-supabase-types.yml` workflow if a table or function was added. See `ARCHITECTURE.md`'s "Known rough edges" section.
- [ ] **This PR changes a `supabase/functions/<name>/`** — `deploy-supabase` redeploys the Edge Functions listed in its "Deploy Edge Functions" step on merge to `main`; a new function must be added to that list, and its directory needs its own `deno.json` import map (CI checks the latter).
- [ ] Any new environment variable is documented in `.env.example`
- [ ] Docs (`README.md`, `AGENTS.md`, `ARCHITECTURE.md`) updated if this changes something they describe, and no plan ids, local paths, email addresses or session links in anything you commit (this repository is public)

## Testing

<!-- How was this verified? Screenshots for UI changes are appreciated. -->
