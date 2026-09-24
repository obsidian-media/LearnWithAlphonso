# Free-form translation question type — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a sixth question type, `translate`, in which the learner writes a full phrase in English and is graded against a curated list of acceptable phrasings, with an AI fallback for valid wordings the list did not anticipate.

**Architecture:** Grading is hybrid and local-first: normalise the submission and compare against `acceptableAnswers` (zero cost, works offline); only on a miss call an AI grader. The AI fallback lives **server-side in all three places that grade** — `/api/grade-translation` for the lesson player, `gradeReview` in `review.functions.ts` for web review, and the `grade-review` edge function for iOS review — so the verdict the learner is shown and the verdict that drives spaced repetition are produced by the same rule. Offline, grading degrades to local-only rather than skipping the question.

**Tech Stack:** TanStack Start (React 19) · Supabase Postgres + Deno edge functions · NVIDIA NIM chat completions via `resolveNvidiaChatModel` · Swift/SwiftUI + LearnWithAlphonsoKit · Vitest, `deno test`, XCTest

**Spec:** `docs/superpowers/specs/2026-09-23-english-content-overhaul-design.md` (Section 3, "Free-form writing/translation", and "Shared grading utility")

## Self-critique corrections

Four things this plan got wrong on the first pass, found by checking it against
the code rather than against itself. Recorded because each one is a live trap
for whoever executes it.

1. **There are THREE graders for a translate answer, not two.** The web review
   player does not call the `grade-review` edge function at all - it calls
   `gradeReview` in `src/lib/review.functions.ts` (`useServerFn`), and the edge
   function is the **iOS** path. A hybrid rule in the edge function alone would
   leave web review string-matching, so an AI-accepted paraphrase would be shown
   correct and lapsed anyway - the exact bug this task exists to prevent, just
   moved. Task 6 now owns `review.functions.ts`, and the review player is
   changed to **display the server's verdict** rather than computing its own, so
   the two cannot disagree by construction.
2. **`reshuffleQuestion` would crash on a translate question.** Its final
   fallthrough is `[...q.bank]` (`src/data/bank-engine.ts:125`), and a translate
   question has `acceptableAnswers`, not `bank`. Every lesson-player question
   goes through it. Task 1 now adds the explicit branch.
3. **The lesson count was wrong.** Five packs of 25 lines produce 25 lessons and
   125 questions, not 125 lessons: English goes 584 -> **609**.
4. **The edge function's AI fallback needs its own key and has no quota.**
   `consumeQuota` is a web-side helper backed by Supabase tables; the edge
   function has no equivalent. Its rate limiter is structural - an item must be
   *due* to be graded, which bounds calls to roughly one per due item per day -
   and if `NVIDIA_API_KEY` is not configured for the function, translate review
   grading degrades to local-only rather than failing. Both facts are stated in
   Task 4 instead of being discovered in production.

## Global Constraints

- **English only.** French and Spanish content is untouched (spec, "Scope"). `bank-engine.ts` must not gain new pack kinds in this plan.
- **Content edits are append-only or in-place.** Question ids are index-derived from pack line order. Appending a pack is safe; inserting or deleting a line inside one repoints real learners' saved review items. Every re-baseline of `.audit-baseline/english-ids.json` must be verified **insertions only** before commit.
- **Never hand-edit the bundled iOS JSON.** Run `bun scripts/export-ios-content.ts` and commit the result; CI fails on drift.
- **Canopy tokens:** on an ember background use `text-ink-on-ember`, never `text-surface`. `src/` currently has zero violations.
- **Two players, not one.** `review.tsx` duplicates `lesson.$id.tsx`'s rendering and grading, and iOS duplicates both again in `LessonPlayerView.swift` and `ReviewQueueView.swift`. A type wired into one renders as an unanswerable card in the other, and no merge conflict will ever reveal it.
- **`src/integrations/supabase/types.ts` is stale** (7 tables missing). Do not write typed `supabase.from()` calls against those tables; the existing edge functions use untyped admin clients.
- **The AI verdict is never written back** into `acceptableAnswers` (spec, "Explicit non-goals").
- **Quota:** translation grading gets its own `QuotaKind`, not `chat`'s budget (spec, Section 3).

## Review Focus

Five failure modes the spec implies but does not test. Each has a test in the task that owns the code.

1. **A translate question must stay answerable with no network.** `deriveLessonCompletion` (`supabase/functions/complete-lesson/progress-math.ts:93`) throws when `total !== lesson.questions.length`, so the spec's "when offline, speaking/translation questions are skipped" would either fail the completion outright or silently mark the skipped question correct. Offline grading must be local-only, not absent. — Task 5, Task 7.
2. **An AI-accepted paraphrase must not be lapsed by the server.** `grade-review` re-derives correctness independently; if it only string-matches, a paraphrase accepted in the player shows "Still got it" and has the item lapsed anyway. — Task 4.
3. **An unavailable or failing AI grader must not mark a correct answer wrong.** No API key, a 500, a timeout, or exhausted quota must fall back to the local verdict and say so, never to `false`. — Task 3, Task 4.
4. **Malformed model output must not be read as a verdict.** The model can answer with prose, an empty string, or JSON with the wrong shape; anything unparseable is "no AI opinion", which means the local verdict stands. — Task 3.
5. **An empty or whitespace-only submission is not an answer.** Check stays disabled; nothing is sent to the grader and no quota is spent. — Task 5, Task 6.

