import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { CLIPS } from "./scenes";

// Scene clips, iPhone half: the looping Higgsfield clips on Lesson complete, Learn and the Hector paywall.
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

describe("SceneClip: the looping clip view", () => {
  const clipFile = read("DesignSystem/SceneClip.swift");
  const player = from(clipFile, "struct SceneClipPlayer");
  const view = between(clipFile, "struct SceneClip: View", "struct SceneClipPlayer");

  it("every approved clip has a data asset and a poster image set, named the way the view loads them", () => {
    for (const c of CLIPS) {
      expect(existsSync(`${SRC}/Assets.xcassets/Clip-${c}.dataset/clip-${c}.mp4`), c).toBe(true);
      expect(existsSync(`${SRC}/Assets.xcassets/Clip-${c}-poster.imageset/Contents.json`), c).toBe(
        true,
      );
    }
    expect(clipFile).toContain('"Clip-\\(rawValue)"');
    expect(clipFile).toContain('"Clip-\\(rawValue)-poster"');
    const names = between(clipFile, "enum ClipName", "var dataAssetName");
    for (const c of CLIPS) expect(names, c).toMatch(new RegExp(`\\b${c}\\b`));
  });

  it("loads the data asset, writes it once to the caches directory and plays that URL", () => {
    expect(player).toContain("NSDataAsset(name:");
    expect(player).toContain(".cachesDirectory");
    expect(player).toContain("fileExists(atPath:");
    expect(player).toContain("AVPlayerItem(url:");
  });

  it("loops seamlessly with AVQueuePlayer and AVPlayerLooper, filling its frame", () => {
    expect(player).toContain("AVQueuePlayer");
    expect(player).toContain("AVPlayerLooper(");
    expect(player).toContain(".resizeAspectFill");
    expect(player).toContain("AVPlayerLayer");
  });

  it("is muted, never keeps the display awake, and mixes with audio already playing instead of stopping it", () => {
    expect(player).toContain("isMuted = true");
    expect(player).toContain("preventsDisplaySleepDuringVideoPlayback = false");
    // Before playing, the clip switches the default solo session to ambient + mix-with-others, and only when another
    // app is playing; it never claims .playback and never touches a session the podcast or voice tutor set up.
    const mixing = between(clipFile, "static func mixWithOtherAudio()", "\n    }\n");
    expect(mixing).toContain("session.category == .soloAmbient");
    expect(mixing).toContain("session.isOtherAudioPlaying");
    expect(mixing).toMatch(
      /setCategory\(\.ambient, mode: \.default, options: \[\.mixWithOthers\]\)/,
    );
    expect(clipFile).not.toMatch(/setCategory\(\.playback/);
    expect(clipFile).not.toContain("setActive(");
    const update = between(clipFile, "func updateUIView", "static func dismantleUIView");
    expect(update.indexOf("mixWithOtherAudio()")).toBeGreaterThan(-1);
    expect(update.indexOf("mixWithOtherAudio()")).toBeLessThan(update.indexOf("player.play()"));
  });

  it("keys the cached copy on the clip's own bytes and clears older copies", () => {
    const cache = between(clipFile, "private static func fileURL", "\n    }\n}");
    expect(cache).toContain("asset.data.count");
    expect(cache).not.toContain("CFBundleVersion");
    expect(cache).toContain("removeItem(");
  });

  it("pauses when the view disappears or the app leaves the foreground", () => {
    expect(view).toContain(".onDisappear");
    expect(view).toContain("@Environment(\\.scenePhase)");
    expect(player).toContain("player.pause()");
    expect(player).toContain("player.play()");
    expect(view).toMatch(/isPlaying: [^\n]*scenePhase == \.active/);
  });

  it("shows the poster until the first frame is ready, so it never flashes black", () => {
    expect(view).toContain("Image(clip.posterName)");
    expect(player).toContain("isReadyForDisplay");
    expect(view).toMatch(/\.opacity\(ready \? 1 : 0\)/);
  });

  it("under Reduce Motion it is the poster only, and re-checks when the setting changes", () => {
    expect(view).toContain("@Environment(\\.accessibilityReduceMotion)");
    expect(view).toMatch(/if !reduceMotion \{\s*\n\s*SceneClipPlayer\(/);
    expect(view).toMatch(/\.onChange\(of: reduceMotion\)/);
  });

  it("the whole view is hidden from VoiceOver", () => {
    expect(view).toContain(".accessibilityHidden(true)");
  });

  it("the backdrop frames the clip like aspect-fill, and a pin sits in the clip's own percent coordinates", () => {
    const backdrop = from(clipFile, "struct ClipBackdrop");
    expect(backdrop).toContain("max(w, h * 9 / 16)");
    expect(backdrop).toContain("max(h, w * 16 / 9)");
    expect(backdrop).toMatch(/\(h - frameH\) \* verticalAnchor/);
    expect(backdrop).toContain("pin.x / 100");
    expect(backdrop).toContain("pin.y / 100");
    expect(clipFile).toContain("struct ClipPin");
  });
});

// Lesson complete no longer plays a clip: since visual round 6 it is drawn in code in the unit's room, and the
// complete clip is retired (ios-lesson-room-guards.test.ts, scenes.test.ts).

describe("Learn plays the garden clip with Alphonso's bubble pinned on him", () => {
  const browser = read("LessonBrowserView.swift");
  const map = read("LearnPathMap.swift");

  it("the backdrop is the learn clip and the greeting bubble is pinned at about 64%, 53% of it", () => {
    expect(browser).toMatch(/\.screenScene\(\s*\.learn,\s*clip: \.learn/);
    expect(browser).toContain("ClipPin(x: 64, y: 53");
    expect(browser).toContain("PathSpeechBubble(message:");
  });

  it("the cut-out Alphonso is gone from the map, but his room stays clear and VoiceOver still hears him", () => {
    expect(map).not.toContain('SceneFigure(assetName: "Figure-alphonso-waving"');
    expect(map).not.toContain("SceneFigure(");
    expect(map).not.toContain("Figure-alphonso-waving");
    expect(map).toContain('.accessibilityLabel("Alphonso: \\(greeting)")');
    expect(map).toContain("Self.figureColumnWidth");
    // The nodes still reserve the room above the current node for him.
    expect(map).toContain("Self.figureHeight");
    expect(map).toContain("Self.bubbleReserve");
  });
});

describe("The Hector paywall plays the library clip, only on the Hector tab", () => {
  const paywall = read("PaywallView.swift");
  const hector = read("HectorView.swift");

  it("the redesigned paywall paints its own static Hector room, not a clip, and no longer branches on the source", () => {
    const parts = read("ProPaywallParts.swift");
    expect(paywall).toContain("PaywallRoomTop(");
    expect(parts).toContain('Image("Scene-hector")');
    expect(parts).toContain('Image("Hector-talking")');
    expect(paywall).not.toContain("source == .hectorTab");
    expect(paywall).not.toContain(".screenScene(");
  });

  it("the 220 pt cut-out is gone, and the Pro conversation keeps the still library", () => {
    expect(paywall).not.toContain("Figure-hector-waving");
    expect(paywall).not.toContain("SceneFigure");
    const view = between(
      hector,
      "struct HectorView: View",
      "private struct HectorConversationView",
    );
    expect(view).toMatch(/HectorConversationView\([\s\S]*?\.screenScene\(\.hector\)/);
    // The free branch no longer gets the still library from the host: the paywall paints its own clip.
    expect(view).not.toMatch(/\}\s*\n\s*\.screenScene\(\.hector\)\s*\n\s*\.navigationTitle/);
  });

  it("the standing cut-out view is gone, since every character now lives in a clip", () => {
    expect(
      readFileSync("ios/LearnWithAlphonso/Sources/DesignSystem/ScreenScene.swift", "utf8"),
    ).not.toContain("struct SceneFigure");
  });

  it("draws the pin above the scrim, moving with the clip, and fades it out within the first 60 pt of scroll", () => {
    const sceneFile = read("DesignSystem/ScreenScene.swift");
    const body = between(sceneFile, "var body: some View", "private func travel");
    const scrimAt = body.indexOf("LinearGradient(");
    const pinAt = body.indexOf(
      "ClipBackdrop(clip: clip, verticalAnchor: clipAnchor, pin: pin, showsClip: false)",
    );
    expect(scrimAt).toBeGreaterThan(-1);
    expect(pinAt).toBeGreaterThan(scrimAt);
    expect(body).toContain(".opacity(pinOpacity)");
    expect(sceneFile).toMatch(/pinOpacity: Double \{[\s\S]{0,120}?held[^}]*60/);
    // The scroll distance is tracked under Reduce Motion too (the fade is not motion; only parallax is gated).
    expect(between(body, ".onChange(of: rawOffset)", "}")).not.toContain("reduceMotion");
  });
});
