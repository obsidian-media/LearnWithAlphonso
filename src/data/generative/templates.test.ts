import { describe, expect, it } from "vitest";
import { PRONOUNS, TEMPLATES } from "./templates";

describe("PRONOUNS", () => {
  it("has exactly the 7 English subject pronouns", () => {
    expect(PRONOUNS.map((p) => p.word)).toEqual(["I", "you", "he", "she", "it", "we", "they"]);
  });

  it("flags only he/she/it as 3rd-person-singular", () => {
    const thirdPerson = PRONOUNS.filter((p) => p.thirdPersonSingular).map((p) => p.word);
    expect(thirdPerson).toEqual(["he", "she", "it"]);
  });
});

describe("TEMPLATES", () => {
  it("has 2 pilot templates with unique ids", () => {
    expect(TEMPLATES).toHaveLength(2);
    const ids = TEMPLATES.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("svo-present has a verb slot that agrees with the subject slot", () => {
    const t = TEMPLATES.find((t) => t.id === "svo-present")!;
    const verbSlot = t.slots.find((s) => s.pos === "verb")!;
    expect(verbSlot.agreeWith).toBe("subject");
    expect(t.slots.some((s) => s.name === verbSlot.agreeWith)).toBe(true);
  });

  it("svo-past has a verb slot with no agreement (past tense doesn't vary by person)", () => {
    const t = TEMPLATES.find((t) => t.id === "svo-past")!;
    const verbSlot = t.slots.find((s) => s.pos === "verb")!;
    expect(verbSlot.agreeWith).toBeUndefined();
  });

  it("every template's render string has one %N placeholder per slot", () => {
    for (const t of TEMPLATES) {
      for (let i = 0; i < t.slots.length; i++) {
        expect(t.render).toContain(`%${i + 1}`);
      }
    }
  });
});
