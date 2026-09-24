# Speaking Question Type (Phase 2, Plan B) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship speaking practice as a question type: the learner is shown a phrase, records themselves saying it, and is graded on whether the transcript matches — with pronunciation clarity reported as feedback, never as a pass/fail gate.

**Architecture:** Add a `speak` variant whose `answer` is the expected phrase text. Recording and transcription already exist end to end (`/api/stt` → Deepgram → `{ text, confidence }`, driven from a `MediaRecorder` on web and `TurnRecorder` on iOS); this plan extracts that flow from the conversation feature and reuses it. The genuinely new piece is grading: a spoken transcript needs tolerant matching ("She's a doctor" vs "she is a doctor"), so this plan adds a normaliser shared with the later translation type.

**Tech Stack:** TypeScript, React (TanStack Start), Vitest, Swift/SwiftUI, Bun as runner and TS script executor (`tsx` is NOT installed). No new dependencies, no new vendor.

**Spec:** `docs/superpowers/specs/2026-09-23-english-content-overhaul-design.md` (Phase 2, "Speaking/pronunciation practice")

## Measured blast radius (probed, not assumed)

Added the variant and ran `bunx tsc --noEmit`: **4 errors across 3 files** — `bank-engine.ts` (2), `curriculum-seed.ts` (1), `english-content-dump.ts` (1). All the same shape as last time: code that narrows other types away and assumes the remainder is `fill` or `reorder`.

**The two web players do NOT error**, because the explicit `q.type === "fill"` guards added in the listening round make a new variant fall through to `null`. That is safe but silent: a `speak` question would render a blank card with no compile error and no test failure. On iOS the same mistake fails the build, because Swift switches are exhaustive. Web is the platform that needs deliberate attention here, not iOS — the opposite of the intuition.

## Global Constraints

- **English only for content.** No speaking content in `lesson-bank-fr.ts`, `lesson-bank-es.ts`, `curriculum-fr.ts`, `curriculum-es.ts`, `placement-fr.ts`, `placement-es.ts`.
- **Id stability.** Ids are `${pack.id}q${i}` / `${pack.id}l${n}`, derived from pack id and line index; users' review items key on `` `${lessonId}:${questionId}` ``. Appending a pack adds ids without moving existing ones. Re-baseline `.audit-baseline/english-ids.json` deliberately, in its own commit, and require an insertions-only diff.
- **Never run the bare full test suite** — it hangs in this Windows sandbox. Scope it: `bun run vitest run <paths>`.
- **Swift now runs locally** (`ios/LearnWithAlphonsoKit/swift-test.ps1 test`, via PowerShell, ~217 tests). Use it; do not wait on CI for Kit changes. The app target still only compiles on CI (`ios-app-build`).
- **A new question type must be wired into SIX exhaustive iOS switches**: `LessonPlayerView.swift` (×2), `ReviewQueueView.swift` (×2), `QuestionGrading.swift`, `VocabDerivation.swift` (×3 — the third only surfaces after the first two are fixed).
- **Three hardcoded English lesson counts** must be updated together: `curriculum-seed.test.ts`, `ios-content-export.test.ts`, `ContentStoreTests.swift` (the Swift one reads the exported bundle, so grepping `src/` misses it).
- **iOS UI uses the Canopy design system**; web uses the Canopy tokens. Text on `bg-ember` must use `text-ink-on-ember`, never `text-surface`.
- `src/integrations/supabase/types.ts` is stale (7 tables missing) — do not add a typed `supabase.from()` against them.
- This plan adds no user-scoped table. If that changes, add it to `USER_ID_EXPORT_TABLES` or `account.functions.test.ts` fails the build.
- **`vitest` does not typecheck.** Type-level work is gated on `bunx tsc --noEmit`, never a test run.

## Review Focus

1. **A `speak` question rendering as a blank card on web.** Both players fall through to `null` for an unhandled type, with no compile error (measured above). Pinned in Tasks 4 and 5.
2. **A failed recording costing the learner a heart.** Denied mic permission, no device, offline, or a Deepgram error all produce "no transcript" — which must never be graded as a wrong answer. This is the same class as the listening no-audio defect, where a 1-in-4 guess cost a heart. Pinned in Task 3.
3. **A device with no microphone at all.** `getUserMedia` is absent in insecure contexts and some browsers. The question must be skippable without penalty rather than unanswerable. Pinned in Task 4.
4. **Low confidence marking a correct answer wrong.** The spec is explicit: confidence is feedback, never a gate. A learner with an accent or a cheap mic must not be failed for words the transcript got right. Pinned in Task 3.
5. **A speaking question reaching the offline review queue on iOS.** Grading needs a network round-trip, so an offline attempt must not be silently marked wrong. Pinned in Task 6.

---

