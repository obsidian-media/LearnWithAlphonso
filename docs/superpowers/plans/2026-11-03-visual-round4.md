# Visual Refresh Round 4 Implementation Plan

> Status (2026-11-04): implemented and merged (#347).

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the remaining in-lesson visual gap with Learna/Duolingo: a full-screen lesson-complete clip, a green/red answer verdict panel with Alphonso reacting, chunky answer tiles, a one-word-at-a-time vocabulary deck, a richer Learn lesson list, and correct English unit numbering. Web and iOS both get every change.

**Architecture:** Pure copy and decision logic goes in testable units: the Kit (`LearnWithAlphonsoKit`, TDD with local `swift test`) and `src/lib` (Vitest). Views stay thin and are pinned by component tests (web) and source-text guards (`src/lib/ios-*.test.ts`, the repo's iOS pattern). The iOS app target compiles only in CI (`ios-app-build`), and a Limrun run on a fresh account checks the screens.

**Tech Stack:** TanStack Start, React 19, Tailwind v4, motion/react, Vitest; SwiftUI (iOS 17+), Swift Package `LearnWithAlphonsoKit`.

**Spec:** the owner's request in chat (2026-11-03), with six device screenshots: "the clip to be on the whole screen"; the question, review, words-to-learn and Learn list pages "would need a make over also to get to be able to close to the gap". The agreed outline (agent's reply, same day): (1) full-screen lesson complete with the rewards on top and Continue always visible; (2) chunky answer tiles, a colored progress bar, a green/red verdict panel that shows the right answer and Alphonso reacting; (3) one big word card at a time; (4) Learn list rows that don't look plain, and the "Unit 9 above Unit 2" bug. No separate spec doc; rulings go in the ledger.

## Global Constraints

- The Studio Ink theme (web, `useTheme(s => s.theme === "studio-ink")`) keeps its current look; every new style applies to the default theme only.
- Reduce Motion: no slide, spring or press animation; opacity fades only. Clips show their poster frame (existing `LoopingClip` / `SceneClip` behavior).
- VoiceOver/screen readers: the verdict is announced ("Correct" / "Incorrect"), the correct answer is spoken when wrong, and decorative Alphonso images are hidden.
- Dynamic Type accessibility sizes (iOS): screens that pin content fall back to one scrolling column, as `quizBody` and `VocabScreen` already do.
- Characters are the existing art only (`alphonso-happy`, `alphonso-encouraging`, the `complete` clip). No new Higgsfield generations.
- No em dashes in UI copy. Button labels are 1-3 words.
- Tap targets are at least 44 pt / 44 px.
- No change to grading, scoring, hearts, XP or what is sent to the server.

## Review Focus

1. A translate or speak question (their own cards render their own feedback): the verdict panel must use the settled verdict (`translationVerdict.correct` on iOS, `answered` on web), never re-derive it. This is pinned in Task 3 by the `verdictFor` tests.
2. The last question of a lesson: the panel's button says "Finish" and still calls `finish()`, and a pending reinforcement still shows "Continue". This is pinned in Task 3 (web) by the `continueLabel` test.
3. A lesson whose vocab list is empty skips the vocab screen (existing behavior). A one-word deck shows "Start practice" right away. This is pinned in Task 4 by `deckButtonTitle(index: 0, count: 1)`.
4. A short phone (iPhone SE, 667 pt): on lesson complete the primary button stays on screen without scrolling. This is pinned in Task 2 by the guard that the button sits in `safeAreaInset(edge: .bottom)` / a `sticky bottom-0` footer.
5. The French and Spanish curricula must not change when the English numbering is fixed. This is pinned in Task 1 by the per-course sequential-eyebrow test, which already passes for FR/ES.

---

### Task 1: English unit numbering

**Files:**

- Modify: `src/data/levels.ts` (eyebrows of u4-u9), `src/data/curriculum.ts` only if the foundation eyebrows need it
- Regenerate: `ios/LearnWithAlphonso/Resources/curriculum-en.json`, `ios/LearnWithAlphonsoKit/Sources/LearnWithAlphonsoKit/Resources/curriculum-en.json` (with the repo's existing export script; find it via `grep -rn "curriculum-en.json" scripts package.json`)
- Test: `src/data/unit-numbering.test.ts` (new)

Root cause: the hand-written English units number across all levels (A2 starts at "Unit 4", C1 is "Unit 9"), while `generatedUnits` numbers each level from its hand-written count. So C1 reads "Unit 9, Unit 2, Unit 3...". The fix renumbers the hand-written units within their level: A2 u4/u5 become "Unit 1"/"Unit 2", B1 u6/u7 become "Unit 1"/"Unit 2", B2 u8 becomes "Unit 1", C1 u9 becomes "Unit 1". Unit ids do not change.

- [ ] **Step 1:** Write test `every level numbers its units 1..n in order`. For each course bundle the app ships (English `curriculum`, plus the FR and ES curricula the iOS JSON is built from), group units by level and assert `eyebrows == ["Unit 1", ..., "Unit n"]`. Also assert the committed iOS `curriculum-en.json` has the same per-level sequence.
- [ ] **Step 2:** Run `bunx vitest run src/data/unit-numbering.test.ts`. Expected: FAIL on English A2 (`Unit 4`), with FR/ES passing.
- [ ] **Step 3:** Edit the six eyebrows in `src/data/levels.ts`, then run the export script to regenerate both `curriculum-en.json` copies.
- [ ] **Step 4:** Run the new test, plus `bunx vitest run src/lib/curriculum-seed.test.ts src/data` and any iOS-JSON freshness test. Expected: PASS.
- [ ] **Step 5:** Find out whether the DB `units.eyebrow` is reseeded by CI/deploy (`grep -rn seed-curriculum .github`). If it is not, ledger a Ruling and tell the owner. The web and iOS read the bundled data, so the DB copy is only for analytics/admin.
- [ ] **Step 6:** Commit `fix(content): number English units within each level`.

### Task 2: Lesson complete fills the screen

**Files:**

- Modify: `ios/LearnWithAlphonso/Sources/LessonPlayerView.swift` (`FinishView`)
- Modify: `src/routes/_authenticated/lesson.$id.tsx` (`FinishScreen`)
- Test: `src/lib/ios-clips-guards.test.ts` (update the stage guards), `src/routes/_authenticated/lesson.$id.finishscreen.test.tsx` (update)

**Interfaces:** Consumes the existing `ClipBackdrop(clip:verticalAnchor:)` (iOS) and `LoopingClip` (web).

Layout on both platforms, top to bottom:

- **Layer 1:** the `complete` clip, full-bleed behind everything and ignoring safe areas. It is anchored so Alphonso sits in the top ~55% of the screen (iOS `verticalAnchor: 0.2`, web `object-[50%_20%]`; tune on the Limrun/CI shots).
- **Layer 2:** a bottom gradient from clear to `surface` at 0.92 opacity, covering the lower 55%.
- **Layer 3:** a scrolling column with a transparent spacer at the top (`55svh` web, `UIScreen.main.bounds.height * 0.5` iOS). Under it sit the glass card (`alphonsoGlass` / existing glass class) holding the headline, the reward chips, "x/y correct", the hearts bonus, achievements, the missed-question review (web), Practise with Hector and generated practice.
- **Pinned footer:** the primary button, always visible. On iOS it is "Continue to next lesson" when `onContinueToNextLesson` exists, otherwise "Back to Learn", which calls `dismiss`. It goes in `.safeAreaInset(edge: .bottom)` with a glass background. On web, "Back to path" moves into a `sticky bottom-0` footer with padding and a surface/blur background.
- **Headline color:** `AlphonsoColor.ink` (iOS) / `text-ink` (web) instead of moss, which failed contrast on the dark glass in the owner's screenshot.
- **Title chip:** the "Lesson complete" chip stays at the top over the clip, on glass.

- [ ] **Step 1:** Update the guards and the component test so they fail first:
  - iOS guard `FinishView puts the complete clip full-bleed behind the card`. `FinishView`'s body contains `ClipBackdrop(clip: .complete` followed by `.ignoresSafeArea()`, contains `safeAreaInset(edge: .bottom)`, and no longer contains `aspectRatio(10.0 / 13.0` or `stageMaxHeight`.
  - iOS guard `finish headline is not moss`: the `LessonFinishCopy.headline` Text is not followed by `.foregroundStyle(AlphonsoColor.moss)`.
  - Web test: `[data-stage="complete"]` has classes `fixed inset-0` and no `aspect-[10/13]`, the "Back to path" link's parent has `sticky` and `bottom-0`, and the clip `<video>`/poster still renders.
- [ ] **Step 2:** Run `bunx vitest run src/lib/ios-clips-guards.test.ts "src/routes/_authenticated/lesson.\$id.finishscreen.test.tsx"`. Expected: FAIL on the new assertions.
- [ ] **Step 3:** Implement both layouts as described, removing `stageMaxHeight`. Keep `accessibilityLabel("Alphonso celebrating on the stage")` / `role="img"`, the haptic, the promotion overlay and `springEntrance`.
- [ ] **Step 4:** Run the same tests plus `bunx vitest run src/lib/ios-` and `bunx tsc --noEmit`. Expected: PASS.
- [ ] **Step 5:** Commit `feat(lesson-complete): full-screen stage clip with a pinned Continue`.

### Task 3: Answer verdict panel and chunky answer tiles

**Files:**

- Create: `ios/LearnWithAlphonsoKit/Sources/LearnWithAlphonsoKit/AnswerVerdict.swift`, test `ios/LearnWithAlphonsoKit/Tests/LearnWithAlphonsoKitTests/AnswerVerdictTests.swift`
- Create: `ios/LearnWithAlphonso/Sources/DesignSystem/AnswerVerdictPanel.swift` (also holds `AnswerChoiceButton` and the `.alphonsoWordChip` button style)
- Modify: `LessonPlayerView.swift` (`quizColumn`, `QuestionCard.choiceButton`, bank chips), `ReviewQueueView.swift` (bottom area, `choiceButton`, bank chips), `AlphonsoComponents.swift` (`AlphonsoProgressBar` height 10, moss gradient with a top highlight)
- Create: `src/lib/answer-verdict.ts`, test `src/lib/answer-verdict.test.ts`
- Create: `src/components/AnswerVerdictPanel.tsx`, test `src/components/AnswerVerdictPanel.test.tsx`
- Modify: `src/components/AnswerOption.tsx` (default-theme classes), `src/routes/_authenticated/lesson.$id.tsx` and `review.tsx` (bottom area and bank chips)
- Test: `src/lib/ios-verdict-guards.test.ts` (new)

**Interfaces (Produces):**

- Kit: `public enum AnswerVerdict { static func correctAnswer(for question: Question) -> String; static func title(correct: Bool) -> String }`
- Web: `export function correctAnswerText(q: Question): string`, `export function verdictTitle(correct: boolean): string`
- iOS view: `struct AnswerVerdictPanel: View { let correct: Bool; let correctAnswer: String?; let continueTitle: String; let onContinue: () -> Void }`
- Web component: `AnswerVerdictPanel({ correct, correctAnswer, explanation, saveCourse, continueLabel, onContinue })`

Values:

- `title(true)` returns "Correct!" and `title(false)` returns "Not quite".
- `correctAnswer`: mc returns `choices[answer]`; fill, reorder, listening and speak return `answer`; translate returns `acceptableAnswers.first ?? ""` (web `acceptableAnswers[0]`).
- Panel design:
  - A full-width card anchored to the bottom of the quiz column with top corners of radius 28. Correct uses a moss-tinted background (`moss.opacity(0.18)` over surface) with a moss top border. Wrong uses `destructive.opacity(0.16)` with a destructive top border.
  - Left side: a 64 pt cut-out of Alphonso (`Alphonso-happy` when correct, `Alphonso-encouraging` when wrong; web `/mascots/alphonso-happy.png` / `-encouraging.png`, `alt=""`).
  - Right side: the title in display 20 bold (moss / destructive). When wrong, a line reads "Answer: \(correctAnswer)" in sans 15 semibold ink.
  - Below: a full-width button with `continueTitle`. Correct uses `.alphonsoPrimary`; wrong uses a destructive-tinted variant of the same chunky style.
  - Entrance: `.move(edge: .bottom).combined(with: .opacity)`, opacity only under Reduce Motion.
  - It announces `"Correct"` / `"Incorrect. Answer: X"` once on appear.
- The in-card explanation stays: `ExplanationView` / `AnswerFeedback`. Because Alphonso now appears in the panel, `AlphonsoTipCard` drops its 88x112 portrait and becomes a plain speech-bubble card, so he isn't shown twice. The web `AnswerFeedback` drops its `<img>` the same way (default theme only).
- Answer tiles (`AnswerChoiceButton`, shared by lesson and review, replacing both private `choiceButton`s):
  - Min height 56 and radius 18, with a 4 pt bottom edge in a darker shade that collapses to 0 while pressed (the same idea as the existing chunky buttons).
  - Idle: parchment. Selected: moss border 2 with a moss tint. Correct: moss fill 0.22 with a checkmark. Wrong pick: destructive fill 0.18 with an xmark.
  - Keep the existing accessibility label and traits logic verbatim.
- Word-bank chips (`.alphonsoWordChip`): the same chunky edge and radius 14, with a highlighted state when `picked == word`.
- Web: `AnswerOption` default theme gets `min-h-14 rounded-[18px] border-2 shadow-[0_4px_0_0_var(--color-hairline)] active:translate-y-1 active:shadow-none motion-reduce:transition-none` plus the state colors. Bank chips get the same chunky classes, with `aria-pressed` when picked.

- [ ] **Step 1:** Write Kit tests `AnswerVerdictTests`: one per question kind for `correctAnswer`, translate with an empty list returning `""`, and both titles. Write `src/lib/answer-verdict.test.ts` with the same cases.
- [ ] **Step 2:** Run `cd ios/LearnWithAlphonsoKit && swift test --filter AnswerVerdictTests` and `bunx vitest run src/lib/answer-verdict.test.ts`. Expected: FAIL (undefined).
- [ ] **Step 3:** Implement both helpers. Run both again. Expected: PASS.
- [ ] **Step 4:** Write `AnswerVerdictPanel.test.tsx`:
  - Correct shows "Correct!", the happy image, and no "Answer:".
  - Wrong shows "Not quite", "Answer: water" and the encouraging image.
  - The button shows `continueLabel` and calls `onContinue`.
  - It has `role="status"`.
  - The Studio Ink theme renders the old `AnswerFeedback` markup.

  Add a lesson-route test: on the last question, after Check, the button reads "Finish". If `lesson.$id` has an existing player test harness, extend it; otherwise ledger a Ruling and cover it with the label helper instead.

  Write `ios-verdict-guards.test.ts`:
  - `LessonPlayerView.quizColumn` and `ReviewQueueView.reviewBody` both render `AnswerVerdictPanel(` when checked.
  - The lesson's `correct:` argument comes from a `lastAnswerCorrect` that prefers `translationVerdict?.correct`.
  - Neither file still declares `private func choiceButton`, and both use `AnswerChoiceButton(`.
  - `AlphonsoTipCard` no longer contains `Image("Alphonso")`.
  - `AnswerVerdictPanel.swift` references `Alphonso-happy` and `Alphonso-encouraging` and checks `accessibilityReduceMotion`.

- [ ] **Step 5:** Run them. Expected: FAIL.
- [ ] **Step 6:** Implement:
  - **iOS:** add `private var lastAnswerCorrect: Bool` to `LessonPlayerView`: if the question is a translate and `translationVerdict` is set, use `.correct`, otherwise `isAnswerCorrect(currentQuestion, picked:, course:)`. Review does the same with its own verdict state. In the checked branch, the panel replaces the plain Continue/Next button with the same action and title. Then `AnswerChoiceButton`, the word chips, the progress bar, and the `AlphonsoTipCard` portrait removal.
  - **Web:** in lesson and review, the panel replaces the checked-state button and its `onContinue` is `next`. The panel renders `AnswerFeedback` inside itself above the button, so the explanation stays tappable. Then the `AnswerOption` and chip classes, and a progress bar at `h-2.5` with a moss gradient.
- [ ] **Step 7:** Run `bunx vitest run src/components src/lib/ios- src/lib/answer-verdict.test.ts "src/routes/_authenticated"`, `bunx tsc --noEmit`, and `cd ios/LearnWithAlphonsoKit && swift test`. Expected: PASS. Fix any existing test that pinned the removed portrait or the old classes; each fix is a ledgered Ruling naming the test.
- [ ] **Step 8:** Commit `feat(lesson): verdict panel with Alphonso reacting, chunky answer tiles`.

### Task 4: Words to learn, one card at a time

**Files:**

- Create: Kit `VocabDeck.swift` with test `VocabDeckTests.swift`; web `src/lib/vocab-deck.ts` with test
- Modify: iOS `VocabScreen` in `LessonPlayerView.swift`; web `VocabScreen` in `lesson.$id.tsx`
- Test: `src/routes/_authenticated/lesson.$id.vocabdeck.test.tsx` (new), guard in `src/lib/ios-verdict-guards.test.ts`

**Interfaces (Produces):** Kit `public enum VocabDeck { static func buttonTitle(index: Int, count: Int) -> String }` and web `deckButtonTitle(index: number, count: number): string`. Both return "Next word" while `index < count - 1`, otherwise "Start practice".

Design:

- Top row: the existing eyebrow and title, a counter "Word \(index+1) of \(count)", and a "Skip" text button (calls `onStart`; hidden when count is 1).
- The card is large: radius 28, chunky lift, about 60% of the height. Inside it:
  - The vocab image at 180 pt, when one exists.
  - The term in display 34 bold.
  - A 44 pt round speaker button.
  - The meaning in sans 16.
  - The example on a parchment strip in italic 15.
- A small Alphonso (`Alphonso-encouraging`, 72 pt, decorative) peeks from the card's top-right corner.
- Page dots sit under the card.
- iOS: `TabView(selection:)` with `.tabViewStyle(.page(indexDisplayMode: .never))` and custom dots.
- Web: an index state with a motion slide (x 24 to 0; opacity only under reduced motion), plus left/right arrow keys.
- The bottom button calls `VocabDeck.buttonTitle`: "Next word" advances, and on the last card it calls `onStart`.
- Fallbacks: iOS accessibility text sizes keep today's scrolling list (existing branch). Web Studio Ink keeps today's list.

- [ ] **Step 1:** Write the Kit and web `buttonTitle` tests for (0,1) "Start practice", (0,3) "Next word", (2,3) "Start practice". Write the web deck test: it shows the first term only, "Next word" moves to the second, the last card's button calls `onStart`, Skip calls `onStart`, and Studio Ink shows all terms. Write the iOS guard: `VocabScreen` uses `VocabDeck.buttonTitle(` and `.tabViewStyle(.page`, and still has the `isAccessibilitySize` list fallback.
- [ ] **Step 2:** Run them. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run `bunx vitest run src/lib src/routes/_authenticated`, `swift test --filter VocabDeckTests`, and `bunx tsc --noEmit`. Expected: PASS.
- [ ] **Step 5:** Commit `feat(lesson): words to learn as a one-card-at-a-time deck`.

### Task 5: Learn lesson list

**Files:**

- Create: `ios/LearnWithAlphonso/Sources/DesignSystem/LessonPathRow.swift`
- Modify: `ios/LearnWithAlphonso/Sources/LessonBrowserView.swift` (unit `Section` rows and header)
- Modify (web, only if its unit list is the same plain style): `src/routes/_authenticated/learn.tsx`. Web already draws `LessonNode` circles per unit, so web gets only the unit header banner treatment if needed. Ledger the ruling.
- Test: guard in `src/lib/ios-scenes-guards.test.ts` (or a new `ios-learn-list-guards.test.ts`)

**Interfaces:** `struct LessonPathRow: View { enum Status { case done, next, open }; let number: Int; let title: String; let subtitle: String; let status: Status }`

Design:

- **Row:** a chunky tile (radius 22, 4 pt bottom edge, parchment over the scene, at least 72 pt tall). On the left, a 44 pt status medallion:
  - done: a moss fill with a white checkmark;
  - next: an ember fill with a play icon, and the whole tile gets an ember border 2;
  - open: a surface fill with the lesson number in display 17 bold.

  Title in display 17 semibold, subtitle in sans 13 inkSoft. The chevron is hidden: the `NavigationLink` goes in a `.background` with `opacity(0)`, the same trick as `LearnContinueCard`.

- **Status rule:** a lesson is done if it is in `completedLessonIDs`; it is next if its id equals `nextLesson?.lesson.id`; otherwise it is open.
- **Unit header:** glass banner, full width. The eyebrow is in sans 11 semibold ember. The title is in display 20 bold ink, with "x/y done" on the right.
- **Unchanged:** keep `springEntrance`, `firstLessonRow`, the identifiers and the accessibility (`accessibilityElement(children: .combine)`, label "Lesson n, title, done/next").

- [ ] **Step 1:** Write the guard. `LessonBrowserView` uses `LessonPathRow(` in the unit rows, passes `.done` when `completedLessonIDs.contains`, compares with `nextLesson?.lesson.id` for `.next`, and still sets `"firstLessonRow"`. `LessonPathRow.swift` exists with the three statuses and `accessibilityLabel`. The unit header shows the done count.
- [ ] **Step 2:** Run it. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run `bunx vitest run src/lib/ios-`. Expected: PASS.
- [ ] **Step 5:** Commit `feat(learn): chunky lesson rows with status medallions`.

### Task 6: Verify, review, ship

- [ ] **Step 1:** Run the full suite: `bunx vitest run > .superpowers/sdd/2026-11-03-visual-round4/suite.txt`, then read the tail. Also run `bunx tsc --noEmit`, the lint and prettier checks, and Kit `swift test`. Expected: all green (name any red test by file).
- [ ] **Step 2:** Push the branch and open a draft PR. Wait for CI: the 7 required checks, including `ios-app-build`, and the e2e phone screenshots of the web screens.
- [ ] **Step 3:** Run Limrun QA on iOS with a fresh plus-address account. Capture: the vocab deck, a right and a wrong answer (multiple choice and fill-in), the lesson-complete screen on an iPhone SE-size and a Pro-size simulator, the Learn list, and review. Delete the account afterwards.
- [ ] **Step 4:** Run one Opus whole-branch review (model set explicitly), then a single fix pass with RED→GREEN tests for Critical/Important findings.
- [ ] **Step 5:** Mark the PR ready and squash-merge on green. Remove the worktree with the owner's `!` commands (rmdir the junction first). Update memory, MEMORY.md and SESSION-CONTEXT.md. Do not cut a build without the owner's OK.
