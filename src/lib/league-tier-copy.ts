/**
 * What learners read for each league tier. Keys are the database's league_tier values and never change;
 * only the display names do. ios/LearnWithAlphonsoKit/.../LeagueTierCopy.swift holds the same names
 * (parity test in src/lib/ios-binary-polish.test.ts).
 */
export const LEAGUE_TIER_COPY = {
  bronze: { label: "Sprout", sub: "Getting started" },
  silver: { label: "Sapling", sub: "Warming up" },
  sapphire: { label: "Grove", sub: "Consistent" },
  ruby: { label: "Treetop", sub: "Serious" },
  diamond: { label: "Summit", sub: "Elite" },
} as const;
