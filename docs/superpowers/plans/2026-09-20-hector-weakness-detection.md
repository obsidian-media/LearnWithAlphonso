# Hector Weakness-Detection Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** After a Hector or free-conversation session ends, detect up to 3 grammar/vocabulary weaknesses from the transcript via NVIDIA NIM and insert them as gradable `review_items` rows, so they show up in the existing SRS review queue on both iOS and web.

**Architecture:** A new TanStack Start API route calls NVIDIA NIM with a taxonomy-constrained prompt, validates the response, dedupes against existing weakness items, and inserts survivors into `review_items` (extended with new nullable "embedded content" columns) using the caller's own RLS-scoped client. `grade-review` (Edge Function + its web mirror) branches on a new `source` column to grade embedded content directly instead of looking up a lesson's `questions` row. iOS and web both branch their display logic the same way.

**Tech Stack:** Supabase (Postgres + Edge Functions/Deno), TanStack Start (React server routes), NVIDIA NIM (OpenAI-compatible chat completions), Swift 6.2.4 (SwiftPM Kit + SwiftUI app target, SwiftData for offline cache).

**Spec:** `docs/superpowers/specs/2026-09-20-hector-weakness-detection-design.md`

## Global Constraints

- Taxonomy is exactly these 15 keys, used verbatim in the zod enum, the LLM prompt, and nowhere else duplicated: `past-tense, articles, prepositions, subject-verb-agreement, plurals, question-formation, modal-verbs, word-order, pronouns, comparatives, conditionals, phrasal-verbs, negation, vocabulary-choice, spelling`.
- Weakness `review_items` rows always: `language = 'en'`, `lesson_id = 'weakness'`, `item_key = 'weakness:' + a 32-char lowercase-hex id (no hyphens)`.
- The new endpoint writes `review_items` using a request-scoped authenticated client (anon key + caller's bearer token) — **never** service-role. RLS already permits the row owner full CRUD.
- Every LLM-sourced field is defensively parsed and zod-validated before any DB write; malformed output silently yields `weaknessesDetected: 0`, never an error surfaced to the end user.
- Kit changes must pass `ios/LearnWithAlphonsoKit/swift-test.ps1` (Windows Swift 6.2.4 toolchain) before being considered done.
- One branch for this whole plan (`ios/hector-weakness-detection` or similar), one PR at the end — not one PR per task.
- Never merge the PR without an explicit "merge" instruction from the user, regardless of how the rest of this plan is executed.

---

### Task 1: Database migration — `review_items` weakness columns

**Files:**
- Create: `supabase/migrations/20260920040000_review_items_weakness_source.sql`
- Modify: `src/integrations/supabase/types.ts` (regenerated, not hand-edited)

**Interfaces:**
- Produces: `review_items.source` (`'lesson'|'weakness'`), `.weakness_label`, `.weakness_display`, `.prompt`, `.choices` (jsonb string array), `.answer_index`, `.explanation` — all nullable except `source`. Every later task that reads/writes `review_items` depends on these column names exactly.

- [ ] **Step 1: Write the migration file**

```sql
-- Adds embedded, non-lesson-derived question content to review_items for
-- the Hector/free-conversation weakness-detection feature (Option C, see
-- docs/superpowers/specs/2026-09-20-hector-weakness-detection-design.md).
-- A 'weakness' row carries its own gradable question directly instead of
-- pointing at a real lessons/questions row.
ALTER TABLE public.review_items
  ADD COLUMN source text NOT NULL DEFAULT 'lesson' CHECK (source IN ('lesson', 'weakness')),
  ADD COLUMN weakness_label text,
  ADD COLUMN weakness_display text,
  ADD COLUMN prompt text,
  ADD COLUMN choices jsonb,
  ADD COLUMN answer_index integer,
  ADD COLUMN explanation text,
  ADD CONSTRAINT weakness_shape_matches_source CHECK (
    (source = 'lesson') OR
    (source = 'weakness' AND weakness_label IS NOT NULL AND weakness_display IS NOT NULL
       AND prompt IS NOT NULL AND choices IS NOT NULL AND answer_index IS NOT NULL)
  );
```

- [ ] **Step 2: Apply the migration**

Use `mcp__claude_ai_Supabase__apply_migration` with `name:
"review_items_weakness_source"` and the SQL above, against project
`qhcjpfbxfcltjbiuknyt`.

- [ ] **Step 3: Verify**

Use `mcp__claude_ai_Supabase__list_migrations` and confirm
`20260920040000_review_items_weakness_source` is listed as applied.
Use `mcp__claude_ai_Supabase__get_advisors` (type `security`) to
confirm no new advisory was introduced by this change.

- [ ] **Step 4: Regenerate TypeScript types**

Use `mcp__claude_ai_Supabase__generate_typescript_types`, write the
result to `src/integrations/supabase/types.ts`, then run:

```bash
bunx prettier --write src/integrations/supabase/types.ts
```

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260920040000_review_items_weakness_source.sql src/integrations/supabase/types.ts
git commit -m "feat: add weakness-source columns to review_items"
```

---

### Task 2: Kit — `Question.MultipleChoice` gets a public initializer

**Files:**
- Modify: `ios/LearnWithAlphonsoKit/Sources/LearnWithAlphonsoKit/CurriculumModels.swift:12-18`
- Test: `ios/LearnWithAlphonsoKit/Tests/LearnWithAlphonsoKitTests/CurriculumModelsTests.swift` (new file)

**Interfaces:**
- Produces: `Question.MultipleChoice.init(id: String, prompt: String, choices: [String], answer: Int, explanation: String)`, callable from the app target (a different module than the Kit).

- [ ] **Step 1: Write the failing test**

Create `ios/LearnWithAlphonsoKit/Tests/LearnWithAlphonsoKitTests/CurriculumModelsTests.swift`:

```swift
import XCTest
@testable import LearnWithAlphonsoKit

final class CurriculumModelsTests: XCTestCase {
    func testMultipleChoiceCanBeConstructedDirectlyNotJustDecoded() {
        let mc = Question.MultipleChoice(
            id: "weakness:abc123",
            prompt: "She ___ to the store yesterday.",
            choices: ["go", "goes", "went", "gone"],
            answer: 2,
            explanation: "Past tense of 'go' is 'went'."
        )
        XCTAssertEqual(mc.id, "weakness:abc123")
        XCTAssertEqual(mc.choices[mc.answer], "went")
    }
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `powershell -File ios/LearnWithAlphonsoKit/swift-test.ps1`
Expected: FAIL to compile — `MultipleChoice` has no accessible
initializer taking these arguments (only the internal
Decodable-synthesized memberwise init exists, and this is a different
module from a test target's perspective via `@testable import`, so
confirm by checking the exact compiler error mentions "inaccessible
due to 'internal' protection level" or "missing argument" — if the
test target actually can see internal via `@testable`, this specific
test may compile already; in that case skip to Step 3 and instead
verify the intended failure mode by checking `ios/LearnWithAlphonso`
app-target code (a *different*, non-testable module) truly cannot
construct one today — this is what actually matters for Task 4).

- [ ] **Step 3: Add the public initializer**

In `CurriculumModels.swift`, inside `Question.MultipleChoice`:

```swift
public struct MultipleChoice: Decodable, Sendable {
    public let id: String
    public let prompt: String
    public let choices: [String]
    public let answer: Int
    public let explanation: String

    public init(id: String, prompt: String, choices: [String], answer: Int, explanation: String) {
        self.id = id
        self.prompt = prompt
        self.choices = choices
        self.answer = answer
        self.explanation = explanation
    }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `powershell -File ios/LearnWithAlphonsoKit/swift-test.ps1`
Expected: PASS, `CurriculumModelsTests` suite shows 1 test passing.

- [ ] **Step 5: Commit**

```bash
git add ios/LearnWithAlphonsoKit/Sources/LearnWithAlphonsoKit/CurriculumModels.swift ios/LearnWithAlphonsoKit/Tests/LearnWithAlphonsoKitTests/CurriculumModelsTests.swift
git commit -m "feat(ios): public init for Question.MultipleChoice"
```

---

### Task 3: Kit — extend `ReviewItem` and add `question(fromWeaknessItem:)`

**Files:**
- Modify: `ios/LearnWithAlphonsoKit/Sources/LearnWithAlphonsoKit/ProgressSyncClient.swift:17-35`
- Modify: `ios/LearnWithAlphonsoKit/Sources/LearnWithAlphonsoKit/QuestionGrading.swift`
- Test: `ios/LearnWithAlphonsoKit/Tests/LearnWithAlphonsoKitTests/QuestionGradingTests.swift`

**Interfaces:**
- Consumes: `Question.MultipleChoice.init(id:prompt:choices:answer:explanation:)` from Task 2.
- Produces: `ReviewItem` gains `source: String`, `weaknessDisplay: String?`, `prompt: String?`, `choices: [String]?`, `answerIndex: Int?`, `explanation: String?` (all with a matching new memberwise `init`). `public func question(fromWeaknessItem item: ReviewItem) -> Question?` — later tasks (ReviewQueueView) call this by name.

- [ ] **Step 1: Write the failing test**

Add to `ios/LearnWithAlphonsoKit/Tests/LearnWithAlphonsoKitTests/QuestionGradingTests.swift` (create it if it doesn't exist yet — check first; if `isAnswerCorrect` already has a test file, append to it):

```swift
func testQuestionFromWeaknessItemBuildsAMultipleChoiceQuestion() {
    let item = ReviewItem(
        itemKey: "weakness:abc123", lessonId: "weakness", level: "A1",
        ease: 2.5, intervalDays: 0, repetitions: 0, dueOn: "2026-09-20",
        source: "weakness", weaknessDisplay: "Past-tense verbs",
        prompt: "She ___ to the store yesterday.",
        choices: ["go", "goes", "went", "gone"], answerIndex: 2,
        explanation: "Past tense of 'go' is 'went'."
    )

    let question = question(fromWeaknessItem: item)

    guard case .multipleChoice(let mc) = question else {
        return XCTFail("Expected a multipleChoice question")
    }
    XCTAssertEqual(mc.id, "weakness:abc123")
    XCTAssertEqual(mc.choices, ["go", "goes", "went", "gone"])
    XCTAssertEqual(mc.answer, 2)
}

func testQuestionFromWeaknessItemReturnsNilForALessonSourcedItem() {
    let item = ReviewItem(
        itemKey: "lesson1:q1", lessonId: "lesson1", level: "A1",
        ease: 2.5, intervalDays: 0, repetitions: 0, dueOn: "2026-09-20",
        source: "lesson", weaknessDisplay: nil, prompt: nil,
        choices: nil, answerIndex: nil, explanation: nil
    )

    XCTAssertNil(question(fromWeaknessItem: item))
}

func testQuestionFromWeaknessItemReturnsNilWhenEmbeddedFieldsAreMissing() {
    let item = ReviewItem(
        itemKey: "weakness:abc123", lessonId: "weakness", level: "A1",
        ease: 2.5, intervalDays: 0, repetitions: 0, dueOn: "2026-09-20",
        source: "weakness", weaknessDisplay: "Past-tense verbs",
        prompt: nil, choices: ["go", "went"], answerIndex: 1,
        explanation: "why"
    )

    XCTAssertNil(question(fromWeaknessItem: item))
}
```

If `QuestionGradingTests.swift` doesn't exist yet, create it with
these three tests plus `import XCTest` / `@testable import
LearnWithAlphonsoKit` / `final class QuestionGradingTests: XCTestCase { ... }`
wrapping them — check the actual current file first with Read before
deciding.

- [ ] **Step 2: Run test to verify it fails**

Run: `powershell -File ios/LearnWithAlphonsoKit/swift-test.ps1`
Expected: FAIL to compile — `ReviewItem`'s init doesn't accept
`source:`/`weaknessDisplay:`/etc., and `question(fromWeaknessItem:)`
doesn't exist.

- [ ] **Step 3: Extend `ReviewItem` in `ProgressSyncClient.swift`**

Replace lines 17-35 with:

```swift
/// Matches review.functions.ts's `ReviewItem` shape exactly. `source`
/// discriminates a real lesson-question item ("lesson", the default)
/// from a synthetic weakness-detection item ("weakness") that carries
/// its own embedded gradable content instead of pointing at a real
/// lessons/questions row -- see docs/superpowers/specs/
/// 2026-09-20-hector-weakness-detection-design.md.
public struct ReviewItem: Sendable, Equatable {
    public let itemKey: String
    public let lessonId: String
    public let level: String
    public let ease: Double
    public let intervalDays: Int
    public let repetitions: Int
    public let dueOn: String
    public let source: String
    public let weaknessDisplay: String?
    public let prompt: String?
    public let choices: [String]?
    public let answerIndex: Int?
    public let explanation: String?

    public init(
        itemKey: String, lessonId: String, level: String, ease: Double,
        intervalDays: Int, repetitions: Int, dueOn: String,
        source: String = "lesson", weaknessDisplay: String? = nil,
        prompt: String? = nil, choices: [String]? = nil,
        answerIndex: Int? = nil, explanation: String? = nil
    ) {
        self.itemKey = itemKey
        self.lessonId = lessonId
        self.level = level
        self.ease = ease
        self.intervalDays = intervalDays
        self.repetitions = repetitions
        self.dueOn = dueOn
        self.source = source
        self.weaknessDisplay = weaknessDisplay
        self.prompt = prompt
        self.choices = choices
        self.answerIndex = answerIndex
        self.explanation = explanation
    }
}
```

(Default parameter values keep every existing call site in this
codebase source-compatible without changes.)

- [ ] **Step 4: Add `question(fromWeaknessItem:)` to `QuestionGrading.swift`**

Append to `ios/LearnWithAlphonsoKit/Sources/LearnWithAlphonsoKit/QuestionGrading.swift`:

```swift
/// Builds a `Question` directly from a weakness-sourced `ReviewItem`'s
/// embedded content, bypassing the bundled-lesson lookup entirely --
/// `nil` if `item` isn't a weakness item or is missing any required
/// field (a malformed/inconsistent row fails safe rather than crashing
/// the reviewer, matching ReviewQueueView's existing "skip on mismatch"
/// behavior for lesson items).
public func question(fromWeaknessItem item: ReviewItem) -> Question? {
    guard item.source == "weakness",
          let prompt = item.prompt,
          let choices = item.choices,
          let answerIndex = item.answerIndex,
          let explanation = item.explanation else {
        return nil
    }
    return .multipleChoice(Question.MultipleChoice(
        id: item.itemKey, prompt: prompt, choices: choices,
        answer: answerIndex, explanation: explanation
    ))
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `powershell -File ios/LearnWithAlphonsoKit/swift-test.ps1`
Expected: PASS, all three new tests green, and the full existing suite
(139+ prior tests) still passes.

- [ ] **Step 6: Commit**

```bash
git add ios/LearnWithAlphonsoKit/Sources/LearnWithAlphonsoKit/ProgressSyncClient.swift ios/LearnWithAlphonsoKit/Sources/LearnWithAlphonsoKit/QuestionGrading.swift ios/LearnWithAlphonsoKit/Tests/LearnWithAlphonsoKitTests/QuestionGradingTests.swift
git commit -m "feat(ios): extend ReviewItem with weakness fields, add question(fromWeaknessItem:)"
```

---

### Task 4: Kit — `fetchDueReviews` select/decode extension

**Files:**
- Modify: `ios/LearnWithAlphonsoKit/Sources/LearnWithAlphonsoKit/ProgressSyncClient.swift:282-306`
- Test: `ios/LearnWithAlphonsoKit/Tests/LearnWithAlphonsoKitTests/ProgressSyncClientTests.swift`

**Interfaces:**
- Consumes: `ReviewItem`'s extended init from Task 3.
- Produces: `fetchDueReviews(course:)` returns `ReviewItem`s with `source`/`weaknessDisplay`/`prompt`/`choices`/`answerIndex`/`explanation` populated when present.

- [ ] **Step 1: Write the failing test**

Add to `ProgressSyncClientTests.swift` (find the existing
`fetchDueReviews`-related test(s) first via Grep to match the file's
existing `makeClient`/`jsonResponse` helper names before writing this):

```swift
func testFetchDueReviewsDecodesWeaknessSourcedRows() async throws {
    let client = makeClient { request in
        self.jsonResponse([
            [
                "item_key": "weakness:abc123", "lesson_id": "weakness", "level": "A1",
                "ease": 2.5, "interval_days": 0, "repetitions": 0, "due_on": "2026-09-20",
                "source": "weakness", "weakness_display": "Past-tense verbs",
                "prompt": "She ___ to the store yesterday.",
                "choices": ["go", "goes", "went", "gone"], "answer_index": 2,
                "explanation": "Past tense of 'go' is 'went'.",
            ]
        ])
    }

    let result = try await client.fetchDueReviews(course: "en")

    let item = try XCTUnwrap(result.due.first)
    XCTAssertEqual(item.source, "weakness")
    XCTAssertEqual(item.weaknessDisplay, "Past-tense verbs")
    XCTAssertEqual(item.choices, ["go", "goes", "went", "gone"])
    XCTAssertEqual(item.answerIndex, 2)
}

func testFetchDueReviewsDefaultsSourceToLessonWhenColumnIsAbsent() async throws {
    let client = makeClient { request in
        self.jsonResponse([
            [
                "item_key": "lesson1:q1", "lesson_id": "lesson1", "level": "A1",
                "ease": 2.5, "interval_days": 0, "repetitions": 0, "due_on": "2026-09-20",
            ]
        ])
    }

    let result = try await client.fetchDueReviews(course: "en")

    XCTAssertEqual(result.due.first?.source, "lesson")
}
```

(Adjust `makeClient`/`jsonResponse` calls to match this file's actual
existing helper signatures — read the file first.)

- [ ] **Step 2: Run test to verify it fails**

Run: `powershell -File ios/LearnWithAlphonsoKit/swift-test.ps1`
Expected: FAIL — `item.source`/`item.weaknessDisplay`/etc. are always
default values since `fetchDueReviews` doesn't select or decode them
yet.

- [ ] **Step 3: Extend the select list and decode logic**

Replace lines 282-306 in `ProgressSyncClient.swift`:

```swift
public func fetchDueReviews(course: String) async throws -> DueReviews {
    let today = ISO8601DateFormatter().string(from: Date()).prefix(10)
    var dueRequest = restRequest(path: "review_items", query: [
        URLQueryItem(name: "select", value: "item_key,lesson_id,level,ease,interval_days,repetitions,due_on,source,weakness_display,prompt,choices,answer_index,explanation"),
        URLQueryItem(name: "language", value: "eq.\(course)"),
        URLQueryItem(name: "due_on", value: "lte.\(today)"),
        URLQueryItem(name: "order", value: "due_on.asc"),
        URLQueryItem(name: "limit", value: "20"),
    ])
    dueRequest.httpMethod = "GET"
    let (dueData, dueResponse) = try await requester(dueRequest)
    try Self.requireSuccess(data: dueData, response: dueResponse)
    guard let rows = try? JSONSerialization.jsonObject(with: dueData) as? [[String: Any]] else {
        throw ProgressSyncError.invalidPayload
    }
    let due = rows.compactMap { row -> ReviewItem? in
        guard let itemKey = row["item_key"] as? String,
              let lessonId = row["lesson_id"] as? String,
              let level = row["level"] as? String,
              let ease = row["ease"] as? Double,
              let intervalDays = row["interval_days"] as? Int,
              let repetitions = row["repetitions"] as? Int,
              let dueOn = row["due_on"] as? String else { return nil }
        return ReviewItem(
            itemKey: itemKey, lessonId: lessonId, level: level, ease: ease,
            intervalDays: intervalDays, repetitions: repetitions, dueOn: dueOn,
            source: row["source"] as? String ?? "lesson",
            weaknessDisplay: row["weakness_display"] as? String,
            prompt: row["prompt"] as? String,
            choices: row["choices"] as? [String],
            answerIndex: row["answer_index"] as? Int,
            explanation: row["explanation"] as? String
        )
    }
```

(The rest of the function — the `countRequest` block and return —
stays exactly as-is, unchanged.)

- [ ] **Step 4: Run test to verify it passes**

Run: `powershell -File ios/LearnWithAlphonsoKit/swift-test.ps1`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add ios/LearnWithAlphonsoKit/Sources/LearnWithAlphonsoKit/ProgressSyncClient.swift ios/LearnWithAlphonsoKit/Tests/LearnWithAlphonsoKitTests/ProgressSyncClientTests.swift
git commit -m "feat(ios): fetchDueReviews decodes weakness-item embedded content"
```

---

### Task 5: Kit — `AIConversationClient.analyzeWeaknesses`

**Files:**
- Modify: `ios/LearnWithAlphonsoKit/Sources/LearnWithAlphonsoKit/AIConversationClient.swift`
- Test: `ios/LearnWithAlphonsoKit/Tests/LearnWithAlphonsoKitTests/AIConversationClientTests.swift`

**Interfaces:**
- Produces: `public func analyzeWeaknesses(transcript: [ChatMessage]) async throws -> Int` on `AIConversationClient` — Task 10/11 (app target) call this by name.

- [ ] **Step 1: Write the failing test**

Add to `AIConversationClientTests.swift`, after the `chat` tests
(matching that file's existing `makeClient`/pattern exactly):

```swift
// MARK: - analyzeWeaknesses

func testAnalyzeWeaknessesPostsTheTranscriptAndReturnsTheCount() async throws {
    var captured: URLRequest?
    let client = makeClient { request in
        captured = request
        let body = try! JSONSerialization.data(withJSONObject: ["weaknessesDetected": 2])
        return (body, HTTPURLResponse(url: request.url!, statusCode: 200, httpVersion: nil, headerFields: nil)!)
    }

    let count = try await client.analyzeWeaknesses(transcript: [
        ChatMessage(role: "assistant", content: "Hi! How was your weekend?"),
        ChatMessage(role: "user", content: "I go to the park yesterday."),
    ])

    XCTAssertEqual(count, 2)
    let request = try XCTUnwrap(captured)
    XCTAssertEqual(request.httpMethod, "POST")
    XCTAssertTrue(request.url!.absoluteString.hasSuffix("/api/analyze-weaknesses"))
    XCTAssertEqual(request.value(forHTTPHeaderField: "Authorization"), "Bearer user-access-token")
    let body = try XCTUnwrap(request.httpBody)
    let payload = try JSONSerialization.jsonObject(with: body) as! [String: Any]
    let messages = payload["messages"] as! [[String: String]]
    XCTAssertEqual(messages, [
        ["role": "assistant", "content": "Hi! How was your weekend?"],
        ["role": "user", "content": "I go to the park yesterday."],
    ])
}

func testAnalyzeWeaknessesSurfacesAQuotaError() async {
    let client = makeClient { request in
        let body = try! JSONSerialization.data(withJSONObject: ["error": "Daily CHAT limit reached (60/day). Try again tomorrow."])
        return (body, HTTPURLResponse(url: request.url!, statusCode: 429, httpVersion: nil, headerFields: nil)!)
    }

    do {
        _ = try await client.analyzeWeaknesses(transcript: [ChatMessage(role: "user", content: "hi")])
        XCTFail("Expected an error")
    } catch {
        XCTAssertEqual(
            error as? AIConversationError,
            .server(status: 429, message: "Daily CHAT limit reached (60/day). Try again tomorrow.")
        )
    }
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `powershell -File ios/LearnWithAlphonsoKit/swift-test.ps1`
Expected: FAIL to compile — `analyzeWeaknesses` doesn't exist yet.

- [ ] **Step 3: Implement `analyzeWeaknesses`**

Add to `AIConversationClient.swift`, right after the existing `chat`
method (after line 63):

```swift
/// POST /api/analyze-weaknesses -- best-effort, fire-and-forget from
/// the caller's perspective (see ConversationSessionView/
/// HectorConversationView's onDisappear wiring, which swallows any
/// error from this call). Returns how many weakness-derived
/// review_items rows the server actually inserted (post-dedup).
public func analyzeWeaknesses(transcript: [ChatMessage]) async throws -> Int {
    var request = URLRequest(url: baseURL.appendingPathComponent("api/analyze-weaknesses"))
    request.httpMethod = "POST"
    request.setValue("application/json", forHTTPHeaderField: "Content-Type")
    request.setValue("Bearer \(accessToken())", forHTTPHeaderField: "Authorization")
    let payload: [String: Any] = ["messages": transcript.map { ["role": $0.role, "content": $0.content] }]
    request.httpBody = try JSONSerialization.data(withJSONObject: payload)

    let (data, response) = try await requester(request)
    try Self.requireSuccess(data: data, response: response)
    guard let object = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
          let count = object["weaknessesDetected"] as? Int else {
        throw AIConversationError.invalidPayload
    }
    return count
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `powershell -File ios/LearnWithAlphonsoKit/swift-test.ps1`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add ios/LearnWithAlphonsoKit/Sources/LearnWithAlphonsoKit/AIConversationClient.swift ios/LearnWithAlphonsoKit/Tests/LearnWithAlphonsoKitTests/AIConversationClientTests.swift
git commit -m "feat(ios): AIConversationClient.analyzeWeaknesses"
```

---

### Task 6: `analyze-weaknesses` API route + `ai-quota.server.ts` reuse

**Files:**
- Create: `src/routes/api/analyze-weaknesses.ts`

**Interfaces:**
- Consumes: `consumeQuota(request, "chat")` from `src/lib/ai-quota.server.ts` (existing, unmodified — reused as-is per the corrected spec, no service-role, no signature change).
- Produces: `POST /api/analyze-weaknesses` — request `{ messages: {role, content}[] }`, response `{ weaknessesDetected: number }`. Task 5's `AIConversationClient.analyzeWeaknesses` is the caller.

There's no local unit-test infrastructure for API routes in this repo
(`api/chat.ts` and the Edge Functions have none either — verified) —
this task is verified via `bunx tsc --noEmit`, `bun run lint`, and the
CI `e2e`/`lint-and-typecheck` jobs, consistent with that existing
precedent. Manual verification happens in Task 14.

- [ ] **Step 1: Write the route**

Create `src/routes/api/analyze-weaknesses.ts`:

```typescript
import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import { upstreamErrorResponse } from "@/lib/api-response.server";

const TAXONOMY = [
  "past-tense",
  "articles",
  "prepositions",
  "subject-verb-agreement",
  "plurals",
  "question-formation",
  "modal-verbs",
  "word-order",
  "pronouns",
  "comparatives",
  "conditionals",
  "phrasal-verbs",
  "negation",
  "vocabulary-choice",
  "spelling",
] as const;

const weaknessSchema = z.object({
  label: z.enum(TAXONOMY),
  display: z.string().min(1).max(120),
  prompt: z.string().min(1).max(300),
  choices: z.array(z.string().min(1).max(120)).length(4),
  answerIndex: z.number().int().min(0).max(3),
  explanation: z.string().min(1).max(300),
});
const weaknessesSchema = z.array(weaknessSchema).max(3);
type Weakness = z.infer<typeof weaknessSchema>;

type ChatMessage = { role: "system" | "user" | "assistant"; content: string };

/** Never throws -- any parse/shape failure yields an empty array. */
function parseWeaknesses(content: string): Weakness[] {
  const stripped = content.replace(/```json\s*|```\s*/g, "").trim();
  try {
    const parsed: unknown = JSON.parse(stripped);
    const result = weaknessesSchema.safeParse(parsed);
    return result.success ? result.data : [];
  } catch {
    return [];
  }
}

function analysisPrompt(): string {
  return (
    `From this English-learner conversation, pick 0-3 categories from ` +
    `this exact list that the learner struggled with: ${TAXONOMY.join(", ")}. ` +
    `For each, write a 4-choice multiple-choice question testing that ` +
    `category, plus a short explanation of the right answer. Respond with ` +
    `ONLY a JSON array, no other text, in this exact shape: ` +
    `[{"label": "<one of the categories above>", "display": "<short human-readable description, e.g. 'Past-tense verbs'>", ` +
    `"prompt": "<question text>", "choices": ["<4 options>"], "answerIndex": <0-3>, "explanation": "<why>"}]. ` +
    `If there's nothing worth flagging, respond with [].`
  );
}

export const Route = createFileRoute("/api/analyze-weaknesses")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const key = process.env.NVIDIA_API_KEY;
        if (!key) return Response.json({ error: "Analysis is not configured" }, { status: 500 });

        const { consumeQuota } = await import("@/lib/ai-quota.server");
        const quota = await consumeQuota(request, "chat");
        if (!quota.ok) return Response.json({ error: quota.message }, { status: quota.status });

        let body: { messages?: ChatMessage[] };
        try {
          body = await request.json();
        } catch {
          return Response.json({ error: "Invalid JSON" }, { status: 400 });
        }
        const messages = Array.isArray(body.messages) ? body.messages : [];
        if (messages.length === 0) {
          return Response.json({ weaknessesDetected: 0 });
        }

        const model = process.env.NVIDIA_CHAT_MODEL || "meta/llama-3.1-70b-instruct";
        const resp = await fetch("https://integrate.api.nvidia.com/v1/chat/completions", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${key}`,
          },
          body: JSON.stringify({
            model,
            messages: [...messages, { role: "user" as const, content: analysisPrompt() }],
          }),
        });
        if (!resp.ok) {
          const text = await resp.text().catch(() => "");
          return upstreamErrorResponse("NVIDIA", resp.status, text);
        }
        const data = (await resp.json()) as {
          choices?: { message?: { content?: string } }[];
        };
        const content = data.choices?.[0]?.message?.content ?? "";
        const weaknesses = parseWeaknesses(content);
        if (weaknesses.length === 0) {
          return Response.json({ weaknessesDetected: 0 });
        }

        const authHeader = request.headers.get("authorization")!; // consumeQuota already required this
        const url = process.env.SUPABASE_URL;
        const anonKey = process.env.SUPABASE_PUBLISHABLE_KEY ?? process.env.SUPABASE_ANON_KEY;
        if (!url || !anonKey) return Response.json({ error: "Server not configured." }, { status: 500 });

        const supabase = createClient(url, anonKey, {
          auth: { persistSession: false, autoRefreshToken: false },
          global: { headers: { Authorization: authHeader } },
        });

        let inserted = 0;
        for (const weakness of weaknesses) {
          const { data: existing } = await supabase
            .from("review_items")
            .select("item_key")
            .eq("source", "weakness")
            .eq("weakness_label", weakness.label)
            .maybeSingle();
          if (existing) continue;

          const itemKey = `weakness:${crypto.randomUUID().replace(/-/g, "")}`;
          const { error } = await supabase.from("review_items").insert({
            item_key: itemKey,
            lesson_id: "weakness",
            level: "A1",
            language: "en",
            ease: 2.5,
            interval_days: 0,
            repetitions: 0,
            due_on: new Date().toISOString().slice(0, 10),
            source: "weakness",
            weakness_label: weakness.label,
            weakness_display: weakness.display,
            prompt: weakness.prompt,
            choices: weakness.choices,
            answer_index: weakness.answerIndex,
            explanation: weakness.explanation,
          });
          if (!error) inserted += 1;
        }

        return Response.json({ weaknessesDetected: inserted });
      },
    },
  },
});
```

- [ ] **Step 2: Typecheck and lint**

```bash
bunx tsc --noEmit
bun run lint
```

Expected: both clean. Fix any type errors against the regenerated
`types.ts` from Task 1 (e.g. if `review_items`'s insert type doesn't
yet recognize the new columns, re-run Task 1 Step 4's type
regeneration).

- [ ] **Step 3: Commit**

```bash
git add src/routes/api/analyze-weaknesses.ts
git commit -m "feat: add /api/analyze-weaknesses endpoint"
```

---

### Task 7: `grade-review` Edge Function — weakness-source branch

**Files:**
- Modify: `supabase/functions/grade-review/index.ts`

**Interfaces:**
- Consumes: `review_items.source`/`.choices`/`.answer_index` from Task 1's migration.

- [ ] **Step 1: Add the branch**

In `handleRequest`, replace:

```ts
  const { data: question } = await admin
    .from("questions")
    .select("type, choices, answer_index, answer_text")
    .eq("lesson_id", lessonId)
    .eq("id", questionId)
    .maybeSingle();
  if (!question) {
    return jsonResponse({ error: "Unknown review item" }, 400);
  }

  const correct = deriveAnswerCorrectness(question as QuestionRow, answer);
```

with:

```ts
  let correct: boolean;
  if (row.source === "weakness") {
    const choices = row.choices as string[] | null;
    correct = choices?.[row.answer_index as number] === answer;
  } else {
    const { data: question } = await admin
      .from("questions")
      .select("type, choices, answer_index, answer_text")
      .eq("lesson_id", lessonId)
      .eq("id", questionId)
      .maybeSingle();
    if (!question) {
      return jsonResponse({ error: "Unknown review item" }, 400);
    }
    correct = deriveAnswerCorrectness(question as QuestionRow, answer);
  }
```

(`const [lessonId, questionId] = itemKey.split(":");` stays exactly
where it already is, just above this block — still needed for the
`else` branch, unused but harmless for the `weakness` branch since
`itemKey.split(":")` on `"weakness:abc123"` just yields
`["weakness", "abc123"]` without being used.)

- [ ] **Step 2: Deploy**

Use `mcp__claude_ai_Supabase__deploy_edge_function` for `grade-review`
against project `qhcjpfbxfcltjbiuknyt`. Confirm the returned version
number incremented and status is `ACTIVE` (via
`mcp__claude_ai_Supabase__get_edge_function`).

- [ ] **Step 3: Commit**

```bash
git add supabase/functions/grade-review/index.ts
git commit -m "feat: grade-review derives correctness from embedded content for weakness items"
```

---

### Task 8: Web mirror — `review.functions.ts`

**Files:**
- Modify: `src/lib/review.functions.ts:10-18` (the `ReviewItem` type)
- Modify: `src/lib/review.functions.ts:112-143` (`fetchDueReviews`)
- Modify: `src/lib/review.functions.ts:156-226` (`gradeReview`)

**Interfaces:**
- Produces: web's own `ReviewItem` type gains the same fields as the Kit's (Task 3), independently (these are two separate type definitions in two separate languages, per this codebase's existing dual-implementation pattern — not shared).

- [ ] **Step 1: Extend the `ReviewItem` type**

Replace lines 10-18:

```ts
export type ReviewItem = {
  itemKey: string;
  lessonId: string;
  level: string;
  ease: number;
  intervalDays: number;
  repetitions: number;
  dueOn: string;
  source: string;
  weaknessDisplay: string | null;
  prompt: string | null;
  choices: string[] | null;
  answerIndex: number | null;
  explanation: string | null;
};
```

- [ ] **Step 2: Extend `fetchDueReviews`'s select and mapping**

Replace the `select` call and the `due` mapping (lines ~121 and
~133-141):

```ts
      supabase
        .from("review_items")
        .select(
          "item_key,lesson_id,level,ease,interval_days,repetitions,due_on,source,weakness_display,prompt,choices,answer_index,explanation",
        )
        .eq("user_id", userId)
        .eq("language", course)
        .lte("due_on", today())
        .order("due_on", { ascending: true })
        .limit(20),
```

```ts
    const due = (dueRes.data ?? []).map((r) => ({
      itemKey: r.item_key,
      lessonId: r.lesson_id,
      level: r.level,
      ease: r.ease,
      intervalDays: r.interval_days,
      repetitions: r.repetitions,
      dueOn: r.due_on,
      source: r.source,
      weaknessDisplay: r.weakness_display,
      prompt: r.prompt,
      choices: r.choices as string[] | null,
      answerIndex: r.answer_index,
      explanation: r.explanation,
    }));
```

- [ ] **Step 3: Branch `gradeReview`'s correctness derivation**

Replace:

```ts
    const ref = getCourse(course).questionIndex[data.itemKey];
    if (!ref) throw new Error("Unknown review item");
    const correct = deriveAnswerCorrectness(ref.question, data.answer);
```

with:

```ts
    let correct: boolean;
    if (row.source === "weakness") {
      const choices = row.choices as string[] | null;
      correct = choices?.[row.answer_index as number] === data.answer;
    } else {
      const ref = getCourse(course).questionIndex[data.itemKey];
      if (!ref) throw new Error("Unknown review item");
      correct = deriveAnswerCorrectness(ref.question, data.answer);
    }
```

- [ ] **Step 4: Typecheck**

```bash
bunx tsc --noEmit
```

Expected: clean. If `row.source`/`row.choices`/`row.answer_index`
aren't recognized on the `review_items` row type, re-check Task 1's
type regeneration landed and is imported correctly here.

- [ ] **Step 5: Commit**

```bash
git add src/lib/review.functions.ts
git commit -m "feat: web review.functions.ts mirrors grade-review's weakness-item branch"
```

---

### Task 9: Web mirror — `review.tsx` display

**Files:**
- Modify: `src/routes/_authenticated/review.tsx:39` (the `Card` type stays the same shape, just built differently)
- Modify: `src/routes/_authenticated/review.tsx:63-67` (the `built` loop)

**Interfaces:**
- Consumes: `ReviewItem`'s extended fields from Task 8.

- [ ] **Step 1: Extend the `built` loop**

Replace:

```tsx
        const built: Card[] = [];
        for (const item of res.due) {
          const ref = questionIndex[item.itemKey];
          if (ref) built.push({ itemKey: item.itemKey, question: ref.question });
        }
```

with:

```tsx
        const built: Card[] = [];
        for (const item of res.due) {
          if (item.source === "weakness") {
            if (item.prompt && item.choices && item.answerIndex !== null) {
              built.push({
                itemKey: item.itemKey,
                question: {
                  id: item.itemKey,
                  type: "mc",
                  prompt: item.prompt,
                  choices: item.choices,
                  answer: item.answerIndex,
                  explanation: item.explanation ?? "",
                },
              });
            }
            continue;
          }
          const ref = questionIndex[item.itemKey];
          if (ref) built.push({ itemKey: item.itemKey, question: ref.question });
        }
```

- [ ] **Step 2: Typecheck and lint**

```bash
bunx tsc --noEmit
bun run lint
```

- [ ] **Step 3: Commit**

```bash
git add src/routes/_authenticated/review.tsx
git commit -m "feat: web review page renders weakness-sourced items"
```

---

### Task 10: iOS — `ConversationSessionView` trigger

**Files:**
- Modify: `ios/LearnWithAlphonso/Sources/ConversationView.swift:80-86`

**Interfaces:**
- Consumes: `AIConversationClient.analyzeWeaknesses(transcript:)` from Task 5.

This is app-target SwiftUI code, verified only by `ios-app-build` CI
(no local macOS toolchain in this dev environment) — see Task 14.

- [ ] **Step 1: Add the `onDisappear` modifier**

Replace lines 80-86:

```swift
        .navigationTitle(scenario.title)
        .navigationBarTitleDisplayMode(.inline)
        .task {
            turns = [ChatMessage(role: "assistant", content: scenario.opener)]
        }
        .onDisappear {
            guard turns.count >= 4, let accessToken = session.accessToken else { return }
            let client = AIConversationClient(baseURL: AppConfig.apiBaseURL, accessToken: { accessToken })
            let transcript = turns
            Task { _ = try? await client.analyzeWeaknesses(transcript: transcript) }
        }
```

- [ ] **Step 2: Commit**

```bash
git add ios/LearnWithAlphonso/Sources/ConversationView.swift
git commit -m "feat(ios): trigger weakness analysis when a free conversation ends"
```

---

### Task 11: iOS — `HectorConversationView` trigger

**Files:**
- Modify: `ios/LearnWithAlphonso/Sources/HectorView.swift:142-164`

**Interfaces:**
- Consumes: `AIConversationClient.analyzeWeaknesses(transcript:)` from Task 5.

- [ ] **Step 1: Add the `onDisappear` modifier**

Replace lines 142-164 (the whole `body` property):

```swift
    var body: some View {
        VStack(spacing: 0) {
            ScrollViewReader { proxy in
                ScrollView {
                    LazyVStack(alignment: .leading, spacing: 12) {
                        ForEach(Array(turns.enumerated()), id: \.offset) { index, turn in
                            bubble(for: turn).id(index)
                        }
                    }
                    .padding()
                }
                .onChange(of: turns.count) {
                    withAnimation { proxy.scrollTo(turns.count - 1, anchor: .bottom) }
                }
            }

            if let errorMessage {
                Text(errorMessage).font(.footnote).foregroundStyle(.red).padding(.horizontal)
            }

            micButton.padding()
        }
        .onDisappear {
            guard turns.count >= 4, let accessToken = session.accessToken else { return }
            let client = AIConversationClient(baseURL: AppConfig.apiBaseURL, accessToken: { accessToken })
            let transcript = turns.map { ChatMessage(role: $0.role, content: $0.content) }
            Task { _ = try? await client.analyzeWeaknesses(transcript: transcript) }
        }
    }
```

- [ ] **Step 2: Commit**

```bash
git add ios/LearnWithAlphonso/Sources/HectorView.swift
git commit -m "feat(ios): trigger weakness analysis when a Hector conversation ends"
```

---

### Task 12: iOS — `ReviewQueueView` display branch

**Files:**
- Modify: `ios/LearnWithAlphonso/Sources/ReviewQueueView.swift:76-80`

**Interfaces:**
- Consumes: `question(fromWeaknessItem:)` from Task 3.

- [ ] **Step 1: Branch `currentQuestion`**

Replace lines 76-80:

```swift
    private var currentQuestion: Question? {
        if currentItem.source == "weakness" {
            return question(fromWeaknessItem: currentItem)
        }
        guard let found = contentStore.findLesson(id: currentItem.lessonId, course: course) else { return nil }
        let questionId = String(currentItem.itemKey.split(separator: ":").last ?? "")
        return found.lesson.questions.first { questionID($0) == questionId }
    }
```

- [ ] **Step 2: Commit**

```bash
git add ios/LearnWithAlphonso/Sources/ReviewQueueView.swift
git commit -m "feat(ios): ReviewQueueView renders weakness-sourced items"
```

---

### Task 13: iOS — `CachedDueReviewRecord` offline cache extension

**Files:**
- Modify: `ios/LearnWithAlphonso/Sources/SyncQueueStore.swift:58-81`

**Interfaces:**
- Consumes: `ReviewItem`'s extended fields from Task 3.

- [ ] **Step 1: Extend the SwiftData model**

Replace lines 58-81:

```swift
/// One cached `ReviewItem` from the last successful `fetchDueReviews` --
/// shown instead of an error screen when a later fetch fails or the device
/// is offline. Mirrors ReviewItem's weakness-embedded-content fields too,
/// so an offline-cached weakness item renders and grades correctly
/// without a network round trip -- see QuestionGrading.swift's
/// question(fromWeaknessItem:).
@Model
final class CachedDueReviewRecord {
    @Attribute(.unique) var itemKey: String
    var lessonId: String
    var level: String
    var ease: Double
    var intervalDays: Int
    var repetitions: Int
    var dueOn: String
    var source: String
    var weaknessDisplay: String?
    var prompt: String?
    var choices: [String]?
    var answerIndex: Int?
    var explanation: String?

    init(_ item: ReviewItem) {
        itemKey = item.itemKey
        lessonId = item.lessonId
        level = item.level
        ease = item.ease
        intervalDays = item.intervalDays
        repetitions = item.repetitions
        dueOn = item.dueOn
        source = item.source
        weaknessDisplay = item.weaknessDisplay
        prompt = item.prompt
        choices = item.choices
        answerIndex = item.answerIndex
        explanation = item.explanation
    }

    var asReviewItem: ReviewItem {
        ReviewItem(
            itemKey: itemKey, lessonId: lessonId, level: level, ease: ease,
            intervalDays: intervalDays, repetitions: repetitions, dueOn: dueOn,
            source: source, weaknessDisplay: weaknessDisplay, prompt: prompt,
            choices: choices, answerIndex: answerIndex, explanation: explanation
        )
    }
}
```

- [ ] **Step 2: Commit**

```bash
git add ios/LearnWithAlphonso/Sources/SyncQueueStore.swift
git commit -m "feat(ios): CachedDueReviewRecord carries weakness-item embedded content offline"
```

---

### Task 14: Final verification, push, PR

**Files:** none (verification only)

- [ ] **Step 1: Full Kit test suite**

```bash
powershell -File ios/LearnWithAlphonsoKit/swift-test.ps1
```

Expected: PASS, full suite (139 prior tests + this plan's new tests,
~148+ total), 0 failures.

- [ ] **Step 2: Web typecheck and lint**

```bash
bunx tsc --noEmit
bun run lint
```

Expected: both clean.

- [ ] **Step 3: Push and open one PR for the whole batch**

```bash
git push -u origin <branch-name>
gh pr create --base main --title "feat: Hector/free-conversation weakness detection (Option C)" --body "$(cat <<'EOF'
## Summary
- Adds weakness-detection after a Hector or free-conversation session ends (>=4 turns): NVIDIA NIM identifies up to 3 grammar/vocabulary weaknesses from a fixed 15-category taxonomy, each becomes a gradable multiple-choice review_items row.
- New review_items columns (source/weakness_label/weakness_display/prompt/choices/answer_index/explanation) carry embedded question content for non-lesson-derived items.
- New /api/analyze-weaknesses endpoint: NVIDIA NIM call, defensive JSON parsing, zod validation, dedup-by-label, insert via the caller's own RLS-scoped client (not service-role).
- grade-review Edge Function and its web mirror (review.functions.ts) both branch on source to grade embedded content directly.
- iOS Kit (Question.MultipleChoice public init, ReviewItem extension, question(fromWeaknessItem:), AIConversationClient.analyzeWeaknesses) and app target (ReviewQueueView, ConversationView/HectorView onDisappear triggers, offline SwiftData cache) all updated; web review.tsx renders weakness items too.
- Spec: docs/superpowers/specs/2026-09-20-hector-weakness-detection-design.md (gitignored, internal decision doc).

## Test plan
- [x] Full Kit test suite passes locally via swift-test.ps1.
- [x] bunx tsc --noEmit and bun run lint clean.
- [ ] ios-app-build CI (real xcodebuild) -- new SwiftUI onDisappear/display code is macOS-CI-verified only.
- [ ] Manual: real Hector + free-conversation sessions, confirming a weakness item appears and grades correctly on iOS (online + offline) and web.
EOF
)"
```

- [ ] **Step 4: Wait for CI, report, do NOT merge**

Poll `gh pr checks <number>` until no checks are `pending`. Report the
full pass/fail status back to the user. Do not run `gh pr merge` under
any circumstance until the user explicitly says to merge — this holds
regardless of how autonomously the rest of this plan was executed.

- [ ] **Step 5: Manual verification (after merge, once deployed)**

A real Hector session and a real free-conversation session, each with
at least 2 full exchanges (4+ turns), confirming: a weakness item
appears in the iOS review queue and grades correctly online; force-quit
network and confirm the offline-cached path also grades it correctly;
confirm the same item appears and grades correctly on the web app's
`/review` page.
