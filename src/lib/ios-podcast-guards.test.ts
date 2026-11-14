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
    if (entry.isDirectory()) {
      if (!entry.name.startsWith(".")) out.push(...swiftFiles(full));
    } else if (entry.name.endsWith(".swift")) out.push(full);
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
    // Before the request, before recording the stored position, after it, and in the stale and unauthorized handlers.
    expect(save.match(/saveGate\.accepts\(epoch\)/g)?.length).toBe(5);
  });
});

describe("iOS podcast quiz guards", () => {
  const kit = () => source("Sources/LearnWithAlphonsoKit/PodcastQuiz.swift");
  const sheet = () => source("Sources/PodcastQuizSheet.swift");
  const bar = () => source("Sources/PodcastMiniBar.swift");

  it("the quiz is offered only after the episode finished, and only when the server has one", () => {
    const text = bar();
    expect(text).toMatch(/if player\.machine\.phase == \.finished, let offer = quizOffer/);
    const load = functionBody(text, "private func loadQuizOffer(episode: PodcastEpisode) async {");
    // Not finished: any held offer is dropped, and nothing is fetched.
    expect(load).toMatch(
      /guard player\.machine\.phase == \.finished, let client = makePodcastClient\(session: session\) else \{\s*quizOffer = nil/,
    );
    expect(load).toContain("client.fetchQuiz(episodeID: episode.id)");
    // Re-keyed on finishing, so playing again clears a stale offer.
    expect(text).toMatch(
      /\.task\(id: QuizOfferRequest\(episodeID: episode\.id, isFinished: player\.machine\.phase == \.finished\)\)/,
    );
  });

  it("the sheet steps through the Kit's run and shows the server's result, never its own marking", () => {
    const text = sheet();
    expect(text).toContain("PodcastQuizRun(questions: offer.questions)");
    expect(text).toContain("run.saved(result)");
    // The score on screen is the result the server returned.
    expect(text).toContain('headline: "\\(result.correct) of \\(result.total) correct"');
    expect(text).toContain("PodcastQuizCopy.xpLine(for: result)");
    // No local scoring: nothing compares a choice with the key to count a score or XP.
    expect(text).not.toMatch(/score|xpGain\s*[+=]|\* 10/);
  });

  it("sends the chosen answers and the finish time to the Edge Function, in an unstructured task", () => {
    const text = sheet();
    const submit = functionBody(text, "private func submit() {");
    expect(submit).toContain(
      "client.submitQuiz(episodeID: episodeID, answers: answers, completedAt: finished)",
    );
    // An unstructured task: leaving the sheet must not cancel a request that may already have been applied.
    expect(submit).toContain("Task { @MainActor in");
    expect(text).not.toMatch(/\.task\(id: run\.phase\)/);
    // The finish time is taken when the last answer is given, not when a retry is tapped.
    expect(text).toMatch(/if run\.phase == \.submitting \{ finishedAt = Date\(\); submit\(\) \}/);
  });

  it("the client posts answers and completedAt to complete-podcast-quiz and nothing else", () => {
    const text = kit();
    const submit = functionBody(text, "public func submitQuiz(");
    expect(submit).toContain("functions/v1/complete-podcast-quiz");
    const payload = submit.slice(submit.indexOf("let payload"), submit.indexOf("request.httpBody"));
    const keys = [...payload.matchAll(/"(\w+)":/g)].map((m) => m[1]);
    expect(keys).toEqual(["episodeId", "answers", "questionId", "choiceIndex", "completedAt"]);
    // A 2xx the app cannot read is an error, never a score.
    expect(submit).toContain('object["status"] as? String == "applied"');
    expect(submit).toContain("throw PodcastQuizError.server");
  });

  it("the Kit never decides a score: the run only stores what the server returned", () => {
    const run = functionBody(kit(), "public mutating func saved(_ result: PodcastQuizResult) {");
    expect(run).toContain("self.result = result");
    // 10 XP per correct answer is stated in copy only; the arithmetic lives in submit_podcast_quiz.
    const arithmetic = kit().replace(/"[^"\n]*"/g, '""');
    expect(arithmetic).not.toMatch(/\* 10|\bcorrect\s*\+=|answerIndex\s*==/);
  });

  it("the function the client calls exists and is deployed", () => {
    expect(
      fs.existsSync(path.join(ROOT, "supabase/functions/complete-podcast-quiz/index.ts")),
    ).toBe(true);
    const ci = fs.readFileSync(path.join(ROOT, ".github/workflows/ci.yml"), "utf8");
    expect(ci).toMatch(/supabase functions deploy complete-podcast-quiz\s*$/m);
  });

  it("a quiz row button appears only on episodes the server says have a quiz", () => {
    const list = source("Sources/ListenView.swift");
    expect(list).toMatch(/client\.fetchQuizEpisodeIDs\(episodeIDs: episodes\.map\(\\.id\)\)/);
    expect(list).toMatch(
      /if quizEpisodeIDs\.contains\(episode\.id\) \{\s*PodcastQuizRowButton\(episode: episode, session: session\)/,
    );
    // A failed read is no buttons, never a failed listing.
    expect(list).toContain("(try? await client.fetchQuizEpisodeIDs(");
  });

  it("an unreadable question row fails loudly instead of being dropped", () => {
    const fetch = functionBody(
      kit(),
      "public func fetchQuiz(episodeID: String) async throws -> PodcastQuizOffer? {",
    );
    expect(fetch).toContain("throw PodcastClientError.invalidPayload");
    expect(fetch).not.toMatch(/\.compactMap\s*\{[^}]*answer_index/);
    expect(fetch).toMatch(/\.rows\(from: data\)\.map \{ row in/);
  });

  it("Try again is offered only for failures that retrying can fix, and a saved result refreshes the best label", () => {
    const text = sheet();
    expect(text).toMatch(/actionTitle: error\.isRetryable \? "Try again" : nil/);
    expect(text).toContain("onSaved?(result)");
    expect(bar()).toMatch(
      /best: PodcastQuizBest\(correct: result\.bestCorrect, xp: result\.bestXP\)/,
    );
    const retry = functionBody(kit(), "public mutating func retry() {");
    expect(retry).toContain("error.isRetryable");
  });
});

describe("iOS podcast quiz: every choice card takes a tap, and the row button reads on the scene", () => {
  const sheet = () => source("Sources/PodcastQuizSheet.swift");

  // QA froze at question 3 of "Ordering Coffee": its choices ("It means no") are the first that are all shorter than
  // half the card. A plain-style button hit-tests only what it draws, so the middle of each card was dead.
  it("the choices are the lesson's own answer buttons, so the whole card takes a tap", () => {
    const text = sheet();
    // LessonAnswerButton sets the content shape after its full-width frame (ios-lesson guards pin that).
    expect(text).toContain("LessonAnswerButton(");
    expect(text).toContain(") { run.select(index) }");
    expect(text).toContain(".disabled(run.checked)");
    // The verdict is the lesson's sheet, and the result is the lesson-complete layout.
    expect(text).toContain("LessonVerdictSheet(");
    expect(text).toContain("LessonCompleteView(");
  });

  const rowButton = () => {
    const text = sheet();
    const start = text.indexOf("struct PodcastQuizRowButton: View {");
    expect(start).toBeGreaterThan(-1);
    return text.slice(start, text.indexOf("private func open() async {", start));
  };

  it("the row button is an opaque surface chip with ink words, not a translucent tint on the photo", () => {
    const button = rowButton();
    expect(button).toContain(".buttonStyle(AlphonsoSecondaryButtonStyle(fullWidth: false))");
    expect(button).not.toMatch(/\.buttonStyle\(\.bordered\)|\.buttonStyle\(\.plain\)/);
    expect(button).not.toMatch(/\.tint\(AlphonsoColor\.moss\)/);
    expect(button).toContain(".labelStyle(PodcastQuizChipLabelStyle())");
    const style = sheet().slice(
      sheet().indexOf("private struct PodcastQuizChipLabelStyle: LabelStyle {"),
    );
    expect(style).toMatch(/configuration\.title[\s\S]*?\.foregroundStyle\(AlphonsoColor\.ink\)/);
    const components = source("Sources/DesignSystem/AlphonsoComponents.swift");
    const secondary = functionBody(
      components.slice(components.indexOf("struct AlphonsoSecondaryButtonStyle: ButtonStyle {")),
      "func makeBody(configuration: Configuration) -> some View {",
    );
    expect(secondary).toContain(
      ".background(AlphonsoColor.surface, in: RoundedRectangle(cornerRadius: AlphonsoRadius.lg, style: .continuous))",
    );
  });

  it("ink on surface is at least 4.5:1 in every theme, light and dark", () => {
    const theme = source("Sources/DesignSystem/AlphonsoTheme.swift");
    const hex = (name: string) =>
      [
        ...theme.matchAll(new RegExp(String.raw`\b${name}: Color\(hex: 0x([0-9A-Fa-f_]+)\)`, "g")),
      ].map((m) => parseInt(m[1].replace(/_/g, ""), 16));
    const surfaces = hex("surface");
    const inks = hex("ink");
    // Two light themes and two night variants: a parse that finds none would pass vacuously.
    expect(surfaces.length).toBe(4);
    expect(inks.length).toBe(surfaces.length);
    const luminance = (rgb: number) => {
      const [r, g, b] = [rgb >> 16, (rgb >> 8) & 0xff, rgb & 0xff].map((c) => {
        const v = c / 255;
        return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
      });
      return 0.2126 * r + 0.7152 * g + 0.0722 * b;
    };
    const ratio = (a: number, b: number) => {
      const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
      return (hi + 0.05) / (lo + 0.05);
    };
    surfaces.forEach((surface, i) => expect(ratio(inks[i], surface)).toBeGreaterThanOrEqual(4.5));
  });
});
