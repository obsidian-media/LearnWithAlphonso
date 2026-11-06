import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// Question screens, iPhone half: the verdict panel, the chunky answer tiles and word chips, the progress bar.
// The app target only compiles in CI (ios-app-build), so these read the Swift source.
const SRC = "ios/LearnWithAlphonso/Sources";
const read = (p: string) => readFileSync(`${SRC}/${p}`, "utf8").replace(/\r\n/g, "\n");
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

const lesson = read("LessonPlayerView.swift");
const review = read("ReviewQueueView.swift");
const panel = read("DesignSystem/AnswerVerdictPanel.swift");
const components = read("DesignSystem/AlphonsoComponents.swift");

describe("the verdict panel after Check", () => {
  it("the lesson shows it with the settled verdict, which prefers a translation's grade", () => {
    const quiz = between(
      lesson,
      "private var quizControls: some View",
      "private func settleTranslationVerdict",
    );
    // Round 6: the verdict sheet (LessonStageViews.swift) replaced the panel in the lesson.
    expect(quiz).toContain("LessonVerdictSheet(");
    // The sheet is handed the settled verdict, as its `correct:` argument, not merely mentioned near it.
    expect(quiz).toMatch(/LessonVerdictSheet\(\s*correct: lastAnswerCorrect,/);
    expect(quiz).toContain("AnswerVerdict.correctAnswer(for: currentQuestion)");
    // The sheet carries the button: Continue after a right answer, Got it after a miss, Finish on the last.
    expect(quiz).toContain('? (lastAnswerCorrect ? "Continue" : "Got it") : "Finish"');
    expect(quiz).not.toMatch(
      /\}\s*\n\s*\.buttonStyle\(\.alphonsoPrimary\)\s*\n\s*\}\s*\n\s*\}\s*\n\s*\.padding\(\)/,
    );
    const verdict = between(lesson, "private var lastAnswerCorrect: Bool", "\n    }\n");
    // Order is the property: a translation's own grade is returned first, and only then the picked-answer check.
    // Swapping them (or dropping the early return) makes a graded translation fall through to isAnswerCorrect.
    expect(verdict).toMatch(
      /if case \.translate = currentQuestion, let translationVerdict \{\s*return translationVerdict\.correct\s*\}\s*return isAnswerCorrect\(currentQuestion/,
    );
  });

  it("review shows it too, keeping its own wording", () => {
    const body = between(review, "private var reviewBody: some View", "private func loadQueue()");
    expect(body).toContain("AnswerVerdictPanel(");
    expect(body).toContain('"Still got it."');
    expect(body).toContain('"Back in the queue."');
  });

  it("Alphonso reacts in the panel (happy, or a thumbs-up), decorative, and the slide gives way under Reduce Motion", () => {
    expect(panel).toContain('"Alphonso-happy"');
    expect(panel).toContain('"Alphonso-encouraging"');
    expect(panel).toContain(".accessibilityHidden(true)");
    expect(panel).toContain("accessibilityReduceMotion");
    expect(panel).toContain("reduceMotion ? .opacity");
    expect(panel).toContain("AnswerVerdict.title(correct: correct)");
  });

  it("Alphonso is no longer shown twice: the tip card drops its portrait", () => {
    const tip = between(components, "struct AlphonsoTipCard: View", "struct ExplanationView: View");
    expect(tip).not.toContain('Image("Alphonso")');
  });
});

