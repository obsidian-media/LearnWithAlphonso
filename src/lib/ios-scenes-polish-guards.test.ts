import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// Follow-ups from the scenes round's review, iPhone half. Source-text guards: the app target only compiles in CI.
const SRC = "ios/LearnWithAlphonso/Sources";
const read = (p: string) => readFileSync(`${SRC}/${p}`, "utf8").replace(/\r\n/g, "\n");
const between = (s: string, a: string, b: string) => {
  const i = s.indexOf(a);
  expect(i, `missing: ${a}`).toBeGreaterThan(-1);
  const j = s.indexOf(b, i + a.length);
  expect(j, `missing: ${b}`).toBeGreaterThan(-1);
  return s.slice(i, j);
};

describe("iOS scenes follow-ups", () => {
  const map = read("LearnPathMap.swift");
  const browser = read("LessonBrowserView.swift");
  const listen = read("ListenView.swift");

  it("VoiceOver hears the map's current node as the current lesson, not a second 'Continue' button", () => {
    expect(map).not.toContain('accessibilityLabel("Continue:');
    expect(map).toContain("current lesson");
  });

  it("the Up next card no longer draws its own mini path, since the map shows the unit", () => {
    const card = between(browser, "private struct LearnContinueCard", "\n}\n");
    expect(card).not.toContain("pathNode(");
    expect(card).not.toContain("let path:");
  });

  it("the Listen root draws the studio once, not once per layer", () => {
    expect(listen.match(/\.screenScene\(\.listen\)/g)?.length ?? 0).toBeLessThanOrEqual(2);
    const rootCall = between(listen, "PodcastFolderListing(\n                folder: nil", ")\n");
    expect(rootCall).toContain("showsScene: false");
    const listing = between(listen, "private struct PodcastFolderListing", "private func subtitle");
    expect(listing).toContain(".screenScene(.listen, if: showsScene)");
  });

  it("the current node stops bouncing when Reduce Motion is switched on mid-session", () => {
    const node = map.slice(map.indexOf("struct PathNodeView"));
    expect(node).toMatch(/\.onChange\(of: reduceMotion\)/);
  });
});

describe("iOS Practice in the cafe", () => {
  const scene = read("DesignSystem/ScreenScene.swift");
  const practice = read("ConversationView.swift");
  const body = between(practice, "struct ConversationView", "/// The heading above a group");

  it("the cafe scene is a named scene", () => {
    expect(between(scene, "enum SceneName", "}")).toMatch(/\bpractice\b/);
  });

  it("Practice paints the cafe instead of a flat surface, with its scroll feeding the parallax", () => {
    expect(body).toContain(".screenScene(.practice)");
    expect(body).not.toContain(".background(AlphonsoColor.surface)");
    expect(body).toContain(".sceneScrollProbe()");
  });

  it("the tiles and section labels sit on glass, not straight on the photo", () => {
    expect(body).toContain(".alphonsoGlass(");
  });
});