---

## File Structure

| File | Responsibility |
| --- | --- |
| `src/data/curriculum.ts` | `translate` variant added to the `Question` union |
| `src/data/lesson-bank.ts` | `"translate"` pack kind, its generator branch, the content packs |
| `src/lib/translation-answer.ts` | **New.** Normalise + match against `acceptableAnswers`. Local, synchronous, no network |
| `src/lib/translation-grader.server.ts` | **New.** The AI fallback: prompt, call, parse. Used only by the route |
| `src/routes/api/grade-translation.ts` | **New.** Authenticated endpoint: local match, then AI fallback |
| `src/lib/ai-quota.server.ts` | `"translate"` added to `QuotaKind` |
| `src/lib/srs.ts` | `deriveAnswerCorrectness` gains the local translate rule |
| `src/components/TranslateAnswer.tsx` | **New.** Shared answer control for both web players |
| `supabase/functions/grade-review/translation-answer.ts` | **New.** Deno mirror of the local matcher |
| `supabase/functions/grade-review/translation-grader.ts` | **New.** Deno mirror of the AI fallback |
| `supabase/migrations/20260926010000_v5_translate_question_type.sql` | **New.** Fifth allowed row shape |
| `ios/.../LearnWithAlphonsoKit/TranslationAnswer.swift` | **New.** Swift port of the local matcher |
| `ios/LearnWithAlphonso/Sources/TranslateQuestionCard.swift` | **New.** Shared iOS answer control |

---

### Task 1: The `translate` variant, its row shape, and the first pack

**Files:**
- Modify: `src/data/curriculum.ts` (the `Question` union)
- Modify: `src/data/lesson-bank.ts` (`Pack.kind`, `packQuestions`, one new pack)
- Modify: `src/lib/curriculum-seed.ts` (`questionRow`)
- Create: `supabase/migrations/20260926010000_v5_translate_question_type.sql`
- Test: `src/lib/curriculum-seed.test.ts`, `src/data/curriculum-consistency.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: the variant every later task switches on —
  ```ts
  | {
      id: string;
      type: "translate";
      prompt: string;
      /** Curated valid phrasings. The first is canonical and is what the
       *  learner is shown after a miss. Never auto-expanded. */
      acceptableAnswers: string[];
      explanation: string;
    }
  ```
  and the row shape `type = 'translate' AND bank IS NOT NULL AND answer_text IS NOT NULL AND choices IS NULL AND answer_index IS NULL`, where `bank` holds `acceptableAnswers` and `answer_text` holds `acceptableAnswers[0]`.

- [ ] **Step 1: Probe the blast radius before writing anything**

Add the variant to the union in `src/data/curriculum.ts`, then run `bun run tsc --noEmit`. Record the error count and the file list. This is how listening (14 vs 8 errors) and speaking (4 errors) were sized; the list is the authoritative set of switches this plan must cover, and if it names a file this plan does not mention, add it.

- [ ] **Step 2: Write the failing seed-row test**

In `src/lib/curriculum-seed.test.ts`:

```ts
it("maps a translate question onto the bank + answer_text row shape", () => {
  const rows = buildQuestionRows("en");
  const row = rows.find((r) => r.type === "translate");
  expect(row).toBeDefined();
  // acceptableAnswers ride in `bank`; answer_text carries the canonical one,
  // so grade-review's existing non-mc path has something to compare against
  // even before the translate branch lands.
  expect(Array.isArray(row!.bank)).toBe(true);
  expect((row!.bank as string[]).length).toBeGreaterThan(1);
  expect(row!.answer_text).toBe((row!.bank as string[])[0]);
  expect(row!.choices).toBeNull();
  expect(row!.answer_index).toBeNull();
});
```

- [ ] **Step 3: Run it and watch it fail**

Run: `bun run vitest run src/lib/curriculum-seed.test.ts`
Expected: FAIL — no row has `type === "translate"`.

- [ ] **Step 4: Add the pack kind and the generator branch**

In `src/data/lesson-bank.ts`, widen `Pack.kind` to include `"translate"`, document the line format, and add the branch to `packQuestions` **before** any distractor work (a translate question has no distractors, and running the pool logic for it wastes work and invites a crash on an empty pool):

```ts
if (pack.kind === "translate") {
  // "prompt|answer one;answer two;answer three" -- the left side is what the
  // learner is asked to express, the right side is the curated list of
  // phrasings that count, most canonical first.
  const answers = right!.split(";").map((a) => a.trim()).filter(Boolean);
  return {
    id: `${pack.id}q${i}`,
    type: "translate",
    prompt: left!,
    acceptableAnswers: answers,
    explanation: `One way to say it: "${answers[0]}" ${pack.note}`,
  };
}
```

- [ ] **Step 5: Add the first pack (A1), 25 lines**

Append to the `A1` array in `src/data/lesson-bank.ts` — appending only, so no existing question id moves. Content rules, which the pack comment must state: each prompt describes an idea in plain English rather than giving the sentence away; every line carries **at least three** acceptable phrasings; avoid the traps the speaking packs documented (compound numbers, ordinals, contracted `has`, possessive `'s`, names with no disambiguating context) since the same normaliser is involved.

