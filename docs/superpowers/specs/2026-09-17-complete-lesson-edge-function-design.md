# Design: `complete-lesson` Supabase Edge Function

> Written 2026-09-17. This is the trust-boundary piece of the native iOS
> app's progress sync that a Swift client cannot implement directly -- see
> `ios/LearnWithAlphonsoKit/Sources/LearnWithAlphonsoKit/ProgressSyncClient.swift`'s
> file comment for why. **Design only, not deployed** -- this needs a real
> review + deployment step against the live Supabase project, which this
> session doesn't have credentials for. Read this alongside
> `src/lib/sync.functions.ts`'s `completeLessonRemote` (the real, current
> server function this must match) and `src/lib/lesson-session.server.ts`
> (the HMAC session-token scheme it reuses).

## Why this can't be a direct client call

`completeLessonRemote` grants XP and unlocks achievements based on a
client-reported score (`total`, `missedQuestionIds`). The only thing
stopping a forged claim is:
1. Verifying `total` and `missedQuestionIds` actually match the real
   lesson's questions (`deriveLessonCompletion` -- already ported to Swift
   in `ProgressMath.swift`, but that Swift copy is for the CLIENT's own
   optimistic UI, never the source of truth)
2. Verifying an HMAC-signed session token proving `startLessonSession` was
   called for this exact user/lesson/course before the completion claim

That HMAC token is signed with `LESSON_SESSION_SECRET`, a server-only
secret. **It can never be embedded in a distributed app binary** -- doing
so would let anyone extract it and forge valid completion claims for
unlimited XP. This is the one piece of `sync.functions.ts` that
structurally cannot move to the client, in Swift or any other language.

## What the Edge Function needs to do

A direct1:1 port of `completeLessonRemote`'s handler (see
`src/lib/sync.functions.ts:174-351`), as a Supabase Edge Function
(`supabase/functions/complete-lesson/index.ts`, Deno runtime):

1. Authenticate the caller via the Supabase JWT in the `Authorization`
   header (Edge Functions get this automatically via
   `Deno.serve`+`createClient` with the user's JWT forwarded -- same
   pattern as any Supabase Edge Function, RLS applies to all reads/writes
   this function makes on the user's behalf).
2. Validate the request body against the same shape as
   `completeLessonSchema` (Zod, in `sync.functions.ts:158-172`):
   `lessonId`, `total`, `missedQuestionIds`, `course`, `sessionToken`.
3. Look up the real lesson via `getCourse(course).findLesson(lessonId)` --
   **this requires the curriculum data to be available to the Edge
   Function**, which is a real open question (see "Open question" below).
4. Verify `sessionToken` via the same HMAC scheme as
   `lesson-session.server.ts` (`verifyLessonSessionToken`) -- this file's
   logic ports directly to Deno (`node:crypto`'s `createHmac`/
   `timingSafeEqual` are both available in Deno's Node compat layer), just
   needs `LESSON_SESSION_SECRET` set as an Edge Function secret (`supabase
   secrets set LESSON_SESSION_SECRET=...` -- **must be the same value** the
   web app's server already uses, or tokens issued by one side won't verify
   on the other).
5. Derive `correct` via the same membership check as
   `deriveLessonCompletion` (already a direct, verified Swift port in
   `ProgressMath.swift` -- port the same logic to Deno/TS here too, or
   better, since this Edge Function runs in the same monorepo, consider
   importing the real `deriveLessonCompletion` from
   `src/lib/progress-math.ts` directly if Supabase Edge Functions' bundler
   can resolve a relative import outside `supabase/functions/` -- verify
   this rather than assume; if not, a Deno-local copy with a comment
   pointing back to the source of truth is the fallback).
6. Compute XP gain, streak update, league promotion -- **the same pure
   functions this already has**: `computeXpGain`, `computeStreakUpdate`,
   `computeLeaguePromotion` from `src/lib/progress-math.ts`. Same import
   question as step 5.
7. Run the exact same sequence of Supabase writes as
   `sync.functions.ts:241-334`: upsert `user_progress`, upsert
   `language_progress`, upsert `lesson_completions`, upsert
   `activity_days`, evaluate `ACHIEVEMENTS` and upsert `user_achievements`.
   **Use the service-role client for these writes**, not the user's own
   JWT -- Edge Functions commonly do this specifically so RLS doesn't need
   a separate "system can write derived progress" policy; the function
   itself is the trust boundary now, matching how `sync.functions.ts`'s
   `context.supabase` already operates with elevated trust inside the
   TanStack Start server context.
8. Return the same response shape: `{ xpGain, newlyUnlocked, progress:
   {...} }`.

## Open question: curriculum data inside the Edge Function

`findLesson` needs the real lesson content (to validate `total` and
`missedQuestionIds`). The web app has this as in-process TypeScript data
(`src/data/curriculum.ts`/`curriculum-fr.ts`). Two real options, not yet
decided:

- **Bundle the same JSON the iOS export script produces**
  (`ios/LearnWithAlphonsoKit/Sources/LearnWithAlphonsoKit/Resources/curriculum-en.json`
  / `curriculum-fr.json`) into the Edge Function's own deploy, read at
  cold-start. Reuses the same export pipeline (`scripts/export-ios-content.ts`)
  as a second consumer -- one source of truth, two outputs (iOS bundle,
  Edge Function bundle).
- **Query a `lessons` table** if one gets created from the curriculum data
  (doesn't exist today -- `curriculum.ts` is the only source of truth,
  never synced to the database). Bigger change, more moving parts, but
  avoids bundling large JSON into a function's cold-start payload.

Recommend the first option for V1 -- reuses existing infrastructure,
smaller change. Needs a real decision before implementation, not just this
doc's opinion.

## Testing

Deno's built-in test runner (`deno test`) covers the same kind of pure
logic already TDD'd on both the TypeScript side
(`progress-math.test.ts`) and the Swift side
(`ProgressMathTests.swift`) -- this function's own tests should focus on
the HTTP-handler-level behavior (auth required, schema validation,
session-token verification, the actual Supabase write sequence via a
local Supabase instance per `supabase start`), not re-prove
`computeXpGain`'s math a third time.

## Deployment

Standard Supabase Edge Function deploy:
```
supabase functions deploy complete-lesson
supabase secrets set LESSON_SESSION_SECRET=<same value as the web app's env>
```
**Not run in this session** -- no Supabase CLI login/project link
available here. This is real work for whoever has that access next.

## What ProgressSyncClient (Swift, already built) will call once this exists

A `completeLesson(sessionID: lessonID: total: missedQuestionIds: course: sessionToken:)`
method, POSTing to this Edge Function's URL
(`{SUPABASE_URL}/functions/v1/complete-lesson`) with the user's JWT --
structurally identical to `TutorConversationClient`'s pattern already
proven in this package, just a different endpoint and payload shape. Not
implemented yet since the Edge Function it calls doesn't exist yet --
building the client first would just be an unverifiable guess at a
contract that isn't real.
