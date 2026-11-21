import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Learn's climbing map on iOS (Path B, PARITY-SPEC-6). The SwiftUI cannot run here (the app target only compiles in
 * CI), so the wiring that matters is read from the source: the map is built from the shared model, level-scoped; the
 * CTA rule; the locked-node hints and their 6 s clear; the bob lives on the face, off under Reduce Motion; VoiceOver's
 * labels; design-system icons only, no emoji. Mirrors what src/components/LearnMap.test.tsx pins for the web.
 */
const root = path.resolve(import.meta.dirname, "../..");
const SRC = "ios/LearnWithAlphonso/Sources";
const read = (p: string) => fs.readFileSync(path.join(root, SRC, p), "utf8");

/** Code only: comments may describe other behaviour. */
const code = (text: string) =>
  text
    .split("\n")
    .filter((l) => !l.trim().startsWith("//"))
    .join("\n");

/** The text between the first `a` and the next `b` after it ("" when either is missing). */
function between(text: string, a: string, b: string): string {
  const i = text.indexOf(a);
  if (i < 0) return "";
  const j = text.indexOf(b, i + a.length);
  return j < 0 ? "" : text.slice(i, j);
}

/** Every way the map's source can drift from what the web pins. Empty when it is right. */
function mapProblems(browserText: string, mapText: string): string[] {
  const out: string[] = [];
  const browser = code(browserText);
  const map = code(mapText);
  const need = (ok: boolean, what: string) => {
    if (!ok) out.push(what);
  };

  // Built from the shared model, from this band's units (curriculum order) and the completed set.
  need(
    browser.includes("LearnMap.climb(units: units, completed: completedLessonIDs, timing: timing)"),
    "climb is built by LearnMap.climb from the level's units and completedLessonIDs",
  );
  need(
    /let units: \[LearnMap\.Unit\] = unitsForSelectedLevel\.map/.test(browser),
    "units come from unitsForSelectedLevel",
  );
  need(
    /continueLessonID: courseContinueLessonID/.test(browser) &&
      /private var courseContinueLessonID: String\? \{\s*for unit in contentStore\.bundle\(for: course\)\.units/.test(
        browser,
      ),
    "the Continue lesson is the course-wide first lesson not done",
  );
  need(!browser.includes("LearnHeroStage("), "the hero is not mounted beside the map");
  need(
    /onOpenLesson: \{ openedLesson = OpenedLesson\(id: \$0\) \}/.test(browser),
    "lessons open through openedLesson",
  );

  // The CTA rule.
  need(
    map.includes('next.lessonID == continueLessonID ? "Continue lesson" : "Start lesson"'),
    "Continue lesson only when the next lesson is the course-wide one, else Start lesson",
  );
  need(map.includes('Text("Not now")'), "the sheet has Not now");

  // The hints and their clear.
  need(
    map.includes('showHint("Finish \\(upNext.title) first, then this one opens.")'),
    "a locked node says to finish the next lesson first",
  );
  need(
    map.includes('showHint("Finish this unit to open the chest.")'),
    "the locked summit chest says to finish the unit",
  );
  need(
    map.includes("AccessibilityNotification.Announcement(message).post()"),
    "the hint is announced",
  );
  need(/private static let hintSeconds: UInt64 = 6$/m.test(map), "the hint lasts 6 s");
  need(
    /\.task\(id: hint\) \{[\s\S]*Task\.sleep\(nanoseconds: Self\.hintSeconds[\s\S]*hint = nil/.test(
      map,
    ),
    "the hint clears after hintSeconds",
  );
  need(
    /\.onChange\(of: climb\.next\?\.lessonID\) \{ _, _ in hint = nil \}/.test(map),
    "the hint clears at once when the next lesson changes",
  );

  // The bob: on the face only, off with Reduce Motion.
  const face = between(map, "private struct ClimbNextFace", "private struct ClimbStartSheet");
  need(
    face.includes("@Environment(\\.accessibilityReduceMotion) private var reduceMotion"),
    "the face reads Reduce Motion",
  );
  need(
    face.includes(".offset(y: (bobbing && !reduceMotion) ? -6 : 0)") &&
      face.includes(
        "reduceMotion ? nil : .easeInOut(duration: 1.8).repeatForever(autoreverses: true)",
      ),
    "the bob is a 6 pt, 1.8 s ease-in-out repeat, and off under Reduce Motion",
  );
  const nextButton = between(
    map.slice(map.lastIndexOf("case .next:")),
    "case .next:",
    "case .done:",
  );
  need(
    nextButton.includes("ClimbNextFace(title: node.title)") &&
      !/offset|repeatForever|bobbing/.test(nextButton),
    "the next node's button holds the face and no bob of its own",
  );
  need(!/repeatForever/.test(map.replace(face, "")), "no repeating animation outside the face");

  // VoiceOver.
  need(
    map.includes(
      '"Lesson \\(index + 1) of \\(total), \\(node.title), \\(stateWord(node.state))"',
    ) &&
      map.includes('return "done"') &&
      map.includes('return "next"') &&
      map.includes('return "locked"'),
    'lesson labels read "Lesson i of N, title, done|next|locked"',
  );
  need(
    map.includes('"Unit \\(climb.strip.number) reward, earned"') &&
      map.includes('"Unit \\(climb.strip.number) reward, locked until you finish the unit"') &&
      map.includes('"Unit \\(climb.strip.number - 1) reward, earned"'),
    "chest labels (summit earned, summit locked, trailhead earned)",
  );
  need(
    map.includes(".accessibilityElement(children: .contain)") &&
      map.includes(".accessibilitySortPriority(Double(total + 3))") &&
      map.includes(".accessibilitySortPriority(Double(total + 2 - index))") &&
      map.includes(".accessibilitySortPriority(2)"),
    "the climb reads foot to summit by sort priority",
  );

  // Design system only: DS icons, no emoji, no raw values.
  for (const icon of [".check", ".play", ".lock", ".chest", ".clock", ".bolt", ".words"])
    need(map.includes(`icon: ${icon}`), `DSIconView icon ${icon}`);
  need(!/\p{Extended_Pictographic}/u.test(map), "no emoji (the DS icons are the only glyphs)");
  need(
    !/Color\(\s*(?:hex|red|white|hue)\s*:|\.system\(\s*size:/.test(map),
    "no raw colour or font size",
  );
  return out;
}

describe("iOS Learn climbing map", () => {
  const browser = read("LessonBrowserView.swift");
  const map = read("LearnClimbMap.swift");

  it("pins the map's wiring, a11y, CTA rule, hints and motion gate", () => {
    expect(mapProblems(browser, map)).toEqual([]);
  });

  it("the start sheet is the web's: detents, chips, scrolls", () => {
    const sheet = between(map, "private struct ClimbStartSheet", "private func chip(");
    for (const needle of [
      ".presentationDetents([.medium, .large])",
      ".presentationDragIndicator(.visible)",
      ".presentationBackground(ds.surface)",
      "ScrollView {",
      "LessonFlowLayout(",
      'chip(icon: .clock, value: "\\(sheet.minutes) min", label: "Time")',
      'chip(icon: .bolt, value: "+\\(sheet.xp)", label: "XP")',
      'chip(icon: .words, value: "\\(sheet.words)", label: "Words")',
      "if !sheet.coverage.isEmpty",
    ])
      expect(sheet, needle).toContain(needle);
  });

  it("the strip and the foot: unit line, thin gold bar, earned chest at the foot of the next climb", () => {
    expect(map).toContain(
      '"Unit \\(climb.strip.number) of \\(climb.strip.count) \\u{00B7} \\(climb.strip.name)"',
    );
    expect(map).toContain("LinearGradient(colors: [ds.onHeroKick, ds.action]");
    expect(map).toContain("if case .earnedChest = climb.trailhead");
    expect(map).toContain("trailheadX: CGFloat = 0.15");
    expect(map).toContain("max(360, slots * 88 + Self.topRoom + Self.footRoom)");
  });

  // A guard that cannot fail is the repo's most common defect: prove the checks go red on broken copies.
  it("goes red when the source is broken in the ways it claims to catch", () => {
    expect(mapProblems(browser, map)).toEqual([]);
    const breakIt = (text: string, from: string, to: string) => {
      expect(text, `fixture has ${from}`).toContain(from);
      return text.replace(from, to);
    };
    // The bob on the button, and not gated by Reduce Motion.
    const ungated = breakIt(map, "(bobbing && !reduceMotion)", "bobbing");
    expect(mapProblems(browser, ungated).join("|")).toContain("Reduce Motion");
    const bobOnButton = breakIt(
      map,
      "ClimbNextFace(title: node.title)",
      "ClimbNextFace(title: node.title).offset(y: -6)",
    );
    expect(mapProblems(browser, bobOnButton).join("|")).toContain("no bob of its own");
    // The CTA always says Continue.
    const alwaysContinue = breakIt(
      map,
      'next.lessonID == continueLessonID ? "Continue lesson" : "Start lesson"',
      '"Continue lesson"',
    );
    expect(mapProblems(browser, alwaysContinue).join("|")).toContain("Continue lesson only when");
    // The hero comes back beside the map.
    const withHero = breakIt(browser, "LearnClimbMap(", "LearnHeroStage(\n LearnClimbMap(");
    expect(mapProblems(withHero, map).join("|")).toContain("hero is not mounted");
    // An emoji in the map.
    const emoji = map + '\nText("\u{1F3C6}")\n';
    expect(mapProblems(browser, emoji).join("|")).toContain("no emoji");
    // The hint never clears.
    const sticky = breakIt(
      map,
      "private static let hintSeconds: UInt64 = 6",
      "private static let hintSeconds: UInt64 = 60",
    );
    expect(mapProblems(browser, sticky).join("|")).toContain("6 s");
  });
});
