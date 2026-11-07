/**
 * Profile's three tabs (round 6.1, option A). Which section lives on which tab is data here, so the three
 * platforms can pin the same assignment (Kit ProfileTabs, Android ProfileTabs) and a test can prove no
 * section was dropped or duplicated when Profile was split.
 */
export type ProfileTab = "overview" | "progress" | "social";

export const PROFILE_TABS: readonly { id: ProfileTab; label: string }[] = [
  { id: "overview", label: "Overview" },
  { id: "progress", label: "Progress" },
  { id: "social", label: "Social" },
];

export type ProfileSectionId =
  | "bigNumbers"
  | "thisWeek"
  | "hector"
  | "settings"
  | "skills"
  | "heatMap"
  | "records"
  | "level"
  | "weakSpots"
  | "achievements"
  | "league"
  | "friends"
  | "share";

export const TAB_SECTIONS: Record<ProfileTab, readonly ProfileSectionId[]> = {
  overview: ["bigNumbers", "thisWeek", "hector", "settings"],
  progress: ["skills", "heatMap", "records", "level", "weakSpots", "achievements"],
  social: ["league", "friends", "share"],
};

/** Every section Profile had before the split (plus the skills slot), in the order the old single column showed them. */
export const ALL_SECTIONS: readonly ProfileSectionId[] = [
  "bigNumbers",
  "thisWeek",
  "heatMap",
  "records",
  "level",
  "weakSpots",
  "hector",
  "achievements",
  "league",
  "friends",
  "share",
  "settings",
  "skills",
];

/** Arrow-key / swipe step between tabs; clamps at the ends. */
export function stepTab(current: ProfileTab, delta: 1 | -1): ProfileTab {
  const i = PROFILE_TABS.findIndex((t) => t.id === current);
  return PROFILE_TABS[Math.min(PROFILE_TABS.length - 1, Math.max(0, i + delta))].id;
}

export function isProfileTab(v: unknown): v is ProfileTab {
  return PROFILE_TABS.some((t) => t.id === v);
}

/** The one-line summary on a collapsed Progress card, from counts the screen already has. */
export function plural(n: number, one: string, many: string): string {
  return n === 1 ? one : many;
}
export function heatSummary(activeDays: number): string {
  return `${activeDays.toLocaleString("en-US")} active ${plural(activeDays, "day", "days")}`;
}
export function recordsSummary(bestStreak: number): string {
  return `Best streak ${bestStreak.toLocaleString("en-US")}`;
}
export function weakSummary(total: number): string {
  return total === 0 ? "Nothing to review" : `${total} to review`;
}
export function achievementsSummary(unlocked: number, total: number): string {
  return `${unlocked} of ${total}`;
}