describe("chunky answer tiles and word chips", () => {
  it("lesson and review each draw their answers through one shared tile, never a private copy", () => {
    expect(lesson).not.toContain("private func choiceButton");
    expect(review).not.toContain("private func choiceButton");
    // Round 6: the lesson's numbered answer (LessonStageViews.swift); review keeps AnswerChoiceButton.
    expect(lesson).toContain("LessonAnswerButton(");
    expect(review).toContain("AnswerChoiceButton(");
    // The accessibility wording moved with it.
    expect(panel).toContain('"\\(choice), your answer, correct"');
    expect(panel).toContain('"\\(choice), correct answer"');
  });

  it("the tile has a bottom edge that collapses when pressed, and stays still under Reduce Motion", () => {
    const style = between(
      panel,
      "struct ChunkyTileStyle: ButtonStyle",
      "struct AlphonsoWordChipStyle",
    );
    expect(style).toContain("configuration.isPressed && !still");
    expect(style).toContain(".offset(y: pressed ? 0 : 4)");
    expect(between(panel, "struct AnswerChoiceButton: View", "struct ChunkyTileStyle")).toContain(
      "minHeight: 56",
    );
  });

  it("the picked wrong tile uses the theme's wrong-answer colour (as the verdict panel does), with a distinct cross badge", () => {
    const tile = between(panel, "struct AnswerChoiceButton: View", "struct ChunkyTileStyle");
    const fill = between(tile, "private var fill: Color {", "private var edge: Color {");
    const edge = between(tile, "private var edge: Color {", "var body: some View {");
    // Fill and edge follow AlphonsoColor.wrongAnswer in the picked-and-wrong branch, never the correct branch.
    expect(fill).toContain(
      "if checked && isPicked { return AlphonsoColor.wrongAnswer.opacity(0.18) }",
    );
    expect(edge).toContain("if checked && isPicked { return AlphonsoColor.wrongAnswer }");
    expect(fill).not.toMatch(/isCorrectChoice \{ return AlphonsoColor\.wrongAnswer/);
    expect(edge).not.toMatch(/isCorrectChoice \{ return AlphonsoColor\.wrongAnswer/);
    expect(tile).not.toContain("AlphonsoColor.destructive");
    // Badges: white glyph on a solid disc (3:1 on the tile tint; a tinted glyph on the 18% tint fell to 2.8:1).
    expect(tile).toMatch(
      /"xmark\.circle\.fill"\)\.symbolRenderingMode\(\.palette\)\s*\.foregroundStyle\(\.white, AlphonsoColor\.wrongAnswer\)/,
    );
    expect(tile).toMatch(
      /"checkmark\.circle\.fill"\)\.symbolRenderingMode\(\.palette\)\s*\.foregroundStyle\(\.white, AlphonsoColor\.moss\)/,
    );
    // Distinct by shape in every theme, and the colour split still keeps a non-moss wrong colour.
    const theme = read("DesignSystem/AlphonsoTheme.swift");
    expect(theme).toContain("case .studioInk, .manuscript: return false");
    expect(theme).toContain("wrongAnswerUsesEmber ? ember : destructive");
  });

  it("word banks and reorder pools use the chunky chip, highlighted when picked", () => {
    // Round 6: the lesson's word tiles, highlighted when picked and solid when placed.
    expect(lesson).toContain("LessonWordTile(word: word, picked: picked == word)");
    expect(lesson).toContain("LessonWordTile(word: tokens[tokenIdx], placed: true)");
    for (const file of [review]) {
      expect(file).toContain(".buttonStyle(.alphonsoWordChip(picked: picked == word))");
      expect(file).toContain(".buttonStyle(.alphonsoWordChip(picked: false))");
    }
  });

  it("the progress bar is thicker, with a moss gradient", () => {
    const bar = between(components, "struct AlphonsoProgressBar: View", "// MARK: - Empty states");
    expect(bar).toContain(".frame(height: 12)");
    expect(bar).toContain("LinearGradient(");
  });
});

describe("words to learn, one card at a time", () => {
  const vocab = between(lesson, "private struct VocabScreen: View", "struct VocabImageView: View");

  it("pages through the words, with the Kit's button wording", () => {
    expect(vocab).toContain(".tabViewStyle(.page(indexDisplayMode: .never))");
    expect(vocab).toContain("VocabDeck.buttonTitle(index: page, count: items.count)");
    expect(vocab).toContain('"Word \\(page + 1) of \\(items.count)"');
    expect(vocab).toContain('"Skip to practice"');
  });

  it("the largest text sizes keep the scrolling list", () => {
    expect(vocab).toContain("dynamicTypeSize.isAccessibilitySize");
    expect(vocab).toContain("wordList");
  });

  it("Alphonso peeks over the card, decorative", () => {
    expect(vocab).toContain("LessonArt.expression(.talk)");
    expect(from(vocab, "LessonArt.expression(.talk)").slice(0, 600)).toContain(
      ".accessibilityHidden(true)",
    );
  });
});

