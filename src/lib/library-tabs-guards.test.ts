import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

// Text guards for the Library's All / Listen / Watch / Stories tabs on iOS and Android, whose app targets only compile in
// CI (macOS and Gradle) and have no unit tests of their own. Web is covered by component tests (ListenLibrary.test.tsx).
const ROOT = path.resolve(import.meta.dirname, "../..");
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), "utf8");
const code = (text: string) => text.replace(/^\s*\/\/[^\n]*$/gm, "");

const IOS = "ios/LearnWithAlphonso/Sources";
const KT = "android/LearnWithAlphonso/app/src/main/java/com/obsidianmedia/learnwithalphonso/ui";
const ART = "continue-studio.webp";

describe("the Continue card art", () => {
  it("is one square webp, byte-identical on web, iOS and Android, and small", () => {
    const web = fs.readFileSync(path.join(ROOT, "public/avatar/scenes", ART));
    expect(
      fs.readFileSync(path.join(ROOT, "ios/LearnWithAlphonso/AlphonsoScenes", ART)).equals(web),
    ).toBe(true);
    expect(
      fs
        .readFileSync(path.join(ROOT, "android/LearnWithAlphonso/app/src/main/assets/scenes", ART))
        .equals(web),
    ).toBe(true);
    expect(web.length).toBeLessThan(300 * 1024);
    // RIFF....WEBP then a VP8 chunk: width and height are 14-bit fields; both must be 1200 (square, not pre-cropped).
    expect(web.subarray(0, 4).toString()).toBe("RIFF");
    expect(web.subarray(8, 12).toString()).toBe("WEBP");
    const fourcc = web.subarray(12, 16).toString();
    let w = 0;
    let h = 0;
    if (fourcc === "VP8 ") {
      w = web.readUInt16LE(26) & 0x3fff;
      h = web.readUInt16LE(28) & 0x3fff;
    } else if (fourcc === "VP8X") {
      w = (web[24]! | (web[25]! << 8) | (web[26]! << 16)) + 1;
      h = (web[27]! | (web[28]! << 8) | (web[29]! << 16)) + 1;
    }
    expect([w, h]).toEqual([1200, 1200]);
  });
});

describe("iOS Library tabs", () => {
  const shelf = () => code(read(`${IOS}/ListenShelfViews.swift`));
  const kit = () =>
    code(read("ios/LearnWithAlphonsoKit/Sources/LearnWithAlphonsoKit/LibraryTab.swift"));

  it("the Kit owns the four tabs in order, and the Continue card's one spoken label", () => {
    expect(kit()).toMatch(/case all, listen, watch, stories/);
    expect(kit()).toContain(
      '"Continue \\(series), episode \\(number) of \\(count): \\(title), \\(detail)"',
    );
  });

  it("the sub-tabs are chips with the selected state, remembered for the session only", () => {
    const text = shelf();
    expect(text).toContain("ForEach(LibraryTab.allCases");
    expect(text).toContain(
      'DSChip(item.title, selected: tab == item, accessibilityText: "\\(item.title) tab")',
    );
    expect(text).toContain("@State private var tab: LibraryTab = LibrarySession.tab");
    expect(text).toContain("LibrarySession.tab = next");
    // Session memory, not persisted: no UserDefaults or AppStorage for the tab.
    expect(text).not.toMatch(/AppStorage|UserDefaults/);
  });

  it("All draws the Continue card from the existing resume logic plus Watch and Stories peeks with See all", () => {
    const text = shelf();
    expect(text).toContain("ListenShelf.continueListening(all, progress: progress)");
    expect(text).toContain("if tab == .all, let target {");
    expect(text).toContain("onSeeAll: { select(.watch) }");
    expect(text).toContain("onSeeAll: { select(.stories) }");
    expect(text).toContain('RoomBackdrop(room: "continue-studio")');
    expect(text).toContain("LibraryTab.continueLabel(series: target.shelf.folder.title");
  });

  it("the Watch host stays at one place in the stack so its sheet and the path deep link survive a tab switch", () => {
    const text = shelf();
    const root = text.slice(
      text.indexOf("struct ListenShelfRoot"),
      text.indexOf("struct WatchShelfHost"),
    );
    expect(root.split("WatchShelfHost(").length - 1).toBe(1);
    expect(root).toContain("case .listen, .stories: return .hidden");
  });

  it("Listen keeps the rooms and level chips (no month stat on iOS); the other tabs do not draw them", () => {
    const text = shelf();
    const root = text.slice(
      text.indexOf("struct ListenShelfRoot"),
      text.indexOf("struct WatchShelfHost"),
    );
    const listen = root.slice(root.indexOf("if tab == .listen {"));
    expect(listen).not.toContain("monthChip");
    expect(listen).toContain("LazyVGrid(");
    expect(listen).toContain("ListenShelfDetail(");
    expect(root.slice(0, root.indexOf("if tab == .listen {"))).not.toContain("LazyVGrid(");
  });

  it("posters say new, in progress or watched plus the length, from the rows' own states", () => {
    const text = shelf();
    expect(text).toContain("VideoShelf.state(video)");
    expect(text).toContain(
      'state == .done ? "watched" : state == .inProgress ? "in progress" : "new"',
    );
    expect(text).toContain('.accessibilityLabel("\\(video.title), \\(length), \\(stateWord)")');
    expect(text).toContain('Text("NEW")');
  });

  it("the stories section loads from an always-present anchor and labels branching stories through Stories.status", () => {
    const views = code(read(`${IOS}/StoriesViews.swift`));
    const section = views.slice(
      views.indexOf("struct StoriesSection"),
      views.indexOf("// MARK: - Reader"),
    );
    expect(section).toMatch(/Color\.clear[\s\S]*?\.task\(id: course\) \{ await load\(\) \}/);
    expect(section).toMatch(/\n\s*loadAnchor\n/);
    expect(section).toContain("Stories.status(story)");
    // The narrator and the reader were not touched by this change.
    expect(views).toContain("final class StoryNarrator");
  });
});

