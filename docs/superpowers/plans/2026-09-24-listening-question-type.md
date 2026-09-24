# Listening Question Type (Phase 2, Plan A) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship listening comprehension as a first-class question type — its own `Question` variant, its own distinguished UI on web and iOS, and real authored content — rather than the hidden `audioText`-on-`mc` format that exists today and is used in 3 questions.

**Architecture:** Add a `listening` variant to the TypeScript `Question` union, teach the two web players (lesson + review) and the iOS player to render and grade it, and make the iOS decoder tolerate unknown question types so content and app builds can ship independently. Audio playback already exists on both platforms (`src/lib/speech.ts` on web, `AVSpeechSynthesizer` on iOS); this plan adds the type, the UI, and the content.

**Tech Stack:** TypeScript, React (TanStack Start), Vitest, Swift/SwiftUI (LearnWithAlphonsoKit + app target), Bun as runner and TS script executor (`tsx` is NOT installed).

**Spec:** `docs/superpowers/specs/2026-09-23-english-content-overhaul-design.md` (Phase 2, section "Listening comprehension — first-class type")

## Why this plan is first

It is the cheapest of the three new types (audio playback already exists on both platforms), and it establishes the end-to-end pathway every later type reuses: TS union → engine → web lesson player → web review player → Swift model → Swift player → content → export. Speaking and translation each add a *new* dependency (microphone capture, LLM grading) on top of that same pathway, so proving the pathway once de-risks both.

## Global Constraints

- **English only for content.** Do not add listening content to `lesson-bank-fr.ts`, `lesson-bank-es.ts`, `curriculum-fr.ts`, `curriculum-es.ts`, `placement-fr.ts`, `placement-es.ts`. Shared *code* (the `Question` union, the players) is necessarily touched, and that is expected — only content stays English-only.
- **Id stability.** Question ids are `${pack.id}q${i}` from the line index, and users' saved review items key on `` `${lessonId}:${questionId}` ``. Adding a NEW pack appends new ids and does not move existing ones — that is safe. Do NOT add or remove lines inside an existing pack. `src/lib/english-id-parity.test.ts` diffs against a committed baseline; new packs will require regenerating that baseline **deliberately**, in its own commit, with the added ids listed.
- **Never run the bare full test suite** (`bun run vitest run` with no args) — it hangs in this Windows sandbox. Always scope: `bun run vitest run <paths>`.
- **No Swift toolchain locally.** Swift RED/GREEN is verified by CI (`ios-swift-tests`, `ios-app-build` on macOS runners), not on this machine. Write the Swift test first anyway and let the CI run be the evidence; say so in the task report rather than claiming a local run.
- **iOS UI must use the Canopy design system** (`ios/LearnWithAlphonso/Sources/DesignSystem/AlphonsoComponents.swift`, `AlphonsoTheme.swift`) added in PR #83. Do not hand-roll colors, fonts, or card chrome.
- `src/integrations/supabase/types.ts` is stale (7 tables missing). Do not add a typed `supabase.from()` call against those tables in this plan.
- If this plan ever adds a user-scoped table, it must be added to `USER_ID_EXPORT_TABLES` — `account.functions.test.ts` parses migrations and fails the build otherwise. This plan adds none.

## Review Focus

Conditions the spec implies but that no task's tests would otherwise exercise:

1. **A listening question reaching the spaced-repetition review player.** `review.tsx` is a second, separate renderer — a type handled only in `lesson.$id.tsx` renders as a blank card in review. Pinned in Task 4.
2. **An iOS build whose bundled JSON contains a type its decoder does not know.** Today `CurriculumModels.swift:77` throws, and because the whole `ContentBundle` decodes at once, one unknown type means the app loads *no content at all*. Pinned in Task 5.
3. **A listening question with empty or missing `audioText`.** The learner gets a play button that says nothing and an unanswerable question. Pinned in Task 2.
4. **A listening question whose `prompt` restates the audio.** Defeats the exercise — the answer is readable without listening. Pinned in Task 6 as an authoring rule with a test.
5. **A device with no speech synthesis available.** `speak()` returns silently (`src/lib/speech.ts:14`), so the learner sees a play button that does nothing and no way to answer. Pinned in Task 3.