```ts
{
  id: "a1p25",
  title: "Say It Your Way",
  subtitle: "Write the idea in English",
  kind: "translate",
  prompt: "Write this in English:",
  note: "Everyday ideas, more than one right wording.",
  data: `Greet someone in the morning.|Good morning.;Morning.;Good morning to you.
Ask someone's name.|What is your name?;What's your name?;May I ask your name?
Say you do not understand.|I do not understand.;I don't understand.;Sorry, I don't understand.`,
  // ... 22 more lines, same shape
},
```

- [ ] **Step 6: Give `reshuffleQuestion` an explicit branch**

In `src/data/bank-engine.ts`, beside the `speak` branch and **before** the
fallthrough, which does `[...q.bank]` and would crash on a question that has
`acceptableAnswers` instead:

```ts
// A translate question has no choices, bank or tokens either -- and its
// acceptableAnswers are a grading list, not a display order, so shuffling
// them would be pointless as well as wrong.
if (q.type === "translate") return q;
```

- [ ] **Step 7: Pin the pack format in the consistency test**

In `src/data/curriculum-consistency.test.ts`:

```ts
it("gives every translate question at least two acceptable phrasings", () => {
  // One phrasing means the AI fallback carries the whole question, and a
  // zero-length list would make matchesAcceptableAnswer fail everything.
  for (const q of allEnglishQuestions()) {
    if (q.type !== "translate") continue;
    expect(q.acceptableAnswers.length).toBeGreaterThanOrEqual(2);
    expect(q.acceptableAnswers.every((a) => a.trim().length > 0)).toBe(true);
  }
});
```

- [ ] **Step 8: Map the row in `curriculum-seed.ts`**

```ts
if (q.type === "translate") {
  // A fifth row shape: the accepted phrasings ride in `bank` (already a
  // jsonb string[] for fill/reorder) and the canonical one in answer_text,
  // so no new column is needed.
  return {
    ...base,
    type: "translate",
    choices: null,
    bank: q.acceptableAnswers,
    answer_index: null,
    answer_text: q.acceptableAnswers[0] ?? "",
  };
}
```

- [ ] **Step 9: Run the seed test and the consistency test**

Run: `bun run vitest run src/lib/curriculum-seed.test.ts src/data/curriculum-consistency.test.ts`
Expected: PASS.

- [ ] **Step 10: Write the migration**

```sql
-- V5 phase 4: a "translate" question type alongside mc/fill/reorder/
-- listening/speak. Its row shape is a FIFTH: `bank` carries the curated
-- acceptable phrasings and `answer_text` the canonical one. Reusing both
-- existing columns rather than adding a new one keeps grade-review's
-- non-mc path working for it unchanged.
ALTER TABLE public.questions DROP CONSTRAINT questions_type_check;
ALTER TABLE public.questions ADD CONSTRAINT questions_type_check
  CHECK (type IN ('mc', 'fill', 'reorder', 'listening', 'speak', 'translate'));

ALTER TABLE public.questions DROP CONSTRAINT question_shape_matches_type;
ALTER TABLE public.questions ADD CONSTRAINT question_shape_matches_type CHECK (
  (type = 'mc' AND choices IS NOT NULL AND answer_index IS NOT NULL
     AND bank IS NULL AND answer_text IS NULL)
  OR
  (type IN ('fill', 'reorder', 'translate') AND bank IS NOT NULL
     AND answer_text IS NOT NULL AND choices IS NULL AND answer_index IS NULL)
  OR
  (type = 'listening' AND choices IS NOT NULL AND answer_text IS NOT NULL
     AND bank IS NULL AND answer_index IS NULL)
  OR
  (type = 'speak' AND answer_text IS NOT NULL
     AND choices IS NULL AND bank IS NULL AND answer_index IS NULL)
);
```

- [ ] **Step 11: Re-baseline ids and verify insertions only**

Run: `bun run scripts/snapshot-english-ids.ts`, then `git diff --stat -- .audit-baseline/english-ids.json`.
Expected: insertions only, 0 deletions. If anything was deleted, a pack line was edited in place — stop and fix that first.

- [ ] **Step 12: Regenerate the iOS bundle and commit**

