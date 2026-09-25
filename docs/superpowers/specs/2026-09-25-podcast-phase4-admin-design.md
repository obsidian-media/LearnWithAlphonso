# Podcast Phase 4 — the admin subsystem

**Status:** spec, awaiting review. Nothing built.

**Follows:** Phases 1a, 1b, 2a, 3. Independent of Phase 2b
(`2026-09-25-podcast-phase2b-questions-design.md`) except that if 2b
ships first, the admin must be able to edit questions too.

**Goal:** the account owner publishes and maintains the podcast library
from a browser instead of a terminal.

---

## What "separate app, separate auth" can and cannot mean

The chosen shape is a separate admin application with its own login,
deployed apart from the learner app. Two parts of that are achievable
and one is not, and the difference has to be stated before anything is
built.

**Achievable: separate deployment.** A second Vercel project from the
same repo, its own domain (`admin.<domain>`), its own build. No admin
code, routes, or strings ship in the learner bundle. This is the part
that carries most of the security value.

**Achievable: separate login and session.** Distinct cookie name, its
own sign-in route, no session sharing with the learner app. Signing in
as a learner never produces an admin session.

**Not achievable: a separate identity provider.** The admin writes to
the *same* Postgres database the learner app reads — that is the entire
point. A second Supabase project would mean a second database, so admin
identity has to live in the same `auth.users` as everyone else.
Pretending otherwise would produce a system that looks separated and
is not.

So "separate auth" here means: **the same identity store, a separate
session, and an explicit allowlist that is never derived from anything
the learner app can influence.** Authorization, not authentication, is
where the separation is real.

---

## Authorization

There is no role concept in this repo today — no `user_roles` table, no
`is_admin` column, nothing reading `app_metadata`. This builds it.

### `admin_users`

```
user_id    uuid PK REFERENCES auth.users(id) ON DELETE CASCADE
added_at   timestamptz NOT NULL DEFAULT now()
added_by   uuid REFERENCES auth.users(id)
note       text
```

**No client policy of any kind.** Not `SELECT`, not `INSERT`. RLS
enabled, zero policies, `GRANT ALL` to `service_role` only. A table the
client cannot read is a table whose contents cannot be enumerated by a
compromised learner session, and an allowlist that the app being guarded
can write to is not an allowlist.

The first row is inserted **by hand, once**, via the Supabase SQL editor.
No bootstrap endpoint, no seed, no environment variable naming an email.
Every self-bootstrapping admin mechanism is an authentication bypass
waiting for a misconfiguration, and this list will have one or two
entries for the foreseeable future.

### The check

One server-side function, `requireAdmin`, used as middleware on every
admin server function and every admin route loader:

1. Resolve the session (the admin cookie, not the learner one).
2. Query `admin_users` with **`supabaseAdmin`** (service role) — the
   user's own token cannot read the table, by design.
3. Absent → throw. Not redirect-to-learner-app, not a friendly page:
   an unauthenticated response that says nothing about whether the
   route exists.

`requireAdmin` lives in `src/lib/admin-auth.ts` and is pure enough to
test with an injected client, following `requireSupabaseAuth`'s existing
shape. **Every admin write goes through it.** The rule that keeps this
honest: no admin route may call `supabaseAdmin` directly — it calls a
server function that begins with `requireAdmin`. A test enumerates the
admin server functions and asserts each has the middleware, because the
failure mode of this design is one endpoint that forgot.

---

## What the admin can do

Everything `scripts/podcast-tool.ts` can do, which is deliberately the
full list — a second publishing path with different capabilities means
two sources of truth about what a valid episode is.

- **Folders**: create, rename, re-parent, reorder, delete (only when
  empty). Cycle prevention reuses `src/lib/podcast-tree.ts`, which is
  already tested and is where the rule lives precisely because only
  trusted writers exist.
- **Episodes**: upload an MP3 or supply a script for TTS, set title /
  slug / description / folder, publish and unpublish, replace the audio
  of an existing episode, delete.
- **Transcripts**: paste or upload, with the same markup rejection —
  `normalizeTranscript` from `src/lib/podcast-transcript.ts`, not a
  second implementation. A transcript is not the TTS script, and the
  admin UI is where that mistake is easiest to make because both boxes
  are on one screen.
