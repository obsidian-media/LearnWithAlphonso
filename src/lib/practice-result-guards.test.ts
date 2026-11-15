import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Source guards for the Practice result screen on all three platforms (Round 13): a campaign scene ends on the approved
 * Practice hub v3 result screen, and its Next scene button is the only way on. The in-call and in-transcript
 * "Continue: <next scene>" button is gone. The Swift and Kotlin cannot be built on every machine, so what must not
 * regress is pinned here. Comments are stripped, so a comment cannot satisfy a guard.
 */
const root = path.resolve(import.meta.dirname, "../..");
const read = (p: string) => fs.readFileSync(path.join(root, p), "utf8").replace(/\r\n/g, "\n");
const code = (p: string) =>
  read(p)
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "")
    .replace(/ \/\/ .*$/gm, "");

const WEB_CAMPAIGN = "src/routes/_authenticated/campaign_.$campaignId.tsx";
const WEB_RESULT = "src/components/practice/PracticeResult.tsx";
const IOS = "ios/LearnWithAlphonso/Sources";
const ANDROID =
  "android/LearnWithAlphonso/app/src/main/java/com/obsidianmedia/learnwithalphonso/ui/practice";

describe("the in-call Continue button is gone on every platform", () => {
  it("web: no 'Continue: <next scene>' label, no continueToNextScene, in the call or the transcript", () => {
    const src = code(WEB_CAMPAIGN);
    expect(src).not.toMatch(/Continue:/);
    expect(src).not.toContain("continueToNextScene");
    expect(src).not.toMatch(/Continue/);
  });

  it("iOS: CampaignView has no Continue button, no callExtra button and no advance flag", () => {
    const src = code(`${IOS}/CampaignView.swift`);
    expect(src).not.toMatch(/Continue:/);
    expect(src).not.toContain("continueButton");
    expect(src).not.toContain("finishCall(advance");
    expect(src).not.toContain("advancing");
    const extra = src.slice(
      src.indexOf("private var callExtra"),
      src.indexOf("private var completionCard"),
    );
    expect(extra).not.toContain("Button");
  });

  it("Android: PracticeScreens has no Continue button, no advanceCall, in the call or the transcript footer", () => {
    const src = code(`${ANDROID}/PracticeScreens.kt`);
    expect(src).not.toMatch(/Continue:/);
    expect(src).not.toContain("advanceCall");
    expect(src).not.toContain("advancing");
    expect(src).not.toContain("Finish campaign");
  });
});

