import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  isAccountSuspendedError,
  SUSPENDED_BODY,
  SUSPENDED_TITLE,
  useAccountStatus,
} from "./account-suspended";
import { SUPPORT_EMAIL } from "./legal-required-phrases";

describe("isAccountSuspendedError", () => {
  it("recognises the API answer (a thrown error or a plain object)", () => {
    expect(isAccountSuspendedError(new Error("account_suspended"))).toBe(true);
    expect(isAccountSuspendedError({ message: "account_suspended" })).toBe(true);
    expect(isAccountSuspendedError(new Error("Request failed: account_suspended"))).toBe(true);
  });
  it("recognises Supabase's banned sign-in error", () => {
    expect(isAccountSuspendedError({ code: "user_banned", message: "x" })).toBe(true);
    expect(isAccountSuspendedError({ message: "User is banned" })).toBe(true);
  });
  it("is false for ordinary failures", () => {
    expect(isAccountSuspendedError(new Error("Invalid login credentials"))).toBe(false);
    expect(isAccountSuspendedError(new Error("Unauthorized: Invalid token"))).toBe(false);
    expect(isAccountSuspendedError(null)).toBe(false);
    expect(isAccountSuspendedError("account_suspended")).toBe(false);
  });
});

describe("the suspended copy", () => {
  it("says it plainly and points at the existing support address", () => {
    expect(SUSPENDED_TITLE).toBe("This account is suspended.");
    expect(SUSPENDED_BODY(SUPPORT_EMAIL)).toBe(
      `If you think this is a mistake, contact support at ${SUPPORT_EMAIL}.`,
    );
  });
});

describe("the account status store", () => {
  it("starts not suspended and can be set", () => {
    expect(useAccountStatus.getState().suspended).toBe(false);
    useAccountStatus.getState().setSuspended();
    expect(useAccountStatus.getState().suspended).toBe(true);
    useAccountStatus.setState({ suspended: false });
  });
});

describe("web wiring", () => {
  it("every server call is watched for account_suspended (start.ts)", () => {
    const start = readFileSync("src/start.ts", "utf8");
    expect(start).toContain("watchAccountSuspended");
    expect(start).toMatch(/functionMiddleware:\s*\[[^\]]*watchAccountSuspended/);
  });
  it("a banned sign-in shows the suspended screen (auth.tsx) and the root renders it", () => {
    expect(readFileSync("src/routes/auth.tsx", "utf8")).toContain("isAccountSuspendedError");
    const root = readFileSync("src/routes/__root.tsx", "utf8");
    expect(root).toContain("SuspendedScreen");
    expect(root).toContain("useAccountStatus");
  });
});