- **Questions** (if Phase 2b has shipped): edit the set, with the
  orphaned-`review_items` warning surfaced as a confirmation naming the
  affected learner count — the CLI prints it, so the UI must too.

### Validation lives in `src/lib/`, not in the UI

Every rule above already exists as a tested pure function used by the
CLI. The admin app calls the same functions. A validation rule that
exists only in a form handler is a rule the CLI does not enforce, and
the two paths would drift within a release.

### TTS and the free tier

The account owner is on the **ElevenLabs free tier**. The UI must show
the character cost of a script *before* generating, and generation must
be a distinct, explicit action — not a side effect of saving an episode.
A quota exhausted by an accidental re-save is a real outcome on a free
tier, and the current CLI avoids it only because every run is typed
deliberately.

---

## Audio upload

The browser cannot hold the service-role key, so the admin app uploads
through a server function: the file is posted to the server, validated
(MIME sniffed from content rather than trusted from the extension, size
capped, duration read with `music-metadata` — imported lazily, as the
CLI now does), then written to the `podcast-audio` bucket with
`supabaseAdmin`.

**The bucket is public-read** (Phase 1a, accepted while this content is
free for all learners). An unpublished episode's audio is fetchable by
anyone with the URL. The admin UI must therefore not present "unpublished"
as privacy — the draft badge says "not listed", not "private" — and
draft paths keep an unguessable suffix. That is obscurity, and the UI
should not imply otherwise. **If podcasts are ever gated behind Pro,
this and the bucket decision must be revisited before that work starts.**

---

## Deployment

A second Vercel project built from the same repo with a distinct entry
and a route filter, so the learner build cannot include admin routes
even by accident. `SUPABASE_SERVICE_ROLE_KEY` is set **only** on the
admin project; the learner project already has it for its own server
functions, so this is not a reduction there, but the admin project must
not receive any key the learner project does not need.

CI gains a build of the admin target. The existing `lint-and-typecheck`,
`e2e` and `deno-tests` jobs cover the shared `src/lib/` code either way.

**Secrets:** per this repo's standing rule, any secret is resolved at
runtime via `{{resolve:secretsmanager:...}}` with `asm-exec` and never
fetched into a working context.

---

## Testing

The admin app's value is that it prevents mistakes, so the tests are
about refusal, not success:

- `requireAdmin` rejects: no session; a valid learner session whose user
  is absent from `admin_users`; a session for a deleted user. Each
  mutation-tested by removing the corresponding clause.
- Every admin server function carries the middleware (the enumeration
  test above).
- Upload rejects a file whose content is not audio regardless of its
  extension, and one over the size cap.
- Folder delete refuses a non-empty folder; re-parent refuses a cycle.
- Transcript save rejects markup — the same cases as `--transcript`.
- `admin_users` is unreadable with an authenticated (non-service) client.

The last one is the only test that proves the central claim of this
design, and it is the one most likely to be written as a test that
cannot fail. It must assert on a real PostgREST refusal, not on a mock
that returns empty.

---

## Out of scope

Multiple admin roles or per-permission granularity — there are one or
two admins and inventing a permission system for them is complexity with
no user. Audit logging of admin actions (worth doing once there is more
than one admin; noted, not built). Admin management of anything other
than the podcast library: learners, curriculum, and gamification stay
out, because each would widen the blast radius of a compromised admin
session from "the podcast library" to "the product".

---

## Risks

1. **This is the largest item in the podcast roadmap and the most
   exposed to the coming respec.** The owner has said the current
   episode format is not what they ultimately mean by "podcast". An
   admin UI is a UI *for that format*. The schema work and
   `requireAdmin` survive a respec; the forms largely do not. If the
   respec is close, building the authorization layer first and the forms
   after is the cheaper order, and this spec is written so that split is
   possible.
2. **A second deployment is a second thing that can be misconfigured.**
   Specifically: the admin project built without the route filter, or
   the learner project accidentally serving an admin route. The CI build
   of both targets, plus a test asserting no admin route appears in the
   learner route tree, is the guard.
3. **The allowlist is bootstrapped by hand.** That is deliberate, and it
   means losing access to the one admin row is recovered only through
   the Supabase dashboard. Documented rather than automated, because
   every automation of it is a bypass.
