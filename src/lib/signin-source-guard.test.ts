import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * The sign-in screens were restyled to the round-6 look; this keeps them from silently losing a way in. Each
 * platform's screen must still carry Apple (iOS), Google, the email field with its code step, and the bot check.
 */
const read = (p: string) => readFileSync(resolve(__dirname, "../../", p), "utf8");

describe("sign-in screens keep every way in", () => {
  it("iOS AuthView has Apple, Google, email, code and the bot check, and dismisses the keyboard", () => {
    const s = read("ios/LearnWithAlphonso/Sources/AuthView.swift");
    for (const needle of [
      "SignInWithAppleButton",
      "GoogleSignInButton",
      'TextField("Email"',
      "AuthCopy.codeFieldLabel",
      "BotCheckView(model: session.botCheck)",
      "session.requestCode()",
      "session.verifyCode()",
      "AuthCopy.useDifferentEmail",
      "scrollDismissesKeyboard",
      "placement: .keyboard",
    ]) {
      expect(s, needle).toContain(needle);
    }
    expect(s).toContain("FirstRunRoom(");
  });

  it("Android AuthScreen has Google, email, code, password and the bot check, and clears the keyboard", () => {
    const s = read(
      "android/LearnWithAlphonso/app/src/main/java/com/obsidianmedia/learnwithalphonso/ui/auth/AuthScreen.kt",
    );
    for (const needle of [
      '"Continue with Google"',
      '"Send code"',
      '"Verify"',
      '"6-digit code"',
      "BotCheckWebView(",
      "session.requestCode(",
      "session.verifyCode(",
      "imePadding()",
      "ImeAction.Done",
      "FirstRunRoom(",
    ]) {
      expect(s, needle).toContain(needle);
    }
  });
});
