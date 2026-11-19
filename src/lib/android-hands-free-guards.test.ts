import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Source guards for hands-free conversation on Android (Hector and the Practice calls). The Compose cannot be built on
 * every machine, so what must not regress is pinned here: the Kotlin loop keeps iOS's numbers, the switch is in the
 * call's conversation sheet, it is off at every call start, Practice ends a turn after 2.5 s of quiet and Hector after
 * 1.2 s, hands-free is screen-on only (no foreground service), and Practice has no Pro gate while Hector keeps its own.
 * Comments are stripped, so a comment cannot satisfy a guard.
 */
const root = path.resolve(import.meta.dirname, "../..");
const read = (p: string) => fs.readFileSync(path.join(root, p), "utf8").replace(/\r\n/g, "\n");
const code = (p: string) =>
  read(p)
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\/\/.*$/gm, "");

const ANDROID = "android/LearnWithAlphonso";
const APP = `${ANDROID}/app/src/main/java/com/obsidianmedia/learnwithalphonso`;
const CORE = `${ANDROID}/core/src/main/kotlin/com/obsidianmedia/learnwithalphonso/core/logic`;
const IOS_KIT = "ios/LearnWithAlphonsoKit/Sources/LearnWithAlphonsoKit/HandsFreeLoop.swift";

const LOOP = `${CORE}/HandsFreeLoop.kt`;
const CALL = `${APP}/ui/practice/call`;
const SCREEN = `${CALL}/PracticeCallScreen.kt`;
const UI = `${CALL}/HandsFreeCallUi.kt`;
const VMS = `${APP}/ui/practice/ConversationViewModels.kt`;
const HECTOR = `${APP}/ui/hector/HectorScreen.kt`;
const PRACTICE_SCREENS = `${APP}/ui/practice/PracticeScreens.kt`;

/** `name: Type = value` in the Swift Tuning, as a number. */
function iosNumber(name: string): number {
  const m = code(IOS_KIT).match(new RegExp(`public var ${name}(?::\\s*\\w+)?\\s*=\\s*(-?[0-9.]+)`));
  expect(m, `iOS Tuning.${name}`).not.toBeNull();
  return Number(m![1]);
}

/** `val name: Double = value` (or Int) in the Kotlin Tuning, as a number. */
function androidNumber(name: string): number {
  const m = code(LOOP).match(new RegExp(`val ${name}: (?:Double|Int) = (-?[0-9.]+)`));
  expect(m, `Android Tuning.${name}`).not.toBeNull();
  return Number(m![1]);
}

describe("the Kotlin loop is the iOS loop, number for number", () => {
  const numbers: Array<[string, string]> = [
    ["speechAboveFloor", "speechAboveFloor"],
    ["calibration", "calibration"],
    ["maximumBackground", "maximumBackground"],
    ["minimumSpeechLevel", "minimumSpeechLevel"],
    ["speechOnset", "speechOnset"],
    ["endOfTurnSilence", "endOfTurnSilence"],
    ["noSpeechTimeout", "noSpeechTimeout"],
    ["maxTurn", "maxTurn"],
    ["ignoreBelow", "ignoreBelow"],
    ["maxTurnsWithoutTouch", "maxTurnsWithoutTouch"],
  ];
  for (const [ios, android] of numbers) {
    it(`${android} equals iOS's ${ios}`, () => {
      expect(androidNumber(android)).toBe(iosNumber(ios));
    });
  }

  it("has the Practice preset with 2.5 s of quiet and nothing else changed", () => {
    expect(code(LOOP)).toContain("val PRACTICE = Tuning(endOfTurnSilence = 2.5)");
    expect(code(LOOP)).toContain("val HECTOR = Tuning()");
    expect(code(LOOP)).toContain("class HandsFreeLoop(val tuning: Tuning = Tuning.HECTOR)");
  });

  it("keeps the same safety copy and the earbuds line as iOS, minus the locked-screen promise it cannot keep", () => {
    const kotlin = read(LOOP);
    const ios = read(IOS_KIT);
    for (const line of [
      "Don't use it while driving or anywhere you need your full attention.",
      "Best with earbuds or a quiet room.",
      "anything it hears is sent for transcription like a held recording",
      "It pauses after 8 seconds of quiet, after background noise, and after 20 turns",
      "handsFree.safetyNoteSeen.v2",
    ]) {
      expect(kotlin, line).toContain(line);
      expect(ios, line).toContain(line);
    }
    expect(ios).toContain("also with the screen locked");
    expect(code(LOOP)).not.toContain("locked");
  });

  it("has the same status lines as iOS", () => {
    const kotlin = read(LOOP);
    for (const line of [
      "Listening. Just talk.",
      "Hearing you...",
      "is replying...",
      "Hands-free is paused.",
      "Paused because nobody spoke. Tap Resume to keep talking.",
      "Paused after a problem. Tap Resume to try again.",
      "Paused after a very long turn. Tap Resume to keep talking.",
      "Paused because it only heard background noise. Tap Resume to keep talking.",
      "Paused after 20 turns. Tap Resume to keep talking.",
      "Paused because the audio was interrupted. Tap Resume to keep talking.",
    ]) {
      expect(kotlin, line).toContain(line);
      expect(read(IOS_KIT), line).toContain(line);
    }
  });
});

