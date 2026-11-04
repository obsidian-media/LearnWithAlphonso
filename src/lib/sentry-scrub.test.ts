import { describe, expect, it } from "vitest";

import { scrubBreadcrumb, scrubEvent, scrubString, scrubValue } from "./sentry-scrub";

// Shaped like real Supabase tokens (header {"alg":"HS256","typ":"JWT"}, payload with sub/email/role).
const ACCESS_JWT =
  "eyJhbGciOiJIUzI1NiIsImtpZCI6Ik5wcWFkUT09IiwidHlwIjoiSldUIn0.eyJpc3MiOiJodHRwczovL3FoY2pwYnhmY2x0amJpdWtueXQuc3VwYWJhc2UuY28vYXV0aC92MSIsInN1YiI6IjFiNGMyZTc0LTlkNmEtNGM5Ni1hMGU1LTc3ZTgxNmE2ZTRmMiIsImVtYWlsIjoibGVhcm5lckBleGFtcGxlLmNvbSIsInJvbGUiOiJhdXRoZW50aWNhdGVkIiwiZXhwIjoxNzY0ODg4ODg4fQ.kP3x8Zr1mQv0_c5B2sXlT9uYhNfWd7aEoJ4iRqGtVbA";
const EMAIL = "maria.gonzalez+lwa@gmail.com";

describe("scrubString", () => {
  it("removes JWTs", () => {
    const out = scrubString(`session failed for ${ACCESS_JWT} at refresh`);
    expect(out).not.toContain("eyJ");
    expect(out).not.toContain(ACCESS_JWT.split(".")[2]);
    expect(out).toContain("session failed for");
  });

  it("removes email addresses", () => {
    const out = scrubString(`Invalid login for ${EMAIL}, contact other@sub.example.co.uk`);
    expect(out).not.toContain("maria");
    expect(out).not.toContain("example.co.uk");
    expect(out).toContain("[email]");
  });

  it("removes bearer tokens and secret-key formats", () => {
    expect(scrubString("Authorization: Bearer abcdef1234567890.zzz")).not.toContain(
      "abcdef1234567890",
    );
    expect(scrubString("key sb_secret_AbCdEf1234567890xyz leaked")).not.toContain(
      "AbCdEf1234567890",
    );
  });

  it("redacts sensitive URL query and fragment parameters but keeps the path", () => {
    const url = `https://learn.alphonsoecosystem.app/auth/callback?code=9f8e7d6c&next=/learn#access_token=${ACCESS_JWT}&refresh_token=r3fr3sh&type=signup`;
    const out = scrubString(url);
    expect(out).toContain("https://learn.alphonsoecosystem.app/auth/callback");
    expect(out).toContain("next=/learn");
    expect(out).not.toContain("9f8e7d6c");
    expect(out).not.toContain("r3fr3sh");
    expect(out).not.toContain("eyJ");
  });

  it("redacts an email carried in a query string", () => {
    expect(scrubString(`/login?email=${EMAIL}&x=1`)).not.toContain("gonzalez");
  });

  it("leaves ordinary error text alone", () => {
    const text = "TypeError: Cannot read properties of undefined (reading 'lessons') at LessonPage";
    expect(scrubString(text)).toBe(text);
  });
});

const USER_ID = "1b4c2e74-9d6a-4c96-a0e5-77e816a6e4f2";

