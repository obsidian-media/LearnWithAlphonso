import { describe, expect, it } from "vitest";
import {
  SUPPORT_LINK_IDS,
  SUPPORT_LINK_LABELS,
  SUPPORT_LINK_WEB_PATHS,
  parseSupportLinkId,
  presentSupportMessages,
  splitSupportLink,
  stripSupportLink,
  withSupportLink,
} from "./support-links";

describe("the link allow-list", () => {
  it("every id has a label and a fixed in-app web path (never a URL)", () => {
    for (const id of SUPPORT_LINK_IDS) {
      expect(SUPPORT_LINK_LABELS[id].length).toBeGreaterThan(0);
      expect(SUPPORT_LINK_WEB_PATHS[id]).toMatch(/^\/[a-z]+$/);
    }
  });

  it("accepts a listed id and drops everything else", () => {
    expect(parseSupportLinkId("subscription")).toBe("subscription");
    for (const bad of [
      "https://evil.example",
      "javascript:alert(1)",
      "Subscription",
      "subscription ",
      "",
      null,
      undefined,
      7,
      {},
      ["subscription"],
    ]) {
      expect(parseSupportLinkId(bad)).toBeNull();
    }
  });
});

describe("the stored marker", () => {
  it("round-trips an allowed link and keeps the text clean", () => {
    const stored = withSupportLink("Tap Restore Purchases.", "subscription");
    expect(stored).toContain("[[link:subscription]]");
    expect(splitSupportLink(stored)).toEqual({
      text: "Tap Restore Purchases.",
      link: "subscription",
    });
    expect(stripSupportLink(stored)).toBe("Tap Restore Purchases.");
  });

  it("stores no marker without a link", () => {
    expect(withSupportLink("Hello", null)).toBe("Hello");
  });

  it("an unknown id leaves no link and the marker never shows", () => {
    expect(splitSupportLink("Go here\n\n[[link:https://evil.example]]")).toEqual({
      text: "Go here",
      link: null,
    });
    expect(splitSupportLink("Go here [[link:nope]]")).toEqual({ text: "Go here", link: null });
  });

  it("a marker in the middle of a body is plain text, not a link", () => {
    expect(splitSupportLink("see [[link:settings]] for more").link).toBeNull();
  });
});

describe("presenting messages to the learner", () => {
  const at = "2026-11-14T10:00:00Z";
  it("links only ai messages: a learner or staff body with a marker is returned as typed", () => {
    const out = presentSupportMessages([
      { id: 1, kind: "you", body: "hi [[link:settings]]", at },
      { id: 2, kind: "ai", body: "Open it\n\n[[link:settings]]", at },
      { id: 3, kind: "support", body: "see [[link:league]]", at },
      { id: 4, kind: "system", body: "A person will reply here.", at },
      { id: 5, kind: "ai", body: "Bad\n\n[[link:https://evil.example]]", at },
    ]);
    expect(out.map((m) => m.link)).toEqual([null, "settings", null, null, null]);
    expect(out[0]!.body).toBe("hi [[link:settings]]");
    expect(out[1]!.body).toBe("Open it");
    expect(out[2]!.body).toBe("see [[link:league]]");
    expect(out[4]!.body).toBe("Bad");
  });
});