describe("the switch and the call chrome", () => {
  it("sits in the call's conversation sheet, above the transcript", () => {
    const screen = code(SCREEN);
    const sheet = screen.slice(screen.indexOf("ModalBottomSheet("));
    expect(sheet).toContain("HandsFreeSwitch(vm, kit.displayName)");
    expect(sheet.indexOf("HandsFreeSwitch(")).toBeLessThan(sheet.indexOf("transcript()"));
  });

  it("is a switch with a note shown once, remembered on confirm, and stores the choice only through HandsFreePreference", () => {
    const ui = code(UI);
    expect(ui).toContain("Role.Switch");
    expect(ui).toMatch(
      /getBoolean\(HandsFreeCopy\.NOTE_SEEN_KEY, false\) == true\) \{ preference\?\.remember\(true\); vm\.handsFree\.enable\(\) \}\s*else showNote = true/,
    );
    expect(ui).toMatch(
      /putBoolean\(HandsFreeCopy\.NOTE_SEEN_KEY, true\)[\s\S]*?vm\.handsFree\.enable\(\)/,
    );
    expect(ui).toContain("HandsFreeCopy.firstUseBody(partner)");
    // The note's flag is the only direct write; the on/off choice goes through HandsFreePreference (core, unit-tested).
    expect((ui.match(/putBoolean/g) ?? []).length).toBe(1);
    expect(ui).toContain("preference?.remember(false); vm.handsFree.disable()");
    // A new call starts from the stored choice (HandsFreePreferenceBinding.kt).
    expect(code(SCREEN)).toContain("ApplyStoredHandsFree(vm)");
  });

  it("replaces the hold button with a labelled Pause or Resume button, and names who is on the call", () => {
    const screen = code(SCREEN);
    expect(screen).toContain("HandsFreePauseButton(handsFreeStatus, onTogglePause)");
    expect(screen).toContain("HandsFreeStatusPill(handsFreeStatus, kit.displayName)");
    const ui = code(UI);
    expect(ui).toContain("HandsFreeCopy.RESUME else HandsFreeCopy.PAUSE");
    expect(ui).toContain("contentDescription = label");
    // A pause is a safety stop: announced at once.
    expect(ui).toContain("view.announceForAccessibility(line)");
    expect(ui).not.toContain("liveRegion");
  });

  it("uses tokens only: no raw colour or font size", () => {
    const ui = code(UI);
    expect(ui).not.toMatch(/Color\(0x|Color\.(Red|Black|White|Gray)|\.sp\b/);
  });

  it("feeds the loop from the one level reader the call already has", () => {
    const screen = code(SCREEN);
    expect(screen).toContain("level?.let { vm.handsFree.level(it, now) }");
    // One reader: the recorder's peak resets on every read, so a second reader would steal the samples.
    expect(
      (read(`${APP}/ui/practice/call/PracticeCallScreen.kt`).match(/micLevelDBFS\(\)/g) ?? [])
        .length,
    ).toBe(1);
  });
});

