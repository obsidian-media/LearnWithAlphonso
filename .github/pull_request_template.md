## What changed and why

<!-- Describe the change and the reasoning behind it. -->

## Checklist

- [ ] `bun run lint`, `bunx tsc --noEmit`, and `bun run test` pass locally (CI also runs these)
- [ ] **This PR adds a file under `supabase/migrations/`** — if so, it needs to be applied to the real project (`supabase db push`, the SQL editor, or a Supabase MCP tool's `apply_migration`) before this ships; there is no automated step that does it. See `ARCHITECTURE.md`'s "Known rough edges" section.
- [ ] **This PR changes `supabase/functions/complete-lesson/`** — if so, it needs its own `supabase functions deploy complete-lesson`; a migration push doesn't deploy Edge Function code.
- [ ] Any new environment variable is documented in `.env.example`
- [ ] Docs (`README.md`, `AGENTS.md`, `ARCHITECTURE.md`) updated if this changes something they describe

## Testing

<!-- How was this verified? Screenshots for UI changes are appreciated. -->
