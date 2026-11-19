import { describe, expect, it } from "vitest";
import { AUTH_ERROR_COPY, authErrorKind, friendlyAuthError } from "./auth-errors";

const err = (message: string, extra: Record<string, unknown> = {}) =>
  Object.assign(new Error(message), extra);

describe("friendlyAuthError", () => {
  it.each([
    ["over_email_send_rate_limit", "emailRateLimit"],
    ["over_request_rate_limit", "requestRateLimit"],
    ["captcha_failed", "captcha"],
    ["user_already_exists", "userExists"],
    ["email_exists", "userExists"],
    ["weak_password", "weakPassword"],
    ["invalid_credentials", "invalidCredentials"],
    ["email_not_confirmed", "emailNotConfirmed"],
    ["otp_expired", "badCode"],
  ] as const)("maps the auth server's code %s", (code, kind) => {
    expect(authErrorKind(err("raw server text", { code }))).toBe(kind);
    expect(friendlyAuthError(err("raw server text", { code }))).toBe(AUTH_ERROR_COPY[kind]);
  });

  it.each([
    ["Invalid login credentials", "invalidCredentials"],
    ["Email not confirmed", "emailNotConfirmed"],
    ["User already registered", "userExists"],
    ["email rate limit exceeded", "emailRateLimit"],
    ["captcha protection: request disallowed (invalid-input-response)", "captcha"],
    ["Password should be at least 10 characters.", "weakPassword"],
    ["Token has expired or is invalid", "badCode"],
    ["Failed to fetch", "offline"],
  ] as const)("falls back to the older message %j when there is no code", (message, kind) => {
    expect(authErrorKind(err(message))).toBe(kind);
  });

  it("treats supabase-js's network failure and a 429 as what they are", () => {
    expect(authErrorKind(err("x", { name: "AuthRetryableFetchError" }))).toBe("offline");
    expect(authErrorKind(err("x", { status: 429 }))).toBe("requestRateLimit");
  });

  it("never shows raw text it does not know: the caller's fallback, else the generic line", () => {
    expect(friendlyAuthError(err("unexpected_failure: relation does not exist"))).toBe(
      AUTH_ERROR_COPY.generic,
    );
    expect(friendlyAuthError(err("??"), "Couldn't send a new code.")).toBe(
      "Couldn't send a new code.",
    );
    expect(friendlyAuthError("a string")).toBe(AUTH_ERROR_COPY.generic);
    expect(friendlyAuthError(null)).toBe(AUTH_ERROR_COPY.generic);
  });

  it("the code wins over a misleading message", () => {
    expect(authErrorKind(err("Invalid login credentials", { code: "captcha_failed" }))).toBe(
      "captcha",
    );
  });
});
