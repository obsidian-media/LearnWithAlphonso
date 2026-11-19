import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Wiring the Android JVM tests cannot reach (AppContainer and the screens need a device): that sign-out keeps the
 * queue and logs the store out, that AI calls use the longer timeouts, that the speech engine is visible, and that
 * Miya's replies and generated practice can be reported. The behaviour itself is tested in SyncCoordinatorTest,
 * HectorAndBillingTest, AiHttpClientTest, SessionManagerTest and AiResponseReportTest.
 */
const APP = "android/LearnWithAlphonso/app/src/main";
const KT = `${APP}/java/com/obsidianmedia/learnwithalphonso`;
const read = (p: string) => fs.readFileSync(path.join(p), "utf8");
const code = (p: string) =>
  read(p)
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\/\/[^\n]*/g, "");

describe("Android session and sync reliability wiring", () => {
  const container = code(`${KT}/AppContainer.kt`);

  it("sign-out keeps the account's queue (endSession, never the deleting clear) and logs the store out", () => {
    const cleanup = /SignOutCleanup\([\s\S]*?\n {4}\}/.exec(container)?.[0] ?? "";
    expect(cleanup).toMatch(/syncCoordinator\.endSession\(ended\)/);
    expect(cleanup).not.toMatch(/clearAccount/);
    expect(cleanup).toMatch(/entitlements\.reset\(\)/);
  });

  it("the sync coordinator and the launch step share the departure clock", () => {
    expect(container).toMatch(/ownerClock = ownerClock,/);
    expect(container).toMatch(/SessionStartup\([^)]*ownerClock\)/);
  });

  it("only account deletion removes that account's queued work, from Settings", () => {
    const settings = code(`${KT}/ui/settings/SettingsScreen.kt`);
    expect(settings).toMatch(/deleteMyAccount\(\)[\s\S]*?syncCoordinator\.clearAccount\(/);
    expect(settings).toMatch(/syncCoordinator\.prepareSignOut\(userId\)/);
    expect(settings).toMatch(/SignOutGuard\.CONFIRM/);
  });

  it("the AI and audio clients are built over the AI timeouts, normal API calls are not", () => {
    expect(container).toMatch(/AiHttpClient\.from\(okHttp\)/);
    for (const client of [
      "TranslationGradingClient",
      "AiConversationClient",
      "ExplainClient",
      "SupportClient",
      "TutorConversationClient",
    ]) {
      expect(container, client).toMatch(new RegExp(`${client}\\(aiApiHttp`));
    }
    expect(container).toMatch(/AccountClient\(apiHttp\)/);
  });

  it("the manifest can see the device's speech engine on Android 11 and later", () => {
    const manifest = read(`${APP}/AndroidManifest.xml`);
    expect(manifest).toMatch(
      /<queries>[\s\S]*<action android:name="android\.intent\.action\.TTS_SERVICE" \/>[\s\S]*<\/queries>/,
    );
  });

  it("Miya's replies and generated practice questions can be reported", () => {
    const help = code(`${KT}/ui/support/HelpChatScreen.kt`);
    expect(help).toMatch(/reports = container\.aiReports/);
    expect(help).toMatch(/AiReplyReports\.support\(message\.body/);
    const practice = code(`${KT}/ui/lesson/GeneratedPractice.kt`);
    expect(practice).toMatch(/AiReplyReports\.practice\(q\.prompt/);
    expect(practice).toMatch(/AiReportStatusHost\(container\.aiReports\)/);
  });
});