---

### Task 1: Add the `listening` variant to the Question union

**Files:**
- Modify: `src/data/curriculum.ts` (the `Question` union, around line 6-42)
- Modify: `src/lib/curriculum-seed.ts` (the literal union at line 43, and the mapping around line 122)
- Test: `src/data/curriculum-seed.test.ts` (create if absent)

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: the `listening` variant, shaped
  `{ id: string; type: "listening"; prompt: string; audioText: string; choices: string[]; answer: number; explanation: string }`.
  Tasks 2-6 all consume this shape. `audioText` is REQUIRED here (unlike the optional `audioText` on `mc`), which is what makes the type self-describing.

- [ ] **Step 1: Write the failing test**

```ts
// src/data/curriculum-seed.test.ts
import { describe, expect, it } from "vitest";
import { buildFullSeed } from "@/lib/curriculum-seed";

describe("curriculum seed rows", () => {
  it("carries listening questions through with their audio text", () => {
    const seed = buildFullSeed();
    const listening = seed.questions.filter((q) => q.type === "listening");
    // There is no listening content yet (Task 6 authors it), so this asserts
    // the seed mapper does not silently drop the type when it arrives.
    for (const q of listening) {
      expect(q.audioText, `${q.id} lost its audioText in the seed mapping`).toBeTruthy();
    }
    expect(seed.questions.length).toBeGreaterThan(2000);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun run vitest run src/data/curriculum-seed.test.ts`
Expected: FAIL — TypeScript rejects `q.type === "listening"` because the union has no such member (`This comparison appears to be unintentional`), or the import path does not resolve.

- [ ] **Step 3: Add the variant to the union**

In `src/data/curriculum.ts`, add to the `Question` union, after the `mc` member:

```ts
  | {
      id: string;
      type: "listening";
      /** What the learner must decide AFTER hearing `audioText`. Must not
       * restate the audio -- if the prompt contains the answer, the question
       * can be solved without listening, which defeats the exercise. */
      prompt: string;
      /** Spoken via TTS. Required: a listening question without audio is
       * unanswerable, which is why this is its own variant rather than the
       * optional `audioText` layered onto `mc`. */
      audioText: string;
      choices: string[];
      answer: number;
      explanation: string;
    }
```

- [ ] **Step 4: Widen the seed mapper**

In `src/lib/curriculum-seed.ts`, change the literal union at line 43 to include `"listening"`, and extend the mapping near line 122 so a listening question carries `choices`, `answer` and `audioText` through:

```ts
  type: "mc" | "fill" | "reorder" | "listening";
```

```ts
  if (q.type === "listening") {
    return {
      ...base,
      type: "listening",
      choices: q.choices,
      answer: q.answer,
      audioText: q.audioText,
    };
  }
```

- [ ] **Step 5: Run test to verify it passes**

Run: `bun run vitest run src/data/curriculum-seed.test.ts`
Expected: PASS.

- [ ] **Step 6: Typecheck**

Run: `bunx tsc --noEmit`
Expected: exit 0. If it reports non-exhaustive switches in `lesson.$id.tsx` or `review.tsx`, that is expected — Tasks 3 and 4 handle those. Note them and continue only if the errors are confined to those two files.

- [ ] **Step 7: Commit**

```bash
git add src/data/curriculum.ts src/lib/curriculum-seed.ts src/data/curriculum-seed.test.ts
git commit -m "feat: add listening question variant to the curriculum type"
```

---

### Task 2: Generate listening questions from packs

**Files:**
- Modify: `src/data/lesson-bank.ts` (the `Pack` type and `packQuestions`)
- Modify: `src/data/curriculum-consistency.test.ts`
- Test: `src/data/lesson-bank-listening.test.ts` (create)

