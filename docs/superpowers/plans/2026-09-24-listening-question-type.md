# Listening Question Type (Phase 2, Plan A) Implementation Plan

> **STATUS: executed, PR #88.** Four things this plan got wrong, recorded here
> because the next question type will hit the same ground:
>
> 1. **It said two exhaustive switches over `Question` on iOS. There are six** —
>    and one of them, `ReviewQueueView.swift`, is an entire second iOS player.
>    That is the same "second renderer" trap the plan *did* catch for the web
>    (`review.tsx`) and still missed for iOS. Swift saved it: exhaustive
>    switches fail to compile, where the web fails silently with a blank card.
>    Also `QuestionGrading.swift` (grading is not inherited on iOS the way it
>    is on web) and `VocabDerivation.swift` (three switches, the third only
>    surfaced after the first two were fixed).
> 2. **A Postgres migration was required, and the plan explicitly ruled schema
>    work out of scope.** `questions.question_shape_matches_type` permits
>    exactly two row shapes; listening is a third (`choices` like mc, but
>    `answer_text` like fill). Every listening row would have been rejected.
>    `curriculum-seed.test.ts` is the local stand-in for that constraint and
>    caught it; `20260921010000_v5_...` (the same widening for `reorder`) was
>    the precedent. See `20260924010000_v5_listening_question_type.sql`.
> 3. **Re-running `scripts/init-audit-log.ts` destroyed the phase 1 audit log**
>    — all 112 verdicts, recovered from git. That script scaffolds, it does not
>    maintain; it now refuses to overwrite a filled log.
> 4. **Three hardcoded lesson counts needed updating** beyond the content
>    itself: `curriculum-seed.test.ts`, `ios-content-export.test.ts`, and
>    `ContentStoreTests.swift` all assert English's lesson count (534 → 559).
>    The Swift one was found only by CI, two pushes later, because it reads the
>    exported bundle rather than the source. Adding a pack is never only a
>    content change — grep for the current count before assuming otherwise.
>
> What the plan got right and is worth repeating: probing the type change with
> `tsc` before committing to a shape (which is how the text-vs-index decision
> was made on evidence), and re-baselining ids early rather than at the end.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship listening comprehension as a first-class question type — its own `Question` variant, its own distinguished UI on web and iOS, and real authored content — replacing the hidden `audioText`-on-`mc` format that exists today and is used in 3 questions.

**Architecture:** Add a `listening` variant to the TypeScript `Question` union whose `answer` is the correct choice **text**, not an index. That one decision makes every existing grading path work unchanged (`srs.ts`'s `deriveAnswerCorrectness`, and both web players' fallback comparison), so this plan is almost entirely rendering plus content. Then teach the iOS model and player about it, and make the iOS decoder tolerate unknown question types so content and app builds can ship independently.

**Tech Stack:** TypeScript, React (TanStack Start), Vitest, Swift/SwiftUI (LearnWithAlphonsoKit + app target), Bun as runner and TS script executor (`tsx` is NOT installed).

**Spec:** `docs/superpowers/specs/2026-09-23-english-content-overhaul-design.md` (Phase 2, "Listening comprehension — first-class type")

## Why this plan is first

It is the cheapest of the three new types — audio playback already exists on both platforms — and it establishes the end-to-end pathway every later type reuses: TS union → engine → both web players → Swift model → Swift player → content → export. Speaking and translation each add one new dependency (microphone capture, LLM grading) on top of that same pathway, so proving it once de-risks both.

## Measured blast radius (verified, not assumed)

A probe added the variant and ran `bunx tsc --noEmit`. With `answer: number` (mirroring `mc`) it produced **14 errors across 6 files**, because several call sites narrow `mc` away and then assume the remainder has a string `answer` and a `bank`. With `answer: string` it produces **8 errors across 4 files**, all of one shape: code that excludes `mc`/`reorder` and treats the rest as `fill`.

So `answer` is a **string**. Consequences, all verified by the probe:

