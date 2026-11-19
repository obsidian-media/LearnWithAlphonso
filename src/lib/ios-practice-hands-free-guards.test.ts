import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Source guards for hands-free conversation in the Practice calls on iOS (scenario talks and campaign scenes).
 * The Swift cannot be built on every machine, so what must not regress is pinned here: the switch is in both
 * entry points, the first-use note shows once, Practice ends a turn after 2.5 s of quiet (Hector keeps 1.2 s), the
 * empty-transcript hook is wired, and nothing on the Practice path is behind Pro.
 * Comments are stripped, so a comment cannot satisfy a guard.
 */
const root = path.resolve(import.meta.dirname, "../..");
const read = (p: string) => fs.readFileSync(path.join(root, p), "utf8").replace(/\r\n/g, "\n");
const code = (p: string) => read(p).replace(/\/\/.*$/gm, "");

const APP = "ios/LearnWithAlphonso/Sources";
const KIT = "ios/LearnWithAlphonsoKit/Sources/LearnWithAlphonsoKit";
const PRACTICE_VIEWS = ["ConversationView.swift", "CampaignView.swift"] as const;

/** The call screen's code, from its declaration to the end of its `.toolbar(.hidden, for: .tabBar)`. */
function callScreen(file: string): string {
  const src = code(`${APP}/${file}`);
  const start = src.indexOf("private var callScreen");
  expect(start, `${file} has callScreen`).toBeGreaterThan(-1);
  const end = src.indexOf(".toolbar(.hidden, for: .tabBar)", start);
  expect(end).toBeGreaterThan(start);
  return src.slice(start, end);
}

/** The body of `private func <name>` up to the next `private func`. */
function fn(file: string, name: string): string {
  const src = code(`${APP}/${file}`);
  const start = src.indexOf(`private func ${name}`);
  expect(start, `${file} has ${name}`).toBeGreaterThan(-1);
  const next = src.indexOf("private func", start + 10);
  return src.slice(start, next === -1 ? undefined : next);
}

