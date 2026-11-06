import { existsSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  PROFILE_AVATARS,
  avatarSeedFor,
  avatarSrc,
  initialsFor,
  isAllowedAvatarSeed,
  parseAvatarSeed,
} from "./profile-avatars";

describe("profile avatars", () => {
  it("are the 16 approved animals, in the approved order", () => {
    expect(PROFILE_AVATARS.map((a) => a.id)).toEqual([
      "llama-rose",
      "llama-cocoa",
      "alpaca",
      "fox",
      "owl",
      "cat",
      "panda",
      "bear",
      "rabbit",
      "penguin",
      "parrot",
      "koala",
      "lion",
      "hedgehog",
      "corgi",
      "deer",
    ]);
  });

  it("every one has its picture in public/ (a missing file would show a broken image)", () => {
    for (const a of PROFILE_AVATARS) {
      expect(existsSync(path.join(process.cwd(), "public", avatarSrc(a.id))), a.id).toBe(true);
    }
  });

  it("round-trips through the public avatar seed", () => {
    expect(parseAvatarSeed(avatarSeedFor("fox"))).toBe("fox");
    expect(avatarSeedFor("fox").length).toBeLessThanOrEqual(32);
  });

  it("an old random colour seed, an unknown animal or an upload URL is initials, never an image", () => {
    expect(parseAvatarSeed("3fa9c1d2")).toBeNull();
    expect(parseAvatarSeed("animal:dragon")).toBeNull();
    expect(parseAvatarSeed("animal:https://evil.example/x.png")).toBeNull();
    expect(parseAvatarSeed(null)).toBeNull();
  });

  it("the server allows colour seeds and the 16 animals only", () => {
    expect(isAllowedAvatarSeed("3fa9c1d2")).toBe(true);
    expect(isAllowedAvatarSeed("animal:owl")).toBe(true);
    expect(isAllowedAvatarSeed("animal:dragon")).toBe(false);
    expect(isAllowedAvatarSeed("animal:../../x")).toBe(false);
    // Arbitrary strings: a URL, markup, or something longer than a seed.
    expect(isAllowedAvatarSeed("https://evil.example/x.png")).toBe(false);
    expect(isAllowedAvatarSeed("<img src=x>")).toBe(false);
    expect(isAllowedAvatarSeed("a".repeat(33))).toBe(false);
  });

  it("initials are the fallback", () => {
    expect(initialsFor("sam rivera")).toBe("S");
    expect(initialsFor("")).toBe("?");
  });
});