### Task 1: Add the variant and guard the three narrowing sites

**Files:**
- Modify: `src/data/curriculum.ts` (the `Question` union)
- Modify: `src/data/bank-engine.ts` (~line 116, `reshuffleQuestion`)
- Modify: `src/lib/curriculum-seed.ts` (the literal union, and the row mapper)
- Modify: `src/lib/english-content-dump.ts` (the type ternary)
- Create: `supabase/migrations/20260925010000_v5_speaking_question_type.sql`

**Interfaces:**
- Produces: `{ id: string; type: "speak"; prompt: string; answer: string; explanation: string }` — `answer` is the expected phrase TEXT, matching `fill`/`reorder`/`listening`. Tasks 2-7 consume this.

Type-level task: its gate is `bunx tsc --noEmit`, not a test run.

- [ ] **Step 1: Confirm a clean baseline**

Run: `bunx tsc --noEmit` → exit 0. If not, stop; you are not on a clean base.

- [ ] **Step 2: Add the variant**

In `src/data/curriculum.ts`, before the `fill` member:

```ts
  | {
      id: string;
      type: "speak";
      /** Shown on screen; the learner reads it aloud. Unlike `listening`,
       * there is nothing to hide -- the exercise is production, not
       * comprehension. */
      prompt: string;
      /** The phrase the learner is expected to say. Compared against the STT
       * transcript after normalisation, so it is stored as text like
       * fill/reorder/listening rather than an index. */
      answer: string;
      explanation: string;
    }
```

- [ ] **Step 3: Confirm the predicted 4 errors**

Run: `bunx tsc --noEmit`
Expected: exactly 4 — `bank-engine.ts` (2), `curriculum-seed.ts` (1), `english-content-dump.ts` (1). Errors anywhere else mean the shape differs from this plan; stop and reconcile.

- [ ] **Step 4: Guard each site**

`bank-engine.ts` `reshuffleQuestion`: a speak question has nothing to shuffle, so return it untouched. Add before the final `fill` branch:

```ts
  if (q.type === "speak") return q;
```

`curriculum-seed.ts`: widen the literal union to include `"speak"`, and add a row mapper before the `fill` branch. A speak row carries only `answer_text`:

```ts
  if (q.type === "speak") {
    return { ...base, type: "speak", choices: null, bank: null, answer_index: null, answer_text: q.answer };
  }
```

`english-content-dump.ts`: add a branch so speak records its answer rather than falling into the `reorder` branch and reading `tokens`:

```ts
        : q.type === "speak"
          ? { ...base, answer: q.answer }
```

- [ ] **Step 5: Write the migration**

`speak` is a FOURTH row shape: `answer_text` only, with `choices`, `bank` and `answer_index` all null. The existing constraint permits three shapes and would reject every speak row.

```sql
-- V5 phase 2B: a "speak" question type alongside mc/fill/reorder/listening.
--
-- Its row shape is a fourth: answer_text alone, with choices, bank and
-- answer_index all null, because a speaking question has no options to choose
-- between and no word bank -- only the phrase the learner is expected to say.
--
-- grade-review's Deno function treats any non-'mc' row as a trimmed-text
-- comparison against answer_text, so a speak row grades correctly there with
-- no code change, the same property the reorder and listening migrations
-- relied on.
ALTER TABLE public.questions DROP CONSTRAINT questions_type_check;
ALTER TABLE public.questions ADD CONSTRAINT questions_type_check
  CHECK (type IN ('mc', 'fill', 'reorder', 'listening', 'speak'));

ALTER TABLE public.questions DROP CONSTRAINT question_shape_matches_type;
ALTER TABLE public.questions ADD CONSTRAINT question_shape_matches_type CHECK (
  (type = 'mc' AND choices IS NOT NULL AND answer_index IS NOT NULL
     AND bank IS NULL AND answer_text IS NULL)
  OR
  (type IN ('fill', 'reorder') AND bank IS NOT NULL AND answer_text IS NOT NULL
     AND choices IS NULL AND answer_index IS NULL)
  OR
  (type = 'listening' AND choices IS NOT NULL AND answer_text IS NOT NULL
     AND bank IS NULL AND answer_index IS NULL)
  OR
  (type = 'speak' AND answer_text IS NOT NULL
     AND choices IS NULL AND bank IS NULL AND answer_index IS NULL)
);
```

- [ ] **Step 6: Update the seed shape test**

`src/lib/curriculum-seed.test.ts` is the local stand-in for that constraint. Add a `speak` branch asserting the fourth shape, and assert at least one speak row exists once Task 7 adds content.

- [ ] **Step 7: Verify and commit**