// Final review fixes (round 4): the taller question layout must stay reachable on a small phone, the deck card
// must not clip its words, VoiceOver hears one verdict, and word chips respect Reduce Motion.
describe("final review fixes", () => {
  it("the lesson question scrolls, and Check / the verdict sheet are pinned at the foot", () => {
    const quizBody = between(
      lesson,
      "private func quizBody(",
      "private var quizControls: some View",
    );
    expect(quizBody).toMatch(/ScrollView \{\s*VStack\(spacing: 0\) \{\s*LessonRoomView\(/);
    expect(quizBody).toContain(".safeAreaInset(edge: .bottom, spacing: 0) { quizControls }");
    // The sheet and Check live in the pinned controls, not in the scrolling content.
    const controls = between(
      lesson,
      "private var quizControls: some View",
      "private func advance()",
    );
    expect(controls).toContain("LessonVerdictSheet(");
    expect(controls).toContain('Button("Check")');
    expect(between(quizBody, "ScrollView {", ".safeAreaInset")).not.toContain(
      "LessonVerdictSheet(",
    );
  });

  it("review scrolls the same way, its controls pinned", () => {
    const body = between(review, "private var reviewBody: some View", "private func loadQueue()");
    expect(body).toMatch(/ScrollView \{[\s\S]*ReviewQuestionCard\(/);
    expect(body).toContain(".safeAreaInset(edge: .bottom)");
    expect(from(body, ".safeAreaInset(edge: .bottom)")).toContain("AnswerVerdictPanel(");
  });

  it("a word card scrolls its own words, and its picture shrinks on a short screen", () => {
    const card = between(
      lesson,
      "private func cardWords(_ item: VocabItem, index: Int) -> some View",
      "private var listContent",
    );
    expect(card).toContain("ScrollView {");
    expect(card).toContain("VocabImageView(image: image, cardHeight: Self.cardImageHeight)");
    expect(lesson).toMatch(
      /static var cardImageHeight: CGFloat \{[^}]*min\(180,[^}]*UIScreen\.main\.bounds\.height/,
    );
  });

  it("VoiceOver hears one verdict: the panel says it, the explanation stays quiet under it", () => {
    expect(panel).toContain('"Incorrect. \\($0)"');
    expect(panel).toContain('"Correct"');
    const explanation = between(
      components,
      "struct ExplanationView: View",
      "struct SaveWordHintLine: View",
    );
    expect(explanation).toContain("verdictAnnouncedByPanel");
    expect(explanation).toMatch(/guard !verdictAnnouncedByPanel, !inSheet else \{ return \}/);
    // The lesson's sheet announces the verdict (and the XP) once, itself.
    const sheet = between(
      read("LessonStageViews.swift"),
      "struct LessonVerdictSheet",
      "// MARK: - Lesson start",
    );
    expect(sheet).toMatch(
      /\.onAppear \{[\s\S]{0,300}AccessibilityNotification\.Announcement\(spoken\)\.post\(\)/,
    );
    expect(lesson).toContain("inSheet: true)");
    for (const file of [lesson, review])
      expect(file).toContain(".environment(\\.verdictAnnouncedByPanel, true)");
  });

  it("word chips stop moving under Reduce Motion: the chip style reads it and hands it to the tile", () => {
    const chip = between(
      panel,
      "struct AlphonsoWordChipStyle: ButtonStyle",
      "extension ButtonStyle",
    );
    expect(chip).toContain("@Environment(\\.accessibilityReduceMotion) private var reduceMotion");
    expect(chip).toContain("reduceMotionOverride: reduceMotion");
    expect(
      between(panel, "struct ChunkyTileStyle: ButtonStyle", "struct AlphonsoWordChipStyle"),
    ).toContain("reduceMotionOverride ?? reduceMotion");
  });
});
