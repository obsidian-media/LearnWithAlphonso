import { readFileSync, readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { LESSON_EXPRESSIONS } from "./lesson-stage";

// Visual round 6, part 2, iPhone half: the lesson in the unit's room (LessonStageViews.swift) and the player's rules
// around it (LessonPlayerView.swift). The rules themselves are TDD'd in the Kit (LessonFlowTests.swift); the app
// target only compiles in CI (ios-app-build), so these read the Swift source for the wiring.
const SRC = "ios/LearnWithAlphonso/Sources";
const read = (p: string) => readFileSync(p, "utf8").replace(/\r\n/g, "\n");
const player = read(`${SRC}/LessonPlayerView.swift`);
const stage = read(`${SRC}/LessonStageViews.swift`);
const from = (s: string, marker: string) => {
  const at = s.indexOf(marker);
  expect(at, `missing: ${marker}`).toBeGreaterThan(-1);
  return s.slice(at);
};
const between = (s: string, a: string, b: string) => {
  const tail = from(s, a);
  const end = tail.indexOf(b, a.length);
  expect(end, `missing: ${b}`).toBeGreaterThan(-1);
  return tail.slice(0, end);
};

describe("XP the learner is shown is XP the server pays", () => {
  it("the verdict's chip comes from the Kit's replay-aware rule, only for a right answer outside a reinforcement", () => {
    const chip = between(player, "private var answerXP: Int?", "\n    }\n");
    expect(chip).toContain("guard checked, lastAnswerCorrect, !isReinforcing else { return nil }");
    expect(chip).toContain(
      "LessonXP.answerChip(rightSoFar: correctCount, previousBest: previousBest)",
    );
    expect(between(player, "private var quizControls", "private func advance()")).toContain(
      "xp: answerXP,",
    );
    // No fixed "+10 XP" drawn anywhere in the lesson: the sheet prints only the amount it is handed.
    expect(player).not.toMatch(/Text\("\+10/);
    expect(stage).not.toMatch(/Text\("\+10/);
    expect(stage).toContain('Text("+\\(xp) XP")');
  });

  it("the earlier best is read when the lesson opens; a failed read promises nothing (unknown)", () => {
    const open = between(player, "private func openLessonSession() async", "private func block(");
    expect(open).toContain("client.fetchLessonBest(lessonID: lesson.id, course: course.wireCode)");
    expect(open).toContain("previousBest = best.map(LessonPreviousBest.best) ?? .firstTry");
    expect(open).toMatch(/\} catch \{\s*previousBest = \.unknown/);
    // A new lesson in the same player starts from unknown again.
    expect(
      between(player, "private func continueToNextLesson()", "private func practiceWithHector"),
    ).toContain("previousBest = .unknown");
  });

  it("the complete screen's XP lines use the server's own count and add up to the award", () => {
    const finish = between(player, "private func completeScreen(", "\n    }\n");
    expect(finish).toContain(
      "LessonXP.breakdown(correct: result.correct ?? correctCount, total: total, awarded: result.xpGain)",
    );
    expect(from(stage, "if xpLines.count > 1 {").slice(0, 300)).toContain("Text(line.text)");
  });

  it("a completion queued for later sync promises no more than the replay pays (the Kit's queuedEstimate)", () => {
    const queue = between(player, "private func queueOffline(", "\n    }\n");
    expect(queue).toContain(
      "optimisticXpEstimate: LessonXP.queuedEstimate(correct: correctCount, total: total, previousBest: previousBest)",
    );
    expect(queue).not.toContain("computeXpGain(");
  });

  it("lesson start says the honest estimate from the shared timing rules and the formula's maximum", () => {
    const meta = between(player, "private var startMeta: String", "\n    }\n");
    expect(meta).toContain(
      "LessonData.timing?.estimateMinutes(questionTypes: lesson.questions.map(\\.typeKey), newWords: vocab.count)",
    );
    expect(meta).toContain("Up to \\(LessonXP.maxXp(total: total)) XP");
    expect(read("ios/LearnWithAlphonsoKit/Package.swift")).toContain(
      '.copy("Resources/lesson-timing.json")',
    );
  });
});

describe("Finish runs once", () => {
  it("only the gate's first opening starts the completion, and nothing else calls finish()", () => {
    const advance = between(player, "private func advance()", "\n    }\n");
    expect(advance).toMatch(/\} else if finishGate\.begin\(\) \{\s*Task \{ await finish\(\) \}/);
    expect(player.match(/await finish\(\)/g)?.length).toBe(1);
    expect(
      between(player, "private func continueToNextLesson()", "private func practiceWithHector"),
    ).toContain("finishGate.reset()");
  });
});

describe("The lesson timer", () => {
  it("starts at Start lesson, pauses while the app is in the background, and stops at Finish", () => {
    expect(between(player, "private func startLesson()", "\n    }\n")).toContain(
      "lessonTimer = ActiveTimer(now: Date().timeIntervalSince1970)",
    );
    const phase = from(player, ".onChange(of: scenePhase)").slice(0, 300);
    expect(phase).toContain(
      "if newPhase == .active { lessonTimer?.resume(now: now) } else { lessonTimer?.pause(now: now) }",
    );
    const finish = between(player, "private func finish() async", "isSubmitting = true");
    expect(finish).toContain("finishedElapsed = lessonTimer?.elapsed(now: now)");
    expect(between(player, "private func completeScreen(", "\n    }\n")).toContain(
      "time: finishedElapsed.map(formatElapsed)",
    );
  });
});

describe("The stage", () => {
  it("is the unit's own room from the room map, with Alphonso's five expressions bundled byte for byte", () => {
    expect(player).toContain("LessonStage.roomID(forUnit: unit?.id, map: LessonData.roomMap)");
    expect(read("ios/LearnWithAlphonso/project.yml")).toMatch(
      /- path: AlphonsoLesson\n\s+type: folder\n\s+buildPhase: resources/,
    );
    expect(readdirSync("ios/LearnWithAlphonso/AlphonsoLesson").sort()).toEqual(
      LESSON_EXPRESSIONS.map((e) => `${e}.webp`).sort(),
    );
    for (const e of LESSON_EXPRESSIONS)
      expect(
        readFileSync(`ios/LearnWithAlphonso/AlphonsoLesson/${e}.webp`).equals(
          readFileSync(`public/alphonso/lesson/${e}.webp`),
        ),
        e,
      ).toBe(true);
  });

  it("Alphonso reacts: asks, listens once you pick, smiles or hmms with the verdict", () => {
    expect(player).toContain(
      "LessonStage.expression(picked: hasStartedAnswer, verdict: checked ? lastAnswerCorrect : nil)",
    );
    // The swap is a crossfade, none under Reduce Motion.
    const room = between(stage, "struct LessonRoomView", "// MARK: - Speech bubble");
    expect(room).toContain(".transition(.opacity)");
    expect(room).toContain(
      ".animation(reduceMotion ? nil : .easeInOut(duration: AlphonsoDS.Motion.swap), value: expression)",
    );
  });

  it("the room's size follows the Kit's layout, and the question type shrinks on a small phone", () => {
    const quiz = between(player, "private func quizBody(", "private var quizControls");
    expect(quiz).toContain(
      "LessonStage.layout(viewportHeight: Double(UIScreen.main.bounds.height), prompt: question.prompt)",
    );
    expect(quiz).toContain("compact: layout.size == .small");
    expect(stage).toContain(".dsText(compact ? .questionSmall : .question)");
    expect(stage).toContain(".dsText(.answer)");
  });

  it("lessons stay light in night mode, with the chosen palette (so Meadow works)", () => {
    expect(from(player, "var body: some View {").slice(0, 200)).toContain(".lessonLightScope()");
    const scope = between(stage, "private struct LessonLightScope", "\n}\n");
    expect(scope).toContain(
      "AlphonsoDS.colors(AlphonsoThemeManager.shared.paletteID, night: false)",
    );
    expect(scope).toContain(".environment(\\.colorScheme, .light)");
  });

  it("the HUD shows ∞ hearts for Pro and says the question number to VoiceOver", () => {
    expect(between(player, "private var hudHearts: Int?", "\n    }\n")).toContain(
      "if hectorAccess?.entitlementStore.isPro ?? false { return nil }",
    );
    expect(stage).toContain(
      '.accessibilityLabel(hearts.map { "\\($0) hearts" } ?? "Unlimited hearts")',
    );
    expect(player).toContain('valueText: "Question \\(idx + 1) of \\(total)"');
  });
});

describe("Lesson complete, in the unit's room, in code", () => {
  const complete = between(
    stage,
    "struct LessonCompleteView",
    "// MARK: - Speak and translate parts",
  );

  it("no clip: confetti and count-ups are drawn in code, and the painted clip is retired", () => {
    expect(player).not.toContain("ClipBackdrop(");
    expect(read(`${SRC}/DesignSystem/SceneClip.swift`)).not.toMatch(/case [^\n]*\bcomplete\b/);
    expect(complete).toContain("LessonConfettiView(reduce: reduceMotion)");
    expect(stage).toContain("Confetti.pieces(seed: seed, width: geo.size.width)");
  });

  it("Reduce Motion: a still scatter, final numbers, and Alphonso already smiling", () => {
    const confetti = between(stage, "struct LessonConfettiView", "/// One reward tile");
    expect(confetti).toContain("paused: reduce || settled");
    expect(confetti).toContain("if reduce || settled || t >= Confetti.seconds {");
    const tile = between(stage, "struct LessonRewardTile", "/// A new achievement");
    expect(tile).toContain("CountingText(number: Double(reduce || counted ? split.number : 0)");
    expect(complete).toContain("expression: amazed && !reduceMotion ? .wow : .happy");
  });

  it("every existing mechanic is kept: haptic, Hector, the reminder card, generated practice, league up, the way on", () => {
    const finish = between(player, "private func completeScreen(", "\n    }\n");
    for (const kept of [
      ".sensoryFeedback(.success, trigger: celebrated)",
      'Button("Practice with Hector", action: practiceWithHector)',
      "LessonReminderCard(",
      "GeneratedPracticeSection(lessonID: lesson.id, course: course, session: session)",
      "LeaguePromotionOverlay(",
      '"Continue to next lesson"',
      '"Back to Learn"',
      "heartsBonus: result.heartsBonus",
      "achievements: achievements",
      "missed: missed",
    ])
      expect(finish, kept).toContain(kept);
    // The way on is pinned at the foot.
    expect(from(complete, ".safeAreaInset(edge: .bottom)").slice(0, 200)).toContain(
      "Button(continueTitle, action: onContinue)",
    );
  });
});
