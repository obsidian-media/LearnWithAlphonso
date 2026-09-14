## What changed and why

<!-- Describe the change and the reasoning behind it. -->

## Checklist

- [ ] `bun run lint`, `bunx tsc --noEmit`, and `bun run test` pass locally (CI also runs these)
- [ ] **This PR adds a file under `supabase/migrations/`** — if so, it needs to be applied to the real project (`supabase db push`, or via the SQL editor) before this ships; there is no automated step that does it. See `ARCHITECTURE.md`'s "Applying migrations" note.
- [ ] Any new environment variable is documented in `.env.example`
- [ ] Docs (`README.md`, `AGENTS.md`, `ARCHITECTURE.md`, `AUDIT.md`) updated if this changes something they describe

## Testing

<!-- How was this verified? Screenshots for UI changes are appreciated. -->