```bash
bun scripts/export-ios-content.ts
git add -A
git commit -m "feat: add translate question variant, its row shape, and the A1 pack"
```

---

### Task 2: The local matcher, in three runtimes

**Files:**
- Create: `src/lib/translation-answer.ts`, `src/lib/translation-answer.test.ts`
- Create: `supabase/functions/grade-review/translation-answer.ts`, `.../translation-answer.test.ts`
- Create: `ios/LearnWithAlphonsoKit/Sources/LearnWithAlphonsoKit/TranslationAnswer.swift`
- Modify: `ios/LearnWithAlphonsoKit/Tests/LearnWithAlphonsoKitTests/` (new `TranslationAnswerTests.swift`)
- Modify: `.github/workflows/ci.yml` (run the new Deno test)

**Interfaces:**
- Consumes: Task 1's `acceptableAnswers`.
- Produces:
  ```ts
  export function normaliseWritten(input: string): string;
  export function matchesAcceptableAnswer(submission: string, acceptable: string[]): boolean;
  ```
  Swift: `public enum TranslationAnswer { public static func normalise(_:) -> String; public static func matches(submission:acceptable:) -> Bool }`

- [ ] **Step 1: Write the failing tests**

In `src/lib/translation-answer.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { matchesAcceptableAnswer, normaliseWritten } from "./translation-answer";

const ACCEPTED = ["I don't understand.", "I do not understand."];

describe("matchesAcceptableAnswer", () => {
  it("accepts any curated phrasing regardless of case and end punctuation", () => {
    expect(matchesAcceptableAnswer("i dont understand", ACCEPTED)).toBe(true);
    expect(matchesAcceptableAnswer("I DO NOT UNDERSTAND!", ACCEPTED)).toBe(true);
  });

  it("reuses the spoken normaliser's contraction handling", () => {
    // Written and spoken answers hit the same "is 'don't' the same as 'do
    // not'" question, and having two different answers to it would mean a
    // phrase accepted when said and rejected when typed.
    expect(normaliseWritten("I don't understand")).toBe(normaliseWritten("I do not understand"));
  });

  it("rejects a different sentence and a partial one", () => {
    expect(matchesAcceptableAnswer("I understand", ACCEPTED)).toBe(false);
    expect(matchesAcceptableAnswer("I do not", ACCEPTED)).toBe(false);
  });

  it("treats an empty submission as no answer", () => {
    expect(matchesAcceptableAnswer("", ACCEPTED)).toBe(false);
    expect(matchesAcceptableAnswer("   ", ACCEPTED)).toBe(false);
  });

  it("is not fooled by an empty acceptable list", () => {
    // A malformed pack line must never make everything correct.
    expect(matchesAcceptableAnswer("anything", [])).toBe(false);
  });
});
```

- [ ] **Step 2: Run them and watch them fail**

Run: `bun run vitest run src/lib/translation-answer.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement it on top of the spoken normaliser**

```ts
import { normaliseSpoken } from "./spoken-answer";

/**
 * A typed translation and a spoken one face the same normalisation question --
 * "don't" vs "do not", "café" vs "cafe" -- and answering it twice would mean a
 * phrasing accepted when said and rejected when typed. So this reuses
 * `normaliseSpoken` rather than growing a second set of rules, and adds
 * nothing of its own beyond the name.
 */
export function normaliseWritten(input: string): string {
  return normaliseSpoken(input);
}

/**
 * Whether `submission` is one of the curated phrasings.
 *
 * An empty submission is false, and so is an empty `acceptable` list: a
 * malformed pack line must fail closed, never make every answer correct.
 */
export function matchesAcceptableAnswer(submission: string, acceptable: string[]): boolean {
  const said = normaliseWritten(submission);
  if (!said) return false;
  return acceptable.some((a) => normaliseWritten(a) === said);
}
```

- [ ] **Step 4: Run them and watch them pass**

Run: `bun run vitest run src/lib/translation-answer.test.ts`
Expected: PASS.

- [ ] **Step 5: Write the Deno mirror and its test**

`supabase/functions/grade-review/translation-answer.ts` imports `normaliseSpoken` from the Deno `./spoken-answer.ts` already in that directory, and exports the same two functions with the same bodies. `translation-answer.test.ts` mirrors **the same vectors** as Step 1 using `assertEquals` from `jsr:@std/assert@1` (pinned to `@1`, matching the other tests — an unpinned `@*` dirties `deno.lock`).

- [ ] **Step 6: Add the Deno test to CI**

In `.github/workflows/ci.yml`, in the `deno-tests` job next to the existing `spoken-answer.test.ts` step:

```yaml
      - name: Test grade-review's translation-answer.ts port
        run: deno test supabase/functions/grade-review/translation-answer.test.ts