**Interfaces:**
- Consumes: the `listening` variant from Task 1.
- Produces: `kind: "listening"` packs. A listening pack's `data` lines are `audioText|answer`, and the pack's `prompt` field holds the question stem shown after playback (e.g. `"What did you hear?"`). Distractors come from the pack's own answer pool via the existing `pickDistractors`, unchanged.

- [ ] **Step 1: Write the failing test**

```ts
// src/data/lesson-bank-listening.test.ts
import { describe, expect, it } from "vitest";
import { getCourse } from "./courses";

describe("listening questions", () => {
  it("always carries non-empty audio text", () => {
    // Review Focus #3: a listening question without audio is unanswerable.
    for (const [key, ref] of Object.entries(getCourse("en").questionIndex)) {
      const q = ref.question;
      if (q.type !== "listening") continue;
      expect(q.audioText.trim(), `${key} has empty audioText`).not.toBe("");
      expect(q.choices.length, `${key} has too few choices`).toBeGreaterThanOrEqual(2);
      expect(q.choices[q.answer], `${key} answer index out of range`).toBeDefined();
    }
  });

  it("builds listening questions from a listening pack", () => {
    const listening = Object.values(getCourse("en").questionIndex).filter(
      (r) => r.question.type === "listening",
    );
    expect(listening.length).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun run vitest run src/data/lesson-bank-listening.test.ts`
Expected: FAIL on the second test — `expected 0 to be greater than 0`, because no listening pack exists yet. The first test passes vacuously for now; it becomes meaningful in Task 6.

- [ ] **Step 3: Teach the pack type and generator about listening**

In `src/data/lesson-bank.ts`, widen the `Pack` type's `kind`:

```ts
  kind: "pair" | "cloze" | "listening";
```

and in `packQuestions`, before the existing `useMc` branch, return the listening shape. Note it always emits `type: "listening"` — it never falls through to `fill`, because a bank of words to drag is a different exercise from hearing a sentence:

```ts
    if (pack.kind === "listening") {
      // Same swap-shuffle the mc branch uses: put the answer at a seeded
      // position and remember that index, so `answer` and `choices` cannot
      // drift apart.
      const choices = [answer, ...distractors];
      const at = hash(seed + "x") % choices.length;
      choices[0] = choices[at]!;
      choices[at] = answer;
      return {
        id: `${pack.id}q${i}`,
        type: "listening",
        prompt: pack.prompt ?? "What did you hear?",
        audioText: left!,
        choices,
        answer: at,
        explanation,
      };
    }
```

- [ ] **Step 4: Add the consistency-test case**

In `src/data/curriculum-consistency.test.ts`, inside the existing per-question loop, add:

```ts
      if (q.type === "listening") {
        expect(q.audioText?.trim(), `${key}: listening question with empty audioText`).toBeTruthy();
      }
```

- [ ] **Step 5: Run both tests**

Run: `bun run vitest run src/data/lesson-bank-listening.test.ts src/data/curriculum-consistency.test.ts`
Expected: the "builds listening questions" test still FAILS (no pack yet — Task 6 adds one); everything else passes. This is the one task that ends with a known-red test, and Task 6 closes it. Record that explicitly in the task report rather than deleting the test.

- [ ] **Step 6: Commit**

```bash
git add src/data/lesson-bank.ts src/data/curriculum-consistency.test.ts src/data/lesson-bank-listening.test.ts
git commit -m "feat: generate listening questions from listening packs"
```

---

### Task 3: Render and grade listening in the lesson player

**Files:**
- Modify: `src/routes/_authenticated/lesson.$id.tsx`
- Test: `src/routes/_authenticated/lesson.$id.test.tsx`

**Interfaces:**
- Consumes: the `listening` variant (Task 1), `speak` from `@/lib/speech`.
- Produces: a listening UI distinguished from ordinary multiple choice — audio-led, with a replay control and a "Listening" label — and grading identical to `mc` (compare the picked choice string to `q.choices[q.answer]`).

This player already renders a play button for the legacy `audioText`-on-`mc`
format at line 352, and renders choices with `AnswerOption` at line 366. The
listening type reuses both; the new work is including it in those two
conditions, adding a format label, and including it in grading.

