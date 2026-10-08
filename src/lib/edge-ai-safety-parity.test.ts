import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { SAFETY_PREAMBLE } from "./ai-safety";

describe("edge SAFETY_PREAMBLE", () => {
  it("is byte-identical to the web copy", () => {
    const edge = fs.readFileSync(
      path.resolve(import.meta.dirname, "../../supabase/functions/_shared/ai-safety.ts"),
      "utf8",
    );
    expect(edge).toContain(`export const SAFETY_PREAMBLE = ${JSON.stringify(SAFETY_PREAMBLE)};`);
  });
});
