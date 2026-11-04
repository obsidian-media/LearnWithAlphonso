import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// Build 55 checklist (BACKLOG 0.0-ar), iPhone half. The app target only compiles in CI, so these read the Swift.
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
const scene = read("DesignSystem/ScreenScene.swift");

describe("1. the word card looks good without a photo", () => {
  const vocab = between(lesson, "private struct VocabScreen: View", "struct VocabImageView: View");
  const card = between(lesson, "private func wordCard(", "private var listContent");

  it("a word with no photo gets a coloured band with the word on it, a different tone per card", () => {
    const words = between(lesson, "private func cardWords(", "private func wordCard(");
    expect(words).toMatch(
      /if let image = item\.image \{[\s\S]*\} else \{\s*wordBand\(item, index: index\)/,
    );
    expect(card).toContain("cardWords(item, index: index)");
    const band = between(lesson, "private func wordBand(", "private func cardWords(");
    expect(band).toContain("AlphonsoTileTone.allCases[index % AlphonsoTileTone.allCases.count]");
    expect(band).toContain("tone.background");
    expect(band).toContain("AlphonsoFont.display(40, weight: .bold)");
  });

  it("the card is as tall as its words, and only scrolls when they do not fit", () => {
    expect(card).toContain("ViewThatFits(in: .vertical)");
    expect(card).not.toContain("maxHeight: .infinity");
  });

  it("Skip sits on the counter row, not beside the title", () => {
    // The counter opens its own row (an HStack right above it), and Skip is inside that row.
    const at = vocab.indexOf('Text("Word \\(page + 1) of \\(items.count)")');
    expect(at).toBeGreaterThan(-1);
    const row = vocab.lastIndexOf("HStack {", at);
    expect(row).toBeGreaterThan(-1);
    expect(at - row).toBeLessThan(120);
    expect(vocab.slice(row, at + 700)).toContain('"Skip to practice"');
    const title = between(vocab, "Text(lesson.title)", 'Text("Word \\(page + 1)');
    expect(title).not.toContain("Skip to practice");
  });
});

describe("2. lesson complete shows the rewards above the pinned button", () => {
  it("the clear window over the clip is a third of the screen, not almost half", () => {
    expect(lesson).toMatch(
      /static var clipWindow: CGFloat \{ UIScreen\.main\.bounds\.height \* 0\.34 \}/,
    );
  });
});

describe("3. the wrong-answer panel is softer, and never the colour of a right answer", () => {
  const theme = read("DesignSystem/AlphonsoTheme.swift");
  const body = between(panel, "struct AnswerVerdictPanel: View", "struct AnswerChoiceButton: View");

  it("tints with the theme's wrong-answer colour and titles in ink (ember text missed 3:1 on light themes)", () => {
    expect(body).toMatch(/correct \? AlphonsoColor\.moss : AlphonsoColor\.wrongAnswer/);
    expect(body).toContain(".foregroundStyle(correct ? tint : AlphonsoColor.ink)");
    expect(body).toContain(
      "AlphonsoColor.wrongAnswerUsesEmber ? AlphonsoPrimaryButtonStyle.alphonsoEmber",
    );
  });

  // Studio Ink and Manuscript draw ember and moss in one colour, so ember there would make wrong look right.
  const hexOf = (block: string, token: string) => {
    const m = block.match(new RegExp(`\\b${token}: Color\\(hex: (0x[0-9A-F_]+)\\)`));
    expect(m, `${token} in palette`).not.toBeNull();
    return m![1];
  };
  const usesEmber = from(theme, "static var wrongAnswerUsesEmber: Bool").slice(0, 400);

  it.each(["meadow", "studioInk", "manuscript", "canopy"])(
    "%s: the wrong-answer colour differs from moss",
    (id) => {
      const block = from(theme, `.${id}: AlphonsoPalette(`).slice(0, 1800);
      const emberIsMoss = hexOf(block, "moss") === hexOf(block, "ember");
      const listedAsEmber = new RegExp(`case [^:]*\\.${id}\\b[^:]*:\\s*return true`).test(
        usesEmber,
      );
      if (emberIsMoss) expect(listedAsEmber, `${id} must use destructive`).toBe(false);
      else expect(listedAsEmber, `${id} should use its coral ember`).toBe(true);
    },
  );
});

describe("4. word chips keep their bottom edge", () => {
  it.each([
    ["lesson", lesson],
    ["review", review],
  ])("the %s word bank and reorder pool leave room for the 4 pt edge", (_n, file) => {
    expect(from(file, "Button(word) { picked = word }").slice(0, 500)).toContain(
      ".padding(.bottom, 4)",
    );
    expect(from(file, "Button(token) { orderPicks.append(i) }").slice(0, 500)).toContain(
      ".padding(.bottom, 4)",
    );
  });
});

describe("5. the scene follows the scroll, so Learn's greeting bubble fades", () => {
  it("the probe reports its position and when it leaves the screen, through a callback", () => {
    const probe = between(scene, "struct SceneScrollProbe: View", "struct ScreenScene: View");
    expect(probe).toContain(".onGeometryChange(for: CGFloat.self");
    expect(probe).toContain(".onAppear");
    expect(probe).toContain(".onDisappear");
    expect(probe).toContain("sceneScrollReporter");
    expect(scene).not.toContain("backgroundPreferenceValue(");
  });

  it("each scene keeps the offset and the probe's visibility in its own state", () => {
    const host = between(scene, "struct SceneScrollHost: ViewModifier", "extension View");
    expect(host).toContain("@State private var offset: CGFloat?");
    expect(host).toContain("@State private var probeVisible = true");
    expect(host).toContain(".environment(\\.sceneScrollReporter");
    expect(host).toContain("ScreenScene(scene: scene, rawOffset: offset");
    expect(host).toContain("probeVisible: probeVisible");
  });

  it("the bubble stays hidden while the top row is off screen, whatever position was last reported", () => {
    const pin = from(scene, "private var pinOpacity: Double").slice(0, 200);
    expect(pin).toContain("guard probeVisible else { return 0 }");
  });

  it("a position reported while the row is off screen is ignored", () => {
    const host = between(scene, "struct SceneScrollHost: ViewModifier", "extension View");
    expect(host).toMatch(/guard probeVisible else \{ return \}\s*offset = /);
  });
});