- `src/lib/srs.ts`'s `deriveAnswerCorrectness` needs **no change** — its non-`mc` branch compares `answer.trim().toLowerCase()` against `question.answer.trim().toLowerCase()`, which is exactly right for listening. This is the shared helper behind review grading, so listening grades correctly server-side and in review for free.
- Neither web player needs a **grading** change: both already fall through to that same string comparison for non-`mc` types.
- `fill` and `reorder` also use string answers, so `mc`'s index is the outlier, not the convention.

The 4 sites that DO need a guard (each excludes `mc`/`reorder` then assumes `fill`):

| File | Line | What it assumes |
|---|---|---|
| `src/data/bank-engine.ts` | 116-117 | `q.bank` exists on the remainder |
| `src/lib/curriculum-seed.ts` | 136 | `q.bank` exists on the remainder |
| `src/routes/_authenticated/lesson.$id.tsx` | 424 | `q.bank` exists on the remainder |
| `src/routes/_authenticated/review.tsx` | 298 | `q.bank` exists on the remainder |

`src/lib/english-content-dump.ts` (line 64) also needs a branch, since its `else` assumes `reorder` and reads `tokens`.

## Global Constraints

- **English only for content.** Do not add listening content to `lesson-bank-fr.ts`, `lesson-bank-es.ts`, `curriculum-fr.ts`, `curriculum-es.ts`, `placement-fr.ts`, `placement-es.ts`. Shared *code* (the union, the players, `bank-engine.ts`) is necessarily touched — that is expected and different from content.
- **Id stability.** Ids are `${pack.id}q${i}` / `${pack.id}l${n}` / `${pack.id}u${n}`, all derived from `pack.id` and the line index — never from global position. So **appending a new pack adds new ids without moving existing ones** (verified by reading `buildLevel`). Do NOT add or remove lines inside an existing pack. `.audit-baseline/english-ids.json` must be regenerated deliberately, in its own commit, and its diff must be insertions-only.
- **Never run the bare full test suite** (`bun run vitest run` with no args) — it hangs in this Windows sandbox. Always scope.
- **No Swift toolchain locally.** Swift RED/GREEN is verified by CI (`ios-swift-tests`, `ios-app-build` on macOS runners). Write the test first anyway, push, and report that the evidence was CI rather than claiming a local run.
- **iOS UI must use the Canopy design system** (`ios/LearnWithAlphonso/Sources/DesignSystem/AlphonsoComponents.swift`, `AlphonsoTheme.swift`, PR #83). Do not hand-roll colors, fonts, or card chrome.
- `src/integrations/supabase/types.ts` is stale (7 tables missing). Do not add a typed `supabase.from()` against those tables.
- This plan adds no user-scoped table. If that changes, add it to `USER_ID_EXPORT_TABLES` — `account.functions.test.ts` parses migrations and fails the build otherwise.
- **`vitest` does not typecheck.** It strips types via esbuild, so a test asserting on a type-level change passes whether or not the type exists. Type-level work is verified with `bunx tsc --noEmit`, never with a test run.

## Review Focus

1. **A listening question reaching the spaced-repetition review player.** `review.tsx` is a second renderer with its own render site; a type wired only into the lesson player renders as a blank card. Pinned in Task 5.
2. **An iOS build whose bundled JSON contains a type its decoder does not know.** Today `CurriculumModels.swift:77` throws, and the whole `ContentBundle` decodes at once, so one unknown type means the app loads *no content at all*. Pinned in Task 6.
3. **A listening question with empty `audioText`.** The learner gets a silent play button and an unanswerable question. Pinned in Task 2.
4. **A listening question whose `prompt` restates the audio.** Solvable without listening, so it tests nothing. Pinned in Task 3.
5. **A device with no speech synthesis.** `speak()` returns silently (`src/lib/speech.ts:14`), so the choices must remain answerable with no audio. Pinned in Task 4.

---

### Task 1: Add the variant and guard the four narrowing sites

**Files:**
- Modify: `src/data/curriculum.ts` (the `Question` union, ~line 6-42)
- Modify: `src/data/bank-engine.ts` (~line 116)
- Modify: `src/lib/curriculum-seed.ts` (~line 43 and ~line 136)
- Modify: `src/lib/english-content-dump.ts` (~line 53-64)
- Modify: `src/routes/_authenticated/lesson.$id.tsx` (~line 424)
- Modify: `src/routes/_authenticated/review.tsx` (~line 298)

**Interfaces:**
- Produces: `{ id: string; type: "listening"; prompt: string; audioText: string; choices: string[]; answer: string; explanation: string }` — `answer` is the correct choice TEXT. Tasks 2-6 consume this shape.

This task is type-level, so its gate is `bunx tsc --noEmit`, not a test run (see Global Constraints).

- [ ] **Step 1: Record the clean baseline**

Run: `bunx tsc --noEmit`
Expected: exit 0, no output. If this is already failing, stop — you are not on a clean base.

- [ ] **Step 2: Add the variant**

In `src/data/curriculum.ts`, add to the `Question` union immediately before the `fill` member:

```ts
  | {
      id: string;
      type: "listening";
      /** What the learner must decide AFTER hearing `audioText`. Must not
       * restate the audio: if the prompt contains it, the question is solvable
       * without listening. */
      prompt: string;
      /** Spoken via TTS. Required -- a listening question without audio is
       * unanswerable, which is why this is its own variant rather than the
       * optional `audioText` layered onto `mc`. */
      audioText: string;
      choices: string[];
      /** The correct choice's TEXT, not its index. Deliberately unlike `mc`:
       * it matches `fill`/`reorder`, and it makes every existing grading path
       * (srs.ts's deriveAnswerCorrectness, and both web players' non-mc
       * comparison) handle listening with no change. */
      answer: string;
      explanation: string;
    }
```

- [ ] **Step 3: Confirm the predicted 8 errors**

Run: `bunx tsc --noEmit`
Expected: 8 errors, in `bank-engine.ts` (116, 117), `curriculum-seed.ts` (136), `english-content-dump.ts` (64), `lesson.$id.tsx` (424 twice), `review.tsx` (298 twice). If you see errors in OTHER files, the union shape does not match this plan — stop and reconcile before editing anything else.

- [ ] **Step 4: Guard each site by narrowing to `fill` explicitly**

Each of these excludes `mc`/`reorder` and then assumes `fill`. Make that assumption explicit rather than implicit. In `src/data/bank-engine.ts` at ~116:

```ts
  if (q.type !== "fill") return q;
  const bank = [...q.bank].sort((a, b) => hash(seed + a) - hash(seed + b));
  return { ...q, bank };
```

In `src/lib/curriculum-seed.ts` at ~136, wrap the `bank` read in a `q.type === "fill"` check and return the listening row before it:

```ts
  if (q.type === "listening") {
    return { ...base, type: "listening", choices: q.choices, answer: q.answer, audioText: q.audioText };
  }
  if (q.type === "fill") {
    return { ...base, type: "fill", bank: q.bank, answer: q.answer };
  }
```

Also widen the literal union at ~line 43:

```ts
  type: "mc" | "fill" | "reorder" | "listening";
```

In `src/lib/english-content-dump.ts`, replace the two-way ternary's `else` with explicit branches so `listening` records its choices rather than falling into the `reorder` branch:

```ts
      q.type === "mc"
        ? { ...base, choices: q.choices, answer: q.choices[q.answer] ?? "", audioText: q.audioText, imageKey: q.imageKey }
        : q.type === "listening"
          ? { ...base, choices: q.choices, answer: q.answer, audioText: q.audioText }
          : q.type === "fill"
            ? { ...base, bank: q.bank, answer: q.answer }
            : { ...base, tokens: q.tokens, answer: q.answer };
```

In `lesson.$id.tsx` (~424) and `review.tsx` (~298), the `bank` read is inside the fill-rendering branch; gate it on `q.type === "fill"` explicitly.

- [ ] **Step 5: Verify clean**

Run: `bunx tsc --noEmit`
Expected: exit 0.

Run: `bun run vitest run src/data src/lib`
Expected: all pass — the guards must not change existing behavior.

- [ ] **Step 6: Commit**

```bash
git add src/data/curriculum.ts src/data/bank-engine.ts src/lib/curriculum-seed.ts src/lib/english-content-dump.ts src/routes/_authenticated/lesson.\$id.tsx src/routes/_authenticated/review.tsx
git commit -m "feat: add listening question variant with a text answer"
```

---

### Task 2: Generate listening questions, with one real pack

**Files:**
- Modify: `src/data/lesson-bank.ts` (the `Pack` type, `packQuestions`, and one new A1 pack)
- Modify: `src/data/curriculum-consistency.test.ts`
- Test: `src/data/lesson-bank-listening.test.ts` (create)

**Interfaces:**
- Consumes: the `listening` variant (Task 1).
- Produces: `kind: "listening"` packs, and one real A1 pack so Tasks 4 and 5 have live content to render in tests. A listening pack's `data` lines are `audioText|answer`; the pack's `prompt` is the stem shown after playback.

Authoring one pack here rather than deferring all content to the end is deliberate: it means Tasks 4 and 5 verify against real questions instead of shipping behind skipped tests.

- [ ] **Step 1: Write the failing test**

```ts
// src/data/lesson-bank-listening.test.ts
import { describe, expect, it } from "vitest";
import { getCourse } from "./courses";

function listeningQuestions() {
  return Object.entries(getCourse("en").questionIndex).filter(
    ([, ref]) => ref.question.type === "listening",
  );
}

describe("listening questions", () => {
  it("exist in the course", () => {
    expect(listeningQuestions().length).toBeGreaterThan(0);
  });

  it("always carry non-empty audio text and a resolvable answer", () => {
    // Review Focus #3: no audio means an unanswerable question.
    for (const [key, ref] of listeningQuestions()) {
      const q = ref.question;
      if (q.type !== "listening") continue;
      expect(q.audioText.trim(), `${key} has empty audioText`).not.toBe("");
      expect(q.choices.length, `${key} has too few choices`).toBeGreaterThanOrEqual(2);
      expect(q.choices, `${key} answer is not among its choices`).toContain(q.answer);
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun run vitest run src/data/lesson-bank-listening.test.ts`
Expected: FAIL on "exist in the course" — `expected 0 to be greater than 0`.

- [ ] **Step 3: Widen the Pack type and the generator**

In `src/data/lesson-bank.ts`:

```ts
  kind: "pair" | "cloze" | "listening";
```

In `packQuestions`, before the `useMc` branch, add. Note it stores the answer TEXT, so no index bookkeeping is needed, and it gets its own explanation wording rather than inheriting the cloze template:

```ts
    if (pack.kind === "listening") {
      const choices = [answer, ...distractors].sort(
        (a, b) => hash(a + seed) - hash(b + seed),
      );
      return {
        id: `${pack.id}q${i}`,
        type: "listening",
        prompt: pack.prompt ?? "What did you hear?",
        audioText: left!,
        choices,
        answer,
        explanation: `The audio says "${left}". ${pack.note}`,
      };
    }
```

- [ ] **Step 4: Add the consistency-test case**

In `src/data/curriculum-consistency.test.ts`, inside the existing per-question loop:

```ts
      if (q.type === "listening") {
        expect(q.audioText?.trim(), `${key}: listening question with empty audioText`).toBeTruthy();
        expect(q.choices, `${key}: listening answer not among its choices`).toContain(q.answer);
      }
```

- [ ] **Step 5: Author one A1 listening pack**

Append to the `A1` array in `lesson-bank.ts`. Answers are full sentences, so the distractors are other sentences from the same pack — which is what keeps them plausible. Keep every sentence the same length and register so length alone does not give the answer away:

```ts
  {
    id: "a1p23",
    title: "Listening: Everyday Sentences",
    subtitle: "Hear it, then choose",
    kind: "listening",
    prompt: "What did you hear?",
    note: "Short statements at natural speed.",
    data: `She is a doctor.|She is a doctor.
He works at the airport.|He works at the airport.
They live near the park.|They live near the park.
I have two brothers.|I have two brothers.
We eat dinner at seven.|We eat dinner at seven.
The train leaves at nine.|The train leaves at nine.
My sister plays the piano.|My sister plays the piano.
This coffee is very hot.|This coffee is very hot.
The shop opens on Monday.|The shop opens on Monday.
Her birthday is in June.|Her birthday is in June.
He walks to work every day.|He walks to work every day.
We watch films on Sunday.|We watch films on Sunday.
The cat sleeps on the chair.|The cat sleeps on the chair.
I study English in the evening.|I study English in the evening.
They travel by bus.|They travel by bus.
My father cooks on Saturday.|My father cooks on Saturday.
The children play outside.|The children play outside.
She reads before bed.|She reads before bed.
We live in a small flat.|We live in a small flat.
He drinks tea with milk.|He drinks tea with milk.
The library closes at six.|The library closes at six.
I take the metro to school.|I take the metro to school.
She writes letters to her aunt.|She writes letters to her aunt.
They visit us in August.|They visit us in August.
My brother works in a bank.|My brother works in a bank.`,
  },
```

- [ ] **Step 6: Run the tests**

Run: `bun run vitest run src/data/lesson-bank-listening.test.ts src/data/curriculum-consistency.test.ts`
Expected: ALL pass, including "exist in the course".

- [ ] **Step 7: Note the lesson id for later tasks**

Run: `bun run scripts/dump-english-questions.ts`
Then find a listening lesson id to use in Tasks 4 and 5's tests:

```bash
grep -m1 -B6 '"type": "listening"' .audit/english-A1.json
```

Record the `lessonId` it prints in your task report — Tasks 4 and 5 need it.

- [ ] **Step 8: Commit**

```bash
git add src/data/lesson-bank.ts src/data/curriculum-consistency.test.ts src/data/lesson-bank-listening.test.ts
git commit -m "feat: generate listening questions and add the first A1 pack"
```

---

### Task 3: Pin the authoring rule that the prompt must not give the answer away

**Files:**
- Modify: `src/data/lesson-bank-listening.test.ts`

**Interfaces:**
- Consumes: the pack from Task 2.

- [ ] **Step 1: Write the test**

```ts
// add to src/data/lesson-bank-listening.test.ts
it("never restates the audio in the prompt", () => {
  // Review Focus #4: if the prompt contains the audio, the learner can answer
  // by reading and the exercise tests nothing.
  for (const [key, ref] of listeningQuestions()) {
    const q = ref.question;
    if (q.type !== "listening") continue;
    const prompt = q.prompt.toLowerCase();
    const audio = q.audioText.toLowerCase().replace(/[.?!]+$/, "");
    expect(prompt.includes(audio), `${key} restates its audio in the prompt`).toBe(false);
  }
});
```

- [ ] **Step 2: Run it**

Run: `bun run vitest run src/data/lesson-bank-listening.test.ts`
Expected: PASS — the Task 2 pack uses a generic stem. This test is a guard for future authoring, so it passing now is the correct outcome; it is not vacuous, because it iterates real questions (Task 2 asserts there is at least one).

- [ ] **Step 3: Commit**

```bash
git add src/data/lesson-bank-listening.test.ts
git commit -m "test: pin the listening authoring rule against self-answering prompts"
```

---

### Task 4: Render listening in the lesson player

The player already renders a play button for the legacy `audioText`-on-`mc` format at line 352, and renders choices with `AnswerOption` at line 366. Grading needs NO change — listening's string answer falls through to the existing comparison. The work is two widened conditions, a format label, and a correct `isRight`.

**Files:**
- Modify: `src/routes/_authenticated/lesson.$id.tsx`
- Test: `src/routes/_authenticated/lesson.$id.test.tsx`

**Interfaces:**
- Consumes: the variant (Task 1), the real pack and lesson id (Task 2), `speak` and `localeForCourse` (already imported in this file).

- [ ] **Step 1: Write the failing test**

The file mounts the REAL route — it mocks `@tanstack/react-router` and `../../data/bank-engine`, sets `currentLessonId`, then renders. There is no standalone `QuestionView`. Follow that pattern:

```tsx
// add to src/routes/_authenticated/lesson.$id.test.tsx
it("renders a play control and answerable choices for a listening question", async () => {
  // Review Focus #5: speech synthesis may be unavailable and `speak` then
  // returns silently, so this asserts the choices are answerable, not that
  // audio played.
  currentLessonId = "a1p23l1"; // from Task 2's pack
  render(<RouteUnderTest />); // same mount the neighbouring tests use
  expect(await screen.findByRole("button", { name: /play audio/i })).toBeEnabled();
  expect(screen.getByText(/what did you hear/i)).toBeInTheDocument();
});
```

Use the exact lesson id Task 2 reported, and the exact mount helper the surrounding tests use.

- [ ] **Step 2: Run test to verify it fails**

Run: `bun run vitest run src/routes/_authenticated/lesson.\$id.test.tsx`
Expected: FAIL — no play button renders, because line 352 gates on `q.type === "mc"`.

- [ ] **Step 3: Widen the audio control and add the format label**

At ~line 352. `listening` always has audio, so it needs no truthiness guard:

```tsx
          {q.type === "listening" && (
            <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-ink-soft/70">
              Listening
            </p>
          )}
          {(q.type === "listening" || (q.type === "mc" && q.audioText)) && (
            <button
              type="button"
              onClick={() => speak(q.audioText!, localeForCourse(course))}
              className="mb-3 flex w-fit items-center gap-2 rounded-full border border-hairline bg-surface px-4 py-2 text-sm font-medium text-ink transition hover:border-ink/30"
            >
              🔊 Play audio
            </button>
          )}
```

- [ ] **Step 4: Widen the choice renderer**

At ~line 366. Note `isRight` differs by type: `mc` indexes, `listening` compares text.

```tsx
            {q.type === "mc" || q.type === "listening" ? (
              q.choices.map((c) => (
                <AnswerOption
                  key={c}
                  label={c}
                  checked={checked}
                  isPicked={picked === c}
                  isRight={q.type === "mc" ? q.choices[q.answer] === c : q.answer === c}
                  disabled={checked}
                  onClick={() => setPicked(c)}
                />
              ))
            ) : q.type === "reorder" ? (
```

- [ ] **Step 5: Verify grading needs no change**

Read `checkAnswer` (~line 151). Confirm listening falls into the non-`mc` branch and that the comparison is `submittedAnswer.trim().toLowerCase() === q.answer.trim().toLowerCase()`, which is correct for a text answer. Make NO edit here. Note in your report that you verified it rather than changed it.

- [ ] **Step 6: Run the tests**

Run: `bun run vitest run src/routes/_authenticated/lesson.\$id.test.tsx`
Expected: all pass, including the new one.

- [ ] **Step 7: Commit**

```bash
git add src/routes/_authenticated/lesson.\$id.tsx src/routes/_authenticated/lesson.\$id.test.tsx
git commit -m "feat: render listening questions in the lesson player"
```

---

### Task 5: Render listening in the review player

`review.tsx` mirrors the lesson player: same `AnswerOption` import (line 6), play button gated at line 226, choices at line 240, grading at line 127. Review Focus #1 — a type wired only into the lesson player renders as a blank card here.

**Files:**
- Modify: `src/routes/_authenticated/review.tsx`
- Test: `src/routes/_authenticated/review.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
// add to src/routes/_authenticated/review.test.tsx, using this file's own
// helper for seeding a review queue
it("renders a listening question in review rather than a blank card", async () => {
  // Review Focus #1: review.tsx is a second renderer with its own render site.
  seedReviewQueueWith("a1p23l1:a1p23q0"); // follow the file's existing helper
  render(<RouteUnderTest />);
  expect(await screen.findByRole("button", { name: /play audio/i })).toBeEnabled();
  expect(screen.getByText(/what did you hear/i)).toBeInTheDocument();
});
```

Adapt the seeding call to whatever this file already does; do not invent a new harness.

- [ ] **Step 2: Run test to verify it fails**

Run: `bun run vitest run src/routes/_authenticated/review.test.tsx`
Expected: FAIL — no play button, because line 226 gates on `q.type === "mc"`.

- [ ] **Step 3: Apply the same two widenings plus the label**

Play button (~line 226) and choice rendering (~line 240): identical to Task 4's Steps 3 and 4, including the type-dependent `isRight`. Grading at line 127 needs NO change for the same reason as the lesson player — verify, do not edit.

Keep both players' listening branches structurally identical. If they later drift, extract a shared component rather than maintaining two copies.

- [ ] **Step 4: Run the tests**

Run: `bun run vitest run src/routes/_authenticated/review.test.tsx`
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add src/routes/_authenticated/review.tsx src/routes/_authenticated/review.test.tsx
git commit -m "feat: render listening questions in the review player"
```

---

### Task 6: Teach iOS the type, and make its decoder forward-compatible

**Files:**
- Modify: `ios/LearnWithAlphonsoKit/Sources/LearnWithAlphonsoKit/CurriculumModels.swift`
- Modify: `ios/LearnWithAlphonso/Sources/LessonPlayerView.swift`
- Test: `ios/LearnWithAlphonsoKit/Tests/LearnWithAlphonsoKitTests/CurriculumModelsTests.swift` (create if absent)

Swift cannot be compiled or tested on this machine. Write the test first, push, and let CI be the evidence. Report it as CI-verified.

- [ ] **Step 1: Write the Swift tests**

```swift
// ios/LearnWithAlphonsoKit/Tests/LearnWithAlphonsoKitTests/CurriculumModelsTests.swift
import XCTest
@testable import LearnWithAlphonsoKit

final class CurriculumModelsTests: XCTestCase {
    func testDecodesListeningQuestion() throws {
        let json = """
        {"id":"q1","type":"listening","prompt":"What did you hear?",
         "audioText":"She is a doctor.","choices":["She is a doctor.","He is a driver."],
         "answer":"She is a doctor.","explanation":"e"}
        """.data(using: .utf8)!
        let question = try JSONDecoder().decode(Question.self, from: json)
        guard case .listening(let listening) = question else {
            return XCTFail("expected a listening question, got \\(question)")
        }
        XCTAssertEqual(listening.audioText, "She is a doctor.")
        XCTAssertEqual(listening.answer, "She is a doctor.")
    }

    // Review Focus #2: the whole ContentBundle decodes at once, so a type this
    // build does not know must degrade to "fewer questions", never "no app".
    func testSkipsUnknownQuestionTypesInsteadOfFailingTheLesson() throws {
        let json = """
        {"id":"l1","title":"T","subtitle":"S","questions":[
          {"id":"q1","type":"from_the_future","prompt":"?","answer":"x","explanation":"e"},
          {"id":"q2","type":"fill","prompt":"a ___","bank":["b"],"answer":"b","explanation":"e"}
        ]}
        """.data(using: .utf8)!
        let lesson = try JSONDecoder().decode(Lesson.self, from: json)
        XCTAssertEqual(lesson.questions.count, 1)
    }
}
```

- [ ] **Step 2: Add the listening case**

In `CurriculumModels.swift`:

```swift
    case listening(Listening)

    public struct Listening: Decodable, Sendable {
        public let id: String
        public let prompt: String
        /// Spoken via AVSpeechSynthesizer before the learner answers.
        public let audioText: String
        public let choices: [String]
        /// The correct choice's text -- mirrors the TypeScript variant, which
        /// stores text rather than an index so shared grading works unchanged.
        public let answer: String
        public let explanation: String
    }
```

and in the type switch:

```swift
        case "listening":
            self = .listening(try Listening(from: decoder))
```

- [ ] **Step 3: Replace the throwing default with a skippable sentinel**

Add `case unsupported` to the enum and change the `default`:

```swift
        default:
            // Unknown to THIS build. Not fatal: content ships inside the app
            // bundle, so a JSON/app version skew would otherwise leave the
            // learner with no content at all. Lesson decoding filters these out.
            self = .unsupported
```

Then give `Lesson` a custom decoder that drops them:

```swift
public struct Lesson: Decodable, Identifiable, Sendable {
    public let id: String
    public let title: String
    public let subtitle: String
    public let questions: [Question]

    private enum CodingKeys: String, CodingKey { case id, title, subtitle, questions }

    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = try c.decode(String.self, forKey: .id)
        title = try c.decode(String.self, forKey: .title)
        subtitle = try c.decode(String.self, forKey: .subtitle)
        questions = try c.decode([Question].self, forKey: .questions).filter {
            if case .unsupported = $0 { return false }
            return true
        }
    }
}
```

**Adding `case unsupported` makes every exhaustive `switch` over `Question` fail to compile until it handles the case.** `LessonPlayerView.swift` has such switches at ~line 272 and ~line 324. Add an `.unsupported` arm to each that renders nothing (`EmptyView()`) — it is filtered before reaching the UI, so the arm is unreachable, but the compiler requires it. Do not use `@unknown default`; that is for non-frozen library enums, not your own.

- [ ] **Step 4: Render listening in the iOS player**

Add a `.listening` arm to the same switches, using the Canopy design system (`AlphonsoComponents`, `AlphonsoTheme`) for the card, button and type styles — read `AlphonsoComponents.swift` for the real initialisers rather than guessing. Play audio with `AVSpeechSynthesizer`:

```swift
import AVFoundation

