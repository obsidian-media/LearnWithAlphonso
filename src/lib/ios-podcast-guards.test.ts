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

/**
 * The text of one member function, from its signature to the closing brace at the same
 * indentation. Bounded, unlike a lazy `[\s\S]*?` from the signature, which runs on into the
 * NEXT function and lets a guard pass on code that belongs to somebody else.
 */
function functionBody(text: string, signature: string): string {
  const start = text.indexOf(signature);
  expect(start, `${signature} not found`).toBeGreaterThan(-1);
  const lineStart = text.lastIndexOf("\n", start) + 1;
  const indent = text.slice(lineStart, start).match(/^\s*/)![0];
  const close = text.indexOf(`\n${indent}}`, start);
  expect(close, `${signature} has no closing brace`).toBeGreaterThan(start);
  return text.slice(start, close + 1);
}

/** Index of a call such as `Foo.register(`, not matching `XFoo.register(` or `Foo_.register(`. */
function callIndex(text: string, call: string): number {
  const escaped = call.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return text.search(new RegExp(`(?<![A-Za-z0-9_])${escaped}`));
}

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
    expect(player).toContain(
      "itemNotificationTokens.forEach { NotificationCenter.default.removeObserver($0) }",
    );
    expect(player).toContain("keyValueObservations.forEach { $0.invalidate() }");
  });

  it("only RootView registers the stop hook, with the player it keeps, never from the player's init", () => {
    expect(source("Sources/PodcastAudioPlayer.swift")).not.toMatch(/stopPlayback\s*=/);
    expect(source("Sources/RootView.swift")).toContain(
      "PodcastLifecycleHooks.stopPlayback = { [weak podcastPlayer] in podcastPlayer?.stopForAccountChange() }",
    );
    const assigners = sources
      .filter(({ text }) => /stopPlayback\s*=/.test(code(text)))
      .map((s) => s.file);
    expect(assigners).toEqual(["ios/LearnWithAlphonso/Sources/RootView.swift"]);
  });

  it("the voice pause hook is untouched and a voice turn pauses without resuming", () => {
    const player = source("Sources/PodcastAudioPlayer.swift");
    // Bounded to the function's own body: an unbounded match reaches into handleRouteChange,
    // which also says resumable: false, so changing pauseForVoice would still pass.
    const body = functionBody(player, "func pauseForVoice() {");
    expect(body).toContain("handle(.pausedExternally(resumable: false))");
    expect(body).not.toContain("resumable: true");
    expect(body.length).toBeLessThan(400);
    expect(source("Sources/RootView.swift")).toContain(
      "VoiceAudioHooks.pauseOtherAudio = { [weak podcastPlayer] in podcastPlayer?.pauseForVoice() }",
    );
  });

  it("registers the podcast lifecycle handlers after the core ones, leaving those in place", () => {
    const app = source("Sources/LearnWithAlphonsoApp.swift");
    const core = callIndex(app, "AccountDataCleanup.register(");
    const podcast = callIndex(app, "PodcastAccountCleanup.register(");
    const auth = callIndex(app, "AuthAccountCleanup.register(");
    expect(core).toBeGreaterThan(-1);
    expect(podcast).toBeGreaterThan(core);
    expect(auth).toBeGreaterThan(podcast);
    // Both handlers are wired to the real work, not to empty closures.
    expect(app).toContain("stopPlayback: { PodcastLifecycleHooks.stopPlayback?() }");
    expect(app).toContain("removeDownloads: { podcastDownloads.removeAllDownloads() }");
  });

  it("the registration needles cannot be satisfied by a look-alike name", () => {
    const lookalikes =
      "OAuthAccountCleanup.register( XPodcastAccountCleanup.register( Podcast_AccountDataCleanup.register(";
    expect(callIndex(lookalikes, "AuthAccountCleanup.register(")).toBe(-1);
    expect(callIndex(lookalikes, "PodcastAccountCleanup.register(")).toBe(-1);
    expect(callIndex(lookalikes, "AccountDataCleanup.register(")).toBe(-1);
    expect(callIndex("AuthAccountCleanup.register(", "AuthAccountCleanup.register(")).toBe(0);
  });

  it("downloads are validated, land atomically and never read file timestamps", () => {
    const manager = source("Sources/PodcastDownloadManager.swift");
    for (const needle of [
      "PodcastDownloadValidation.checkResponse",
      "PodcastDownloadValidation.checkBody",
      "replaceItemAt",
      "defer { for url in leftovers",
    ]) {
      expect(manager, needle).toContain(needle);
    }
    // The comparison, not the declaration: `private var cleanupGeneration` alone proves
    // nothing. One guard before landing the file, and one at the top of EACH catch, so an
    // account deleted mid-download gets no alert and no failed state.
    expect(manager.match(/guard generation == cleanupGeneration else \{/g)?.length).toBe(3);
    expect(manager).toMatch(
      /catch let failure as PodcastDownloadFailure \{\s*(?:\/\/[^\n]*\s*)*guard generation == cleanupGeneration else \{ return \}/,
    );
    expect(manager).toMatch(
      /\} catch \{\s*guard generation == cleanupGeneration else \{ return \}/,
    );
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
    expect(source("Sources/RootView.swift")).toMatch(
      /ListenView\([\s\S]*?activeCourse: activeCourse/,
    );
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
  it("Listen prunes downloads only after a read that returned folders", () => {
    const listen = source("Sources/ListenView.swift");
    expect(listen).toMatch(
      /if PodcastLibrary\.canPruneDownloads\(afterLoading: loadedFolders\) \{\s*downloads\.removeDownloads\(/,
    );
    expect(listen.match(/removeDownloads\(/g)?.length).toBe(1);
  });

  it("Listen's failures say the connection failed when connected, and keep an offline message offline", () => {
    const listen = source("Sources/ListenView.swift");
    expect(listen).not.toContain("Something went wrong loading the library.");
    expect(listen).not.toContain("Search isn't available right now");
    expect(listen).toMatch(
      /errorMessage = networkMonitor\.isConnected\s*\? Copy\.connectionFailure\s*: "You're offline\."/,
    );
    expect(listen).toMatch(
      /message\(networkMonitor\.isConnected\s*\? Copy\.connectionFailure\s*: "You're offline\. Search needs a connection\."\)/,
    );
  });

  it("the mini bar's Retry and Next pass the real connectivity, and every call site supplies the monitor", () => {
    const bar = source("Sources/PodcastMiniBar.swift");
    expect(bar).toContain("let networkMonitor: NetworkMonitor");
    expect(bar).toMatch(/player\.retry\([\s\S]{0,160}?isOnline: networkMonitor\.isConnected/);
    expect(bar).toMatch(/player\.play\([\s\S]{0,220}?isOnline: networkMonitor\.isConnected/);
    const callers = sources
      .map(({ file, text }) => ({ file, text: code(text) }))
      .filter(({ text }) => /\.podcastMiniBar\(/.test(text));
    expect(callers.length).toBeGreaterThan(1);
    for (const { file, text } of callers) {
      for (const call of text.match(/\.podcastMiniBar\([^)]*\)/g) ?? []) {
        expect(call, file).toContain("networkMonitor: networkMonitor");
      }
    }
  });

  it("the player times out a load that never produces a first frame, as it does a stall", () => {
    const player = source("Sources/PodcastAudioPlayer.swift");
    expect(player).toMatch(
      /case let \.scheduleLoadTimeout\(generation\):[\s\S]{0,260}?PodcastPlayerMachine\.loadTimeoutSeconds[\s\S]{0,160}?handle\(\.loadTimedOut\(generation: generation\)\)/,
    );
  });

  it("an account change resets the save gate in place and every queued save checks its epoch", () => {
    const player = source("Sources/PodcastAudioPlayer.swift");
    const stop = functionBody(player, "func stopForAccountChange() {");
    expect(stop).toContain("saveGate.resetForAccountChange()");
    expect(stop).not.toMatch(/saveGate = PodcastSaveGate\(\)/);
    const save = functionBody(player, "private func save(position: Double, completed: Bool) {");
    expect(save).toContain("let epoch = saveGate.epoch");
    // Before the request, after it, and in the stale and unauthorized handlers.
    expect(save.match(/saveGate\.accepts\(epoch\)/g)?.length).toBe(4);
  });
});