```

A parity guard CI does not run is decorative.

- [ ] **Step 7: Write the Swift port and its tests**

`TranslationAnswer.swift` delegates to `SpokenAnswer.normalise` for the same reason the TypeScript does, and `TranslationAnswerTests.swift` carries the same five vectors.

- [ ] **Step 8: Run all three suites**

Run: `bun run vitest run src/lib/translation-answer.test.ts`, `deno test supabase/functions/grade-review/`, `ios/LearnWithAlphonsoKit/swift-test.ps1 test`
Expected: all pass.

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "feat: add the local translation matcher in all three runtimes"
```

---

### Task 3: `/api/grade-translation` and its quota kind

**Files:**
- Create: `src/lib/translation-grader.server.ts`, `src/lib/translation-grader.server.test.ts`
- Create: `src/routes/api/grade-translation.ts`, `src/routes/api/grade-translation.test.ts`
- Modify: `src/lib/ai-quota.server.ts` (`QuotaKind`, `DAILY_LIMITS`)

**Interfaces:**
- Consumes: `matchesAcceptableAnswer` (Task 2), `resolveNvidiaChatModel` from `@/lib/nvidia-chat-model.server`, `consumeQuota` from `@/lib/ai-quota.server`.
- Produces:
  ```ts
  export type TranslationVerdict = { correct: boolean; reason: string | null; source: "local" | "ai" };
  export async function gradeTranslationWithAi(args: {
    prompt: string; acceptableAnswers: string[]; submission: string; apiKey: string; model: string;
  }): Promise<{ correct: boolean; reason: string | null } | null>;
  ```
  `null` means **no usable AI opinion** — never `false`.
  Route contract: `POST /api/grade-translation` with `{ lessonId, questionId, submission, course }` → `200 { correct, reason, source }`.

- [ ] **Step 1: Write the failing grader tests**

In `src/lib/translation-grader.server.test.ts`:

```ts
it("returns null rather than false when the model output cannot be parsed", async () => {
  // Anything unparseable means "no AI opinion", so the caller keeps the local
  // verdict. Reading prose as a verdict would mark correct answers wrong.
  vi.stubGlobal("fetch", vi.fn(async () => ({
    ok: true,
    json: async () => ({ choices: [{ message: { content: "Well, it depends!" } }] }),
  })));
  expect(await gradeTranslationWithAi(ARGS)).toBeNull();
});

it("returns null when the model call fails", async () => {
  vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false, status: 500, text: async () => "boom" })));
  expect(await gradeTranslationWithAi(ARGS)).toBeNull();
});

it("reads a well-formed verdict", async () => {
  vi.stubGlobal("fetch", vi.fn(async () => ({
    ok: true,
    json: async () => ({
      choices: [{ message: { content: '{"correct": true, "reason": "Same meaning, natural wording."}' } }],
    }),
  })));
  expect(await gradeTranslationWithAi(ARGS)).toEqual({
    correct: true,
    reason: "Same meaning, natural wording.",
  });
});
```

- [ ] **Step 2: Run them and watch them fail**

Run: `bun run vitest run src/lib/translation-grader.server.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the grader**

Prompt the model as a strict marker: it receives the instruction, the curated acceptable answers, and the submission, and must reply with only `{"correct": boolean, "reason": string}`. Parse with a guard that returns `null` unless `correct` is a boolean. Never throw out of this function — a rejected promise here would surface as a wrong answer.

- [ ] **Step 4: Run them and watch them pass**

Run: `bun run vitest run src/lib/translation-grader.server.test.ts`
Expected: PASS.

- [ ] **Step 5: Write the failing route tests**

In `src/routes/api/grade-translation.test.ts`, following `stt.test.ts`'s shape:

```ts
it("answers from the local list without spending quota or calling the model", async () => {
  const fetchSpy = vi.fn();
  vi.stubGlobal("fetch", fetchSpy);
  const res = await post({ submission: "I don't understand." });
  expect(await res.json()).toMatchObject({ correct: true, source: "local" });
  expect(consumeQuota).not.toHaveBeenCalled();
  expect(fetchSpy).not.toHaveBeenCalled();
});

it("keeps the local verdict when the AI grader is unavailable", async () => {
  // No key configured. A learner must not be marked wrong because a vendor is
  // down -- the local list is still a real verdict.
  delete process.env.NVIDIA_API_KEY;
  const res = await post({ submission: "I truly do not get it" });
  expect(res.status).toBe(200);
  expect(await res.json()).toMatchObject({ correct: false, source: "local" });
});

