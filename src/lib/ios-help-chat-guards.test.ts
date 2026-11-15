import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// The iPhone Help chat (plan milestone 4). The app target only compiles in CI (ios-app-build) and has no UI tests for
// this screen yet, so these read the Swift source; each assertion names the property it protects.
const SRC = "ios/LearnWithAlphonso/Sources";
const read = (p: string) => readFileSync(`${SRC}/${p}`, "utf8").replace(/\r\n/g, "\n");
const chat = read("HelpChatView.swift");
const model = read("HelpChatModel.swift");
const settings = read("SettingsView.swift");

describe("the Help chat never turns learner or AI text into something that acts", () => {
  it("draws every message as plain text: no markdown, no link detection, no URL opened from a message", () => {
    for (const forbidden of [
      "AttributedString(",
      "Text(.init(",
      "LocalizedStringKey(",
      "openURL",
      "UIApplication.shared.open",
      "WKWebView",
      "WebView",
      "UITextView",
    ]) {
      expect(chat, forbidden).not.toContain(forbidden);
    }
    // A SwiftUI Link opens a URL; NavigationLink (the Settings row) is not one.
    expect(chat).not.toMatch(/(^|[^A-Za-z])Link\(/m);
    // The bubbles take a String variable (verbatim), never a literal-keyed Text.
    expect(chat).toContain("Text(message.body)");
    expect(chat).toContain("Text(text)");
  });

  it("a link chip comes only from the allow-list id the host maps to an action, never from a URL", () => {
    expect(chat).toContain("if let link = message.link, let openLink");
    expect(chat).toContain("link.label");
    expect(chat).not.toMatch(/URL\(string:/);
  });

  it("the request carries nothing but the text and the client id (the model has no conversation or user field)", () => {
    expect(model).toContain("client.sendMessage(text: pending.text, clientID: pending.clientID)");
    for (const forged of ["userID", "conversationID", "author"]) {
      expect(model, forged).not.toContain(forged);
    }
  });
});

describe("the Help chat's loaders are on content that always draws", () => {
  it("the first load and the poll hang off the root view, never off a conditional branch", () => {
    // memory: project_swiftui_empty_container_task. A .task on something that can draw nothing never fires.
    // The root view's modifier chain is indented exactly 8 spaces; a task nested in a branch is indented deeper.
    const tasks = chat.split("\n").filter((l) => /\.task(\(id:[^)]*\))? \{/.test(l));
    expect(tasks.length).toBe(2);
    for (const line of tasks) expect(line, line).toMatch(/^ {8}\.task/);
    expect(chat).toContain(".task { await model.load() }");
    expect(chat).toContain(".task(id: pollKey)");
  });

  it("polls only while a person has the chat, the app is active and the device is online", () => {
    const poll = chat.slice(chat.indexOf(".task(id: pollKey)"));
    expect(poll).toContain("SupportChatRules.shouldPoll(");
    expect(poll).toContain("online");
    expect(poll).toContain("scenePhase == .active");
    expect(poll).toContain("SupportChatRules.pollInterval");
  });
});

describe("where a learner finds Help", () => {
  it("Settings has its own Help section between AI features and Account", () => {
    const ai = settings.indexOf("DSOverline(AIConsentCopy.settingsTitle)");
    const help = settings.indexOf("DSOverline(SupportCopy.entryTitle)");
    const account = settings.indexOf('DSOverline("Account")');
    expect(ai).toBeGreaterThan(-1);
    expect(ai).toBeLessThan(help);
    expect(help).toBeLessThan(account);
    expect(settings).toContain("HelpSettingsRow(session: session");
  });

  it("the save-failure screen and the paywall error offer Get help, only where the app has a session for it", () => {
    expect(read("LessonSaveFailureView.swift")).toContain("GetHelpButton(prominent: true)");
    expect(read("PaywallView.swift")).toContain("if case .error = notice { GetHelpButton() }");
    expect(chat).toContain("if let session {");
    expect(read("RootView.swift")).toContain(
      ".environment(\\.helpSession, session.userID != nil ? session : nil)",
    );
  });

  it("works with AI answers off: the first-open screen and the banner follow the server's aiAvailable", () => {
    expect(chat).toContain("aiAvailable: state.aiAvailable");
    expect(chat).toContain("state.aiAvailable && aiConsent.status != .denied");
    // AI off shows no starters and no AI label; the welcome says a person reads every message.
    expect(chat).toContain("aiAnswering ? SupportCopy.welcomeAiTitle : SupportCopy.welcomeTitle");
    expect(chat).toContain("if aiAnswering {");
  });
});

describe("the chat is usable without colour or sight", () => {
  it("every speaker has a text label, and the AI and person labels differ from the learner's", () => {
    for (const label of [
      "SupportCopy.you",
      "SupportCopy.ai",
      "SupportCopy.aiTag",
      "SupportCopy.person",
      "SupportCopy.personTag",
    ]) {
      expect(chat, label).toContain(label);
    }
    expect(chat).toContain("AccessibilityNotification.Announcement(last.body).post()");
    expect(chat).toContain(".accessibilityLabel(SupportCopy.sendLabel)");
  });
});
