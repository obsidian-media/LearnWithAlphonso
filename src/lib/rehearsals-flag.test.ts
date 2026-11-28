import { afterEach, describe, expect, it, vi } from "vitest";
import { rehearsalsEnabledFor } from "./rehearsals-flag";

/** A stand-in for the service-role client that answers one rehearsals_off read and records what it was asked. */
function fakeDb(
  answer: { data: { user_id: string } | null; error: { message: string } | null } | "throw",
) {
  const asked: unknown[][] = [];
  const db = {
    from: (table: string) => {
      asked.push(["from", table]);
      return {
        select: (cols: string) => {
          asked.push(["select", cols]);
          return {
            eq: (col: string, value: string) => {
              asked.push(["eq", col, value]);
              return {
                maybeSingle: async () => {
                  if (answer === "throw") throw new Error("down");
                  return answer;
                },
              };
            },
          };
        },
      };
    },
  };
  return { db, asked };
}

afterEach(() => vi.unstubAllEnvs());

describe("rehearsalsEnabledFor", () => {
  it("is off for everyone while the global switch is off, and does not even read the account", async () => {
    const { db, asked } = fakeDb({ data: null, error: null });
    expect(await rehearsalsEnabledFor(db, "u1")).toBe(false);
    vi.stubEnv("REHEARSALS_ENABLED", "1");
    expect(await rehearsalsEnabledFor(db, "u1")).toBe(false);
    expect(asked).toEqual([]);
  });

  it("is on for an account with no off row when the global switch is on", async () => {
    vi.stubEnv("REHEARSALS_ENABLED", "true");
    const { db, asked } = fakeDb({ data: null, error: null });
    expect(await rehearsalsEnabledFor(db, "u1")).toBe(true);
    expect(asked).toEqual([
      ["from", "rehearsals_off"],
      ["select", "user_id"],
      ["eq", "user_id", "u1"],
    ]);
  });

  it("is off for an account that has an off row, even though the global switch is on", async () => {
    vi.stubEnv("REHEARSALS_ENABLED", "true");
    expect(
      await rehearsalsEnabledFor(fakeDb({ data: { user_id: "u1" }, error: null }).db, "u1"),
    ).toBe(false);
  });

  it("fails closed: an unreadable switch (an error, or a throw) is off", async () => {
    vi.stubEnv("REHEARSALS_ENABLED", "true");
    expect(
      await rehearsalsEnabledFor(fakeDb({ data: null, error: { message: "down" } }).db, "u1"),
    ).toBe(false);
    expect(await rehearsalsEnabledFor(fakeDb("throw").db, "u1")).toBe(false);
  });
});
