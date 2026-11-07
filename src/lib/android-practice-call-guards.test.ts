import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { SCENARIOS } from "@/data/scenarios";

/**
 * Source guards for the full-screen Practice call on Android. The Compose cannot be built on every machine, so what
 * must not regress is pinned here: a picture for every scenario id, the art being the same art as iOS and web, and
 * the TalkBack contract.
 */
const root = path.resolve(import.meta.dirname, "../..");
const read = (p: string) => fs.readFileSync(path.join(root, p), "utf8").replace(/\r\n/g, "\n");
const code = (p: string) => read(p).replace(/\/\/.*$/gm, "");

const ASSETS = "android/LearnWithAlphonso/app/src/main/assets";
const CALL =
  "android/LearnWithAlphonso/app/src/main/java/com/obsidianmedia/learnwithalphonso/ui/practice/call";
const IOS_ART = "ios/LearnWithAlphonso/AlphonsoAvatar";
const HECTOR =
  "android/LearnWithAlphonso/app/src/main/java/com/obsidianmedia/learnwithalphonso/ui/hector";

describe("the rooms", () => {
  it("has a picture for every scenario in src/data/scenarios.ts, so a new scenario cannot ship without one", () => {
    const files = new Set(fs.readdirSync(path.join(root, ASSETS, "scenes")));
    for (const s of SCENARIOS) expect(files.has(`${s.id}.webp`), s.id).toBe(true);
    expect(files.has("room-light.webp")).toBe(true);
    expect(files.has("room-dark.webp")).toBe(true);
  });

  it("lists every scenario in the core lookup", () => {
    const core = code(
      "android/LearnWithAlphonso/core/src/main/kotlin/com/obsidianmedia/learnwithalphonso/core/avatar/AvatarCall.kt",
    );
    for (const s of SCENARIOS) expect(core, s.id).toContain(`"${s.id}"`);
  });

  it("is the same art, byte for byte, as iOS bundles", () => {
    for (const f of fs.readdirSync(path.join(root, IOS_ART)))
      expect(
        fs
          .readFileSync(path.join(root, ASSETS, "avatar", f))
          .equals(fs.readFileSync(path.join(root, IOS_ART, f))),
        f,
      ).toBe(true);
    for (const f of fs.readdirSync(path.join(root, ASSETS, "scenes")))
      expect(
        fs
          .readFileSync(path.join(root, ASSETS, "scenes", f))
          .equals(fs.readFileSync(path.join(root, "public/avatar/scenes", f))),
        f,
      ).toBe(true);
  });
});