it("rejects an unknown lesson or question rather than grading it", async () => {
  const res = await post({ questionId: "nope" });
  expect(res.status).toBe(400);
});
```

- [ ] **Step 6: Run them and watch them fail**

Run: `bun run vitest run src/routes/api/grade-translation.test.ts`
Expected: FAIL — route not found.

- [ ] **Step 7: Implement the route**

Resolve the question through `getCourse(course).findLesson(lessonId)` and match `questionId` — the submission is graded against **server-side content**, never against `acceptableAnswers` sent by the client. Local match first; on a miss and only then, `consumeQuota(request, "translate")` and call the grader. Quota exhaustion or a `null` grader result returns the local verdict with `source: "local"`.

- [ ] **Step 8: Add the quota kind**

```ts
export type QuotaKind = "chat" | "stt" | "tts" | "translate";
```
with its own entry in `DAILY_LIMITS`, so translation grading cannot drain conversation practice's budget.

- [ ] **Step 9: Run the route tests**

Run: `bun run vitest run src/routes/api/grade-translation.test.ts`
Expected: PASS.

- [ ] **Step 10: Commit**

```bash
git add -A
git commit -m "feat: add /api/grade-translation with a local-first hybrid verdict"
```

---

### Task 4: Make the review server agree with the player

**Files:**
- Modify: `supabase/functions/grade-review/index.ts`
- Create: `supabase/functions/grade-review/translation-grader.ts`
- Modify: `supabase/functions/grade-review/srs.test.ts`

**Interfaces:**
- Consumes: Task 2's Deno matcher, Task 3's prompt and parsing rules.
- Produces: `deriveAnswerCorrectness` becomes `async` for the translate path only — callers `await` it.

- [ ] **Step 1: Write the failing test**

```ts
Deno.test("an AI-accepted paraphrase is graded correct, not lapsed", async () => {
  // This is the whole point of the task. The player accepts a valid phrasing
  // the curated list did not anticipate; if this function string-matched only,
  // the learner would be shown "Still got it" and have the item lapsed anyway,
  // which is invisible from either side alone.
  stubFetchWithVerdict({ correct: true, reason: "Same meaning." });
  const row = { type: "translate", bank: ["I don't understand."], answer_text: "I don't understand." };
  assertEquals(await deriveAnswerCorrectness(row, "I really don't follow you"), true);
});

