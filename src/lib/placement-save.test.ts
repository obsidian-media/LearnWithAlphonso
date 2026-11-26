import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { PLACEMENT_SAVE_ATTEMPTS, savePlacementWithRetry } from "./placement-save";

const noWait = { sleep: async () => {} };

describe("savePlacementWithRetry", () => {
  it("is true after one successful try, with no waiting", async () => {
    const save = vi.fn().mockResolvedValue({});
    const sleep = vi.fn(async () => {});
    expect(await savePlacementWithRetry(save, { sleep })).toBe(true);
    expect(save).toHaveBeenCalledTimes(1);
    expect(sleep).not.toHaveBeenCalled();
  });

  it("retries a failure and reports the success that follows", async () => {
    const save = vi.fn().mockRejectedValueOnce(new Error("offline")).mockResolvedValue({});
    expect(await savePlacementWithRetry(save, noWait)).toBe(true);
    expect(save).toHaveBeenCalledTimes(2);
  });

  it("gives up after the bounded number of tries and says so, never throwing", async () => {
    const save = vi.fn().mockRejectedValue(new Error("offline"));
    const sleep = vi.fn(async () => {});
    expect(await savePlacementWithRetry(save, { sleep })).toBe(false);
    expect(save).toHaveBeenCalledTimes(PLACEMENT_SAVE_ATTEMPTS);
    expect(sleep.mock.calls.map((c) => (c as unknown[])[0])).toEqual([600, 1800]);
  });
});

describe("the placement screen awaits the save", () => {
  const source = readFileSync(
    path.join(process.cwd(), "src/routes/_authenticated/placement.tsx"),
    "utf8",
  );
  it("no longer fires the save and swallows its failure", () => {
    expect(source).not.toMatch(/savePlacement\([^)]*\)\.catch\(\(\) => \{\}\)/);
    expect(source).toContain("savePlacementWithRetry(");
  });
  it("shows a retry when it did not save", () => {
    expect(source).toContain("Try saving again");
  });
});
