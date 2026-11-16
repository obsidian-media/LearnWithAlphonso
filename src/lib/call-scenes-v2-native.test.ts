import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { SCENARIOS } from "@/data/scenarios";
import { NIGHT_SCENES } from "./scenes";

/**
 * Call scenes v2 and the Royal-night rooms on iOS and Android: the same bytes as the web ships, the call reading its
 * own call-*.webp files, campaigns keeping the old ones, Alphonso's bottom fading out, and Meadow never taking a night
 * picture. The Swift and Kotlin cannot be built on every machine, so the source is pinned here as well as unit-tested
 * in the Kit and in :core.
 */
const root = path.resolve(import.meta.dirname, "../..");
const read = (p: string) => fs.readFileSync(path.join(root, p), "utf8").replace(/\r\n/g, "\n");
const bytes = (p: string) => fs.readFileSync(path.join(root, p));

const WEB_CALL = "public/avatar/scenes";
const IOS_CALL = "ios/LearnWithAlphonso/AlphonsoScenes";
const ANDROID_CALL = "android/LearnWithAlphonso/app/src/main/assets/scenes";
const WEB_NIGHT = "public/scenes";
const IOS_SETS = "ios/LearnWithAlphonso/Sources/Assets.xcassets";
const ANDROID_NIGHT = "android/LearnWithAlphonso/app/src/main/assets/screen-scenes";

const callNames = [...SCENARIOS.map((s) => s.id), "room-light", "room-dark"].map(
  (n) => `call-${n}.webp`,
);

describe("the call pictures are the same bytes on all three platforms", () => {
  it("has call-<scenario>.webp for all 12 scenarios and the study room day and evening", () => {
    expect(SCENARIOS).toHaveLength(12);
    expect(callNames).toHaveLength(14);
    for (const f of callNames) {
      const web = bytes(`${WEB_CALL}/${f}`);
      expect(bytes(`${IOS_CALL}/${f}`).equals(web), `ios ${f}`).toBe(true);
      expect(bytes(`${ANDROID_CALL}/${f}`).equals(web), `android ${f}`).toBe(true);
    }
  });

  it("keeps the old room files beside them, untouched, for lessons and campaigns", () => {
    for (const s of SCENARIOS) {
      for (const dir of [WEB_CALL, IOS_CALL, ANDROID_CALL])
        expect(fs.existsSync(path.join(root, dir, `${s.id}.webp`)), `${dir}/${s.id}`).toBe(true);
    }
  });
});

describe("the Royal-night rooms are the same bytes on all three platforms", () => {
  it("ships night-<scene>.jpg for the five scenes, and none for Lesson complete", () => {
    expect([...NIGHT_SCENES].sort()).toEqual(["hector", "learn", "listen", "practice", "profile"]);
    for (const n of NIGHT_SCENES) {
      const web = bytes(`${WEB_NIGHT}/night-${n}.jpg`);
      expect(bytes(`${ANDROID_NIGHT}/night-${n}.jpg`).equals(web), `android ${n}`).toBe(true);
      expect(
        bytes(`${IOS_SETS}/SceneNight-${n}.imageset/SceneNight-${n}.jpg`).equals(web),
        `ios ${n}`,
      ).toBe(true);
      expect(
        JSON.parse(read(`${IOS_SETS}/SceneNight-${n}.imageset/Contents.json`)).images[0].filename,
      ).toBe(`SceneNight-${n}.jpg`);
    }
    for (const dir of [WEB_NIGHT, ANDROID_NIGHT])
      expect(fs.existsSync(path.join(root, dir, "night-complete.jpg"))).toBe(false);
    expect(fs.existsSync(path.join(root, IOS_SETS, "SceneNight-complete.imageset"))).toBe(false);
  });
});