describe("the Hands-free switch is in both Practice entry points", () => {
  for (const file of PRACTICE_VIEWS) {
    it(`${file}: the switch sits in the call's conversation sheet, above the transcript`, () => {
      const screen = callScreen(file);
      const sheet = screen.slice(screen.indexOf("sheet: {"));
      expect(sheet).toContain('HandsFreeSwitch(voice: voice, partner: "Alphonso")');
      expect(sheet.indexOf("HandsFreeSwitch(")).toBeLessThan(sheet.indexOf("transcript"));
    });
  }

  it("is one shared view: a Toggle bound to the voice controller's hands-free state", () => {
    const view = code(`${APP}/HandsFreeSwitch.swift`);
    expect(view).toContain("struct HandsFreeSwitch: View");
    expect(view).toContain("Toggle(HandsFreeCopy.toggle");
    expect(view).toContain("get: { voice.isHandsFreeOn }");
    expect(view).toContain("voice.setHandsFree(on)");
  });

  it("is off when a call starts: each call makes its own controller and nothing persists the switch", () => {
    for (const file of PRACTICE_VIEWS) {
      expect(code(`${APP}/${file}`)).toMatch(/@State private var voice = VoiceSessionController\(/);
    }
    const view = code(`${APP}/HandsFreeSwitch.swift`);
    // Only the once-per-device note is stored, never the on/off state (Hector does not persist it either).
    expect((view.match(/@AppStorage/g) ?? []).length).toBe(1);
    expect(view).toContain("@AppStorage(HandsFreeCopy.noteSeenKey) private var noteSeen");
    expect(code(`${APP}/VoiceSession.swift`)).toMatch(
      /private\(set\) var handsFreeStatus: HandsFreeLoop\.Status = \.off/,
    );
  });

  it("keeps the choice across the scenes of one campaign run, and only that", () => {
    const campaign = code(`${APP}/CampaignView.swift`);
    // Ending a scene remembers that hands-free was on, before finishCall's disappeared() turns it off; the
    // result's Next scene (continueToNextScene) then re-arms it for the next scene.
    const finish = fn("CampaignView.swift", "finishCall");
    expect(finish).toContain("rearmHandsFree = voice.isHandsFreeOn");
    expect(finish.indexOf("rearmHandsFree = voice.isHandsFreeOn")).toBeLessThan(
      finish.indexOf("voice.disappeared()"),
    );
    // It is re-armed for the next scene's call, after the opener has been spoken.
    expect(campaign).toMatch(
      /await voice\.speakOpener\([^)]*\)\s*if rearmHandsFree \{\s*rearmHandsFree = false\s*if !conversation\.finished \{ voice\.setHandsFree\(true\) \}/,
    );
    // Not across a finished campaign or a restarted scene; the flag is per view, so a new run starts off.
    expect(fn("CampaignView.swift", "continueToNextScene")).toMatch(
      /if isLastScene \{\s*rearmHandsFree = false/,
    );
    expect(fn("CampaignView.swift", "restartScene")).toContain("rearmHandsFree = false");
    expect(campaign).toContain("@State private var rearmHandsFree = false");
    // The scenario talk has no scenes: it never re-arms.
    expect(code(`${APP}/ConversationView.swift`)).not.toContain("rearmHandsFree");
  });

  it("turns hands-free off when a call is ended or a campaign finishes, so the microphone cannot stay open", () => {
    // finishCall -> voice.disappeared() -> setHandsFree(false), before the result screen takes over.
    for (const file of PRACTICE_VIEWS) {
      expect(fn(file, "finishCall")).toContain("voice.disappeared()");
    }
    expect(code(`${APP}/VoiceSession.swift`)).toMatch(
      /func disappeared\(\) \{[^}]*setHandsFree\(false\)/,
    );
    expect(code(`${APP}/CampaignView.swift`)).toMatch(
      /\.onChange\(of: conversation\.finished\) \{ _, finished in\s*if finished \{ voice\.setHandsFree\(false\) \}/,
    );
  });
});

describe("the first-use note shows once", () => {
  const view = code(`${APP}/HandsFreeSwitch.swift`);

  it("asks before the first turn-on, and only then", () => {
    expect(view).toMatch(
      /if on, !noteSeen \{\s*showNote = true\s*\} else \{\s*voice\.setHandsFree\(on\)/,
    );
  });

  it("remembers it on confirm and turns hands-free on from the confirm button", () => {
    expect(view).toMatch(
      /Button\(HandsFreeCopy\.firstUseConfirm\) \{\s*noteSeen = true\s*voice\.setHandsFree\(true\)/,
    );
  });

  it("is presented from the switch, which is inside the sheet (a view under a sheet cannot present an alert)", () => {
    expect(view).toContain(".alert(HandsFreeCopy.firstUseTitle, isPresented: $showNote)");
    expect(view).toContain("HandsFreeCopy.firstUseBody(partner: partner)");
  });

  it("shares one storage key with Hector, whose copy changed in the same way, so it shows once per device", () => {
    const kit = code(`${KIT}/HandsFreeLoop.swift`);
    expect(kit).toContain('public static let noteSeenKey = "handsFree.safetyNoteSeen.v2"');
    const hector = code(`${APP}/HectorView.swift`);
    expect(hector).toContain("@AppStorage(HandsFreeCopy.noteSeenKey)");
    expect(hector).not.toContain("safetyNoteSeen.v1");
    expect(hector).toContain('HandsFreeCopy.firstUseBody(partner: "Hector")');
  });

  it("keeps the safety copy and adds the earbuds line", () => {
    const kit = read(`${KIT}/HandsFreeLoop.swift`);
    expect(kit).toContain("Don't use it while driving or anywhere you need your full attention.");
    expect(kit).toContain("Best with earbuds or a quiet room.");
    expect(kit).toContain("anything it hears is sent for transcription like a held recording");
  });
});

describe("Practice ends a turn after 2.5 s of quiet; Hector keeps 1.2 s", () => {
  const kit = code(`${KIT}/HandsFreeLoop.swift`);

  it("makes the tuning a per-use value with a Practice and a Hector preset", () => {
    expect(kit).toContain("public static let hector = Tuning()");
    expect(kit).toMatch(
      /public static let practice: Tuning = \{\s*var tuning = Tuning\(\)\s*tuning\.endOfTurnSilence = 2\.5\s*return tuning\s*\}\(\)/,
    );
    expect(kit).toContain("public init(tuning: Tuning = .hector)");
    expect(kit).toContain("public var endOfTurnSilence: TimeInterval = 1.2");
  });

  it("keeps the 8 s no-speech, 30 s long-turn and 20-turns-without-touch limits as they are", () => {
    expect(kit).toContain("public var noSpeechTimeout: TimeInterval = 8");
    expect(kit).toContain("public var maxTurn: TimeInterval = 30");
    expect(kit).toContain("public var maxTurnsWithoutTouch = 20");
    // Practice changes nothing but the end-of-turn silence.
    const practice = kit.slice(
      kit.indexOf("public static let practice"),
      kit.indexOf("}()", kit.indexOf("public static let practice")),
    );
    expect((practice.match(/tuning\.\w+ =/g) ?? []).length).toBe(1);
  });

  it("hands the tuning to the voice controller, which builds its loop with it", () => {
    const voice = code(`${APP}/VoiceSession.swift`);
    expect(voice).toContain("init(handsFreeTuning: HandsFreeLoop.Tuning = .hector)");
    expect(voice).toContain("handsFree = HandsFreeLoop(tuning: handsFreeTuning)");
  });

  it("passes the Practice tuning from both Practice entry points, and Hector uses the default", () => {
    for (const file of PRACTICE_VIEWS) {
      expect(code(`${APP}/${file}`)).toContain(
        "@State private var voice = VoiceSessionController(handsFreeTuning: .practice)",
      );
    }
    expect(code(`${APP}/HectorView.swift`)).toContain(
      "@State private var voice = VoiceSessionController()",
    );
    expect(code(`${APP}/HectorView.swift`)).not.toContain("handsFreeTuning");
  });
});

describe("the empty-transcript path knows about hands-free", () => {
  for (const file of PRACTICE_VIEWS) {
    it(`${file}: an empty transcript pauses hands-free instead of saying "Hold the button"`, () => {
      const turn = fn(file, "runTurn");
      expect(turn).toMatch(
        /isEmpty else \{\s*if voice\.isHandsFreeOn \{\s*voice\.handsFreeHeardNoWords\(\)\s*\} else \{\s*notice = "Didn't catch that — try again\."/,
      );
    });

    it(`${file}: a too-short recording shows no "Hold the button" line while hands-free is on`, () => {
      const capture = fn(file, "handle");
      expect(capture).toContain(
        'notice = voice.isHandsFreeOn ? nil : "Didn\'t catch that. Hold the button while you speak."',
      );
    });
  }

  it("names who is on the call in the hands-free status line", () => {
    const call = code(`${APP}/PracticeCallView.swift`);
    expect(call).toContain(
      "HandsFreeCopy.statusLine(voice.handsFreeStatus, partner: kit.displayName)",
    );
    expect(call).toContain("HandsFreeCopy.statusLine(new, partner: kit.displayName)");
  });
});

describe("hands-free in Practice is free", () => {
  it("has no Pro or paywall check on the Practice path or in the switch", () => {
    for (const file of [
      ...PRACTICE_VIEWS,
      "HandsFreeSwitch.swift",
      "PracticeCallView.swift",
      "VoiceSession.swift",
    ]) {
      // ConversationView.swift also holds the tab's wrapper, which passes the entitlement store to Hector; only the
      // Practice session view below it is the Practice path.
      const whole = code(`${APP}/${file}`);
      const src = whole.includes("struct ConversationSessionView")
        ? whole.slice(whole.indexOf("struct ConversationSessionView"))
        : whole;
      expect(src, file).not.toMatch(/isPro|entitlement|Entitlement|paywall|Paywall/);
    }
    expect(code(`${KIT}/HandsFreeLoop.swift`)).not.toMatch(/isPro|entitlement|paywall/i);
  });

  it("leaves Hector's own Pro gate where it was", () => {
    const hector = code(`${APP}/HectorView.swift`);
    expect(hector).toContain("if !entitlementStore.isPro");
  });
});

describe("iOS call screen: hands-free is switchable on the call itself", () => {
  const call = code(`${APP}/PracticeCallView.swift`);
  it("has an on-call chip (Practice, campaign and Hector all use PracticeCallView) with the first-use note", () => {
    expect(call).toContain("private var handsFreeChip: some View");
    expect(call).toContain('accessibilityIdentifier("callHandsFreeChip")');
    expect(call).toContain("voice.setHandsFree(true)");
    expect(call).toContain("voice.setHandsFree(false)");
    expect(call).toContain(".alert(HandsFreeCopy.firstUseTitle, isPresented: $showHandsFreeNote)");
    expect(call.indexOf("handsFreeChip\n")).toBeLessThan(call.indexOf("controls\n"));
  });
});

describe("iOS call avatar rendering", () => {
  it("draws the layers with high interpolation and flattens them before the sway/breath transforms", () => {
    const v = code(`${APP}/AlphonsoAvatarView.swift`);
    expect(v).toContain(".interpolation(.high)");
    expect(v.indexOf(".compositingGroup()")).toBeGreaterThan(-1);
    expect(v.indexOf(".compositingGroup()")).toBeLessThan(
      v.indexOf(".scaleEffect(x: frame.breath.x"),
    );
  });
});