private let synthesizer = AVSpeechSynthesizer()

private func speak(_ text: String) {
    let utterance = AVSpeechUtterance(string: text)
    utterance.voice = AVSpeechSynthesisVoice(language: "en-US")
    synthesizer.stopSpeaking(at: .immediate)
    synthesizer.speak(utterance)
}
```

Grade by comparing the tapped choice against `listening.answer` (text, not index).

- [ ] **Step 5: Push and read CI**

```bash
git add ios/
git commit -m "feat: decode and render listening questions on iOS"
git push
gh pr checks <PR number>
```

Expected: `ios-swift-tests` and `ios-app-build` both pass. A failure naming a Canopy initialiser means read that component's real signature; a failure about a non-exhaustive switch means a `.unsupported` arm is still missing.

---

### Task 7: Author the remaining levels, re-baseline, and sweep the docs

**Files:**
- Modify: `src/data/lesson-bank.ts` (one listening pack per remaining band)
- Modify: `.audit-baseline/english-ids.json` (regenerate deliberately)
- Modify: `src/data/answer-pos.ts`, `ios/**/curriculum-en.json` (regenerate)
- Modify: `docs/superpowers/english-content-audit-log.md`, `ARCHITECTURE.md`, `CHANGELOG.md`, `docs/BACKLOG.md`

- [ ] **Step 1: Author one listening pack per remaining band**

Add packs to `A2`, `B1`, `B2`, `C1` following Task 2's shape and the audit's rules: answers within a pack share a domain and a rough length so neither the topic nor the sentence length leaks the answer. Scale sentence complexity to the band.

- [ ] **Step 2: Run the content tests**

Run: `bun run vitest run src/data/lesson-bank-listening.test.ts src/data/curriculum-consistency.test.ts`
Expected: all pass.

- [ ] **Step 3: Re-baseline ids deliberately**

```bash
bun run scripts/snapshot-english-ids.ts
git diff --stat .audit-baseline/english-ids.json
```

Expected: **insertions only, zero deletions.** A deletion means an existing id moved — stop and find out why before committing.

Then: `bun run vitest run src/lib/english-id-parity.test.ts` → PASS.

- [ ] **Step 4: Regenerate derived artifacts**

```bash
bun run scripts/gen-answer-pos.ts
bun run scripts/export-ios-content.ts
git diff --stat ios/
```

Expected: only `curriculum-en.json` changes in both iOS resource directories. If `curriculum-fr.json` or `curriculum-es.json` change, investigate before committing (on this branch they should already be current).

- [ ] **Step 5: Full scoped verification**

```bash
bunx tsc --noEmit
bun run lint
bun run vitest run src/lib src/data src/routes
```

Expected: typecheck exit 0, lint 0 errors, all tests pass.

- [ ] **Step 6: Sweep the docs**

Add the new packs as rows with verdicts in `docs/superpowers/english-content-audit-log.md`. Then update `ARCHITECTURE.md` (the content-model section now has a fourth question type, and the iOS decoder now skips unknown types — both are architectural facts), `CHANGELOG.md`, and `docs/BACKLOG.md` (listening is no longer a gap; speaking and translation remain).

- [ ] **Step 7: Commit**

```bash
git add src/data/lesson-bank.ts src/data/answer-pos.ts .audit-baseline/english-ids.json docs/ ARCHITECTURE.md CHANGELOG.md ios/
git commit -m "feat: add listening packs for every CEFR band"
```