The test file mounts the REAL route (it mocks `@tanstack/react-router` and
`../../data/bank-engine`, then renders) — there is no standalone `QuestionView`
to render. Follow the surrounding tests' pattern: point `currentLessonId` at a
lesson and assert on what the route renders.

- [ ] **Step 1: Write the failing test**

```tsx
// add to src/routes/_authenticated/lesson.$id.test.tsx, alongside the
// existing route-rendering tests and using the same harness
it("renders a play control and choices for a listening question", async () => {
  // Review Focus #5: speech synthesis may be unavailable -- `speak` returns
  // silently in that case -- so the choices must be answerable regardless.
  // This asserts the choices render and are enabled, not that audio played.
  currentLessonId = LISTENING_LESSON_ID; // a lesson from the Task 6 pack
  render(<RouteUnderTest />); // same mount the neighbouring tests use
  expect(await screen.findByRole("button", { name: /play audio/i })).toBeEnabled();
  const choices = await screen.findAllByRole("button");
  expect(choices.length).toBeGreaterThan(2);
});
```

Until Task 6 authors a listening pack there is no real listening lesson to
point at. Write this test now and mark it `it.skip` with a comment naming Task
6; Task 6 Step 4 un-skips it. Do not fabricate a fake lesson id that does not
resolve — a test that throws on lookup proves nothing.

- [ ] **Step 2: Run test to verify it fails (or is skipped pending Task 6)**

Run: `bun run vitest run src/routes/_authenticated/lesson.\$id.test.tsx`
Expected: the new test is skipped; every existing test in the file still passes. A failure in an EXISTING test means the Task 1 union change broke this player — fix that before continuing.

- [ ] **Step 3: Include listening in the audio control and the choice renderer**

At line 352, widen the play-button condition. `listening` always has audio, so
it needs no truthiness guard of its own:

```tsx
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

Add the format label directly above that button, so the type reads as
distinguished rather than as an ordinary multiple choice that happens to have
audio:

```tsx
          {q.type === "listening" && (
            <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-ink-soft/70">
              Listening
            </p>
          )}
