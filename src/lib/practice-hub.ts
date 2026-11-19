import { CAMPAIGNS } from "../data/campaigns";
import { SCENARIOS, type ScenarioLevel } from "../data/scenarios";
import {
  SCENARIO_FOCUS,
  allPracticeKeys,
  maxStarsInCourse,
  scenarioLevelForCefr,
  sceneKey,
  type PracticeKind,
} from "./practice-catalog";

/**
 * The Practice hub's numbers, worked out from the learner's own rows (GET /api/practice): the star counter, "Today's
 * pick" and "Continue". Pure, so every rule here is tested without a database.
 */
export type StarRow = {
  kind: PracticeKind;
  itemKey: string;
  bestStars: number;
  lastPlayedAt: string;
};

export type WeaknessEventRow = {
  category: string;
  eventType: "detected" | "resolved";
  createdAt: string;
};

export type PracticeHubData = {
  stars: StarRow[];
  cefrLevel: string | null;
  weaknessEvents: WeaknessEventRow[];
};

export type StarLookup = (kind: PracticeKind, key: string) => number;

export function starLookup(rows: readonly StarRow[]): StarLookup {
  const m = new Map(rows.map((r) => [`${r.kind}:${r.itemKey}`, r.bestStars]));
  return (kind, key) => m.get(`${kind}:${key}`) ?? 0;
}

/** Stars held, counting only items that still exist in the catalog, out of the most the course can hold. */
export function starTally(rows: readonly StarRow[]): { earned: number; total: number } {
  const stars = starLookup(rows);
  const earned = allPracticeKeys().reduce((sum, k) => sum + stars(k.kind, k.key), 0);
  return { earned, total: maxStarsInCourse() };
}

/**
 * Open weak spots, worst first: per category, detections minus resolutions (a relapse counts again, as on Profile's
 * weakness trend), most open first, the most recently seen breaking a tie. Closed categories are left out.
 */
export function topWeakSpots(events: readonly WeaknessEventRow[]): string[] {
  const by = new Map<string, { open: number; last: string }>();
  for (const e of events) {
    const v = by.get(e.category) ?? { open: 0, last: e.createdAt };
    v.open += e.eventType === "detected" ? 1 : -1;
    if (e.createdAt > v.last) v.last = e.createdAt;
    by.set(e.category, v);
  }
  return [...by.entries()]
    .filter(([, v]) => v.open > 0)
    .sort(
      (a, b) =>
        b[1].open - a[1].open || (b[1].last > a[1].last ? 1 : b[1].last < a[1].last ? -1 : 0),
    )
    .map(([category]) => category);
}

/**
 * Weak spots that only exist on the page: a spoken call cannot practice them, so Today's pick skips them. The
 * taxonomy (WEAKNESS_TAXONOMY) has one such key today; the test pins every key against this list, so a new
 * written-only key must be classified here or that test fails.
 */
export const WRITTEN_ONLY_WEAK_SPOTS: ReadonlySet<string> = new Set(["spelling"]);

export type TodaysPick = {
  scenarioId: string;
  level: ScenarioLevel;
  /** The weak spot it exercises, or null when the learner has none that a scenario at their level practices. */
  weakSpot: string | null;
};

/**
 * The scenarios the hub's call cards offer, best first (at most `limit`). The rule is Today's pick's, repeated: weak
 * spots are tried worst first, skipping written-only ones (spelling); each yields the least-starred scenario at the
 * learner's level that practices it and is not already offered (unplayed first, then catalog order). Once the weak
 * spots are used up the level's least-starred scenarios fill the rest, claiming no weak spot. The first card is
 * exactly what `todaysPick` returns.
 */
export function todaysPicks(data: PracticeHubData, limit = 3): TodaysPick[] {
  const level = scenarioLevelForCefr(data.cefrLevel);
  const stars = starLookup(data.stars);
  const atLevel = SCENARIOS.filter((s) => s.level === level);
  const taken = new Set<string>();
  const leastStarred = (list: typeof SCENARIOS) =>
    list
      .filter((s) => !taken.has(s.id))
      .reduce<(typeof SCENARIOS)[number] | null>(
        (best, s) => (!best || stars("scenario", s.id) < stars("scenario", best.id) ? s : best),
        null,
      );
  const picks: TodaysPick[] = [];
  const add = (id: string, weakSpot: string | null) => {
    taken.add(id);
    picks.push({ scenarioId: id, level, weakSpot });
  };
  for (const weak of topWeakSpots(data.weaknessEvents)) {
    if (picks.length >= limit) break;
    if (WRITTEN_ONLY_WEAK_SPOTS.has(weak)) continue;
    const pick = leastStarred(atLevel.filter((s) => SCENARIO_FOCUS[s.id]?.includes(weak)));
    if (pick) add(pick.id, weak);
  }
  while (picks.length < limit) {
    const pick = leastStarred(atLevel);
    if (!pick) break;
    add(pick.id, null);
  }
  return picks;
}

/** A scenario at the learner's level that exercises their top weak spot: the first of `todaysPicks`. */
export function todaysPick(data: PracticeHubData): TodaysPick | null {
  return todaysPicks(data, 1)[0] ?? null;
}

export type ContinuePoint = { campaignId: string; sceneIndex: number };

/**
 * Where "Continue" resumes: the campaign whose scene was played most recently and still has a scene without stars,
 * at its first such scene. A finished campaign is skipped in favour of the next most recent one; with none, null.
 */
export function continuePoint(rows: readonly StarRow[]): ContinuePoint | null {
  const stars = starLookup(rows);
  const recentScenes = rows
    .filter((r) => r.kind === "scene")
    .sort((a, b) =>
      a.lastPlayedAt < b.lastPlayedAt ? 1 : a.lastPlayedAt > b.lastPlayedAt ? -1 : 0,
    );
  const seen = new Set<string>();
  for (const row of recentScenes) {
    const campaignId = row.itemKey.split("/")[0];
    if (seen.has(campaignId)) continue;
    seen.add(campaignId);
    const campaign = CAMPAIGNS.find((c) => c.id === campaignId);
    if (!campaign) continue;
    const sceneIndex = campaign.scenes.findIndex(
      (s) => stars("scene", sceneKey(campaign.id, s.id)) === 0,
    );
    if (sceneIndex >= 0) return { campaignId, sceneIndex };
  }
  return null;
}

/** The scene a campaign card starts: its first scene without stars, or the first scene once all have some. */
export function nextSceneIndex(campaignId: string, rows: readonly StarRow[]): number {
  const stars = starLookup(rows);
  const campaign = CAMPAIGNS.find((c) => c.id === campaignId);
  if (!campaign) return 0;
  const i = campaign.scenes.findIndex((s) => stars("scene", sceneKey(campaign.id, s.id)) === 0);
  return i < 0 ? 0 : i;
}

/** A campaign's progress for its rail card: scenes that hold at least one star, out of all its scenes. */
export function campaignProgress(
  campaignId: string,
  rows: readonly StarRow[],
): { done: number; total: number; scenes: boolean[] } {
  const stars = starLookup(rows);
  const campaign = CAMPAIGNS.find((c) => c.id === campaignId);
  const scenes = (campaign?.scenes ?? []).map(
    (s) => stars("scene", sceneKey(campaignId, s.id)) > 0,
  );
  return { done: scenes.filter(Boolean).length, total: scenes.length, scenes };
}
