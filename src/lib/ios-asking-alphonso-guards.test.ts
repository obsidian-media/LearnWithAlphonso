import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { ASK_LONG_PROMPT_CHARS, ASK_SMALL_SIZE } from "./asking-alphonso";

// Alphonso asking the question, iPhone half. The app target only compiles in CI (ios-app-build), so these read
// the Swift source; each assertion names the property it protects.
const SRC = "ios/LearnWithAlphonso/Sources";
const read = (p: string) => readFileSync(`${SRC}/${p}`, "utf8").replace(/\r\n/g, "\n");
const count = (s: string, needle: string) => s.split(needle).length - 1;

/** Source with all whitespace collapsed, so a guard pins the tokens and not the formatting. */
const squash = (t: string) => t.replace(/\s+/g, " ").trim();
/** The text of the first `{ ... }` block after `marker`, braces balanced, whitespace collapsed. */
function block(src: string, marker: string): string {
  const start = src.indexOf("{", src.indexOf(marker));
  expect(start, marker).toBeGreaterThan(-1);
  let depth = 0;
  for (let i = start; i < src.length; i++) {
    if (src[i] === "{") depth++;
    if (src[i] === "}" && --depth === 0) return squash(src.slice(start, i + 1));
  }
  throw new Error(`unbalanced block after ${marker}`);
}

const view = read("DesignSystem/AskingAlphonso.swift");
const kit = readFileSync(
  "ios/LearnWithAlphonsoKit/Sources/LearnWithAlphonsoKit/AskingAlphonsoLayout.swift",
  "utf8",
).replace(/\r\n/g, "\n");
const lesson = read("LessonPlayerView.swift");
const review = read("ReviewQueueView.swift");
const translate = read("TranslateQuestionCard.swift");
const speak = read("SpeakQuestionCard.swift");