describe("it is off at every call start and tuned per partner", () => {
  it("Practice (scenarios and campaigns) uses the Practice tuning, Hector the Hector tuning", () => {
    expect(code(VMS)).toContain("newController(HandsFreeLoop.Tuning.PRACTICE");
    expect(code(HECTOR)).toContain("newController(HandsFreeLoop.Tuning.HECTOR");
    expect(code(VMS)).not.toContain("Tuning.HECTOR");
    expect(code(HECTOR)).not.toContain("Tuning.PRACTICE");
  });

  it("each view model makes its own controller, off, and the controller never persists the switch", () => {
    const controller = code(`${CORE}/HandsFreeController.kt`);
    expect(controller).toContain(
      "MutableStateFlow<HandsFreeLoop.Status>(HandsFreeLoop.Status.Off)",
    );
    expect(controller).not.toMatch(/SharedPreferences|putBoolean|DataStore/);
  });

  it("is turned off when the screen leaves, on hang-up, on finishing and when the view model is cleared", () => {
    expect(code(VMS)).toMatch(/fun onLeave\(\) \{ handsFree\.disable\(\)/);
    expect(code(VMS)).toMatch(/finishing = true\s*handsFree\.disable\(\)/);
    expect(code(VMS)).toMatch(/public override fun onCleared\(\) \{\s*handsFree\.disable\(\)/);
    expect(code(HECTOR)).toMatch(/fun onLeave\(\) \{ handsFree\.disable\(\)/);
    expect(code(HECTOR)).toMatch(/callGeneration\+\+\s*handsFree\.disable\(\)/);
    expect(code(HECTOR)).toMatch(/public override fun onCleared\(\) \{\s*handsFree\.disable\(\)/);
  });

  it("carries the choice across the scenes of one campaign run, and only that", () => {
    const screens = code(PRACTICE_SCREENS);
    // Noted before the call finishes (which turns it off); the result's Next scene moves on, and the next call re-arms it.
    expect(screens).toMatch(
      /val endCall: \(\) -> Unit = \{ vm\.carryHandsFreeToNextScene\(\); scope\.launch/,
    );
    expect(screens).toContain("vm.speakOpener(); vm.rearmHandsFreeIfCarried()");
    const vms = code(VMS);
    expect(vms).toMatch(
      /fun restartScene\(speak: Boolean = true\) \{\s*if \(awaitingResult\) return\s*rearmHandsFree = false/,
    );
    expect(vms).toContain("if (carried && !_campaign.value.finished) handsFree.enable()");
  });
});

describe("the safety stops", () => {
  it("an empty transcript and every failure reach the loop before the phase returns to idle", () => {
    const binding = code(`${CALL}/HandsFreeBinding.kt`);
    expect(binding).toContain("TurnEvent.Empty -> controller.turnHadNoWords()");
    expect(binding).toContain("TurnEvent.MicDenied, is TurnEvent.Failed -> controller.failed()");
    for (const file of [VMS, HECTOR]) {
      const src = code(file);
      expect(src.indexOf("HandsFreeBinding.onTurnEvent(handsFree, event)")).toBeGreaterThan(-1);
      expect(src.indexOf("HandsFreeBinding.onTurnEvent")).toBeLessThan(
        src.indexOf("is TurnEvent.Transcribed ->"),
      );
      expect(src).toContain("handsFree.failed()");
    }
  });

  it("a too-short capture is its own event, so it listens again instead of pausing like a blank transcript", () => {
    expect(code(`${CORE}/ConversationTurnEngine.kt`)).toContain(
      "_events.tryEmit(TurnEvent.TooShort)",
    );
    expect(code(`${CALL}/HandsFreeBinding.kt`)).toContain(
      "TurnEvent.TooShort, is TurnEvent.Transcribed -> Unit",
    );
  });

  it("the mic opens only after the reply: the loop is fed the conversation's phase, not only the engine's", () => {
    const binding = code(`${CALL}/HandsFreeBinding.kt`);
    expect(binding).toContain("conversation == ConversationPhase.THINKING -> VoicePhase.THINKING");
    expect(binding).toContain("conversation == ConversationPhase.SPEAKING -> VoicePhase.SPEAKING");
    expect(binding).toContain("combine(engine.phase, state.map { it.phase })");
  });

  it("pauses on audio focus loss, an incoming call and removed earbuds", () => {
    const ui = code(UI);
    expect(ui).toContain("HandsFreeInterruption.pauses(change)");
    expect(ui).toContain("AudioManager.ACTION_AUDIO_BECOMING_NOISY");
    expect(code(`${CORE}/HandsFreeController.kt`)).toContain("AUDIOFOCUS_LOSS = -1");
    expect(code(`${CORE}/HandsFreeController.kt`)).toContain("AUDIOFOCUS_LOSS_TRANSIENT = -2");
  });
});

describe("the microphone is never left open", () => {
  it("marks the conversation busy before telling the engine the turn ended, so there is no idle gap", () => {
    for (const f of [VMS, HECTOR]) {
      const src = code(f);
      const at = src.indexOf("override fun pressEnded()");
      expect(at, f).toBeGreaterThan(-1);
      const body = src.slice(at, at + 400);
      expect(body.indexOf("ConversationPhase.TRANSCRIBING")).toBeGreaterThan(-1);
      expect(body.indexOf("ConversationPhase.TRANSCRIBING")).toBeLessThan(
        body.indexOf("engine.pressEnded()"),
      );
    }
  });

  it("turning it off or pausing cancels unconditionally, also while a recording is still starting", () => {
    const c = code(`${CORE}/HandsFreeController.kt`);
    expect(c).toMatch(/if \(wasOn\) perform\(HandsFreeLoop\.Effect\.CANCEL_TURN\)/);
    expect(c).toMatch(/if \(wasOn && !resuming\) perform\(HandsFreeLoop\.Effect\.CANCEL_TURN\)/);
  });

  it("any pause releases the recorder, and a failing level read pauses", () => {
    const binding = code(`${CALL}/HandsFreeBinding.kt`);
    expect(binding).toContain("if (status is HandsFreeLoop.Status.Paused) releaseMic(engine)");
    // Only the microphone is released: a turn already being transcribed must be left to finish, or the call is stuck busy.
    const release = binding.slice(binding.indexOf("fun releaseMic"));
    expect(release).toContain("phase == TurnPhase.RECORDING || phase == TurnPhase.REQUESTING_MIC");
    expect(release.slice(0, 300)).not.toContain("TRANSCRIBING");
    for (const f of [VMS, HECTOR])
      expect(code(f)).toContain("cancel = { HandsFreeBinding.releaseMic(engine) }");
    for (const f of [VMS, HECTOR])
      expect(code(f)).toContain("catch (e: Exception) { handsFree.failed(); null }");
  });

  it("the no-speech and max-turn limits also run on the wall clock", () => {
    expect(code(SCREEN)).toContain("vm.handsFree.tick(now)");
    expect(code(LOOP)).toContain("is Event.Tick -> onTick(event.at)");
  });
});

describe("screen-on only", () => {
  it("keeps the screen on while hands-free is on, and clears the flag after", () => {
    const ui = code(UI);
    expect(ui).toContain("addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)");
    expect(ui).toContain("clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)");
  });

  it("stops when the app leaves the foreground", () => {
    const ui = code(UI);
    expect(ui).toMatch(/Lifecycle\.Event\.ON_STOP\) vm\.handsFree\.disable\(\)/);
  });

  it("adds no foreground service and no locked-screen use", () => {
    const manifest = read(`${ANDROID}/app/src/main/AndroidManifest.xml`);
    expect(manifest).not.toMatch(/foregroundServiceType="[^"]*microphone/);
    expect(manifest).not.toContain("FOREGROUND_SERVICE_MICROPHONE");
    for (const file of [UI, LOOP, `${CORE}/HandsFreeController.kt`]) {
      expect(code(file), file).not.toMatch(
        /PowerManager|WakeLock|startForegroundService|setShowWhenLocked/,
      );
    }
  });
});

describe("Practice is free and Hector stays Pro", () => {
  it("has no Pro or paywall check in the Practice path or the hands-free code", () => {
    for (const file of [
      PRACTICE_SCREENS,
      VMS,
      UI,
      SCREEN,
      `${CALL}/HandsFreeBinding.kt`,
      LOOP,
      `${CORE}/HandsFreeController.kt`,
    ]) {
      expect(code(file), file).not.toMatch(/isPro|entitlement|Entitlement|paywall|Paywall/);
    }
  });

  it("keeps Hector's own gate in front of its call", () => {
    const hector = code(HECTOR);
    expect(hector).toContain("!entitlement.isPro -> ProPaywallScreen(container");
    expect(hector).toContain("else -> HectorConversation(container)");
  });
});
