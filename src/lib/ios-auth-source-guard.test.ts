import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

// The iOS app target compiles only on macOS CI. These pin the sign-in and onboarding properties that a refactor
// could silently drop, so a regression is red on every machine.
const SRC = path.resolve(import.meta.dirname, "../../ios/LearnWithAlphonso/Sources");
const read = (file: string) => fs.readFileSync(path.join(SRC, file), "utf8");

describe("iOS sign-in screen", () => {
  const auth = () => read("AuthView.swift");

  it("uses Apple's own button with the Continue title, 50 pt, black on light and white on dark", () => {
    expect(auth()).toContain("SignInWithAppleButton(.continue)");
    expect(auth()).toContain("== .dark ? .white : .black");
    expect(auth()).toContain(".frame(height: AuthButtonMetrics.height)");
    expect(read("GoogleSignInButton.swift")).toContain("static let height: CGFloat = 50");
    expect(auth()).not.toContain('Label("Continue with Apple"');
  });

  it("AuthView rebuilds the Apple button per colour scheme", () => {
    expect(auth()).toContain(".id(AlphonsoThemeManager.shared.palette.colorScheme)");
  });

  it("puts Apple first, then Google with the official G, then email", () => {
    const text = auth();
    const apple = text.indexOf("SignInWithAppleButton(");
    const google = text.indexOf("GoogleSignInButton(");
    const email = text.indexOf('TextField("Email"');
    expect(apple).toBeGreaterThan(-1);
    expect(apple).toBeLessThan(google);
    expect(google).toBeLessThan(email);
    expect(read("GoogleSignInButton.swift")).toContain('Image("GoogleG")');
    for (const f of ["GoogleG.png", "GoogleG@2x.png", "GoogleG@3x.png", "Contents.json"]) {
      expect(fs.existsSync(path.join(SRC, "Assets.xcassets/GoogleG.imageset", f)), f).toBe(true);
    }
  });

  it("shows the Terms and Privacy footer with both links", () => {
    expect(auth()).toContain("AuthCopy.footerPrefix");
    expect(auth()).toContain('appendingPathComponent("terms")');
    expect(auth()).toContain('appendingPathComponent("privacy")');
  });

  it("the code step autofills, is numeric, can go back and can resend", () => {
    expect(auth()).toContain(".textContentType(.oneTimeCode)");
    expect(auth()).toContain(".keyboardType(.numberPad)");
    expect(auth()).toContain("session.useDifferentEmail()");
    expect(auth()).toContain("session.resendCode()");
    expect(auth()).toContain("resendSecondsRemaining(now: context.date)");
    expect(auth()).toContain('Text("Send code")');
    expect(auth()).toContain('Text("Verify")');
  });
});

describe("iOS session and root wiring", () => {
  it("checks the Apple credential at launch, on foreground and on Apple's revocation notice", () => {
    expect(read("Session.swift")).toContain("ASAuthorizationAppleIDProvider.credentialRevokedNotification");
    expect(read("RootView.swift").match(/session\.checkAppleCredential\(\)/g)?.length).toBe(2);
  });

  it("captures the ending access token before clearing the session", () => {
    const session = read("Session.swift");
    const capture = session.indexOf("let endingAccessToken = accessToken");
    const clear = session.indexOf("state = .signedOut", capture);
    expect(capture).toBeGreaterThan(-1);
    expect(clear).toBeGreaterThan(capture);
  });

  it("every sign-in path finishes the pending cleanup first", () => {
    const session = read("Session.swift");
    expect(session.match(/await finishPendingCleanup\(\)/g)?.length).toBe(4);
  });

  it("RootView uploads an existing token after every sign-in, and shows the name prompt before placement", () => {
    const root = read("RootView.swift");
    expect(root).toContain("if let token = remotePushRegistrar.deviceTokenHex");
    expect(root).toContain("OnboardingSequence.next(");
    expect(root).toContain("case .displayName:");
    expect(root).not.toContain("showPlacementGate");
  });

  it("registers the sign-out cleanup after the account cleanup", () => {
    const app = read("LearnWithAlphonsoApp.swift");
    expect(app.indexOf("AccountDataCleanup.register")).toBeGreaterThan(-1);
    expect(app.indexOf("AuthAccountCleanup.register")).toBeGreaterThan(app.indexOf("AccountDataCleanup.register"));
    expect(app).toContain("scheduler.cancelAll()");
  });
});
