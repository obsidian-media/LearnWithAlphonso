import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { yamlSetting, yamlTarget } from "./ios-project-yml";
import { BOOT_SPLASH_FALLBACK_COLOR } from "./boot-splash";

/**
 * The owner's picks from the build 72 feedback (mock: renders-2026-11-19/b72-feedback-mocks), pinned across web, iOS and
 * Android so one platform cannot drift from the others. Native views cannot run here, so what they must do is read from
 * the source and the assets.
 */
const root = path.resolve(import.meta.dirname, "../..");
const read = (rel: string) => fs.readFileSync(path.join(root, rel), "utf8");
const exists = (rel: string) => fs.existsSync(path.join(root, rel));

/** The Royal hero colour, from the one place the tokens are defined: the first "hero" in design/tokens.json. */
const heroHex = /"hero":\s*"(#[0-9A-Fa-f]{6})"/.exec(read("design/tokens.json"))![1].toUpperCase();

const ANDROID = "android/LearnWithAlphonso/app/src/main";
const IOS = "ios/LearnWithAlphonso";

describe("pick 1: the launch screen is the brand colour and the app icon, on every platform", () => {
  it("the hero colour is the one the launch screens use", () => {
    expect(heroHex).toBe("#1D2B64");
    expect(BOOT_SPLASH_FALLBACK_COLOR.toUpperCase()).toBe(heroHex);
  });

  it("iOS: Info.plist has a UILaunchScreen dict (colour set + icon image), and the generated blank one is gone", () => {
    const plist = read(`${IOS}/Info.plist`);
    expect(plist).toMatch(
      /<key>UILaunchScreen<\/key>\s*<dict>\s*<key>UIColorName<\/key>\s*<string>LaunchBackground<\/string>\s*<key>UIImageName<\/key>\s*<string>LaunchIcon<\/string>\s*<\/dict>/,
    );
    const target = yamlTarget(read(`${IOS}/project.yml`), "LearnWithAlphonso");
    expect(yamlSetting(target, "INFOPLIST_KEY_UILaunchScreen_Generation")).toBeNull();
    expect(yamlSetting(target, "INFOPLIST_FILE")).toBe("Info.plist");
  });

  it("iOS: the LaunchBackground colour set is the Royal hero and LaunchIcon ships at 1x, 2x and 3x", () => {
    const set = JSON.parse(
      read(`${IOS}/Sources/Assets.xcassets/LaunchBackground.colorset/Contents.json`),
    ) as {
      colors: { color: { components: Record<string, string> } }[];
    };
    const c = set.colors[0].color.components;
    const hex = ["red", "green", "blue"]
      .map((k) => parseInt(c[k], 16).toString(16).padStart(2, "0"))
      .join("")
      .toUpperCase();
    expect(`#${hex}`).toBe(heroHex);
    for (const f of ["LaunchIcon.png", "LaunchIcon@2x.png", "LaunchIcon@3x.png"])
      expect(exists(`${IOS}/Sources/Assets.xcassets/LaunchIcon.imageset/${f}`), f).toBe(true);
  });

  it("iOS: the restoring view in RootView draws the same colour set and icon, not the theme surface", () => {
    const root_ = read(`${IOS}/Sources/RootView.swift`);
    const restoring = root_.slice(root_.indexOf("} else if session.isRestoring {"));
    expect(restoring.slice(0, restoring.indexOf("} else {"))).toContain("LaunchRestoringView()");
    const view = root_.slice(root_.indexOf("struct LaunchRestoringView"));
    expect(view).toContain('Color("LaunchBackground")');
    expect(view).toContain('Image("LaunchIcon")');
    expect(view).not.toMatch(/AlphonsoDS\.current\.surface|ds\.surface/);
  });

  it("Android: the SplashScreen API (core-splashscreen) with the same colour and the app icon", () => {
    expect(read("android/LearnWithAlphonso/gradle/libs.versions.toml")).toContain(
      "androidx.core:core-splashscreen",
    );
    expect(read("android/LearnWithAlphonso/app/build.gradle.kts")).toContain(
      "libs.androidx.core.splashscreen",
    );
    const colors = read(`${ANDROID}/res/values/colors.xml`);
    expect(/name="launch_background">(#[0-9A-Fa-f]{6})</.exec(colors)![1].toUpperCase()).toBe(
      heroHex,
    );
    const themes = read(`${ANDROID}/res/values/themes.xml`);
    expect(themes).toMatch(/name="Theme\.Alphonso\.Starting" parent="Theme\.SplashScreen"/);
    expect(themes).toContain('name="windowSplashScreenBackground">@color/launch_background');
    expect(themes).toContain('name="windowSplashScreenAnimatedIcon">@drawable/launch_icon');
    expect(themes).toContain('name="postSplashScreenTheme">@style/Theme.Alphonso');
    expect(read(`${ANDROID}/AndroidManifest.xml`)).toMatch(
      /android:name="\.MainActivity"[\s\S]*?android:theme="@style\/Theme\.Alphonso\.Starting"/,
    );
    expect(read(`${ANDROID}/java/com/obsidianmedia/learnwithalphonso/MainActivity.kt`)).toContain(
      "installSplashScreen()",
    );
    expect(exists(`${ANDROID}/res/drawable/launch_icon.xml`)).toBe(true);
    expect(exists(`${ANDROID}/res/drawable-nodpi/launch_icon_art.png`)).toBe(true);
  });

  it("Android: the in-app restoring view draws the same colour and icon", () => {
    const screen = read(`${ANDROID}/java/com/obsidianmedia/learnwithalphonso/ui/RootScreen.kt`);
    expect(screen).toContain("isRestoring -> LaunchRestoringView()");
    const view = screen.slice(screen.indexOf("internal fun LaunchRestoringView"));
    expect(view).toContain("R.color.launch_background");
    expect(view).toContain("R.drawable.launch_icon_art");
  });

  it("web: the manifest background and the boot splash are the same colour", () => {
    const manifest = JSON.parse(read("public/site.webmanifest")) as { background_color: string };
    expect(manifest.background_color.toUpperCase()).toBe(heroHex);
  });
});

describe("pick 2: the Library All tab has a Podcasts rail, and the course is a compact EN chip", () => {
  it("web: the rail comes before Watch and Stories, and the full-width course control is gone", () => {
    const lib = read("src/components/ListenLibrary.tsx");
    expect(lib).toContain("<PodcastsRail");
    expect(lib.indexOf("<PodcastsRail library")).toBeLessThan(lib.indexOf("<WatchShelf\n"));
    expect(lib).toContain("<CourseChip");
    expect(lib).not.toMatch(/role="group"\s+aria-label="Course"/);
  });

  it("iOS: the rail comes before Watch, 'See all' opens Listen, and the course is a Menu chip", () => {
    const shelf = read(`${IOS}/Sources/ListenShelfViews.swift`);
    expect(shelf.indexOf("podcastsRail(all)")).toBeGreaterThan(-1);
    expect(shelf.indexOf("podcastsRail(all)")).toBeLessThan(
      shelf.indexOf("WatchShelfHost(session:"),
    );
    expect(shelf).toContain('Button("See all") { select(.listen) }');
    expect(shelf).toContain("courseChip");
    expect(shelf).not.toContain("DSSegmented(");
  });

  it("Android: the rail comes before Watch, 'See all' opens Listen, and the course is a DropdownMenu chip", () => {
    const shelf = read(
      `${ANDROID}/java/com/obsidianmedia/learnwithalphonso/ui/listen/ListenShelfUi.kt`,
    );
    expect(shelf).toContain(
      "PodcastsRailSection(shelves, onOpenFolder) { select(LibraryTab.Listen) }",
    );
    expect(shelf.indexOf("PodcastsRailSection(shelves, onOpenFolder)")).toBeLessThan(
      shelf.indexOf('item(key = "watch")'),
    );
    expect(shelf).toContain("CourseChip(course) { course = it }");
    expect(shelf).not.toContain("DsSegmented(");
  });
});

describe("pick 4: Practice cards show real art on every platform", () => {
  it("the two vocab photos are bundled as small thumbnails everywhere", () => {
    for (const w of ["coffee", "train"]) {
      for (const rel of [
        `public/practice/say-the-picture-${w}.jpg`,
        `${IOS}/Sources/Assets.xcassets/PracticePhoto-${w}.imageset/PracticePhoto-${w}.jpg`,
        `${ANDROID}/res/drawable-nodpi/practice_photo_${w}.jpg`,
      ]) {
        expect(exists(rel), rel).toBe(true);
        expect(fs.statSync(path.join(root, rel)).size, `${rel} is a thumbnail`).toBeLessThan(
          30 * 1024,
        );
      }
    }
  });

  it("Say it right uses the approved listening-headphones pose, already bundled on each platform", () => {
    expect(exists("public/figures/alphonso-listening-headphones.webp")).toBe(true);
    expect(
      exists(
        `${IOS}/Sources/Assets.xcassets/Alphonso-listening-headphones.imageset/Alphonso-listening-headphones.png`,
      ),
    ).toBe(true);
    expect(exists(`${ANDROID}/assets/poses/alphonso-listening-headphones.webp`)).toBe(true);
  });

  it("iOS: the cards use the new art, in the right and choice tokens", () => {
    const hub = read(`${IOS}/Sources/PracticeHubView.swift`);
    expect(hub).toContain("PracticeSayPictureArt()");
    expect(hub).toContain("PracticeSayItRightArt()");
    expect(hub).toContain('"PracticePhoto-train"');
    expect(hub).toContain('"PracticePhoto-coffee"');
    expect(hub).toContain('Image("Alphonso-listening-headphones")');
    expect(hub).toContain("ds.onRight");
    expect(hub).not.toContain('systemName: "waveform"');
  });

  it("Android: the cards use the new art, in the right and choice tokens", () => {
    const hub = read(
      `${ANDROID}/java/com/obsidianmedia/learnwithalphonso/ui/practice/PracticeHubScreen.kt`,
    );
    expect(hub).toContain("SayPictureArt()");
    expect(hub).toContain("SayItRightArt()");
    expect(hub).toContain("R.drawable.practice_photo_train");
    expect(hub).toContain("R.drawable.practice_photo_coffee");
    expect(hub).toContain("poses/alphonso-listening-headphones.webp");
    expect(hub).toContain("ds.onRight");
    expect(hub).not.toContain("Icons.Filled.GraphicEq");
  });
});

describe("pick 5: Quick practice re-asks say they are not scored, with the same accessibility label", () => {
  const LABEL = "Practice, not scored";

  it("web: the tag sits only behind isReinforcing and carries the label", () => {
    const lesson = read("src/routes/_authenticated/lesson.$id.tsx");
    expect(lesson).toMatch(
      /\{isReinforcing && \(\s*<span\s+role="img"\s+aria-label="Practice, not scored"/,
    );
    expect(lesson).toContain("Practice · not scored");
  });

  it("iOS: the tag is shown only when reinforcing and VoiceOver reads the label", () => {
    const player = read(`${IOS}/Sources/LessonPlayerView.swift`);
    expect(player).toContain("if isReinforcing { PracticeNotScoredTag() }");
    expect(player).toContain(`.accessibilityLabel("${LABEL}")`);
    // The same rule that skips scoring: recordAnswer returns early for a reinforcement round.
    expect(player).toMatch(/guard !isReinforcing else \{ return false \}/);
  });

  it("Android: the tag is shown only when reinforcing and TalkBack reads the label", () => {
    const stage = read(
      `${ANDROID}/java/com/obsidianmedia/learnwithalphonso/ui/lesson/LessonStageQuestion.kt`,
    );
    expect(stage).toContain("if (isReinforcing) PracticeNotScoredTag()");
    expect(stage).toContain(`contentDescription = "${LABEL}"`);
    const vm = read(
      `${ANDROID}/java/com/obsidianmedia/learnwithalphonso/ui/lesson/LessonViewModel.kt`,
    );
    expect(vm).toContain("if (s.isReinforcing) return");
  });
});

describe("pick 3 (code side): linear story covers come from the story-art bucket by convention", () => {
  it("all three platforms use <course>/<slug>/cover.jpg, and only a cached existence check decides", () => {
    expect(read("src/lib/stories.ts")).toContain("`${course}/${slug}/cover.jpg`");
    expect(read(`${IOS}Kit/Sources/LearnWithAlphonsoKit/Stories.swift`)).toContain(
      '"\\(course)/\\(slug)/cover.jpg"',
    );
    expect(
      read(
        "android/LearnWithAlphonso/core/src/main/kotlin/com/obsidianmedia/learnwithalphonso/core/podcast/Stories.kt",
      ),
    ).toContain('"$course/$slug/cover.jpg"');
  });

  it("each platform asks with a HEAD (never a download) through its cache", () => {
    expect(read("src/lib/story-cover-probe.ts")).toContain('method: "HEAD"');
    expect(read(`${IOS}Kit/Sources/LearnWithAlphonsoKit/Stories.swift`)).toContain(
      'request.httpMethod = "HEAD"',
    );
    expect(
      read(
        "android/LearnWithAlphonso/core/src/main/kotlin/com/obsidianmedia/learnwithalphonso/core/net/SupabaseHttp.kt",
      ),
    ).toContain("HttpMethod.Head");
  });
});
