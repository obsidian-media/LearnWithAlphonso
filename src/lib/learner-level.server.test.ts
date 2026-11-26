import { describe, expect, it } from "vitest";
import { currentCefrLevel } from "./learner-level.server";

const db = (row: { cefr_level?: unknown } | null, boom = false) => {
  const seen: [string, string][] = [];
  const q = {
    select: () => q,
    eq: (c: string, v: string) => {
      seen.push([c, v]);
      return q;
    },
    maybeSingle: async () => {
      if (boom) throw new Error("db down");
      return { data: row };
    },
  };
  return { client: { from: () => q } as never, seen };
};

describe("currentCefrLevel", () => {
  it("reads the learner's level for that course", async () => {
    const { client, seen } = db({ cefr_level: "B2" });
    expect(await currentCefrLevel(client, "u1", "fr")).toBe("B2");
    expect(seen).toEqual([
      ["user_id", "u1"],
      ["language", "fr"],
    ]);
  });
  it("is A1 for a missing row, an unknown value or a failed read", async () => {
    expect(await currentCefrLevel(db(null).client, "u1", "en")).toBe("A1");
    expect(await currentCefrLevel(db({ cefr_level: "Z9" }).client, "u1", "en")).toBe("A1");
    expect(await currentCefrLevel(db(null, true).client, "u1", "en")).toBe("A1");
  });
});
