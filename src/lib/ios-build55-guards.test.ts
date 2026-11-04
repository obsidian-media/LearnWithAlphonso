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
    const counter = from(vocab, 'Text("Word \\(page + 1) of \\(items.count)")').slice(0, 700);
    expect(counter).toContain('"Skip to practice"');
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

describe("3. the wrong-answer panel is coral, not alarm red", () => {
  it("uses the ember tint and the ember button", () => {
    const body = between(
      panel,
      "struct AnswerVerdictPanel: View",
      "struct AnswerChoiceButton: View",
    );
    expect(body).toMatch(/correct \? AlphonsoColor\.moss : AlphonsoColor\.ember/);
    expect(body).toContain(".alphonsoEmber");
    expect(body).not.toContain("AlphonsoColor.destructive");
    expect(body).not.toContain("Color(red:");
  });
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
