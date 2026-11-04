import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// Alphonso asking the question, iPhone half. The app target only compiles in CI (ios-app-build), so these read
// the Swift source; each assertion names the property it protects.
const SRC = "ios/LearnWithAlphonso/Sources";
const read = (p: string) => readFileSync(`${SRC}/${p}`, "utf8").replace(/\r\n/g, "\n");
const count = (s: string, needle: string) => s.split(needle).length - 1;

const view = read("DesignSystem/AskingAlphonso.swift");
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

  it("drops the portrait at accessibility text sizes and on a short phone, keeping the bubble", () => {
    expect(view).toContain("dynamicTypeSize.isAccessibilitySize");
    expect(view).toMatch(/let height = UIScreen\.main\.bounds\.height/);
    // One flag gates the portrait; the prompt text is outside that branch so it is never hidden.
    const gate = view.slice(view.indexOf("mascotSize"));
    expect(gate).toMatch(
      /if let mascotSize \{[\s\S]*?MascotTile[\s\S]*?\}\s*\n\s*(speechBubble|bubble)/,
    );
  });

  it("is a large figure on a tall phone and a small avatar in the middle", () => {
    expect(view).toMatch(/height > 800 \{ return 12\d \}/);
    expect(view).toMatch(/height > 667 \{ return 56 \}/);
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

describe("every question type asks through Alphonso", () => {
  it("the lesson's multiple choice, fill, reorder and listening cards", () => {
    expect(count(lesson, "AskingAlphonso(prompt: q.prompt)")).toBe(4);
    expect(lesson).not.toMatch(/Text\(q\.prompt\)\.font\(AlphonsoFont\.display\(22/);
  });

  it("review's four cards", () => {
    expect(count(review, "AskingAlphonso(prompt: q.prompt)")).toBe(4);
    expect(review).not.toMatch(/Text\(q\.prompt\)\.font\(AlphonsoFont\.display\(21/);
  });

  it("translate and speak, which draw their own prompt", () => {
    expect(translate).toContain("AskingAlphonso(prompt: question.prompt)");
    expect(speak).toContain("AskingAlphonso(prompt: question.prompt)");
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

  it("drops the portrait on a short screen and at large font scales, never the prompt", () => {
    expect(asking).toMatch(/screenHeightDp\s*<=\s*\d{3}\s*->\s*null/);
    expect(asking).toMatch(/fontScale\s*>=\s*1\.\d/);
    expect(asking).toMatch(
      /if \(mascotSize != null\) \{[\s\S]*?Image\([\s\S]*?\}\s*\n\s*Text\(\s*prompt,/,
    );
  });

  it("is a large figure on a tall screen and a small avatar in the middle", () => {
    expect(asking).toMatch(/screenHeightDp\s*>=\s*7\d\d\s*->\s*1[2-4]\d\.dp/);
    expect(asking).toMatch(/56\.dp/);
  });

  it("is static, so Reduce Motion has nothing to switch off", () => {
    expect(asking).not.toMatch(
      /animate\w*As|rememberInfiniteTransition|Animatable|AnimatedVisibility/,
    );
  });

  it("every question type asks through it", () => {
    expect(questionCard.match(/AskingAlphonso\(question\.prompt\)/g)?.length).toBe(5);
    expect(questionCard).not.toContain("private fun Prompt(");
    expect(speakCard).toContain("AskingAlphonso(question.prompt)");
  });
});

describe("Android: the streak-freeze row is a card", () => {
  const learn = droid("learn/LearnScreen.kt");
  const block = learn.slice(
    learn.indexOf("if (onBuyStreakFreeze != null)"),
    learn.indexOf("private fun StatPill"),
  );

  it("sits on parchment with a hairline border and rounded corners, like the other Learn rows", () => {
    expect(block).toMatch(
      /\.clip\(RoundedCornerShape\([^)]*\)\)\s*\.background\(palette\.parchment\)/,
    );
    expect(block).toContain(".border(1.dp, palette.hairline");
  });

  it("its words are ink, and the buy button is the secondary button, not moss text (3.8:1 on Studio Ink)", () => {
    expect(block).toContain("color = palette.ink,");
    expect(block).toContain("AlphonsoSecondaryButton(");
    expect(block).not.toMatch(/Color\.White|onPrimary|palette\.moss/);
  });
});
