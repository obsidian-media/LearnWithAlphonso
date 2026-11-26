import { isLongEnoughNewPassword, TOO_SHORT_MESSAGE } from "./password-policy";

/** The browser tab title: the page says Create account on the sign-up form, Sign in everywhere else. */
export function authTitle(mode: "signin" | "signup" | "forgot" | "verify"): string {
  return mode === "signup" ? "Create account — Alphonso" : "Sign in — Alphonso";
}

const EMAIL_SHAPE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** What is wrong with the email or password, in words, or null. Whether it shows yet is the caller's call. */
export function fieldProblems(
  mode: "signin" | "signup" | "forgot" | "verify",
  email: string,
  password: string,
): { email: string | null; password: string | null } {
  if (mode === "verify") return { email: null, password: null };
  const e = email.trim();
  const emailProblem = !e
    ? "Enter your email address."
    : !EMAIL_SHAPE.test(e)
      ? "That email address doesn't look right. Check it for a typo."
      : null;
  let passwordProblem: string | null = null;
  if (mode !== "forgot") {
    if (!password) passwordProblem = "Enter your password.";
    else if (mode === "signup" && !isLongEnoughNewPassword(password)) {
      passwordProblem = TOO_SHORT_MESSAGE;
    }
  }
  return { email: emailProblem, password: passwordProblem };
}
