# Native iOS Content Bootstrap Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Export english-buddy-app-33's lesson content and conversation scenarios into a native iOS app's bundle, and get a real Xcode project decoding and loading that content in Swift — the foundational slice everything else in the native app (lesson browsing, the player, gamification, AI conversation) builds on.

**Architecture:** A pure, tested TypeScript function (`buildIOSContentBundle`) extracts the existing `curriculum`/`curriculumFr`/`SCENARIOS` data unchanged into a JSON shape; a thin CLI script writes that to disk; a new Xcode project (bootstrapped manually — see Task 2 — hand-authoring a `.xcodeproj` from scratch is not something to attempt blind) gets Swift `Codable` models matching that JSON exactly, plus a loader that reads the bundled files at launch.

**Tech Stack:** TypeScript/Vitest (export side, this repo's existing stack) + Swift/SwiftUI (iOS side, new).

**Known constraint — read before starting:** there is no Swift compiler in the environment writing this plan. Tasks 3+ (anything Swift) are written carefully against real, existing type shapes, but are **unverified until built in Xcode**. Task 1 (TypeScript) is fully real and testable now, with no such caveat — do that work with full confidence; treat Swift steps as "ready to try, not proven."

---

### Task 1: Content export pipeline (TypeScript, fully testable now)

**Files:**
- Create: `src/lib/ios-content-export.ts`
- Create: `src/lib/ios-content-export.test.ts`
- Create: `scripts/export-ios-content.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// src/lib/ios-content-export.test.ts
import { describe, expect, it } from "vitest";
import { buildIOSContentBundle } from "./ios-content-export";

describe("buildIOSContentBundle", () => {
  it("exports the full English curriculum with the expected lesson count", () => {
    const bundle = buildIOSContentBundle("en");
    const lessonCount = bundle.units.reduce((sum, u) => sum + u.lessons.length, 0);
    expect(lessonCount).toBe(534);
    expect(bundle.units.length).toBeGreaterThan(0);
  });

  it("exports the full French curriculum with the expected lesson count", () => {
    const bundle = buildIOSContentBundle("fr");
    const lessonCount = bundle.units.reduce((sum, u) => sum + u.lessons.length, 0);
    expect(lessonCount).toBe(125);
  });

  it("preserves question shape exactly (mc and fill variants both present)", () => {
    const bundle = buildIOSContentBundle("en");
    const allQuestions = bundle.units.flatMap((u) => u.lessons.flatMap((l) => l.questions));
    const hasMc = allQuestions.some((q) => q.type === "mc" && Array.isArray(q.choices));
    const hasFill = allQuestions.some((q) => q.type === "fill" && Array.isArray(q.bank));
    expect(hasMc).toBe(true);
    expect(hasFill).toBe(true);
  });

  it("exports conversation scenarios with all required fields", () => {
    const scenarios = buildIOSScenariosBundle();
    expect(scenarios.length).toBeGreaterThan(0);
    for (const s of scenarios) {
      expect(s.id).toBeTruthy();
      expect(s.systemPrompt).toBeTruthy();
      expect(s.opener).toBeTruthy();
    }
  });
});
```

Note: this test file imports `buildIOSScenariosBundle` from the same module you're about to create in Step 3 — that's expected, both functions live in `ios-content-export.ts`.

- [ ] **Step 2: Run the test to verify it fails**

Run: `bun run test src/lib/ios-content-export.test.ts`
Expected: FAIL — `Cannot find module './ios-content-export'` (the file doesn't exist yet)

- [ ] **Step 3: Write the minimal implementation**

```typescript
// src/lib/ios-content-export.ts
import { getCourse, type Course } from "@/data/courses";
import { SCENARIOS } from "@/data/scenarios";
import type { Unit } from "@/data/curriculum";

export type IOSContentBundle = {
  course: Course;
  units: Unit[];
};

/**
 * Extracts one course's full curriculum, unchanged, into the shape the
 * native iOS app's bundled JSON will use. This is intentionally a
 * pass-through, not a transform -- the native Swift Codable models (see
 * the native-app plan) are written to decode exactly this shape, so a
 * lesson/unit/question schema change here must be mirrored there. Real
 * export logic lives here (a pure function) so it's testable without
 * writing to disk; scripts/export-ios-content.ts is a thin CLI wrapper
 * around it.
 */
export function buildIOSContentBundle(course: Course): IOSContentBundle {
  const { curriculum } = getCourse(course);
  return { course, units: curriculum };
}

export type IOSScenario = {
  id: string;
  title: string;
  emoji: string;
  blurb: string;
  level: "Beginner" | "Intermediate" | "Advanced";
  systemPrompt: string;
  opener: string;
};

/** Same pass-through reasoning as buildIOSContentBundle, for SCENARIOS. */
export function buildIOSScenariosBundle(): IOSScenario[] {
  return SCENARIOS;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `bun run test src/lib/ios-content-export.test.ts`
Expected: PASS (4 tests)

If the lesson-count assertions fail, do not change the expected numbers to
match reality without first checking `AGENTS.md`'s Content Structure
table — the counts there (534 English / 125 French, verified 2026-09-13)
are the source of truth used throughout this project's docs. A mismatch
means either that table is stale (re-verify and update it too) or
`buildIOSContentBundle` isn't returning the full curriculum — investigate
before assuming the test is wrong.

- [ ] **Step 5: Write the CLI export script**

```typescript
// scripts/export-ios-content.ts
/**
 * Writes the native iOS app's bundled content JSON to
 * ios/LearnWithAlphonso/Resources/. Re-run this whenever curriculum.ts,
 * curriculum-fr.ts, or scenarios.ts change -- the native app has no other
 * way to pick up content changes short of a new build (see the native
 * app's design doc, docs/superpowers/specs/2026-09-17-native-ios-app-design.md,
 * for why content is bundled rather than fetched at runtime for V1).
 *
 * Usage: node_modules/.bin/tsx scripts/export-ios-content.ts
 */
import fs from "node:fs";
import path from "node:path";
import { buildIOSContentBundle, buildIOSScenariosBundle } from "../src/lib/ios-content-export";

const OUT_DIR = path.resolve(import.meta.dirname, "../ios/LearnWithAlphonso/Resources");

function writeJSON(filename: string, data: unknown) {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const outPath = path.join(OUT_DIR, filename);
  fs.writeFileSync(outPath, JSON.stringify(data, null, 2));
  console.log(`Wrote ${outPath}`);
}

writeJSON("curriculum-en.json", buildIOSContentBundle("en"));
writeJSON("curriculum-fr.json", buildIOSContentBundle("fr"));
writeJSON("scenarios.json", buildIOSScenariosBundle());
```

- [ ] **Step 6: Verify the script runs (it will fail to find the output directory — expected until Task 2 creates the Xcode project)**

Run: `node_modules/.bin/tsx scripts/export-ios-content.ts`
Expected: succeeds and creates `ios/LearnWithAlphonso/Resources/` itself
(the script's `fs.mkdirSync(..., { recursive: true })` creates the directory
if it doesn't exist yet — this is expected to work even before Task 2's
Xcode project exists; Task 2 will add that directory as a **referenced
folder** in the Xcode project rather than needing the JSON files to
already be there first).

Confirm the three JSON files exist and are non-empty:

```sh
ls -la ios/LearnWithAlphonso/Resources/
```

Expected: `curriculum-en.json`, `curriculum-fr.json`, `scenarios.json`, all with real size (curriculum-en.json should be several hundred KB given 534 lessons).

- [ ] **Step 7: Commit**

```bash
git add src/lib/ios-content-export.ts src/lib/ios-content-export.test.ts scripts/export-ios-content.ts ios/LearnWithAlphonso/Resources/
git commit -m "feat(ios-export): add content export pipeline for the native iOS app

Pure, tested function extracts the existing curriculum/scenarios data
unchanged into the JSON shape the native app's Swift Codable models
will decode. CLI script writes it to ios/LearnWithAlphonso/Resources/."
```

---

### Task 2: Manual Xcode project bootstrap (human step, not automatable here)

This step must be done by someone with Xcode installed — hand-authoring a
`.xcodeproj`'s `project.pbxproj` from scratch (not modifying an existing
one) is fragile and not something to attempt without Xcode generating the
initial skeleton.

- [ ] **Step 1: Create the Xcode project**

In Xcode: File → New → Project → iOS → App.
- Product Name: `LearnWithAlphonso`
- Interface: SwiftUI
- Language: Swift
- Save location: `english-buddy-app-33/ios/` (so the final path is
  `english-buddy-app-33/ios/LearnWithAlphonso/LearnWithAlphonso.xcodeproj`)
- **Do not** check "Use Core Data" or "Include Tests" unless you want to
  adjust Task 4's test setup below (this plan assumes a plain XCTest
  target added the default way).

- [ ] **Step 2: Add the Resources folder from Task 1 to the project**

In Xcode's Project Navigator, right-click the `LearnWithAlphonso` group →
"Add Files to LearnWithAlphonso..." → select the `Resources/` folder
created by Task 1 (containing the three JSON files) → ensure "Create folder
references" is selected (blue folder icon, not yellow group) so the JSON
files are copied into the app bundle at build time and can be re-exported
by re-running Task 1's script without re-adding them to Xcode each time.

- [ ] **Step 3: Verify it builds empty**

Build the project (Cmd+B) with no changes yet. Expected: builds
successfully (Xcode's default SwiftUI template is buildable as-is).

- [ ] **Step 4: Commit the project skeleton**

```bash
git add ios/LearnWithAlphonso
git commit -m "chore(ios): scaffold LearnWithAlphonso Xcode project

Default SwiftUI app template, Resources/ folder reference added from
the Task 1 content export."
```

- [ ] **Step 5: Push and hand back**

```bash
git push -u origin docs/native-ios-app-design
```

(Or whatever branch is current — push so the next task's work, done in an
environment without Xcode, can build on a real committed project file
rather than one that only exists locally on this machine.)

---

### Task 3: Swift Codable models matching the exported JSON

**Files:**
- Create: `ios/LearnWithAlphonso/LearnWithAlphonso/Models/CurriculumModels.swift`
- Test: `ios/LearnWithAlphonso/LearnWithAlphonsoTests/CurriculumModelsTests.swift`

**Unverified — no Swift compiler available while writing this. Build and
fix real compiler errors in Xcode before trusting this task done.**

- [ ] **Step 1: Write the failing test**

```swift
// ios/LearnWithAlphonso/LearnWithAlphonsoTests/CurriculumModelsTests.swift
import XCTest
@testable import LearnWithAlphonso

final class CurriculumModelsTests: XCTestCase {
    func testDecodesMultipleChoiceQuestion() throws {
        let json = """
        {
            "id": "q1",
            "type": "mc",
            "prompt": "Which is a formal greeting?",
            "choices": ["Hey!", "What's up?", "Good morning.", "Yo."],
            "answer": 2,
            "explanation": "\\"Good morning\\" is polite and used in professional settings."
        }
        """.data(using: .utf8)!

        let question = try JSONDecoder().decode(Question.self, from: json)

        guard case let .multipleChoice(mc) = question else {
            return XCTFail("Expected .multipleChoice, got \(question)")
        }
        XCTAssertEqual(mc.id, "q1")
        XCTAssertEqual(mc.choices.count, 4)
        XCTAssertEqual(mc.answer, 2)
    }

    func testDecodesFillInBlankQuestion() throws {
        let json = """
        {
            "id": "q2",
            "type": "fill",
            "prompt": "Nice to ___ you.",
            "bank": ["meet", "meat", "met", "meeting"],
            "answer": "meet",
            "explanation": "\\"Nice to meet you\\" is the standard greeting when introduced."
        }
        """.data(using: .utf8)!

        let question = try JSONDecoder().decode(Question.self, from: json)

        guard case let .fillInBlank(fill) = question else {
            return XCTFail("Expected .fillInBlank, got \(question)")
        }
        XCTAssertEqual(fill.bank, ["meet", "meat", "met", "meeting"])
        XCTAssertEqual(fill.answer, "meet")
    }

    func testDecodesFullContentBundleFromBundledResource() throws {
        let url = Bundle(for: Self.self).url(forResource: "curriculum-en", withExtension: "json")
        // The resource lives in the app bundle, not the test bundle, in a
        // default Xcode setup -- if this lookup returns nil, load via
        // Bundle.main instead once running inside the app target, or add
        // Resources/ to the test target's "Copy Bundle Resources" build
        // phase too. Flag this as a real thing to verify once building in
        // Xcode -- don't assume this line works as written.
        XCTAssertNotNil(url, "curriculum-en.json should be reachable from a test target -- verify bundle membership in Xcode if this fails")

        guard let url else { return }
        let data = try Data(contentsOf: url)
        let bundle = try JSONDecoder().decode(ContentBundle.self, from: data)
        let lessonCount = bundle.units.reduce(0) { $0 + $1.lessons.count }
        XCTAssertEqual(lessonCount, 534)
    }
}
```

- [ ] **Step 2: Run the test to verify it fails**

In Xcode: Product → Test (Cmd+U), or select `CurriculumModelsTests` in the
Test Navigator and run it directly.
Expected: FAIL to compile — `Question`, `ContentBundle` don't exist yet.

- [ ] **Step 3: Write the minimal implementation**

```swift
// ios/LearnWithAlphonso/LearnWithAlphonso/Models/CurriculumModels.swift
import Foundation

/// Mirrors the discriminated union in src/data/curriculum.ts's `Question`
/// type exactly -- the "type" field selects which associated payload to
/// decode. Keep this in sync with that file; a schema change on the
/// TypeScript side (see ios-content-export.ts) must be mirrored here.
enum Question: Decodable {
    case multipleChoice(MultipleChoice)
    case fillInBlank(FillInBlank)

    struct MultipleChoice: Decodable {
        let id: String
        let prompt: String
        let choices: [String]
        let answer: Int
        let explanation: String
    }

    struct FillInBlank: Decodable {
        let id: String
        let prompt: String
        let bank: [String]
        let answer: String
        let explanation: String
    }

    private enum CodingKeys: String, CodingKey {
        case type
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        let type = try container.decode(String.self, forKey: .type)
        switch type {
        case "mc":
            self = .multipleChoice(try MultipleChoice(from: decoder))
        case "fill":
            self = .fillInBlank(try FillInBlank(from: decoder))
        default:
            throw DecodingError.dataCorruptedError(
                forKey: .type,
                in: container,
                debugDescription: "Unknown question type: \(type)"
            )
        }
    }
}

struct Lesson: Decodable, Identifiable {
    let id: String
    let title: String
    let subtitle: String
    let questions: [Question]
}

struct Unit: Decodable, Identifiable {
    let id: String
    let level: String
    let eyebrow: String
    let title: String
    let description: String
    let lessons: [Lesson]
}

struct ContentBundle: Decodable {
    let course: String
    let units: [Unit]
}
```

- [ ] **Step 4: Run the test to verify it passes**

Cmd+U again. Expected: all 3 tests pass. If
`testDecodesFullContentBundleFromBundledResource` fails specifically on the
`Bundle(for: Self.self).url(...)` lookup returning nil, follow the comment
in that test -- add `Resources/` to the test target's own "Copy Bundle
Resources" build phase (Project Navigator → test target → Build Phases),
it's a separate target from the app and doesn't automatically share bundled
resources.

- [ ] **Step 5: Commit**

```bash
git add ios/LearnWithAlphonso/LearnWithAlphonso/Models/CurriculumModels.swift ios/LearnWithAlphonso/LearnWithAlphonsoTests/CurriculumModelsTests.swift
git commit -m "feat(ios): add Codable models for curriculum content

Mirrors src/data/curriculum.ts's Question/Lesson/Unit types exactly.
Decodes the real bundled curriculum-en.json (534 lessons) in a test."
```

---

### Task 4: Content loader (Swift, loads bundled JSON at launch)

**Files:**
- Create: `ios/LearnWithAlphonso/LearnWithAlphonso/Services/ContentStore.swift`
- Test: `ios/LearnWithAlphonso/LearnWithAlphonsoTests/ContentStoreTests.swift`

**Unverified — same caveat as Task 3.**

- [ ] **Step 1: Write the failing test**

```swift
// ios/LearnWithAlphonso/LearnWithAlphonsoTests/ContentStoreTests.swift
import XCTest
@testable import LearnWithAlphonso

final class ContentStoreTests: XCTestCase {
    func testLoadsEnglishAndFrenchBundles() throws {
        let store = try ContentStore()
        XCTAssertEqual(store.english.units.reduce(0) { $0 + $1.lessons.count }, 534)
        XCTAssertEqual(store.french.units.reduce(0) { $0 + $1.lessons.count }, 125)
    }

    func testFindsLessonById() throws {
        let store = try ContentStore()
        let found = store.findLesson(id: "u1l1", course: .english)
        XCTAssertNotNil(found, "u1l1 (Saying Hello, from curriculum.ts's foundationUnits) should exist in the exported bundle")
        XCTAssertEqual(found?.lesson.title, "Saying Hello")
    }
}
```

- [ ] **Step 2: Run the test to verify it fails**

Cmd+U. Expected: FAIL to compile — `ContentStore` doesn't exist yet.

- [ ] **Step 3: Write the minimal implementation**

```swift
// ios/LearnWithAlphonso/LearnWithAlphonso/Services/ContentStore.swift
import Foundation

enum Course {
    case english
    case french

    fileprivate var resourceName: String {
        switch self {
        case .english: return "curriculum-en"
        case .french: return "curriculum-fr"
        }
    }
}

enum ContentStoreError: Error {
    case resourceNotFound(String)
}

/// Loads the bundled curriculum JSON (see scripts/export-ios-content.ts in
/// the main repo for how these files are generated) once at launch. No
/// network calls, no async -- this is app-bundle content, not
/// server-fetched, per the native app design doc's V1 scope.
final class ContentStore {
    let english: ContentBundle
    let french: ContentBundle

    init() throws {
        english = try Self.loadBundle(for: .english)
        french = try Self.loadBundle(for: .french)
    }

    func bundle(for course: Course) -> ContentBundle {
        switch course {
        case .english: return english
        case .french: return french
        }
    }

    func findLesson(id: String, course: Course) -> (unit: Unit, lesson: Lesson)? {
        for unit in bundle(for: course).units {
            if let lesson = unit.lessons.first(where: { $0.id == id }) {
                return (unit, lesson)
            }
        }
        return nil
    }

    private static func loadBundle(for course: Course) throws -> ContentBundle {
        guard let url = Bundle.main.url(forResource: course.resourceName, withExtension: "json") else {
            throw ContentStoreError.resourceNotFound(course.resourceName)
        }
        let data = try Data(contentsOf: url)
        return try JSONDecoder().decode(ContentBundle.self, from: data)
    }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Cmd+U. Expected: both tests pass.

- [ ] **Step 5: Commit**

```bash
git add ios/LearnWithAlphonso/LearnWithAlphonso/Services/ContentStore.swift ios/LearnWithAlphonso/LearnWithAlphonsoTests/ContentStoreTests.swift
git commit -m "feat(ios): add ContentStore loading bundled curriculum JSON

Loads both English and French bundles at launch, no network calls --
app-bundle content per the V1 design. findLesson(id:course:) is the
lookup lesson-player/review-queue tasks will build on next."
```

---

## What this plan deliberately does not cover

Per the design doc's V1 scope, these are separate follow-up plans, not
part of this one:

- Lesson browsing UI (`LessonBrowserView`) and the lesson player
  (`LessonPlayerView`) — next plan, builds directly on `ContentStore`
- Supabase auth + the lesson-completion Edge Function (trust boundary)
- Native `SRSEngine` port + review queue UI
- Gamification (XP/streaks)
- AI conversation via AlphonsoCompanion's voice backend
- RevenueCat/StoreKit IAP

## Self-review notes

- **Spec coverage:** this plan covers the design doc's "Content export
  script" and "Codable models matching the exported JSON" architecture
  pieces exactly; it does not cover `LessonContentStore`'s full scope from
  the design doc (which also implies lesson-browsing UI) — deliberately
  split into a follow-up plan, noted above.
- **Type consistency:** `ContentStore.findLesson` returns
  `(unit: Unit, lesson: Lesson)?`, matching the tuple shape a future
  `LessonPlayerView` will need (unit context for level/title display
  alongside the lesson itself) — checked against no other task in this
  plan referencing a different shape.
- **Placeholder scan:** no TBDs; the one intentionally-uncertain step
  (Task 3's bundle-lookup-from-test-target caveat) is flagged with a real,
  actionable fallback instruction, not a bare "handle this."