```

At line 366, include listening in the `AnswerOption` branch — it renders
choices identically to `mc`:

```tsx
            {q.type === "mc" || q.type === "listening" ? (
              q.choices.map((c) => (
                <AnswerOption
                  key={c}
                  label={c}
                  checked={checked}
                  isPicked={picked === c}
                  isRight={q.choices[q.answer] === c}
                  disabled={checked}
                  onClick={() => setPicked(c)}
                />
              ))
            ) : q.type === "reorder" ? (
```

- [ ] **Step 4: Grade it like multiple choice**

At the grading site (`checkAnswer`, near line 151), include `listening` with `mc`:

```ts
    const isCorrect =
      q.type === "mc" || q.type === "listening"
        ? q.choices[q.answer] === submittedAnswer
        : submittedAnswer.trim().toLowerCase() === q.answer.trim().toLowerCase();
```

- [ ] **Step 5: Run the file's tests**

Run: `bun run vitest run src/routes/_authenticated/lesson.\$id.test.tsx`
Expected: all existing tests pass; the new listening test remains skipped until Task 6 supplies real content.

- [ ] **Step 6: Commit**

```bash
git add src/routes/_authenticated/lesson.\$id.tsx src/routes/_authenticated/lesson.\$id.test.tsx
git commit -m "feat: render and grade listening questions in the lesson player"
```

---

### Task 4: Render and grade listening in the review player

`review.tsx` is a SEPARATE renderer for spaced repetition. A type handled only in the lesson player renders as a blank card here — Review Focus #1.

**Files:**
- Modify: `src/routes/_authenticated/review.tsx`
- Test: `src/routes/_authenticated/review.test.tsx`

**Interfaces:**
- Consumes: the `listening` variant (Task 1), the rendering approach settled in Task 3.
- Produces: listening questions that are reviewable, not blank.

`review.tsx` mirrors the lesson player's structure exactly: it imports the same
`AnswerOption` (line 6), gates the play button on `q.type === "mc" && q.audioText`
(line 226), renders choices under `q.type === "mc"` (line 240), and grades at
line 127. Three identical widenings.

- [ ] **Step 1: Write the failing test**

```tsx
// add to src/routes/_authenticated/review.test.tsx, using the same harness
// the neighbouring tests use to seed a review queue
it("renders a listening question in review rather than a blank card", async () => {
  // Review Focus #1: review.tsx is a second renderer. A type wired only into
  // the lesson player renders nothing here, and the learner is stuck.
  seedReviewQueueWith("listening"); // follow the file's existing seeding helper
  render(<RouteUnderTest />);
  expect(await screen.findByRole("button", { name: /play audio/i })).toBeEnabled();
  expect((await screen.findAllByRole("button")).length).toBeGreaterThan(2);
});
```

As in Task 3, mark this `it.skip` until Task 6 authors listening content, with a
comment naming Task 6. Task 6 Step 4 un-skips it.

- [ ] **Step 2: Run test to verify existing tests still pass**

Run: `bun run vitest run src/routes/_authenticated/review.test.tsx`
Expected: the new test is skipped; every existing test passes.

- [ ] **Step 3: Widen the three sites in review.tsx**

Grading, line 127:

```tsx
    return q.type === "mc" || q.type === "listening"
```

Play button, line 226 — same widening as the lesson player, plus the same
"Listening" label above it:

```tsx
        {(q.type === "listening" || (q.type === "mc" && q.audioText)) && (
```

Choice rendering, line 240:

```tsx
          {q.type === "mc" || q.type === "listening" ? (
```

Keep these branches structurally identical to the lesson player's. If the pair
later drifts, extract a shared component rather than maintaining two copies.

- [ ] **Step 4: Run the file's tests**

Run: `bun run vitest run src/routes/_authenticated/review.test.tsx`
Expected: all existing tests pass; the listening test remains skipped until Task 6.

- [ ] **Step 5: Commit**

```bash
git add src/routes/_authenticated/review.tsx src/routes/_authenticated/review.test.tsx
git commit -m "feat: render and grade listening questions in the review player"
```

---

### Task 5: Teach iOS the listening type, and make its decoder forward-compatible

**Files:**
- Modify: `ios/LearnWithAlphonsoKit/Sources/LearnWithAlphonsoKit/CurriculumModels.swift`
- Modify: `ios/LearnWithAlphonso/Sources/LessonPlayerView.swift`
- Test: `ios/LearnWithAlphonsoKit/Tests/LearnWithAlphonsoKitTests/CurriculumModelsTests.swift` (create if absent)

**Interfaces:**
- Consumes: the JSON shape produced by Task 1 (`type: "listening"` with required `audioText`).
- Produces: a `Question.listening` case, and a decoder that SKIPS unknown question types instead of throwing.

Swift cannot be compiled or tested on this machine. Write the test first regardless, push, and let CI (`ios-swift-tests`, `ios-app-build`) be the RED/GREEN evidence. Report that the verification was CI, not local.

- [ ] **Step 1: Write the failing Swift test**

```swift
// ios/LearnWithAlphonsoKit/Tests/LearnWithAlphonsoKitTests/CurriculumModelsTests.swift
import XCTest
@testable import LearnWithAlphonsoKit

final class CurriculumModelsTests: XCTestCase {
    func testDecodesListeningQuestion() throws {
        let json = """
        {"id":"q1","type":"listening","prompt":"What did you hear?",
         "audioText":"She is a doctor.","choices":["She is a doctor.","He is a driver."],
         "answer":0,"explanation":"The audio says \\"She is a doctor.\\""}
        """.data(using: .utf8)!
        let question = try JSONDecoder().decode(Question.self, from: json)
        guard case .listening(let listening) = question else {
            return XCTFail("expected a listening question, got \\(question)")
        }
        XCTAssertEqual(listening.audioText, "She is a doctor.")
        XCTAssertEqual(listening.choices.count, 2)
    }

    // Review Focus #2: the whole ContentBundle decodes at once, so a type this
    // build does not know must not take the entire course down with it. A
    // newer content bundle has to degrade to "fewer questions", never "no app".
    func testSkipsUnknownQuestionTypesInsteadOfFailingTheLesson() throws {
        let json = """
        {"id":"l1","title":"T","subtitle":"S","questions":[
          {"id":"q1","type":"from_the_future","prompt":"?","answer":"x","explanation":"e"},
          {"id":"q2","type":"fill","prompt":"a ___","bank":["b"],"answer":"b","explanation":"e"}
        ]}
        """.data(using: .utf8)!
        let lesson = try JSONDecoder().decode(Lesson.self, from: json)
        XCTAssertEqual(lesson.questions.count, 1)
        XCTAssertEqual(lesson.questions.first?.id, "q2")
    }
}
```

`Question` needs an `id` accessor for that last assertion. Add one if absent:

```swift
extension Question {
    public var id: String {
        switch self {
        case .multipleChoice(let q): return q.id
        case .fillInBlank(let q): return q.id
        case .reorder(let q): return q.id
        case .listening(let q): return q.id
        }
    }
}
```

- [ ] **Step 2: Add the listening case and the forward-compatible decode**

In `CurriculumModels.swift`, add the case and payload:

```swift
    case listening(Listening)

    public struct Listening: Decodable, Sendable {
        public let id: String
        public let prompt: String
        /// Spoken via AVSpeechSynthesizer before the learner answers.
        public let audioText: String
        public let choices: [String]
        public let answer: Int
        public let explanation: String
    }
```

extend the type switch:

```swift
        case "listening":
            self = .listening(try Listening(from: decoder))
```

and replace the throwing `default` with a sentinel the container can filter:

```swift
        default:
            self = .unsupported
```

adding `case unsupported` to the enum. Then make `Lesson` drop them at decode time:

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
        // A question type this build does not understand is skipped, not
        // fatal: content ships in the app bundle, so a JSON/app version skew
        // would otherwise leave the learner with no content at all.
        questions = try c.decode([Question].self, forKey: .questions).filter {
            if case .unsupported = $0 { return false }
            return true
        }
    }
}
```

- [ ] **Step 3: Render listening in the iOS player**

In `LessonPlayerView.swift`'s question switch (near line 272 and the `QuestionCard` switch near line 324), add a `.listening` case. Use the Canopy design system from PR #83 (`AlphonsoComponents`, `AlphonsoTheme`) for the card, button and type styles — do not hand-roll colors or fonts. Play audio with `AVSpeechSynthesizer`:

```swift
import AVFoundation

private let synthesizer = AVSpeechSynthesizer()

func speak(_ text: String) {
    let utterance = AVSpeechUtterance(string: text)
    utterance.voice = AVSpeechSynthesisVoice(language: "en-US")
    synthesizer.stopSpeaking(at: .immediate)
    synthesizer.speak(utterance)
}
```

Grade it exactly as the multiple-choice case does: compare the tapped choice against `choices[answer]`.

- [ ] **Step 4: Push and let CI verify**

```bash
git add ios/
git commit -m "feat: decode and render listening questions on iOS"
git push
```

Then read the `ios-swift-tests` and `ios-app-build` results:

```bash
gh pr checks <PR number>
```

Expected: both pass. If `ios-app-build` fails on the Canopy component API, read `AlphonsoComponents.swift` for the actual initialisers rather than guessing at them.

---

### Task 6: Author the listening content

**Files:**
- Modify: `src/data/lesson-bank.ts` (append new `kind: "listening"` packs)
- Modify: `.audit-baseline/english-ids.json` (regenerate — deliberately, in its own commit)
- Modify: `docs/superpowers/english-content-audit-log.md`

**Interfaces:**
- Consumes: `kind: "listening"` packs (Task 2).
- Produces: real listening content, and an id baseline that includes it.

- [ ] **Step 1: Write the authoring-rule test**

```ts
// add to src/data/lesson-bank-listening.test.ts
it("never restates the audio in the prompt", () => {
  // Review Focus #4: if the prompt contains the audio, the question is
  // solvable without listening and tests nothing.
  for (const [key, ref] of Object.entries(getCourse("en").questionIndex)) {
    const q = ref.question;
    if (q.type !== "listening") continue;
    const prompt = q.prompt.toLowerCase();
    const audio = q.audioText.toLowerCase().replace(/[.?!]$/, "");
    expect(prompt.includes(audio), `${key} restates its audio in the prompt`).toBe(false);
  }
});
```

- [ ] **Step 2: Run it**

Run: `bun run vitest run src/data/lesson-bank-listening.test.ts`
Expected: passes vacuously (no listening content yet). It becomes load-bearing after Step 3.

- [ ] **Step 3: Author the packs**

Append listening packs to `lesson-bank.ts`'s level arrays, 25 lines each, in the existing format. Lines are `audioText|answer`, and the pack's `prompt` is the stem shown after playback. Author at least one pack per CEFR band (A1, A2, B1, B2, C1), following the audit's rules: answers within a pack share a semantic domain so the generated distractors stay plausible.

Example shape:

```ts
  {
    id: "a1p23",
    title: "Listening: Everyday Sentences",
    subtitle: "Hear it, then choose",
    kind: "listening",
    prompt: "What did you hear?",
    note: "Short sentences at natural speed.",
    data: `She is a doctor.|She is a doctor.
He works at the airport.|He works at the airport.
...`,
  },
```

For a "what did you hear" pack the answer IS the sentence, so `audioText` and `answer` match and distractors are other sentences from the pack — which is what makes them plausible. For comprehension packs (asking ABOUT the audio), set `prompt` to the question and let `answer` be the fact, e.g. `She is a doctor.|a doctor` with prompt `"What is her job?"`. Do not mix the two styles inside one pack — the distractor pool must stay homogeneous.

- [ ] **Step 4: Un-skip the player tests and run everything**

Real listening content now exists, so the two tests Tasks 3 and 4 left skipped
become runnable. Remove their `.skip`, and point each at a real lesson id from
the pack you just authored (find one with
`bun run scripts/dump-english-questions.ts` and grep the dump for
`"type": "listening"`).

Run: `bun run vitest run src/data/lesson-bank-listening.test.ts src/data/curriculum-consistency.test.ts src/routes/_authenticated/lesson.\$id.test.tsx src/routes/_authenticated/review.test.tsx`
Expected: ALL pass — including the "builds listening questions" test Task 2 left red, and both previously-skipped player tests.

- [ ] **Step 5: Regenerate the id baseline deliberately**

New packs append new ids; they must not move existing ones.

```bash
bun run scripts/snapshot-english-ids.ts
bun run vitest run src/lib/english-id-parity.test.ts
```

Before committing, confirm the diff is ADDITIONS ONLY:

```bash
git diff --stat .audit-baseline/english-ids.json
```

Expected: insertions only, zero deletions. A deletion means an existing id moved — stop and find out why; do not commit it.

- [ ] **Step 6: Regenerate the POS map and re-export iOS content**

```bash
bun run scripts/gen-answer-pos.ts
bun run scripts/export-ios-content.ts
```

- [ ] **Step 7: Update the audit log**

Add the new packs as rows in `docs/superpowers/english-content-audit-log.md`, each with a verdict, so the enumeration stays complete.

- [ ] **Step 8: Full scoped verification**

```bash
bunx tsc --noEmit
bun run lint
bun run vitest run src/lib src/data src/routes
```

Expected: typecheck exit 0, lint 0 errors, all tests pass.

- [ ] **Step 9: Commit**

```bash
git add src/data/lesson-bank.ts src/data/answer-pos.ts .audit-baseline/english-ids.json docs/superpowers/english-content-audit-log.md ios/
git commit -m "feat: add listening comprehension content packs"
```