describe("the call screen", () => {
  const screen = code(`${CALL}/PracticeCallScreen.kt`);
  it("hides the character, the room and the You tile from TalkBack", () => {
    expect((screen.match(/clearAndSetSemantics \{\}/g) ?? []).length).toBeGreaterThanOrEqual(4);
    expect(screen).toMatch(/modifier = Modifier\.offset[^\n]*clearAndSetSemantics \{\}/);
  });
  it("announces the state pill (Listening / Thinking / Speaking) as a polite live region", () => {
    expect(screen).toContain(
      "clearAndSetSemantics { liveRegion = LiveRegionMode.Polite; contentDescription = mode.callLabel }",
    );
  });
  it("labels the three call buttons and the sheet", () => {
    for (const label of ["Hold to talk", "Show the conversation", "End the call", "Back to call"])
      expect(screen).toContain(`"${label}"`);
  });
  it("makes the caption a polite live region of its plain text, held to four lines", () => {
    expect(screen).toContain(
      "clearAndSetSemantics { liveRegion = LiveRegionMode.Polite; contentDescription = caption.text }",
    );
    const caption = screen.slice(
      screen.indexOf("private fun Caption("),
      screen.indexOf("private fun Controls("),
    );
    expect(caption).toContain("maxLines = 4");
    expect(caption).toMatch(
      /if \(caption\.mine \|\| mode != AvatarMode\.SPEAKING\) return@produceState/,
    );
  });
  it("gives TalkBack a way to talk: the hold-to-talk button has a click action that toggles", () => {
    const controls = screen.slice(
      screen.indexOf("private fun Controls("),
      screen.indexOf("private fun RoundButton("),
    );
    expect(controls).toContain("role = Role.Button");
    expect(controls).toMatch(
      /onClick\(label = .*?\) \{\s*if \(recording\) onPressEnded\(\) else onPressBegan\(\)/,
    );
    expect(controls).toContain("disabled()");
  });
  it("holds the avatar square to 72% of the height so the controls stay clear of his mouth", () => {
    expect(screen).toContain("minOf(w * 1.28f, h * 0.72f)");
  });
  it("dims a scenario picture with navy multiply in dark mode", () => {
    expect(screen).toContain("BlendMode.Multiply");
    expect(screen).toContain("CallScenes.EVENING_OVERLAY_OPACITY");
  });
  it("reads the real recorder level for the You tile", () => {
    expect(screen).toContain("vm.micLevelDBFS()");
    expect(
      code(
        "android/LearnWithAlphonso/app/src/main/java/com/obsidianmedia/learnwithalphonso/audio/TurnRecorder.kt",
      ),
    ).toContain("r.maxAmplitude");
  });
});

describe("the setting", () => {
  it("defaults on, is in Settings, and gates the call in the scenario screen only", () => {
    const practice = code(
      "android/LearnWithAlphonso/app/src/main/java/com/obsidianmedia/learnwithalphonso/ui/practice/PracticeScreens.kt",
    );
    expect(practice).toContain(
      "container.prefs.getBoolean(AvatarPreference.KEY, AvatarPreference.DEFAULT)",
    );
    expect(practice).toMatch(
      /if \(showCall\) \{[\s\S]*?PracticeCallScreen\([\s\S]*?\} else \{\s*ConversationBody\(/,
    );
    expect(
      code(
        "android/LearnWithAlphonso/app/src/main/java/com/obsidianmedia/learnwithalphonso/ui/settings/SettingsScreen.kt",
      ),
    ).toContain("AvatarSection(container)");
  });
  it("covers Hector's call too: the same setting gates it", () => {
    const hector = code(`${HECTOR}/HectorScreen.kt`);
    expect(hector).toContain(
      "container.prefs.getBoolean(AvatarPreference.KEY, AvatarPreference.DEFAULT)",
    );
    expect(hector).toMatch(/if \(showCall\) \{[\s\S]*?PracticeCallScreen\(/);
  });
});

describe("campaign conversations", () => {
  const practice = code(
    "android/LearnWithAlphonso/app/src/main/java/com/obsidianmedia/learnwithalphonso/ui/practice/PracticeScreens.kt",
  );
  const campaign = practice.slice(practice.indexOf("fun CampaignConversationScreen("));
  it("use the call too, with the campaign id (no picture of its own, so the default room)", () => {
    expect(campaign).toContain(
      "container.prefs.getBoolean(AvatarPreference.KEY, AvatarPreference.DEFAULT)",
    );
    expect(campaign).toMatch(
      /if \(showCall\) \{[\s\S]*?PracticeCallScreen\([\s\S]*?scenarioId = campaign\.id/,
    );
    // ...and the classic screen is still there for the setting off.
    expect(campaign).toContain("ConversationBody(");
  });
  it("keeps Continue, Restart scene and the transcript reachable in the call", () => {
    const call = campaign.slice(
      campaign.indexOf("PracticeCallScreen("),
      campaign.indexOf("ConversationBody("),
    );
    expect(call).toContain("vm::continueToNextScene");
    expect(call).toContain("vm::restartScene");
    expect(call).toContain("TranscriptList(");
  });
});

describe("Hector's call", () => {
  const hector = code(`${HECTOR}/HectorScreen.kt`);
  it("bundles his kit, the same art as iOS", () => {
    const dir = path.join(root, ASSETS, "hector");
    const files = fs.readdirSync(dir).sort();
    expect(files).toEqual(
      fs.readdirSync(path.join(root, "ios/LearnWithAlphonso/HectorAvatar")).sort(),
    );
    expect(files.some((f) => f.startsWith("ear-") || f.startsWith("glint"))).toBe(false);
    for (const f of files)
      expect(
        fs
          .readFileSync(path.join(dir, f))
          .equals(fs.readFileSync(path.join(root, "ios/LearnWithAlphonso/HectorAvatar", f))),
        f,
      ).toBe(true);
  });
  it("uses his own kit and label, and keeps the classic screen for the setting off", () => {
    expect(hector).toContain("hectorKit(context)");
    expect(hector).toContain('talkLabel = "Hold to talk to Hector"');
    expect(hector).toContain("HoldToTalkButton(");
    expect(hector).toContain("AiConsentGate(container)");
    expect(hector).toContain("AiReportStatusHost(container.aiReports)");
  });
  it("hangs up with a token, so a reply still on its way is never spoken after the call ended", () => {
    expect(hector).toContain("onEnd = { vm.hangUp(); playback.stop(); callEnded = true }");
    expect(hector).toMatch(/if \(live\) reply\.audioBytes\(\)/);
  });
  it("loads his kit from his own folder with the eyes expression group", () => {
    const kit = code(`${CALL}/AlphonsoKit.kt`);
    expect(kit).toContain('"hector/manifest.json"');
    expect(kit).toMatch(
      /fromManifest\(manifest, "hector", "Hector", "hector", CallScenes\.defaultRoom, expressionPrefix = "eyes"\)/,
    );
  });
  it("keeps Pro gating outside the conversation", () => {
    expect(hector).toContain("!entitlement.isPro -> ProPaywallScreen(container");
    expect(hector).toContain("else -> HectorConversation(container)");
  });
  it("shows no reactions: his endpoint returns no verdict", () => {
    expect(hector).toContain("ConversationUiState(openerIndices = emptySet())");
    expect(hector).not.toMatch(/verdictSerial\s*=\s*it\.verdictSerial \+ 1/);
  });
  it("keeps the report buttons and the save-word hint in the sheet transcript", () => {
    const transcript = hector.slice(
      hector.indexOf("private fun HectorTranscript"),
      hector.indexOf("private fun HectorConversation"),
    );
    expect(transcript).toContain("ReportableAiMessage(");
    expect(transcript).toContain("SaveWordHintLine(");
  });
});
