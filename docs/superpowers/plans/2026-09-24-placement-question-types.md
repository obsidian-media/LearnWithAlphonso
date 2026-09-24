# Placement exam covers the new question types — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stop placing learners with an exam that tests only multiple choice and then dropping them into a course that is one-eighth listening, speaking and translation.

**Architecture:** `PlacementQuestion` becomes a small discriminated union covering the types placement can fairly assess — `mc`, `listening`, `translate` — and the placement route renders and grades each the way the lesson player already does. Speaking is deliberately excluded (argued below). The `placement_questions` mirror table is widened to hold the new shapes.

**Tech Stack:** TanStack Start (React 19) · Supabase Postgres · Vitest

**Spec:** No standalone spec. The gap was found during the Phase 4 review and is recorded in `docs/BACKLOG.md`; this plan carries the design argument itself.

## The product judgment, stated plainly

Placement is a **soft nudge shown to new signups**, not a gate, and it is at most 15 questions. Three of the six question types are candidates and they are not equal:

- **`listening` — include.** It adds real assessment signal (comprehension is most of what a CEFR band means at A1–B1), costs nothing, needs no permission and no network, and reuses the exam's existing choose-an-option interaction. Where the browser cannot speak, the same readable fallback the lesson player uses keeps the question answerable — a placement question nobody can answer would mis-place the learner downward.
- **`translate` — include.** Production is the other half of a band, and placement already requires auth and a network round trip to record its result, so the hybrid grader adds no new class of dependency. Graded exactly as everywhere else: curated wordings first, AI second opinion only on a miss, `null` means "no opinion" and the local verdict stands.
- **`speak` — EXCLUDE, deliberately.** It would gate onboarding on a microphone permission prompt before the learner has any reason to grant it, and a denial makes the question unanswerable. The typing fallback that rescues it inside a lesson would here be assessing writing while claiming to assess speaking, which is worse than not asking. **This is a product call, not a technical one** — it is written down here so the account owner can overturn it knowingly rather than discover it.

Net effect: a learner still meets one type in the course that the exam never showed them. That is a deliberate, argued gap rather than the accidental three-type one it replaces.

## Self-critique corrections

Checked against the code rather than against itself. Four corrections:

1. **The pools are bigger than assumed.** English has **49** placement entries,
   French and Spanish **45** each — 139 entries to tag with `type: "mc"`, not
   the ~45 the first draft implied. Mechanical, but it is three files, and the
   two other courses must keep type-checking.