```bash
bunx tsc --noEmit
bun run vitest run src/data src/lib
git add src/data/curriculum.ts src/data/bank-engine.ts src/lib/curriculum-seed.ts src/lib/curriculum-seed.test.ts src/lib/english-content-dump.ts supabase/migrations/20260925010000_v5_speaking_question_type.sql
git commit -m "feat: add speak question variant and its row shape"
```

---

### Task 2: Tolerant transcript matching

**Files:**
- Create: `src/lib/spoken-answer.ts`
- Create: `src/lib/spoken-answer.test.ts`

**Interfaces:**
- Produces: `matchesSpokenAnswer(transcript: string, expected: string): boolean` and `normaliseSpoken(s: string): string`. Task 3 consumes both; the later translation type reuses them.

Exact matching is wrong here: Deepgram returns "She's a doctor" or "she is a doctor" or "Shes a doctor." for the same utterance. Grading must forgive punctuation, casing, contraction expansion and filler, while still rejecting a genuinely different sentence.

- [ ] **Step 1: Write the failing tests**

```ts
// src/lib/spoken-answer.test.ts
import { describe, expect, it } from "vitest";
import { matchesSpokenAnswer, normaliseSpoken } from "./spoken-answer";

describe("normaliseSpoken", () => {
  it("strips punctuation and case", () => {
    expect(normaliseSpoken("She's a Doctor!")).toBe(normaliseSpoken("shes a doctor"));
  });

  it("treats a contraction and its expansion as the same", () => {
    expect(normaliseSpoken("she is a doctor")).toBe(normaliseSpoken("she's a doctor"));
  });
});

describe("matchesSpokenAnswer", () => {
  it("accepts the expected phrase however it was transcribed", () => {
    expect(matchesSpokenAnswer("She's a doctor.", "She is a doctor")).toBe(true);
    expect(matchesSpokenAnswer("she is a DOCTOR", "She's a doctor")).toBe(true);
  });

  it("forgives a leading filler word", () => {
    // Deepgram routinely prefixes "um"/"uh" from a held mic.
    expect(matchesSpokenAnswer("um, she's a doctor", "She's a doctor")).toBe(true);
  });

  it("rejects a different sentence", () => {
    expect(matchesSpokenAnswer("he is a driver", "She's a doctor")).toBe(false);
  });

  it("rejects a partial attempt", () => {
    // Saying half the phrase is not saying the phrase.
    expect(matchesSpokenAnswer("she is", "She's a doctor")).toBe(false);
  });

  it("treats an empty transcript as no answer, not a wrong one", () => {
    expect(matchesSpokenAnswer("", "She's a doctor")).toBe(false);
    expect(matchesSpokenAnswer("   ", "She's a doctor")).toBe(false);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `bun run vitest run src/lib/spoken-answer.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

Normalise by lowercasing, expanding a small set of contractions, stripping punctuation and filler, and collapsing whitespace. Match on the normalised strings being equal. Do NOT reach for fuzzy distance here: a Levenshtein threshold that accepts "he is a driver" for "she is a doctor" is worse than a strict comparison, and this content is short phrases where exactness is the point.

- [ ] **Step 4: Verify and commit**

Run: `bun run vitest run src/lib/spoken-answer.test.ts` → PASS.

```bash
git add src/lib/spoken-answer.ts src/lib/spoken-answer.test.ts
git commit -m "feat: add tolerant matching for spoken answers"
```

---

### Task 3: The recording hook

**Files:**
- Create: `src/lib/use-speech-capture.ts`
- Create: `src/lib/use-speech-capture.test.ts`

**Interfaces:**
- Consumes: `/api/stt`, `authHeaders`, `matchesSpokenAnswer` (Task 2).
- Produces: a hook exposing `{ start, stop, state, transcript, confidence, error, canRecord }`, extracted from the inline implementation in `converse_.$scenarioId.tsx` (lines ~81-225) rather than written fresh or copied a third time.

- [ ] **Step 1: Write the failing tests**