describe("Android Library tabs", () => {
  const shelf = () => code(read(`${KT}/listen/ListenShelfUi.kt`));

  it("has four tabs with the Tab role and the selected state, remembered for the session only", () => {
    const text = shelf();
    expect(text).toContain('All("All"), Listen("Listen"), Watch("Watch"), Stories("Stories")');
    expect(text).toContain(".selectable(selected = on, role = Role.Tab");
    expect(text).toContain('contentDescription = "${item.title} tab"');
    expect(text).toContain("var tab by remember { mutableStateOf(LibrarySession.tab) }");
    expect(text).toContain("LibrarySession.tab = next");
    expect(text).not.toMatch(/rememberSaveable\(\)?\s*\{\s*mutableStateOf\(LibraryTab/);
  });

  it("All draws the Continue card from the existing resume logic plus peeks with See all", () => {
    const text = shelf();
    expect(text).toContain("ListenShelf.continueListening(shelves, state.progress)");
    expect(text).toContain("onSeeAll = { select(LibraryTab.Watch) }");
    expect(text).toContain("select(LibraryTab.Stories)");
    expect(text).toContain('RoomImage("continue-studio"');
    expect(text).toContain(
      'contentDescription = "Continue ${t.shelf.folder.title}, episode $number of $count: ${t.episode.title}, $detail"',
    );
  });

  it("the Watch sheet and deep link stay mounted on every tab; Listen alone holds the rooms", () => {
    const text = shelf();
    const root = text.slice(
      text.indexOf("fun ListenShelfRoot"),
      text.indexOf("private fun LibraryFailedCard"),
    );
    expect(root.split("rememberWatchSheet(").length - 1).toBe(1);
    const afterListen = root.slice(
      root.indexOf("LibraryTab.Listen ->"),
      root.indexOf("LibraryTab.Watch ->"),
    );
    expect(afterListen).toContain("RoomTile(shelf, Modifier.weight(1f))");
    expect(root.slice(0, root.indexOf("LibraryTab.Listen ->"))).not.toContain("RoomTile(");
    expect(root).toContain("LibraryTab.Stories -> storiesFullItems(stories, course, onOpenStory)");
  });

  it("posters say new, in progress or watched plus the length, from the rows' own states", () => {
    const watch = code(read(`${KT}/listen/WatchShelfUi.kt`));
    expect(watch).toContain('contentDescription = "${video.title}, $length, $word"');
    expect(watch).toContain('VideoState.NEW -> "new"');
    expect(watch).toContain('Text("NEW"');
  });

  it("a tapped story opens its reader from the Library", () => {
    const root = code(read(`${KT}/RootScreen.kt`));
    expect(root).toContain("onOpenStory = { nav.navigate(Routes.story(it)) }");
    const stories = code(read(`${KT}/listen/StoriesUi.kt`));
    expect(stories).toContain("Stories.status(story)");
    expect(stories).toContain("internal class StoryNarrator(");
  });
});