Deno.test("an unavailable AI grader leaves the local verdict standing", async () => {
  stubFetchFailure();
  const row = { type: "translate", bank: ["I don't understand."], answer_text: "I don't understand." };
  assertEquals(await deriveAnswerCorrectness(row, "I really don't follow you"), false);
  assertEquals(await deriveAnswerCorrectness(row, "i dont understand"), true);
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `deno test supabase/functions/grade-review/srs.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement the translate branch**

Local match against `bank` first. On a miss, call the mirrored grader with the function's own `NVIDIA_API_KEY` env var; `null` leaves the local verdict. The branch must be reached **before** the generic `answer_text` comparison at the bottom of the function, or a paraphrase never gets that far.

Two facts belong in the code as comments rather than left implicit: this
function has **no `consumeQuota`** (that helper is web-side, backed by Supabase
tables), and its structural rate limit is that an item must be *due* to be
graded at all - roughly one call per due item per day. And if `NVIDIA_API_KEY`
is not configured for this function in the Supabase dashboard, translate review
grading quietly degrades to local-only: a correct outcome, but a stricter one
than the lesson player's.

- [ ] **Step 4: Await the call site**

`deriveAnswerCorrectness` is called once, at `index.ts:157`. Make it `await`ed and confirm nothing else calls it synchronously.

- [ ] **Step 5: Run the Deno suite**

Run: `deno test supabase/functions/grade-review/`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: grade translate review items with the same hybrid rule as the player"
```

---

### Task 5: Render and grade translation in the lesson player

**Files:**
- Create: `src/components/TranslateAnswer.tsx`, `src/components/TranslateAnswer.test.tsx`
- Modify: `src/routes/_authenticated/lesson.$id.tsx`
- Modify: `src/lib/srs.ts` (`deriveAnswerCorrectness`)
- Test: `src/routes/_authenticated/lesson.$id.test.tsx`

**Interfaces:**
- Consumes: `matchesAcceptableAnswer` (Task 2), `POST /api/grade-translation` (Task 3).
- Produces: `<TranslateAnswer question value onChange checked verdict onVerdict />`.

- [ ] **Step 1: Add the local rule to the shared helper**

In `src/lib/srs.ts`, before the generic comparison:

```ts
// The LOCAL half of translate grading. The AI half cannot live here --
// this function is synchronous and is mirrored into an edge function --
// so the players call /api/grade-translation for a second opinion and
// pass the result in. What this returns is the floor, never the ceiling.
if (question.type === "translate") {
  return matchesAcceptableAnswer(answer, question.acceptableAnswers);
}
```

- [ ] **Step 2: Write the failing player tests**

```tsx
it("keeps a translation question answerable with no network", async () => {
  // deriveLessonCompletion throws when the submitted total does not equal the
  // lesson's question count, so a question that cannot be answered offline is
  // a lesson that can never be completed: no XP, no streak, no unlock.
  vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("offline"); }));
  const user = userEvent.setup();
  currentLessonId = "a1p25l1";
  renderPage();
  await user.click(await screen.findByRole("button", { name: "Begin lesson" }));
  await user.type(screen.getByLabelText("Your answer"), "good morning");
  await user.click(screen.getByRole("button", { name: "Check" }));
  expect(await screen.findByText("Nice.")).toBeInTheDocument();
});

it("does not enable Check for a whitespace-only submission", async () => {
  const user = userEvent.setup();
  currentLessonId = "a1p25l1";
  renderPage();
  await user.click(await screen.findByRole("button", { name: "Begin lesson" }));
  await user.type(screen.getByLabelText("Your answer"), "   ");
  expect(screen.getByRole("button", { name: "Check" })).toBeDisabled();
});
```

- [ ] **Step 3: Run them and watch them fail**

Run: `bun run vitest run src/routes/_authenticated/lesson.\$id.test.tsx`
Expected: FAIL.

- [ ] **Step 4: Build `TranslateAnswer` and wire it in**

A textarea labelled "Your answer", the prompt above it, and — once checked and wrong — the canonical phrasing plus the AI's one-line reason when there is one. On Check, the player grades locally; if the local verdict is `false` it calls `/api/grade-translation` and upgrades the verdict if the server says so. A failed call leaves the local verdict and shows nothing extra: the learner is never told a vendor was unavailable in a way that reads as a grade.

Gate Check on `picked?.trim()`, not `picked`, so whitespace spends no quota.

- [ ] **Step 5: Run them and watch them pass**

Run: `bun run vitest run src/routes/_authenticated/lesson.\$id.test.tsx src/components/TranslateAnswer.test.tsx`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: render and grade translation questions in the lesson player"
```

---

### Task 6: Render and grade translation in the review player - and make the web server agree

**Files:**
- Modify: `src/lib/review.functions.ts` (`gradeReview`)
- Modify: `src/routes/_authenticated/review.tsx`
- Test: `src/lib/review.functions.test.ts`, `src/routes/_authenticated/review.test.tsx`

**Interfaces:**
- Consumes: `matchesAcceptableAnswer` (Task 2), `gradeTranslationWithAi` (Task 3).
- Produces: `gradeReview` returns `{ retired, dueOn, correct }` - the added
  `correct` is what the player displays.

**Why this is not just "reuse the component":** the web review player grades
through `gradeReview`, a server function, NOT through the `grade-review` edge
function, which is the iOS path. Task 4 fixed the iOS one. Without this task web
review would string-match while the lesson player accepts paraphrases, and the
learner would be shown "Still got it" on an item the scheduler then lapsed.

- [ ] **Step 1: Write the failing server-function test**

```ts
it("accepts a paraphrase the curated list did not anticipate", async () => {
  stubAiVerdict({ correct: true, reason: "Same meaning." });
  const res = await gradeReview({
    data: { itemKey: "a1p25l1:a1p25q0", answer: "morning to you", course: "en" },
  });
  expect(res.correct).toBe(true);
});

it("falls back to the local verdict when the AI grader is unavailable", async () => {
  stubAiUnavailable();
  const res = await gradeReview({
    data: { itemKey: "a1p25l1:a1p25q0", answer: "morning to you", course: "en" },
  });
  expect(res.correct).toBe(false);
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `bun run vitest run src/lib/review.functions.test.ts`
Expected: FAIL - `correct` is not returned, and the paraphrase grades false.

- [ ] **Step 3: Grade translate hybrid in `gradeReview`, and return the verdict**

Replace the synchronous `deriveAnswerCorrectness(ref.question, data.answer)`
call at `src/lib/review.functions.ts:212` with: local match first, then - for
`translate` only, and only on a miss - the AI grader, reusing Task 3's module
directly (this is a server function, so no HTTP hop). Add `correct` to every
return path, including the two early returns (`{ retired: false, dueOn: today() }`
and the not-due branch).

- [ ] **Step 4: Write the failing player test**

```tsx
it("renders and grades a translation review item rather than a blank card", async () => {
  fetchDueReviews.mockResolvedValue({ due: [{ itemKey: "a1p25l1:a1p25q0" }], total: 1 });
  gradeReview.mockResolvedValue({ retired: false, dueOn: "2026-09-25", correct: true });
  const user = userEvent.setup();
  renderPage();

  expect(await screen.findByText("Write this in English:")).toBeInTheDocument();
  await user.type(screen.getByLabelText("Your answer"), "morning to you");
  await user.click(screen.getByRole("button", { name: "Check" }));
  expect(await screen.findByText("Still got it.")).toBeInTheDocument();
});
```

Note what this pins: the player shows **the server's** verdict. Locally
"morning to you" does not match, and the displayed result is still correct
because the server said so. If the player computed its own verdict this test
fails, which is the point.

- [ ] **Step 5: Run it and watch it fail**

Run: `bun run vitest run src/routes/_authenticated/review.test.tsx`
Expected: FAIL - blank card.

- [ ] **Step 6: Render `TranslateAnswer` here and display the server's verdict**

`key={q.id}`, as the speaking card is keyed. For `translate` only, hold the
verdict returned by `grade(...)` and render feedback from it; the other five
types keep computing `isCorrect` locally, which is right for them because their
grading is pure string comparison on both sides.

- [ ] **Step 7: Run both suites**

Run: `bun run vitest run src/lib/review.functions.test.ts src/routes/_authenticated/review.test.tsx`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "feat: grade translate review items hybrid server-side on web too"
```

---

### Task 7: iOS — six switches, one card, offline-local grading

**Files:**
- Modify: `ios/.../LearnWithAlphonsoKit/CurriculumModels.swift` (case + struct + decoder)
- Modify: `ios/.../LearnWithAlphonsoKit/QuestionGrading.swift`
- Modify: `ios/.../LearnWithAlphonsoKit/VocabDerivation.swift` (three switches)
- Modify: `ios/LearnWithAlphonso/Sources/LessonPlayerView.swift`, `ReviewQueueView.swift` (id helper + render switch in each)
- Create: `ios/LearnWithAlphonso/Sources/TranslateQuestionCard.swift`
- Test: `ios/.../LearnWithAlphonsoKitTests/TranslateQuestionTests.swift`

- [ ] **Step 1: Write the failing Kit tests**

Decode a `translate` question from JSON; grade a curated phrasing correct and a different sentence wrong; assert `deriveVocab` contributes nothing for it (the answer is a whole sentence, same as listening, speak and reorder).

- [ ] **Step 2: Run them and watch them fail**

Run: `ios/LearnWithAlphonsoKit/swift-test.ps1 test`
Expected: FAIL.

- [ ] **Step 3: Add the case, struct and decoder branch**

The decoder must keep failing loudly on an unknown type — the lenient `.unsupported` variant was tried and reverted because a skipped question leaves the lesson with fewer questions than the server's copy and `deriveLessonCompletion` throws, so the learner finishes and silently receives nothing.

- [ ] **Step 4: Fill in all six switches**

`isAnswerCorrect` (via `TranslationAnswer.matches`), `answerOf`, `exampleOf`, the explanation switch in `deriveVocab`, and `questionID` in **both** players.

- [ ] **Step 5: Build `TranslateQuestionCard`**

A `TextEditor` on Canopy tokens, the prompt above it, the canonical phrasing revealed after a wrong answer. **Online** it calls `/api/grade-translation` through `AIConversationClient` for the second opinion; **offline** (`isConnected == false`) it grades locally and says nothing about the network — the question is still answerable and still counts, which is the whole reason it does not skip.

- [ ] **Step 6: Run the Kit tests**

Run: `ios/LearnWithAlphonsoKit/swift-test.ps1 test`
Expected: PASS. The app target only compiles on macOS, so `ios-app-build` in CI is what verifies the card and the two players.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat(ios): decode, render and grade translation questions"
```

---

### Task 8: Remaining content, artifacts, docs, review

- [ ] **Step 1: Author one translate pack per remaining band (A2, B1, B2, C1)**

25 lines each, at least three acceptable phrasings per line, scaled by band. Append to each level's array — appending only.

- [ ] **Step 2: Re-baseline and verify insertions only**

Run: `bun run scripts/snapshot-english-ids.ts`; confirm the diff has 0 deletions.

- [ ] **Step 3: Regenerate artifacts**

Run: `bun scripts/export-ios-content.ts` and `bun run scripts/gen-answer-pos.ts`. Confirm only `curriculum-en.json` changed, and confirm question-by-question that the regenerated bundle **adds** rows without changing existing ones.

- [ ] **Step 4: Update the four hardcoded counts**

`src/lib/curriculum-seed.test.ts` (×2), `src/lib/ios-content-export.test.ts`, `ios/.../ContentStoreTests.swift`. English goes 584 -> **609** (five packs x 25 lines = 25 lessons, 125 questions).

- [ ] **Step 5: Full verification**

`bun run tsc --noEmit` · `bun run lint` · `bun run vitest run src` · `deno test supabase/functions/` · `ios/LearnWithAlphonsoKit/swift-test.ps1 test`

- [ ] **Step 6: Docs**

Audit-log rows for the five new packs (by hand — `init-audit-log.ts` refuses to overwrite a filled log), `ARCHITECTURE.md` (six types now; the AI-fallback-on-both-sides rule and why), `README.md` counts, `CHANGELOG.md`, `AGENTS.md`'s count table.

- [ ] **Step 7: Seed the live database**

The curriculum tables are read by `grade-review` to re-derive correctness, so translate rows must exist there or every translate review item 400s. Apply the migration, then upsert the new packs' rows and verify by digest that what is live matches source.

- [ ] **Step 8: Whole-branch review BEFORE opening the PR**

Run the independent review while the branch is still local. On the speaking round it found four defects of the "correct learner, punished" or "learner permanently blocked" kind, two of them things the docs already claimed were handled, and none of them catchable by any test. Green CI is not a substitute.
