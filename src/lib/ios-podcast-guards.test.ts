import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

// Text guards for the podcast player wiring that the app target (compiled only on macOS CI,
// with no unit tests) cannot pin itself. The rules live in the Kit and have XCTest coverage;
// these pin that the app actually routes through them.
const ROOT = path.resolve(import.meta.dirname, "../..");
const SWIFT_DIRS = ["ios/LearnWithAlphonso/Sources", "ios/LearnWithAlphonsoKit/Sources"];

function swiftFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...swiftFiles(full));
    else if (entry.name.endsWith(".swift")) out.push(full);
  }
  return out;
}

const sources = SWIFT_DIRS.flatMap((d) => swiftFiles(path.join(ROOT, d))).map((file) => ({
  file: path.relative(ROOT, file).split(path.sep).join("/"),
  text: fs.readFileSync(file, "utf8"),
}));
const code = (text: string) => text.replace(/^\s*\/\/[^\n]*$/gm, "");
const source = (rel: string) => {
  const found = sources.find((s) => s.file.endsWith(rel));
  expect(found, rel).toBeDefined();
  return code(found!.text);
};

describe("iOS podcast guards", () => {
  it("finds the Swift sources (guards that scan nothing cannot fail)", () => {
    expect(sources.some((s) => s.file.endsWith("PodcastAudioPlayer.swift"))).toBe(true);
    expect(sources.length).toBeGreaterThan(50);
  });

  it("the player shows playing only from the machine, and observes status, failure and stalls", () => {
    const player = source("Sources/PodcastAudioPlayer.swift");
    expect(player).not.toMatch(/\bisPlaying\s*=/);
    expect(player).toContain("var isPlaying: Bool { machine.isAudible }");
    for (const needle of [
      "item.observe(\\.status",
      "player.observe(\\.timeControlStatus",
      "AVPlayerItem.failedToPlayToEndTimeNotification",
      "AVPlayerItem.playbackStalledNotification",
      "AVPlayerItem.didPlayToEndTimeNotification",
    ]) {
      expect(player, needle).toContain(needle);
    }
  });

  it("the player's observers are removed with the item, so an old item cannot report into a new one", () => {
    const player = source("Sources/PodcastAudioPlayer.swift");
    expect(player).toContain("itemNotificationTokens.forEach { NotificationCenter.default.removeObserver($0) }");
    expect(player).toContain("keyValueObservations.forEach { $0.invalidate() }");
  });

  it("only RootView registers the stop hook, with the player it keeps, never from the player's init", () => {
    expect(source("Sources/PodcastAudioPlayer.swift")).not.toMatch(/stopPlayback\s*=/);
    expect(source("Sources/RootView.swift")).toContain(
      "PodcastLifecycleHooks.stopPlayback = { [weak podcastPlayer] in podcastPlayer?.stopForAccountChange() }",
    );
    const assigners = sources.filter(({ text }) => /stopPlayback\s*=/.test(code(text))).map((s) => s.file);
    expect(assigners).toEqual(["ios/LearnWithAlphonso/Sources/RootView.swift"]);
  });

  it("the voice pause hook is untouched and a voice turn pauses without resuming", () => {
    const player = source("Sources/PodcastAudioPlayer.swift");
    expect(player).toMatch(/func pauseForVoice\(\)[\s\S]*?\.pausedExternally\(resumable: false\)/);
    expect(source("Sources/RootView.swift")).toContain(
      "VoiceAudioHooks.pauseOtherAudio = { [weak podcastPlayer] in podcastPlayer?.pauseForVoice() }",
    );
  });

  it("registers the podcast lifecycle handlers after the core ones, leaving those in place", () => {
    const app = source("Sources/LearnWithAlphonsoApp.swift");
    const core = app.indexOf("AccountDataCleanup.register(");
    const podcast = app.indexOf("PodcastAccountCleanup.register(");
    const auth = app.indexOf("AuthAccountCleanup.register(");
    expect(core).toBeGreaterThan(-1);
    expect(podcast).toBeGreaterThan(core);
    expect(auth).toBeGreaterThan(podcast);
    expect(app).toContain("removeDownloads: { podcastDownloads.removeAllDownloads() }");
  });

  it("downloads are validated, land atomically and never read file timestamps", () => {
    const manager = source("Sources/PodcastDownloadManager.swift");
    for (const needle of [
      "PodcastDownloadValidation.checkResponse",
      "PodcastDownloadValidation.checkBody",
      "replaceItemAt",
      "cleanupGeneration",
      "defer { for url in leftovers",
    ]) {
      expect(manager, needle).toContain(needle);
    }
    for (const { file, text } of sources) {
      expect(code(text), file).not.toContain("attributesOfItem");
      expect(code(text), file).not.toContain("PodcastDownloadRefusal");
    }
  });

  it("Listen follows the course, hides empty folders and prunes downloads of unpublished episodes", () => {
    const listen = source("Sources/ListenView.swift");
    for (const needle of [
      "PodcastLibrary.visibleFolders(",
      "fetchPublishedIndex()",
      "removeDownloads(",
      "activeCourse.course.wireCode",
      "PodcastLibraryCopy.emptyTitle",
    ]) {
      expect(listen, needle).toContain(needle);
    }
    expect(source("Sources/RootView.swift")).toMatch(/ListenView\([\s\S]*?activeCourse: activeCourse/);
  });

  it("the mini bar shows the machine's control and a Retry, never a Pause over a failure", () => {
    const bar = source("Sources/PodcastMiniBar.swift");
    expect(bar).not.toContain("player.isPlaying");
    expect(bar).toContain("switch player.control");
    expect(bar).toContain("PodcastPlaybackCopy.retryTitle");
  });

  it("user-facing podcast strings contain no double hyphen", () => {
    const files = [
      "Sources/LearnWithAlphonsoKit/PodcastPlaybackFailure.swift",
      "Sources/LearnWithAlphonsoKit/PodcastDownloadValidation.swift",
      "Sources/LearnWithAlphonsoKit/PodcastLibrary.swift",
      "Sources/ListenView.swift",
      "Sources/PodcastMiniBar.swift",
    ];
    for (const rel of files) {
      const literals = source(rel).match(/"[^"\n]*"/g) ?? [];
      for (const literal of literals) expect(literal, rel).not.toContain("--");
    }
  });
});
