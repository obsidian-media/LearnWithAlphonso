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

  it("a word with no photo gets a band with the word on it, in the lesson's choice tint (round 6)", () => {
    const words = between(lesson, "private func cardWords(", "private func wordCard(");
    expect(words).toMatch(
      /if let image = item\.image \{[\s\S]*\} else \{\s*wordBand\(item, index: index\)/,
    );
    expect(card).toContain("cardWords(item, index: index)");
    const band = between(lesson, "private func wordBand(", "private func cardWords(");
    expect(band).toContain(".dsText(.displayXL)");
    expect(band).toContain(".foregroundStyle(ds.brand)");
    expect(band).toContain("ds.choiceTint");
    expect(band).not.toContain("AlphonsoTileTone");
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

// 2. (the clip window over lesson complete) is gone with the clip: lesson complete is drawn in code in the unit's
// room since visual round 6 (ios-lesson-room-guards.test.ts).

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
  it("the lesson's word tiles carry their edge in their own style, with room for it below", () => {
    // Since round 6 the lesson draws LessonWordTile (LessonStageViews.swift): the edge sits under the face and the
    // style pads the tile by the edge's height, so a wrapping row never clips it.
    const stage = read("LessonStageViews.swift");
    const pressable = between(
      stage,
      "private struct LessonPressableStyle",
      "struct LessonAnswerButton",
    );
    expect(pressable).toContain(
      ".background(alignment: .top) { shape.fill(edge).offset(y: edgeHeight) }",
    );
    expect(pressable).toContain(".padding(.bottom, edgeHeight)");
    expect(lesson).toContain(
      "LessonWordTile(word: word, picked: picked == word) { picked = word }",
    );
    expect(lesson).toContain("LessonWordTile(word: token) { orderPicks.append(i) }");
  });

  it.each([["review", review]])(
    "the %s word bank and reorder pool leave room for the 4 pt edge",
    (_n, file) => {
      expect(from(file, "Button(word) { picked = word }").slice(0, 500)).toContain(
        ".padding(.bottom, 4)",
      );
      expect(from(file, "Button(token) { orderPicks.append(i) }").slice(0, 500)).toContain(
        ".padding(.bottom, 4)",
      );
    },
  );
});

describe("5. the scene follows the scroll, so Learn's greeting bubble fades", () => {
  it("the probe reports its position and when it leaves the screen, through a callback", () => {
    const probe = between(scene, "struct SceneScrollProbe: View", "struct ScreenScene: View");
    // A GeometryReader in the row, read on every change: Limrun showed `onGeometryChange` never fires while a
    // List scrolls (the scene stood still and the bubble never faded), the old GeometryReader signal did.
    expect(probe).toContain("GeometryReader { proxy in");
    expect(probe).toContain(".onChange(of: proxy.frame(in: .global).minY, initial: true)");
    expect(probe).not.toContain("onGeometryChange");
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

  it("reads the scroll view's own offset (iOS 18+): a List row's probe never reached the scene on Limrun", () => {
    // Builds 53/54 and the first two build 55 tries: on Learn's List the scene never moved and the bubble never
    // faded, whichever way the probe row reported. The scroll view's own geometry is the reliable signal.
    const reader = between(
      scene,
      "struct SceneScrollOffsetReader: ViewModifier",
      "struct ScreenScene: View",
    );
    expect(reader).toContain("if #available(iOS 18.0, *)");
    expect(reader).toContain(".onScrollGeometryChange(for: CGFloat.self)");
    expect(reader).toMatch(/-\(geometry\.contentOffset\.y \+ geometry\.contentInsets\.top\)/);
    const host = between(
      scene,
      "struct SceneScrollHost: ViewModifier",
      "struct SceneScrollOffsetReader",
    );
    expect(host).toContain(".modifier(SceneScrollOffsetReader { report(.scrolled($0)) })");
    // Once the scroll view reports, the probe is ignored and the pin no longer depends on the probe row.
    expect(host).toMatch(/case \.scrolled\(let y\):\s*scrollDriven = true\s*offset = y/);
    expect(host).toMatch(/guard probeVisible, !scrollDriven else \{ return \}\s*offset = /);
    expect(host).toContain("probeVisible: probeVisible || scrollDriven");
  });

  it("the bubble stays hidden while the top row is off screen, whatever position was last reported", () => {
    const pin = from(scene, "private var pinOpacity: Double").slice(0, 200);
    expect(pin).toContain("guard probeVisible else { return 0 }");
  });

  it("a position reported while the row is off screen is ignored", () => {
    const host = between(scene, "struct SceneScrollHost: ViewModifier", "extension View");
    expect(host).toMatch(/guard probeVisible(, !scrollDriven)? else \{ return \}\s*offset = /);
  });
});
