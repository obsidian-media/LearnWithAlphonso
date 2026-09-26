import { describe, expect, it } from "vitest";
import { findAuthConfigProblems, type AuthConfig } from "./auth-config-guard";

/**
 * Each case is a shape that ACTUALLY SHIPPED, not an invented one. The
 * point of the guard is that its failing branch runs -- so every defect
 * in its own doc comment gets a test that goes red without the check.
 */
const GOOD: AuthConfig = {
  site_url: "https://learn.alphonsoecosystem.app",
  mailer_otp_length: 6,
  mailer_templates_magic_link_content: "<p>{{ .Token }}</p>",
  mailer_templates_confirmation_content: "<p>{{ .Token }}</p>",
};

describe("findAuthConfigProblems", () => {
  it("passes a correctly configured project", () => {
    expect(findAuthConfigProblems(GOOD)).toEqual([]);
  });

  // 2026-09-21. Fixed the magic-link template only.
  it("catches a magic-link template with no token", () => {
    const problems = findAuthConfigProblems({
      ...GOOD,
      mailer_templates_magic_link_content: '<a href="{{ .ConfirmationURL }}">Sign in</a>',
    });
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain("mailer_templates_magic_link_content");
  });

  // 2026-09-25, and the expensive one: a FIRST-TIME address gets the
  // confirmation template, so this broke every new signup for days while
  // returning users signed in fine. A guard that only checked the
  // magic-link template would have stayed green throughout.
  it("catches a confirmation template with no token, independently", () => {
    const problems = findAuthConfigProblems({
      ...GOOD,
      mailer_templates_confirmation_content: '<a href="{{ .ConfirmationURL }}">Confirm</a>',
    });
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain("mailer_templates_confirmation_content");
  });

  it("treats an empty template as broken -- Supabase falls back to its own", () => {
    expect(findAuthConfigProblems({ ...GOOD, mailer_templates_confirmation_content: "" })).toEqual([
      expect.stringContaining("is empty"),
    ]);
  });

  // 2026-09-26. Every signup mail's "Prefer a link?" fallback pointed at
  // the user's own machine.
  it.each(["http://localhost:3000", "http://127.0.0.1:3000"])(
    "catches site_url = %s",
    (site_url) => {
      const problems = findAuthConfigProblems({ ...GOOD, site_url });
      expect(problems).toHaveLength(1);
      expect(problems[0]).toContain("localhost");
    },
  );

  it("requires https, so a plain-http production host is still caught", () => {
    expect(findAuthConfigProblems({ ...GOOD, site_url: "http://learn.example.app" })).toEqual([
      expect.stringContaining("must be https"),
    ]);
  });

  it("catches an unset site_url", () => {
    expect(findAuthConfigProblems({ ...GOOD, site_url: undefined })).toEqual([
      expect.stringContaining("site_url is unset"),
    ]);
  });

  // 2026-09-26. GoTrue issued 8 digits while the app's field says
  // "6-digit code" in two places.
  it.each([8, 7, undefined])("catches mailer_otp_length = %s", (mailer_otp_length) => {
    const problems = findAuthConfigProblems({ ...GOOD, mailer_otp_length });
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain("6-digit code");
  });

  it("reports every problem at once rather than stopping at the first", () => {
    // A config can drift in more than one way, and fixing one at a time
    // across CI round trips is how the second one gets forgotten --
    // which is precisely how the confirmation template survived the
    // first fix.
    expect(
      findAuthConfigProblems({
        site_url: "http://localhost:3000",
        mailer_otp_length: 8,
        mailer_templates_magic_link_content: "<p>no token</p>",
        mailer_templates_confirmation_content: "<p>no token</p>",
      }),
    ).toHaveLength(4);
  });
});