2. **`buildCourseDump` will stop compiling, and it is not my file this week.**
   `src/lib/english-content-dump.ts:76-88` hardcodes `type: "mc"` for placement
   entries and reads `p.choices` / `p.answer` directly, so widening the union
   breaks it. That file and `english-id-parity.ts` were **just generalised by
   the French session in #97**, so the change here must be additive and minimal
   — widen the placement branch to handle the three types, touch nothing else,
   and re-run `english-content-dump.test.ts` (also edited by #97) rather than
   assuming its expectations still hold.
3. **The id baseline is not at risk, and now I can say why rather than assert
   it.** `collectCourseIds` flattens `dump.byLevel` only; `dump.placement` is a
   separate field, and the committed baseline contains zero `placement:` keys.
   So placement content can be edited freely — the append-only discipline that
   governs lesson content genuinely does not apply here.
4. **New ids start at `p50`.** The existing English pool runs `p1`–`p49`;
   reusing an id would silently replace a question rather than add one.

## Global Constraints

- **English only.** `placement-fr.ts` and `placement-es.ts` are untouched; their pools stay mc-only and must keep type-checking against the widened union.
- **Placement ids are not review-item keys** (review keys are `lessonId:questionId`), so editing the pool in place is safe — unlike lesson content. Do not add the append-only ceremony here; it does not apply.
- **Migration filenames carry REAL seconds, never a rounded `HHmmss` of zeros.**
  `20260926010000` collided with the podcast session's independently-chosen
  `20260926010000` — git cannot see a duplicate version across two filenames,
  both PRs went green, and `main`'s deploy broke when the second merged, taking
  the Edge Function deploy, the APNs sync and the curriculum seed down with it.
  Round numbers are exactly what two sessions working the same day both reach
  for. CI now fails on duplicate versions (`ci.yml`), which is a backstop, not
  a licence to keep picking round numbers.
- **Never pin a migration version in a test.** Locate migrations by name or by
  content; a rename then cannot break the test at module load, as it did to
  `podcast-schema.test.ts`.
- **`bun run build` is part of verification**, not just tsc/lint/tests: it is the only check that exercises TanStack's import-protection plugin, which is what caught a bad module name in Phase 4.
- **Run one vitest at a time.** Concurrent instances silently drop test files and produce phantom failures — this cost real time in Phase 4.
- **Canopy tokens:** on an ember background use `text-ink-on-ember`, never `text-surface`.
- **`src/integrations/supabase/types.ts` is stale**; do not write typed `supabase.from()` calls against the affected tables.

## Review Focus

1. **A placement question nobody can answer mis-places the learner downward** — no TTS, no network, denied anything. Every question must resolve to an answer. — Task 2, Task 3.
2. **Scoring must stay band-based and unchanged.** A band is passed on 2 of 3; mixing types must not change what a band means or the adaptive walk. — Task 1.
3. **The other two courses must keep working.** French and Spanish pools are mc-only and share the type. — Task 1.
4. **The seed must not silently drop the new rows.** `placement_questions.choices`/`answer_index` are `NOT NULL`; a listening or translate row cannot be represented without the migration. — Task 4.
5. **An empty or whitespace translation must not be gradeable** and must not spend quota. — Task 3.

---

### Task 1: `PlacementQuestion` becomes a union, and grading moves behind one helper

**Files:**
- Modify: `src/data/placement.ts` (the type, and `type: "mc"` on every existing entry)
- Create: `src/data/placement-grading.ts`, `src/data/placement-grading.test.ts`
- Modify: `src/routes/_authenticated/placement.tsx` (grade through the helper)
- Check: `src/data/placement-fr.ts`, `src/data/placement-es.ts` still type-check

**Interfaces:**
- Produces:
  ```ts
  export type PlacementQuestion = { id: string; level: Level } & (
    | { type: "mc"; prompt: string; choices: string[]; answer: number }
    | { type: "listening"; prompt: string; audioText: string; choices: string[]; answer: string }
    | { type: "translate"; prompt: string; acceptableAnswers: string[] }
  );
  export function isPlacementAnswerCorrect(q: PlacementQuestion, answer: string | null): boolean;
  ```
  `answer` is the submitted **text** for every type, not an index — that is what lets one helper serve all three and what the route must be changed to pass.

- [ ] **Step 1: Write the failing grading tests**

```ts
it("grades mc by the chosen option's text", () => {
  expect(isPlacementAnswerCorrect(MC, "is")).toBe(true);
  expect(isPlacementAnswerCorrect(MC, "are")).toBe(false);
});

it("grades listening against the answer text, like the lesson player", () => {
  expect(isPlacementAnswerCorrect(LISTENING, "She's a doctor.")).toBe(true);
});

it("grades translate against every curated wording", () => {
  expect(isPlacementAnswerCorrect(TRANSLATE, "I don't understand")).toBe(true);
  expect(isPlacementAnswerCorrect(TRANSLATE, "I do not understand.")).toBe(true);
});

it("treats no answer as wrong rather than throwing", () => {
  expect(isPlacementAnswerCorrect(MC, null)).toBe(false);
  expect(isPlacementAnswerCorrect(TRANSLATE, "   ")).toBe(false);
});
```

- [ ] **Step 2: Run them and watch them fail**

Run: `bun run vitest run src/data/placement-grading.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Widen the type and tag every existing entry**

Add `type: "mc"` to all existing English entries, and to `placement-fr.ts` / `placement-es.ts`. Mechanical, but it is what makes the union exhaustive — do it with a script and confirm the count matches the pool size.

- [ ] **Step 4: Implement the helper**

```ts
import { matchesAcceptableAnswer } from "@/lib/translation-answer";

/**
 * One grading rule for every placement type, taking the submitted TEXT rather
 * than an option index -- the exam used to compare `picked === q.answer` with
 * `picked` being a number, which only mc can express.
 *
 * Translate is graded LOCALLY here. The AI second opinion lives server-side
 * and the route asks for it separately; this is the floor, exactly as it is in
 * the lesson player.
 */
export function isPlacementAnswerCorrect(q: PlacementQuestion, answer: string | null): boolean {
  const given = (answer ?? "").trim();
  if (!given) return false;
  if (q.type === "mc") return q.choices[q.answer] === given;
  if (q.type === "listening") return q.answer === given;
  return matchesAcceptableAnswer(given, q.acceptableAnswers);
}
```

- [ ] **Step 5: Move the route onto it**

`picked` becomes `string | null`. `setPicked(i)` becomes `setPicked(choice)`. The correctness line becomes `isPlacementAnswerCorrect(q, picked)`. The adaptive band walk, the 2-of-3 rule and `scorePlacement` are untouched — a test should assert that explicitly.

- [ ] **Step 6: Run the suite and the build**

Run: `bun run vitest run src/data src/routes/_authenticated/placement.test.tsx` then `bun run build`
Expected: PASS, and French/Spanish pools still type-check.

- [ ] **Step 7: Commit**

---

### Task 2: Listening in the exam

**Files:**
- Modify: `src/data/placement.ts` (two listening questions per band, 10 total)
- Modify: `src/routes/_authenticated/placement.tsx` (playback + readable fallback)
- Test: `src/routes/_authenticated/placement.test.tsx`

- [ ] **Step 1: Write the failing tests**

```tsx
it("offers playback for a listening placement question", async () => { /* ... */ });

it("shows the sentence when the browser cannot speak", async () => {
  // A placement question nobody can answer mis-places the learner DOWNWARD,
  // which is worse than the lesson-player case: it sets their whole course.
  canSpeak.mockReturnValue(false);
  /* ... expect the sentence to be readable ... */
});
```

- [ ] **Step 2: Run them and watch them fail** — `bun run vitest run src/routes/_authenticated/placement.test.tsx`

- [ ] **Step 3: Author the content**

Two per band, each a minimal pair against its own distractors, following the a1p23-style discipline: the wrong options must be genuine mishearings, not different topics.

- [ ] **Step 4: Render it** — the same "🔊 Play audio" button and no-TTS fallback the lesson player uses.

- [ ] **Step 5: Run the tests and the build**

- [ ] **Step 6: Commit**

---

### Task 3: Translation in the exam

**Files:**
- Modify: `src/data/placement.ts` (one translate question per band, 5 total)
- Modify: `src/routes/api/grade-translation.ts` (resolve placement ids too)
- Modify: `src/routes/_authenticated/placement.tsx` (textarea + async check)
- Test: `src/routes/api/grade-translation.test.ts`, `placement.test.tsx`

- [ ] **Step 1: Write the failing route test**

```ts
it("grades a placement question, not just a lesson one", async () => {
  // Placement ids are not lesson ids, and the route resolved questions only
  // through findLesson -- so every placement translation would have 400ed and
  // the learner would have been marked wrong for a valid wording.
  const res = await post({ placementId: "p50", submission: "good morning" });
  expect(await res.json()).toMatchObject({ correct: true });
});
```

- [ ] **Step 2: Run it and watch it fail**

- [ ] **Step 3: Extend the route's resolution**

Accept `placementId` as an alternative to `lessonId`/`questionId`, resolving against the course's placement pool. Everything else — local-first, quota, `null` is not `false`, the 500-character cap — is unchanged and must stay unchanged.

- [ ] **Step 4: Render and grade it in the exam**

Textarea, Check disabled on whitespace, and the same await-then-score flow the lesson player uses so a verdict is never recorded before it settles. Offline or grader-unavailable leaves the local verdict, which is what keeps the question answerable.

- [ ] **Step 5: Run the tests and the build**

- [ ] **Step 6: Commit**

---

### Task 4: The mirror table

**Files:**
- Create: `supabase/migrations/20260927215427_placement_question_types.sql`
- Modify: `src/lib/curriculum-seed.ts` (`buildPlacementQuestionRows`)
- Test: `src/lib/curriculum-seed.test.ts`

- [ ] **Step 1: Write the failing seed test** — a listening and a translate placement row survive `buildPlacementQuestionRows` with their content intact.

- [ ] **Step 2: Run it and watch it fail** — `choices`/`answer_index` are `NOT NULL` and neither new shape has both.

- [ ] **Step 3: Write the migration**

Make `choices` and `answer_index` nullable, add `type` (defaulting `'mc'` so existing rows stay valid), `answer_text`, `bank`, and `audio_text`, with a shape check per type mirroring `questions`'. Note in the comment that **nothing reads this table at runtime** — the app uses bundled content — so this keeps a mirror faithful rather than fixing a live read path.

- [ ] **Step 4: Map the rows and re-run**

- [ ] **Step 5: Commit**

---

### Task 5: Docs, review, PR

- [ ] **Step 1: Docs** — `ARCHITECTURE.md` (placement now assesses three of six types, and why speaking is excluded), `README.md` if it describes the exam, `CHANGELOG.md`, and `docs/BACKLOG.md`'s placement item marked done with the speaking exclusion recorded as an open product call.

- [ ] **Step 2: Full verification** — `bun run tsc --noEmit` · `bun run lint` · `bun run vitest run src` (one instance) · `bun run build` · `deno test --allow-env supabase/functions/` · `swift-test.ps1 test`.

- [ ] **Step 3: Whole-branch review BEFORE pushing.** Non-negotiable: the Phase 4 review found the AI grader entirely dead in production behind a silent quota refusal, and the Phase 3 one found two learner-blocking bugs. Neither was catchable by any test.

- [ ] **Step 4: PR**