describe("iOS reads them", () => {
  const kit = read("ios/LearnWithAlphonsoKit/Sources/LearnWithAlphonsoKit/AvatarCall.swift");
  const view = read("ios/LearnWithAlphonso/Sources/PracticeCallView.swift");
  const scene = read("ios/LearnWithAlphonso/Sources/DesignSystem/ScreenScene.swift");

  it("points the call at call-<id> and the study room at call-room-*", () => {
    expect(kit).toContain("callFile(scenarioID)");
    expect(kit).toContain(
      'CallRoom(light: "call-room-light", dark: "call-room-dark", dimInDark: false)',
    );
  });

  it("gives a campaign scene its older room file through campaignRoom, and the campaign view says so", () => {
    expect(view).toContain(
      "CallScenes.campaignRoom(for: scenarioID, known: PracticeHub.sceneRoomNames",
    );
    expect(view).toContain("CallScenes.room(for: scenarioID, fallback: kit.defaultRoom)");
    expect(view).toContain("known: PracticeHub.sceneRoomNames, fallback: CallScenes.studyRoom)");
    expect(read("ios/LearnWithAlphonso/Sources/CampaignView.swift")).toMatch(
      /PracticeHub\.room\(campaignID: campaign\.id, sceneID: scene\.id\), campaignRoom: true/,
    );
    for (const f of ["ConversationView.swift", "HectorView.swift"])
      expect(read(`ios/LearnWithAlphonso/Sources/${f}`), f).not.toContain("campaignRoom: true");
  });

  it("fades Alphonso's bottom from 80% without moving or resizing him", () => {
    expect(view).toContain("CallScenes.avatarFadeStart");
    expect(view).toMatch(/\.mask\(\s*LinearGradient\(/);
    expect(view).toContain(".frame(width: side, height: side)");
    expect(view).toContain(".position(x: width / 2, y: height * 0.15 + side / 2)");
    expect(kit).toContain("avatarFadeStart = 0.8");
  });

  it("picks the night picture only through the Kit's rule, and keeps clips and Lesson complete on day art", () => {
    expect(scene).toContain("ScreenSceneArt.assetName(scene: rawValue, night: night)");
    expect(scene).toContain(
      "night && clip == nil && ScreenSceneArt.nightScenes.contains(scene.rawValue)",
    );
    expect(scene).toContain("scene.assetName(night: showsNightPicture)");
    expect(scene).toContain("paletteID.usesNight(deviceDark: colorScheme == .dark)");
  });

  it("lists the five night scenes in the Kit exactly as the web does", () => {
    const kitScenes = read(
      "ios/LearnWithAlphonsoKit/Sources/LearnWithAlphonsoKit/ScreenSceneArt.swift",
    );
    for (const n of NIGHT_SCENES) expect(kitScenes, n).toContain(`"${n}"`);
    expect(kitScenes).not.toContain('"complete"');
  });
});

describe("Android reads them", () => {
  const core = read(
    "android/LearnWithAlphonso/core/src/main/kotlin/com/obsidianmedia/learnwithalphonso/core/avatar/AvatarCall.kt",
  );
  const screen = read(
    "android/LearnWithAlphonso/app/src/main/java/com/obsidianmedia/learnwithalphonso/ui/practice/call/PracticeCallScreen.kt",
  );
  const blocks = read(
    "android/LearnWithAlphonso/app/src/main/java/com/obsidianmedia/learnwithalphonso/ui/components/DsBlocks.kt",
  );

  it("points the call at call-<id> and the study room at call-room-*", () => {
    expect(core).toContain(
      "CallRoom(callFile(scenarioId), callFile(scenarioId), dimInDark = true)",
    );
    expect(core).toContain('CallRoom("call-room-light", "call-room-dark", dimInDark = false)');
  });

  it("gives a campaign scene its older room file through campaignRoom", () => {
    expect(screen).toContain("CallScenes.campaignRoom(scenarioId, known =");
    // A campaign that falls back keeps room-light/room-dark, not the call's own room.
    expect(screen).toContain("fallback = CallScenes.studyRoom)");
    expect(core).toContain(
      'val studyRoom = CallRoom("room-light", "room-dark", dimInDark = false)',
    );
    expect(screen).toContain("CallScenes.room(scenarioId, fallback = kit.defaultRoom)");
    expect(
      read(
        "android/LearnWithAlphonso/app/src/main/java/com/obsidianmedia/learnwithalphonso/ui/practice/PracticeScreens.kt",
      ),
    ).toMatch(/PracticeHub\.room\(campaign\.id, vm\.scene\.id\), campaignRoom = true/);
  });

  it("fades Alphonso's bottom from 80% without moving or resizing him", () => {
    expect(core).toContain("AVATAR_FADE_START = 0.8f");
    expect(screen).toContain(
      "CallScenes.AVATAR_FADE_START to Color.Black, 1f to Color.Transparent",
    );
    expect(screen).toContain("blendMode = BlendMode.DstIn");
    expect(screen).toContain(
      "Modifier.offset(x = (w - side) / 2, y = h * 0.15f).size(side).avatarBottomFade().clearAndSetSemantics {}",
    );
  });

  it("picks the night picture only for Royal night (palette.isDark), through the shared rule", () => {
    expect(blocks).toContain("val night = AlphonsoColor.palette.isDark");
    expect(blocks).toContain("ScreenSceneArt.assetPath(scene.file, night)");
    const art = read(
      "android/LearnWithAlphonso/core/src/main/kotlin/com/obsidianmedia/learnwithalphonso/core/avatar/ScreenSceneArt.kt",
    );
    for (const n of NIGHT_SCENES) expect(art, n).toContain(`"${n}"`);
    expect(art).not.toContain('"complete"');
  });
});

describe("the web", () => {
  it("never gives Meadow a night picture: night is the data-ds-mode attribute, which Meadow never carries", () => {
    const theme = read("src/lib/theme.ts");
    expect(theme).toContain('mode: theme === "royal" && nightRequested ? "night" : "light"');
    expect(read("src/lib/use-night.ts")).toContain('dataset.dsMode === "night"');
  });
});
