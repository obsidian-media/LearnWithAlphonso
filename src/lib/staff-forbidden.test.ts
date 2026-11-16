import { describe, expect, it } from "vitest";
import { forbiddenLine, forbiddenOrSignIn } from "./staff-forbidden";
import { SCOPES } from "./staff-scopes";

describe("forbiddenOrSignIn", () => {
  it("a signed-in person missing the scope gets a forbidden result, not a redirect", () => {
    const result = forbiddenOrSignIn(
      new Error("Forbidden: missing scope reports.manage"),
      "reports.manage",
    );
    expect(result).toEqual({ forbidden: true, scope: "reports.manage" });
  });

  it("an owner-only refusal is forbidden too", () => {
    expect(forbiddenOrSignIn(new Error("Only an owner can manage staff."), "staff.manage")).toEqual(
      {
        forbidden: true,
        scope: "staff.manage",
      },
    );
  });

  it("a signed-out person (or any other failure) is sent to sign in", () => {
    for (const e of [new Error("Unauthorized"), new Error("boom"), "x", null]) {
      let thrown: unknown;
      try {
        forbiddenOrSignIn(e, "podcasts.manage");
      } catch (t) {
        thrown = t;
      }
      expect(thrown, String(e)).toBeDefined();
      expect(JSON.stringify((thrown as { options?: unknown }).options ?? thrown)).toContain(
        "/signin",
      );
    }
  });
});

describe("forbiddenLine", () => {
  it("each page names its own access, and the support line is unchanged", () => {
    expect(forbiddenLine("support.read")).toBe(
      "Ask the owner to add the Support role to your account.",
    );
    expect(forbiddenLine("users.read")).toBe("Ask the owner to add Users access to your account.");
    expect(forbiddenLine("podcasts.manage")).toBe(
      "Ask the owner to add Podcasts access to your account.",
    );
  });

  it("every console page scope has its own wording", () => {
    for (const scope of [
      "users.read",
      "staff.manage",
      "audit.read",
      "reports.manage",
      "podcasts.manage",
      "support.read",
      "numbers.read",
    ] as const) {
      expect(SCOPES).toContain(scope);
      expect(forbiddenLine(scope)).not.toContain("add access");
    }
    expect(
      new Set(["users.read", "audit.read", "reports.manage"].map((s) => forbiddenLine(s as never)))
        .size,
    ).toBe(3);
  });
});