describe("AskingAlphonso (the prompt as Alphonso's speech bubble)", () => {
  it("shows the asking pose beside the prompt, decorative because the prompt already says it", () => {
    expect(view).toContain("struct AskingAlphonso: View");
    expect(view).toContain("MascotTile(moment: .questionAsk");
    expect(view).toMatch(/MascotTile\([^)]*\)[\s\S]{0,80}\.accessibilityHidden\(true\)/);
  });

  it("hands the size to the Kit's pure function with the real screen height, text size, prompt length and media flag", () => {
    // The exact call: any change to an argument or the height source changes this text.
    expect(block(view, "private var mascotSize")).toBe(
      squash(`{
        AskingAlphonsoLayout.portraitSize(
            screenHeight: UIScreen.main.bounds.height,
            accessibilitySize: dynamicTypeSize.isAccessibilitySize,
            promptLength: prompt.count,
            hasMedia: hasMedia
        ).map { CGFloat($0) }
      }`),
    );
    // One flag gates the portrait; the prompt text is outside that branch so it is never hidden.
    const gate = view.slice(view.indexOf("var body: some View"));
    expect(gate).toMatch(
      /if let mascotSize \{[\s\S]*?MascotTile[\s\S]*?\}\s*\n\s*(speechBubble|bubble)/,
    );
  });

  it("the Kit's size rule is exactly: accessibility drops him, two crowding reasons or a short phone drop him, a tall uncrowded phone gets the figure, otherwise the avatar", () => {
    expect(block(kit, "public static func portraitSize")).toBe(
      squash(`{
        if accessibilitySize { return nil }
        let crowd = (promptLength > longPromptCharacters ? 1 : 0) + (hasMedia ? 1 : 0)
        if crowd >= 2 || screenHeight <= noneAtOrBelowHeight { return nil }
        if screenHeight > largeAboveHeight && crowd == 0 { return largeSize }
        return smallSize
      }`),
    );
  });

  it("the Kit's thresholds: 667 pt and under drops him, over 800 pt (an 812 pt mini too) is the large figure", () => {
    expect(kit).toContain("public static let largeAboveHeight: Double = 800");
    expect(kit).toContain("public static let noneAtOrBelowHeight: Double = 667");
    expect(kit).toContain("public static let largeSize = 128");
    expect(kit).toContain(`public static let smallSize = ${ASK_SMALL_SIZE}`);
    expect(kit).toContain(`public static let longPromptCharacters = ${ASK_LONG_PROMPT_CHARS}`);
    // The doc comment says what the code does.
    expect(squash(view.replace(/\/\/\/ ?/g, ""))).toContain(
      "above 800 pt (an iPhone mini's 812 pt",
    );
    expect(view).not.toContain("844 pt and up");
  });

  it("wraps a long prompt instead of truncating it", () => {
    expect(view).toContain(".fixedSize(horizontal: false, vertical: true)");
    expect(view).not.toMatch(/lineLimit\(/);
  });

  it("adds no animation of its own, so Reduce Motion has nothing extra to switch off", () => {
    // The portrait's breathing already stops under Reduce Motion (MascotBreathe).
    expect(view).not.toMatch(/withAnimation|\.animation\(|repeatForever|\.transition\(/);
  });
});

// A multiple choice with an image or audio, a listening card and a speak card carry something above the answers.
const MC_CALL =
  "AskingAlphonso(prompt: q.prompt, hasMedia: q.imageKey.flatMap { vocabImages[$0] } != nil || q.audioText != nil)";
const LISTENING_CALL = "AskingAlphonso(prompt: q.prompt, hasMedia: true)";

describe("every question type asks through Alphonso", () => {
  it("the lesson asks every question type through Alphonso's bubble in the unit's room (round 6)", () => {
    // One bubble for all six types, over Alphonso in the room; the speak and translate cards skip their own prompt
    // there (inStage), so the question is never asked twice.
    expect(lesson).not.toContain("AskingAlphonso(");
    expect(count(lesson, "AlphonsoBubbleView(label: bubbleLabel, text: question.prompt")).toBe(1);
    expect(lesson).toContain("surface: .lesson, inStage: true)");
    expect(lesson).toMatch(/SpeakQuestionCard\([\s\S]{0,200}inStage: true\)/);
    expect(translate).toMatch(
      /if inStage \{[\s\S]{0,300}\} else \{[\s\S]{0,300}AskingAlphonso\(prompt: question\.prompt\)/,
    );
    expect(speak).toMatch(
      /if inStage \{[\s\S]{0,200}\} else \{[\s\S]{0,300}AskingAlphonso\(prompt: question\.prompt, hasMedia: true\)/,
    );
  });

  it("review's four cards", () => {
    expect(count(review, "AskingAlphonso(prompt: q.prompt")).toBe(4);
    expect(review).toContain(MC_CALL);
    expect(review).toContain(LISTENING_CALL);
    expect(review).not.toMatch(/Text\(q\.prompt\)\.font\(AlphonsoFont\.display\(21/);
  });

  it("translate and speak, which draw their own prompt", () => {
    expect(translate).toContain("AskingAlphonso(prompt: question.prompt)");
    expect(speak).toContain("AskingAlphonso(prompt: question.prompt, hasMedia: true)");
  });

  it("the moment exists in the Kit's enum, backed by the shared JSON", () => {
    const kit = readFileSync(
      "ios/LearnWithAlphonsoKit/Sources/LearnWithAlphonsoKit/MascotPoses.swift",
      "utf8",
    );
    expect(kit).toMatch(/case [^\n]*\bquestionAsk\b/);
  });
});

describe("the streak-freeze row is a card, not text on the garden photo", () => {
  const row = read("StreakFreezeRow.swift");
  const body = row.slice(row.indexOf("var body: some View"), row.indexOf("private var summary"));

  it("sits on parchment with a hairline edge, like LessonPathRow", () => {
    expect(body).toContain(
      ".background(AlphonsoColor.parchment, in: RoundedRectangle(cornerRadius: 22",
    );
    expect(body).toContain(".strokeBorder(AlphonsoColor.hairline");
    // The card is drawn after the content's own padding and before the outer gutter, so the fill hugs the text.
    expect(body.indexOf(".padding(.vertical, AlphonsoSpacing.sm + 2)")).toBeLessThan(
      body.indexOf(".background(AlphonsoColor.parchment"),
    );
    expect(body.indexOf(".background(AlphonsoColor.parchment")).toBeLessThan(
      body.indexOf(".padding(.horizontal, AlphonsoSpacing.md)\n        .padding(.top"),
    );
  });

  it("every text colour on the card is ink or inkSoft, the pair each theme keeps readable on parchment", () => {
    const colours = [...row.matchAll(/foregroundStyle\(([^)]*\)?)\)/g)].map((m) => m[1]);
    expect(colours.length).toBeGreaterThan(2);
    for (const c of colours) expect(c, c).toMatch(/^AlphonsoColor\.(ink|inkSoft|moss)$/);
    // moss is only the decorative snowflake, never the words.
    expect(row.match(/AlphonsoColor\.moss/g)?.length).toBe(1);
  });
});

// Android half. The Compose sources are not compiled by the web tests either, so they are read the same way.
const DROID = "android/LearnWithAlphonso/app/src/main/java/com/obsidianmedia/learnwithalphonso/ui";
const droid = (p: string) => readFileSync(`${DROID}/${p}`, "utf8").replace(/\r\n/g, "\n");

describe("Android: Alphonso asks the question", () => {
  const asking = droid("components/AskingAlphonso.kt");
  const questionCard = droid("lesson/QuestionCard.kt");
  const speakCard = droid("lesson/SpeakQuestionCard.kt");

  it("shows his portrait beside a bubble holding the prompt; the portrait is decorative", () => {
    expect(asking).toContain("fun AskingAlphonso(prompt: String");
    expect(asking).toContain("R.drawable.mascot_alphonso");
    expect(asking).toMatch(/Image\([\s\S]{0,120}contentDescription = null/);
  });

  it("hands the size to core's pure function with the real screen height, font scale, prompt length and media flag", () => {
    expect(asking).toContain(
      "val mascotSize = AskingAlphonsoLayout.portraitSizeDp(config.screenHeightDp, config.fontScale, prompt.length, hasMedia)?.dp",
    );
    // The portrait is gated by the one value; the prompt text is outside that branch so it is never hidden.
    expect(asking).toMatch(
      /if \(mascotSize != null\) \{[\s\S]*?Image\([\s\S]*?\}\s*\n\s*Text\(\s*prompt,/,
    );
  });

  const core = readFileSync(
    "android/LearnWithAlphonso/core/src/main/kotlin/com/obsidianmedia/learnwithalphonso/core/logic/AskingAlphonsoLayout.kt",
    "utf8",
  ).replace(/\r\n/g, "\n");

  it("core's size rule is exactly: large font or a compact phone or two crowding reasons drop him, a tall uncrowded phone gets the figure, otherwise the avatar", () => {
    expect(block(core, "fun portraitSizeDp")).toBe(
      squash(`{
        val crowd = (if (promptLength > LONG_PROMPT_CHARS) 1 else 0) + (if (hasMedia) 1 else 0)
        return when {
            fontScale >= NONE_FROM_FONT_SCALE -> null
            screenHeightDp <= NONE_AT_OR_BELOW_DP -> null
            crowd >= 2 -> null
            screenHeightDp >= LARGE_FROM_DP && crowd == 0 -> LARGE_SIZE_DP
            else -> SMALL_SIZE_DP
        }
      }`),
    );
  });

  it("core's thresholds, and the numbers it shares with the web and iPhone rules", () => {
    expect(core).toContain("const val NONE_AT_OR_BELOW_DP = 640");
    expect(core).toContain("const val LARGE_FROM_DP = 720");
    expect(core).toContain("const val NONE_FROM_FONT_SCALE = 1.3f");
    expect(core).toContain("const val LARGE_SIZE_DP = 120");
    expect(core).toContain(`const val SMALL_SIZE_DP = ${ASK_SMALL_SIZE}`);
    expect(core).toContain(`const val LONG_PROMPT_CHARS = ${ASK_LONG_PROMPT_CHARS}`);
  });

  it("is static, so Reduce Motion has nothing to switch off", () => {
    expect(asking).not.toMatch(
      /animate\w*As|rememberInfiniteTransition|Animatable|AnimatedVisibility/,
    );
  });

  it("every question type asks through it", () => {
    expect(questionCard.match(/AskingAlphonso\(question\.prompt[,)]/g)?.length).toBe(5);
    expect(questionCard).toContain(
      "AskingAlphonso(question.prompt, hasMedia = question.audioText != null || question.imageKey?.let { vocabImages[it] } != null)",
    );
    expect(questionCard).toContain("AskingAlphonso(question.prompt, hasMedia = true)");
    expect(questionCard).not.toContain("private fun Prompt(");
    expect(speakCard).toContain("AskingAlphonso(question.prompt, hasMedia = true)");
  });
});

describe("Android: the streak-freeze row is a card", () => {
  const learn = droid("learn/LearnScreen.kt");
  const block = learn.slice(
    learn.indexOf("if (onBuyStreakFreeze != null)"),
    learn.indexOf("private fun StatPill"),
  );

  it("sits on parchment with a hairline border and rounded corners, like the other Learn rows (round-6 tokens)", () => {
    expect(block).toMatch(/\.clip\(RoundedCornerShape\([^)]*\)\)\s*\.background\(ds\.card\)/);
    expect(block).toContain(".border(1.dp, ds.line");
  });

  it("its words are ink, and the buy button is the secondary button, not moss text (3.8:1 on Studio Ink)", () => {
    expect(block).toContain("color = ds.ink,");
    expect(block).toContain("AlphonsoSecondaryButton(");
    expect(block).not.toMatch(/Color\.White|onPrimary|onAction|palette\.moss|ds\.actionText/);
  });
});
