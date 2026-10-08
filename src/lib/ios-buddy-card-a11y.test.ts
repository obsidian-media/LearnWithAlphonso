import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const SRC = path.join(process.cwd(), "ios", "LearnWithAlphonso", "Sources");
const read = (f: string) => fs.readFileSync(path.join(SRC, f), "utf8");

/** The text of `private func buddyRows(` up to the next `private ` declaration. */
function buddyRows(): string {
  const s = read("BuddySectionView.swift");
  const start = s.indexOf("private func buddyRows(");
  expect(start).toBeGreaterThan(-1);
  const end = s.indexOf("\n    private ", start + 10);
  return s.slice(start, end < 0 ? undefined : end);
}

describe("iOS matched buddy card", () => {
  it("keeps Block and Report on the matched card, OUTSIDE the combined accessibility element", () => {
    const rows = buddyRows();
    const combine = rows.indexOf(".accessibilityElement(children: .combine)");
    const menu = rows.indexOf("SocialSafetyMenu(");
    expect(combine).toBeGreaterThan(-1);
    expect(menu).toBeGreaterThan(combine); // after the combined VStack closes, so VoiceOver reaches it
    expect(rows.slice(combine, menu)).toMatch(/if buddy\.isMatch \{/);
  });
  it("labels the menu 'Block or report <name>' through the Kit wording", () => {
    expect(buddyRows()).toContain("accessibilityName: buddy.buddyName");
    expect(read("SocialSafetyControls.swift")).toMatch(
      /\.accessibilityLabel\(accessibilityName\.map\(BuddyCopy\.safetyMenuLabel\)/,
    );
  });
  it("asks with the buddy wording and says the pairing ended", () => {
    const s = read("BuddySectionView.swift");
    expect(s).toContain("BuddyCopy.blockConfirm(");
    expect(s).toContain("BuddyCopy.blockedLine(");
    expect(s).toContain("ReportSheet(target:");
  });
});