describe("Next scene on the result screen carries what Continue did", () => {
  it("web: forward advances the scene only with a star, and the result gets the campaign context", () => {
    const src = code(WEB_CAMPAIGN);
    expect(src).toContain("campaign={{ isLastScene }}");
    expect(src).toMatch(
      /if \(r\.stars >= 1\) advanceScene\(\);\s*else void navigate\(\{ to: "\/converse" \}\)/,
    );
  });

  it("iOS: forward moves on only with a star; the last scene's forward finishes the campaign", () => {
    const src = code(`${IOS}/CampaignView.swift`);
    expect(src).toContain("context: .campaignScene(isLast: isLastScene)");
    expect(src).toMatch(
      /forward: \{ if result\.stars >= 1 \{ self\.result = nil; continueToNextScene\(\) \} else \{ dismiss\(\) \} \}/,
    );
    // continueToNextScene on the last scene marks the campaign finished (the completion card).
    expect(src).toMatch(
      /if isLastScene \{\s*rearmHandsFree = false\s*conversation = conversationStore\.update\(key\) \{ \$0\.finished = true \}/,
    );
    // Hands-free is remembered when the scene ends, so Next scene can re-arm it.
    expect(src).toContain("rearmHandsFree = voice.isHandsFreeOn");
  });

  it("Android: forward moves on only with a star, and the result gets the campaign context", () => {
    const src = code(`${ANDROID}/PracticeScreens.kt`);
    expect(src).toContain("PracticeResultContext.CampaignScene(isLast = vm.isLastScene)");
    expect(src).toContain("if (r.stars >= 1) vm.continueToNextScene(speak = false) else onBack()");
  });

  it("scenario talks keep their own result: the Scenario context and a Done that leaves", () => {
    expect(code(`${IOS}/ConversationView.swift`)).toContain("context: .scenario");
    expect(code(`${IOS}/ConversationView.swift`)).toContain("forward: { dismiss() }");
    expect(code(`${ANDROID}/PracticeScreens.kt`)).toContain(
      "context = PracticeResultContext.Scenario",
    );
    expect(code("src/routes/_authenticated/converse_.$scenarioId.tsx")).toContain(
      "campaign={null}",
    );
  });
});

describe("the result screen draws what the table says, on every platform", () => {
  it("web: the buttons come from practiceResultButtons, not from labels in the view", () => {
    const src = code(WEB_RESULT);
    expect(src).toContain("practiceResultButtons({ stars: result.stars, campaign })");
    expect(src).not.toMatch(/Play again|Try again|Try for/);
  });

  it("iOS: PracticeResultView takes its buttons from the Kit's table and follows Royal light and night", () => {
    const src = code(`${IOS}/PracticeHubView.swift`);
    const view = src.slice(
      src.indexOf("struct PracticeResultView"),
      src.indexOf("struct PracticeRoomThumbnail"),
    );
    expect(view).toContain("result.buttons(for: context)");
    expect(view).toContain("AlphonsoDS.current");
    // It used to force the light palette; Meadow stays light on its own (AlphonsoThemeManager.isNight).
    expect(view).not.toContain("night: false");
    expect(view).not.toContain("retryLabel");
  });

  it("Android: PracticeResultScreen takes its buttons from the core table", () => {
    const src = code(`${ANDROID}/PracticeHubScreen.kt`);
    const view = src.slice(
      src.indexOf("internal fun PracticeResultScreen"),
      src.indexOf("private fun PracticeRoomThumbnail"),
    );
    expect(view).toContain("result.buttons(context)");
    expect(view).not.toContain("retryLabel");
  });
});

describe("the chat-mode reply bar is one docked row with a round send button", () => {
  it("iOS: both Practice entry points use PracticeReplyBar, with no full-width Send button", () => {
    for (const file of ["ConversationView.swift", "CampaignView.swift"]) {
      const typed = code(`${IOS}/${file}`);
      const controls = typed.slice(
        typed.indexOf("private var typedControls"),
        typed.indexOf("private func resetCall"),
      );
      expect(controls, file).toContain("PracticeReplyBar(text: $input");
      expect(controls, file).not.toContain('PracticeButton("Send")');
      expect(controls, file).not.toContain("roundedBorder");
    }
    const bar = code(`${IOS}/PracticeReplyBar.swift`);
    expect(bar).toContain("PracticeHub.canSendReply(text, pending: pending)");
    expect(bar).toContain('Image(systemName: "arrow.up")');
    expect(bar).toContain(".disabled(!canSend)");
    expect(bar).toContain("focused ? ds.choice : ds.line");
  });

  it("Android: PracticeTextComposer is a pill field plus a round send button, multiline up to 4 lines, no full-width Send", () => {
    const src = code(`${ANDROID}/PracticeHubScreen.kt`);
    const bar = src.slice(
      src.indexOf("internal fun PracticeTextComposer"),
      src.indexOf("private fun EmptyStarOutline"),
    );
    expect(bar).toContain("maxLines = 4");
    expect(bar).toContain("Icons.Filled.ArrowUpward");
    expect(bar).toContain(
      "PracticeHub.canSendReply(input, pending = state.phase != ConversationPhase.IDLE)",
    );
    expect(bar).toContain("if (focused) ds.choice else ds.line");
    expect(bar).not.toContain('HubButton("Send")');
  });
});

describe("a call with no score (offline) keeps the learner on the scene", () => {
  const NOTICE = "You're offline, so this talk wasn't scored. Try again when you're back online.";
  it("the notice is the same line on every platform", () => {
    expect(read("src/lib/practice-result-buttons.ts")).toContain(NOTICE);
    expect(
      read("ios/LearnWithAlphonsoKit/Sources/LearnWithAlphonsoKit/PracticeHub.swift"),
    ).toContain(NOTICE);
    expect(
      read(
        "android/LearnWithAlphonso/core/src/main/kotlin/com/obsidianmedia/learnwithalphonso/core/logic/PracticeHub.kt",
      ),
    ).toContain(NOTICE);
  });

  it("web: an unscored campaign scene never navigates away once replies were sent", () => {
    const src = code(WEB_CAMPAIGN);
    expect(src).toMatch(/if \(userTurnsInScene > 0\) setUnscored\(true\);\s*else void navigate/);
    expect(src).toContain("<PracticeUnscored");
    const scenario = code("src/routes/_authenticated/converse_.$scenarioId.tsx");
    expect(scenario).toMatch(/if \(!scored\) \{[^}]*setUnscored\(true\);[^}]*return;/);
  });

  it("iOS: the finish failure shows the notice screen instead of dismissing, in both entry points", () => {
    for (const file of ["CampaignView.swift", "ConversationView.swift"]) {
      const src = code(`${IOS}/${file}`);
      expect(src, file).toContain("PracticeUnscoredView(retry:");
      expect(src, file).toMatch(
        /PracticeHub\.staysOnUnscored\(userReplies: .*\{ ending = false; unscored = true \} else \{ dismiss\(\) \}/,
      );
    }
  });

  it("Android: the finish failure shows the notice screen, and Try again resets the call first", () => {
    const src = code(`${ANDROID}/PracticeScreens.kt`);
    expect((src.match(/PracticeUnscoredScreen\(/g) ?? []).length).toBe(2);
    expect((src.match(/staysOnUnscored\(/g) ?? []).length).toBe(2);
    expect(src).toContain("unscored = false; vm.resetPractice(); vm.restartScene(speak = false)");
    expect((src.match(/unscored = true else onBack\(\)/g) ?? []).length).toBe(2);
  });
});

describe("See my result ends a chat-mode scene on every platform", () => {
  it("web: the button is in the transcript, gated by seeResultShown, and the header Finish is gone", () => {
    const src = code(WEB_CAMPAIGN);
    expect(src).toContain("{SEE_MY_RESULT}");
    expect(src).toMatch(/seeResultShown\(\{[^}]*minTurns: scene\.minTurns/);
    expect(src).not.toMatch(/>\s*Finish\s*</);
  });
  it("iOS: the button sits at the end of the transcript, gated by the Kit's rule at minTurns", () => {
    const src = code(`${IOS}/CampaignView.swift`);
    expect(src).toMatch(
      /PracticeHub\.seeResultShown\(chatMode: chatMode,.*minTurns: scene\.minTurns/,
    );
    expect(src).toContain("Button(PracticeHub.seeMyResult) { Task { await finishCall() } }");
  });
  it("Android: the chat footer shows the button through the core rule at minTurns and ends via endCall", () => {
    const src = code(`${ANDROID}/PracticeScreens.kt`);
    expect(src).toMatch(
      /seeResultShown\(chatMode, replies, vm\.scene\.minTurns, progress\.finished\)/,
    );
    expect(src).toContain("PracticeHub.SEE_MY_RESULT, endCall");
  });
  it("the label is the same everywhere", () => {
    expect(read("src/lib/practice-result-buttons.ts")).toContain('"See my result"');
    expect(
      read("ios/LearnWithAlphonsoKit/Sources/LearnWithAlphonsoKit/PracticeHub.swift"),
    ).toContain('"See my result"');
    expect(
      read(
        "android/LearnWithAlphonso/core/src/main/kotlin/com/obsidianmedia/learnwithalphonso/core/logic/PracticeHub.kt",
      ),
    ).toContain('"See my result"');
  });
});