Cover, with `getUserMedia` and `fetch` mocked:
- a successful capture resolves a transcript and confidence;
- a denied permission sets `error` and leaves `state` idle, and **never** produces a wrong answer (Review Focus #2);
- an `/api/stt` failure does the same (Review Focus #2);
- `canRecord` is false when `navigator.mediaDevices` is absent (Review Focus #3);
- a release before `getUserMedia` resolves does not leave the mic open — the existing converse code documents this exact race at line 84, so the extraction must preserve it.

- [ ] **Step 2-4: RED, implement by extracting from the converse route, GREEN**

Extract rather than duplicate, and have `converse_.$scenarioId.tsx` use the hook so there is one implementation. Its existing tests must stay green — they are the regression net for the extraction.

- [ ] **Step 5: Commit**

```bash
git commit -m "feat: extract the microphone capture flow into a reusable hook"
```

---

### Task 4: Render and grade speaking in the lesson player

**Files:**
- Modify: `src/routes/_authenticated/lesson.$id.tsx`
- Test: `src/routes/_authenticated/lesson.$id.test.tsx`

- [ ] **Step 1: Write the failing test**

Point `currentLessonId` at the Task 7 pack and assert: the phrase is shown, a record control is present and enabled, and — with `canRecord` false — a skip affordance appears instead of a dead button (Review Focus #1, #3).

- [ ] **Step 2: RED**

Run the file's tests; the new one fails because the type renders nothing.

- [ ] **Step 3: Implement**

Add a `speak` branch: the phrase in the question heading, a hold-to-record control, transcript shown back after recording, and a "Check" that grades via `matchesSpokenAnswer`. Confidence renders as a secondary note only ("Clear" / "A little unclear — try again slower"), never affecting correctness (Review Focus #4).

Use Canopy tokens; if any control sits on `bg-ember`, use `text-ink-on-ember`.

**A failed or empty recording must not call the miss path.** Leave the question unanswered and show the error, so no heart is lost (Review Focus #2).

- [ ] **Step 4: GREEN, then verify visually**

`bun run dev` boots in this sandbox (the app itself needs Supabase env vars, so render the card in isolation against the built stylesheet as was done for listening). Confirm the control reads as native to Canopy.

- [ ] **Step 5: Commit**

---

### Task 5: Render and grade speaking in the review player

`review.tsx` is a second renderer with its own grading site. Review Focus #1.

**Files:**
- Modify: `src/routes/_authenticated/review.tsx`
- Test: `src/routes/_authenticated/review.test.tsx`

Mirror Task 4 exactly. Seed the review queue with a speak item, assert it renders and grades. Keep the two players' speak branches structurally identical; extract a shared component if they start to drift.

---

### Task 6: iOS

**Files:**
- Modify: `ios/LearnWithAlphonsoKit/Sources/LearnWithAlphonsoKit/CurriculumModels.swift`, `QuestionGrading.swift`, `VocabDerivation.swift`
- Modify: `ios/LearnWithAlphonso/Sources/LessonPlayerView.swift`, `ReviewQueueView.swift`
- Test: `ios/LearnWithAlphonsoKit/Tests/LearnWithAlphonsoKitTests/SpeakingQuestionTests.swift`

- [ ] **Step 1: Write the Swift tests, and run them locally**

`ios/LearnWithAlphonsoKit/swift-test.ps1 test` works on Windows again — use it rather than waiting on CI. Cover decoding, grading through `isAnswerCorrect` (tolerant matching ported to match Task 2's rules), and no vocabulary contribution.

- [ ] **Step 2: Add the case to all six switches**

The compiler will find them; `VocabDerivation.swift` has three and the third only appears after the first two are fixed.

- [ ] **Step 3: Render with `TurnRecorder`**

Reuse `ConversationView.swift`'s existing `TurnRecorder`; do not write a second recorder. Use Canopy design-system components.

- [ ] **Step 4: Offline behaviour**

Grading needs the network. An offline attempt must not be marked wrong — skip speaking questions when offline, consistent with the spec's decision, and never silently fail the learner (Review Focus #5).

- [ ] **Step 5: Run Swift tests locally, then push and confirm `ios-app-build`**

---

### Task 7: Content, artifacts and docs

- [ ] **Step 1: Author one speaking pack per CEFR band**

Phrases the learner reads aloud, scaled by band. Keep them short enough to say in one breath and unambiguous to transcribe; avoid homophone-heavy phrasing that Deepgram will render inconsistently.

- [ ] **Step 2: Re-baseline ids deliberately**

`bun run scripts/snapshot-english-ids.ts`, then confirm the diff is **insertions only**.

- [ ] **Step 3: Regenerate derived artifacts**

`gen-answer-pos.ts`, `export-ios-content.ts`. Confirm only `curriculum-en.json` changes.

- [ ] **Step 4: Update the three hardcoded lesson counts**

`curriculum-seed.test.ts`, `ios-content-export.test.ts`, `ContentStoreTests.swift`.

- [ ] **Step 5: Full verification**

`bunx tsc --noEmit`, `bun run lint`, `bun run vitest run src`, `swift-test.ps1 test`.

- [ ] **Step 6: Docs**

Audit log rows (add by hand — `init-audit-log.ts` refuses to overwrite a filled log), `ARCHITECTURE.md` (five question types now; the six-switch and four-row-shape facts), `README.md` counts, `CHANGELOG.md`.

- [ ] **Step 7: Whole-branch review BEFORE opening the PR**

Run the independent review while the branch is still local. On the listening round it was run after pushing and found a silent progress-loss bug plus content that repeated the original complaint — both invisible to every test. Do not treat green CI as a substitute.
