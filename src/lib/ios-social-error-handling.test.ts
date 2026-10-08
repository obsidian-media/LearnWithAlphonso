import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const SRC = path.join(process.cwd(), "ios", "LearnWithAlphonso", "Sources");
const read = (f: string) => fs.readFileSync(path.join(SRC, f), "utf8");

describe("iOS social views", () => {
  for (const file of ["TeamsView.swift", "DuelsView.swift", "BuddySectionView.swift"]) {
    it(`${file} has no try? on a user-visible call`, () => {
      // Allowed: try? await Task.sleep (a cancelled sleep is not a failure).
      const offenders = read(file)
        .split("\n")
        .filter((l) => /try\?/.test(l) && !/Task\.sleep/.test(l));
      expect(offenders).toEqual([]);
    });
  }
  it("no raw reason code reaches the screen", () => {
    for (const file of ["TeamsView.swift", "DuelsView.swift"]) {
      expect(read(file), file).not.toMatch(/errorMessage = result\??\.reason/);
      expect(read(file), file).toContain("SocialReasonCopy.");
    }
  });
  it("Settings saves the name through confirm_display_name and maps the error", () => {
    const settings = read("SettingsView.swift");
    expect(settings).toContain("client.confirmDisplayName(");
    expect(settings).toContain("SocialReasonCopy.nameSaveMessage(for: error)");
    expect(settings).not.toContain('"Couldn\'t save your name. Try again."');
  });
  it("the owner's kick list marks blocked members", () => {
    const teams = read("TeamsView.swift");
    expect(teams).toMatch(/if member\.isBlocked \{[\s\S]{0,300}Text\("Blocked"\)/);
    expect(teams).toContain("!member.isBlocked");
  });
});
