import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/** Static guards over Swift sources the Windows toolchain cannot compile (the app target). */
const ROOT = path.resolve(import.meta.dirname, "../..");
const APP = "ios/LearnWithAlphonso/Sources";
const read = (f: string) => fs.readFileSync(path.join(ROOT, f), "utf8").replace(/\r\n/g, "\n");
/** From `start` up to (not including) the next match of `end` after it, or the end of the file. */
const between = (src: string, start: string, end: RegExp) => {
  const from = src.indexOf(start);
  if (from < 0) return "";
  const rest = src.slice(from);
  const stop = rest.slice(start.length).search(end);
  return stop < 0 ? rest : rest.slice(0, start.length + stop);
};
/** One top-level Swift type, up to the next top-level declaration. */
const typeBody = (src: string, header: string) =>
  between(
    src,
    header,
    /\n(?:\/\/\/|private struct|struct|final class|@MainActor|enum|extension)\b/,
  );

describe("Learn cards never depend on their own rendering to load", () => {
  const browser = read(`${APP}/LessonBrowserView.swift`);
  const mission = read(`${APP}/TeamMissionCardView.swift`);
  const teams = read(`${APP}/TeamsView.swift`);
  const sections = [
    ["TeamMissionSection", typeBody(mission, "struct TeamMissionSection")],
    ["WeeklyChallengesSection", typeBody(browser, "private struct WeeklyChallengesSection")],
    ["PlacementBannerSection", typeBody(browser, "private struct PlacementBannerSection")],
  ] as const;

  it("finds all three sections", () => {
    for (const [name, body] of sections) expect(body, name).toContain("Section {");
  });

  // An empty Group/section inside a List produces no row, so a modifier attached to it never fires and the
  // card can never load (the team mission card never appeared).
  it.each(sections)("%s attaches no .task or .onAppear (it is conditional content)", (_n, body) => {
    expect(body).not.toMatch(/\.task\b/);
    expect(body).not.toMatch(/\.onAppear\b/);
    expect(body).not.toMatch(/Group\s*\{/);
  });

  it("the Learn list loads the mission, challenges and placement check from tasks on the List", () => {
    const listTail = between(browser, ".scrollContentBackground(.hidden)", /\.navigationTitle\(/);
    expect(listTail).toContain(".task { await missionModel.load(session: session) }");
    expect(listTail).toContain(".task { await loadChallenges() }");
    expect(listTail).toContain(".task(id: course.code) { await checkPlacement() }");
  });

  it("the team screen loads the mission from a task on its List, keyed on the member count", () => {
    expect(teams).toMatch(
      /\.task\(id: [^\n]*members\.count[^\n]*\) \{ await missionModel\.load\(session: session\) \}/,
    );
    expect(teams).toContain("TeamMissionSection(mission: missionModel.mission)");
  });

  it("a cancelled mission load leaves the card as it was, and a failure shows nothing", () => {
    const load = between(mission, "func load(session: Session)", /\n {4}\}\n/);
    expect(load).toContain("guard !Task.isCancelled else { return }");
    expect(load.indexOf("guard !Task.isCancelled")).toBeLessThan(load.indexOf("mission = result"));
    expect(load).toContain("freshAccessToken()");
  });
});

describe("Largest accessibility text", () => {
  const placement = read(`${APP}/PlacementView.swift`);
  const player = read(`${APP}/LessonPlayerView.swift`);
  const name = read(`${APP}/NameOnboardingView.swift`);

  it("placement questions scroll as one column at accessibility sizes", () => {
    const body = between(placement, "private func questionBody", /\n {4}@ViewBuilder/);
    const branch = between(body, "if dynamicTypeSize.isAccessibilitySize", /\} else \{/);
    expect(branch).toContain("ScrollView");
    // header, content and footer all inside the one ScrollView
    expect(branch).toMatch(/header\s+content\s+footer/);
  });

  it("placement results scroll", () => {
    expect(between(placement, "private var resultsBody", /\n {4}private func restart/)).toContain(
      "ScrollView",
    );
  });

  it("the lesson question column and the vocabulary screen scroll as one at accessibility sizes", () => {
    expect(between(player, "private var quizBody", /private var quizColumn/)).toMatch(
      /isAccessibilitySize[\s\S]*ScrollView \{ quizColumn \}/,
    );
    expect(between(player, "private struct VocabScreen", /\n\/\/\/ The one way/)).toMatch(
      /isAccessibilitySize[\s\S]*ScrollView \{ content \}/,
    );
  });

  it("the name prompt keeps Save and Skip above the keyboard and does not open it at accessibility sizes", () => {
    expect(name).toMatch(/ToolbarItemGroup\(placement: \.keyboard\)/);
    expect(name).toContain("fieldFocused = !dynamicTypeSize.isAccessibilitySize");
    expect(name).not.toMatch(/onAppear \{ fieldFocused = true \}/);
  });
});

describe("Name prompt prefill", () => {
  const name = read(`${APP}/NameOnboardingView.swift`);
  it("shows the handle as the placeholder, not as typed text, and can clear a real prefill", () => {
    expect(name).toContain("TextField(state.fieldPlaceholder");
    expect(name).toContain('.accessibilityLabel("Clear name")');
  });
  it("keeps the skip copy", () => {
    expect(name).toContain("NameOnboardingCopy.skipNote(currentName: state.currentName)");
  });
});

describe("Lesson finish headline", () => {
  const player = read(`${APP}/LessonPlayerView.swift`);
  it("comes from the score, not a fixed string", () => {
    const finish = typeBody(player, "private struct FinishView");
    expect(finish).toContain("LessonFinishCopy.headline(correct: correct, total: total)");
    expect(finish).not.toContain('message: "Nice work!"');
  });
});

describe("Accessibility labels", () => {
  it("decorative symbols are hidden instead of reading as Favorite", () => {
    const placement = read(`${APP}/PlacementView.swift`);
    expect(between(placement, 'Image(systemName: "star.fill")', /\.background/)).toContain(
      ".accessibilityHidden(true)",
    );
    const ach = read(`${APP}/AchievementsView.swift`);
    expect(between(ach, "Image(systemName: symbolName)", /Text\(achievement\.title\)/)).toContain(
      ".accessibilityHidden(true)",
    );
    expect(ach).toContain('.accessibilityValue(unlocked ? "Unlocked" : "Locked")');
  });

  it("the League header controls are labelled and expose the selected value", () => {
    const league = read(`${APP}/LeaderboardView.swift`);
    expect(league).toContain('.accessibilityLabel("Leaderboard scope")');
    expect(league).toContain(".accessibilityValue(scopeName)");
    expect(league).toContain('.accessibilityLabel("Leaderboard period")');
    expect(league).toContain(".accessibilityValue(periodName)");
    expect(league).toContain('.accessibilityLabel("Teams")');
    expect(league).toContain('.accessibilityLabel("Season")');
  });
});

describe("A block takes effect everywhere at once", () => {
  const files = ["TeamsView", "LeaderboardView", "FriendsView", "DuelsView", "BuddySectionView"];
  it.each(files)("%s announces a successful block", (f) => {
    expect(read(`${APP}/${f}.swift`)).toContain("BlockedUserSignal.post(userID:");
  });
  it("the League list drops the person the moment any screen blocks them", () => {
    const league = read(`${APP}/LeaderboardView.swift`);
    const handler = between(league, "publisher(for: BlockedUserSignal.name)", /\n {8}\.onChange/);
    expect(handler).toContain("rows.removeAll { $0.userID == blocked }");
  });
});

describe("Podcast resume", () => {
  it("play() starts from the position this device last stored, not the list snapshot", () => {
    const src = read(`${APP}/PodcastAudioPlayer.swift`);
    const play = between(
      src,
      "func play(_ episode: PodcastEpisode",
      /\n {4}\/\/\/ The error banner/,
    );
    expect(play).toContain("let episode = savedPositions.applying(to: episode)");
    expect(src).toContain("self.savedPositions.record(");
    expect(src).toContain("savedPositions.reset()");
  });
  it("the folder list shows Resume from the same source", () => {
    expect(read(`${APP}/ListenView.swift`)).toContain("subtitle(for: player.resumed(episode))");
  });
});