describe("account ids and query strings", () => {
  it("redacts a Supabase user_id filter in a fetch URL", () => {
    const out = scrubString(
      `https://qhcjpfbxfcltjbiuknyt.supabase.co/rest/v1/progress?select=*&user_id=eq.${USER_ID}`,
    );
    expect(out).not.toContain(USER_ID);
    expect(out).toContain("/rest/v1/progress");
  });

  it("redacts any bare UUID in text", () => {
    expect(scrubString(`row ${USER_ID} failed`)).not.toContain(USER_ID);
    expect(scrubString(`row ${USER_ID.toUpperCase()} failed`)).not.toContain(USER_ID.toUpperCase());
  });

  it("strips the query string from breadcrumb, request and navigation URLs", () => {
    const out = scrubEvent({
      request: {
        url: `https://learn.alphonsoecosystem.app/lesson?uid=abc&x=${USER_ID}`,
        query_string: "uid=abc",
      },
      breadcrumbs: [
        {
          category: "fetch",
          data: { url: `https://x.supabase.co/rest/v1/t?user_id=eq.${USER_ID}` },
        },
        { category: "navigation", data: { from: "/a?private=1", to: "/b?private=2#frag" } },
      ],
    });
    const text = JSON.stringify(out);
    expect(text).not.toContain(USER_ID);
    expect(text).not.toContain("private=");
    expect(text).not.toContain("uid=abc");
    expect(text).toContain("/lesson");
  });
});

describe("scrubValue", () => {
  it("scrubs nested strings and drops values under secret-looking keys", () => {
    const out = scrubValue({
      a: [{ msg: `hello ${EMAIL}` }],
      authorization: `Bearer ${ACCESS_JWT}`,
      nested: { refreshToken: "plain-looking-value", ok: "fine" },
    });
    expect(JSON.stringify(out)).not.toContain("gonzalez");
    expect(JSON.stringify(out)).not.toContain("plain-looking-value");
    expect(JSON.stringify(out)).not.toContain("eyJ");
    expect(out.nested.ok).toBe("fine");
  });
});

describe("scrubEvent (the beforeSend hook)", () => {
  const dirty = () => ({
    message: `login failed for ${EMAIL}`,
    exception: { values: [{ type: "AuthError", value: `bad token ${ACCESS_JWT}` }] },
    user: { id: "1b4c2e74", email: EMAIL, ip_address: "203.0.113.9" },
    request: {
      url: `https://learn.alphonsoecosystem.app/reset?token_hash=abc123&email=${EMAIL}`,
      headers: { Authorization: `Bearer ${ACCESS_JWT}`, Cookie: "sb-access-token=zzz" },
      cookies: { session: "s" },
      data: { answer: "my private answer", password: "hunter2" },
    },
    breadcrumbs: [
      {
        category: "fetch",
        data: { url: `https://x.supabase.co/rest/v1/profiles?email=eq.${EMAIL}` },
      },
      { category: "navigation", data: { to: `/auth#access_token=${ACCESS_JWT}` } },
    ],
    extra: { route: "/learn", hint: EMAIL },
  });

  it("removes every email and JWT anywhere in the event", () => {
    const text = JSON.stringify(scrubEvent(dirty()));
    expect(text).not.toContain("gonzalez");
    expect(text).not.toContain("example.co");
    expect(text).not.toContain("eyJ");
    expect(text).not.toContain("hunter2");
    expect(text).not.toContain("my private answer");
    expect(text).not.toContain("203.0.113.9");
    expect(text).not.toContain("abc123");
  });

  it("drops user identity, request headers, cookies and body", () => {
    const out = scrubEvent(dirty());
    expect(out.user).toBeUndefined();
    expect(out.request?.headers).toBeUndefined();
    expect(out.request?.cookies).toBeUndefined();
    expect(out.request?.data).toBeUndefined();
  });

  it("keeps the diagnostic content: error type, route and path", () => {
    const out = scrubEvent(dirty());
    expect(out.exception.values[0].type).toBe("AuthError");
    expect(out.extra.route).toBe("/learn");
    expect(out.request.url).toContain("/reset");
  });
});

describe("scrubBreadcrumb (the beforeBreadcrumb hook)", () => {
  it("drops console breadcrumbs entirely", () => {
    expect(scrubBreadcrumb({ category: "console", message: "anything" })).toBeNull();
  });
  it("scrubs the message and data of the rest", () => {
    const out = scrubBreadcrumb({
      category: "xhr",
      message: `GET /x?access_token=${ACCESS_JWT}`,
      data: { who: EMAIL },
    });
    expect(JSON.stringify(out)).not.toContain("eyJ");
    expect(JSON.stringify(out)).not.toContain("gonzalez");
  });
});
