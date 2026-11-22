import type { Scope } from "./staff-scopes";
import { aiCostPlaceholders } from "./ai-cost-numbers";

/**
 * The numbers dashboard, without the framework: which groups a person may receive, the window rule, the per-group
 * isolation (a missing key is "not_connected", a failing provider is "error" for that group only, never a 0), the
 * short server-side cache, and the AI cost estimate. Pure and injectable so every rule is tested directly
 * (numbers-core.test.ts). The real provider calls live in numbers-sources.server.ts.
 *
 * What a response may contain: counts, sums, averages, rates, money totals and fixed labels. Never a user id, a name
 * or an email (numbers-core.test.ts asserts the keys).
 */

export const WINDOW_CHOICES = [1, 7, 30, 90] as const;
export type WindowDays = (typeof WINDOW_CHOICES)[number];
export const DEFAULT_WINDOW: WindowDays = 7;

/** Only 1 (today, UTC), 7, 30 and 90 are accepted; anything else (a string, 14, 0, -1, NaN) is refused. */
export function parseWindow(value: unknown): WindowDays | null {
  return (WINDOW_CHOICES as readonly unknown[]).includes(value) ? (value as WindowDays) : null;
}

export const PROVIDER_TIMEOUT_MS = 8_000;
export const CACHE_TTL_MS = 5 * 60_000;
export const APP_STORE_TIMEOUT_MS = 25_000;
export const APP_STORE_CACHE_MS = 6 * 60 * 60_000;

export type GroupKey =
  "own" | "revenuecat" | "aicost" | "sentry" | "posthog" | "appstore" | "googleplay";

export type GroupState = "ok" | "not_connected" | "error";

export type TileKind = "number" | "percent" | "money" | "usd" | "days" | "rating" | "text" | "list";

/** Dollars as the page writes them: whole above 100, cents above 1, a tenth of a cent below (per-call costs are tiny). */
export function formatUsd(v: number): string {
  const digits = Math.abs(v) >= 100 ? 0 : Math.abs(v) >= 1 ? 2 : 3;
  return `$${v.toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits })}`;
}

/** One point of a per-day series: a UTC date (YYYY-MM-DD) and the count for that day. */
export type SeriesPoint = { day: string; value: number };

export type Tile = {
  id: string;
  label: string;
  kind: TileKind;
  /** null = no value to show (see `reason`); never a stand-in 0. */
  value: number | string | null;
  rows?: { label: string; value: number; unit?: "%" | "usd" }[];
  /** The same measure over the equal-length window right before this one; absent when it is not comparable or unread. */
  previous?: number | null;
  /** A per-day series (real counts, oldest first); only the tile that is a chart has one. */
  series?: SeriesPoint[];
  /** The time window or basis, e.g. "last 7 days". */
  note: string;
  /** Why there is no value, shown instead of one. */
  reason?: string;
};

export type NumbersGroup = {
  key: GroupKey;
  title: string;
  source: string;
  state: GroupState;
  tiles: Tile[];
  /** Only on a "not_connected" group whose cause is a missing setting: the NAMES of the env vars to set. Never values. */
  envNames?: string[];
};

export type NumbersResponse = {
  windowDays: WindowDays;
  generatedAt: string;
  groups: NumbersGroup[];
};

export type GroupDef = {
  key: GroupKey;
  title: string;
  source: string;
  /** The scope that unlocks this group. Revenue and cost groups need numbers.revenue, the rest numbers.read. */
  scope: Extract<Scope, "numbers.read" | "numbers.revenue">;
  /** A longer provider budget than the default 8 s (many small calls). */
  timeoutMs?: number;
  /** A longer cache than the default 5 minutes (the provider's data is a day or more behind anyway). */
  cacheTtlMs?: number;
  /** The tiles shown when the group has no data, so the page keeps its shape. */
  placeholders: (
    windowDays: WindowDays,
  ) => { id: string; label: string; kind: TileKind; note: string }[];
};

/** The note for our own counts: a one-day window is today since midnight UTC. */
const last = (w: number) => (w === 1 ? "today (UTC)" : `last ${w} days`);
/** The note for a provider's numbers: a one-day window is the provider's last 24 hours. */
const lastP = (w: number) => (w === 1 ? "last 24 hours" : `last ${w} days`);

export const GROUP_DEFS: readonly GroupDef[] = [
  {
    key: "own",
    title: "Our database",
    source: "own aggregates",
    scope: "numbers.read",
    placeholders: (w) => [
      { id: "new_today", label: "New learners", kind: "number", note: "today" },
      { id: "new_window", label: "New learners", kind: "number", note: last(w) },
      { id: "dau", label: "Active learners (DAU)", kind: "number", note: "today" },
      { id: "active_window", label: `Active learners (${w} days)`, kind: "number", note: last(w) },
      { id: "lessons", label: "Lessons finished", kind: "number", note: last(w) },
      { id: "stories", label: "Stories read", kind: "number", note: last(w) },
      {
        id: "perfect",
        label: "Perfect lessons",
        kind: "percent",
        note: `of lessons finished, ${last(w)}`,
      },
      { id: "by_course", label: "Active learners by course", kind: "list", note: last(w) },
      { id: "dau_series", label: "Active learners per day", kind: "list", note: "UTC days" },
      {
        id: "reactivated",
        label: "Reactivated",
        kind: "number",
        note: "active today after 14+ quiet days",
      },
      { id: "practice", label: "Practice calls", kind: "number", note: last(w) },
      { id: "podcasts", label: "Podcasts finished", kind: "number", note: last(w) },
      { id: "avg_streak", label: "Average streak", kind: "days", note: "all active streaks" },
      { id: "ret_d1", label: "Retention, day 1", kind: "percent", note: "joined 2 days ago" },
      { id: "ret_d7", label: "Retention, day 7", kind: "percent", note: "joined 8 days ago" },
      { id: "ret_d30", label: "Retention, day 30", kind: "percent", note: "joined 31 days ago" },
      { id: "open", label: "Open reports / tickets", kind: "text", note: "right now" },
      {
        id: "ai_calls",
        label: "AI calls by kind",
        kind: "list",
        note: `${last(w)}, from ai_usage`,
      },
    ],
  },
  {
    key: "revenuecat",
    title: "RevenueCat",
    source: "subscriptions",
    scope: "numbers.revenue",
    placeholders: (w) => [
      { id: "active_pro", label: "Active Pro", kind: "number", note: "right now" },
      { id: "trials", label: "Trials", kind: "number", note: "right now" },
      { id: "new_subs", label: "New subscriptions", kind: "number", note: lastP(w) },
      { id: "churn", label: "Churn rate", kind: "percent", note: lastP(w) },
      { id: "mrr", label: "MRR (estimate)", kind: "money", note: "right now" },
    ],
  },
  {
    key: "aicost",
    title: "AI cost",
    source: "measured per call (ai_cost_log)",
    scope: "numbers.revenue",
    placeholders: (w) => aiCostPlaceholders(w),
  },
  {
    key: "sentry",
    title: "Sentry",
    source: "crashes",
    scope: "numbers.read",
    placeholders: (w) => [
      {
        id: "crash_free",
        label: "Crash-free sessions",
        kind: "list",
        note: `${lastP(Math.min(w, 90))}, per app`,
      },
      { id: "new_issues", label: "Top new issues", kind: "list", note: lastP(w) },
    ],
  },
  {
    key: "posthog",
    title: "PostHog",
    source: "product analytics",
    scope: "numbers.read",
    placeholders: (w) => [
      { id: "first_lesson", label: "First run to first lesson", kind: "percent", note: lastP(w) },
      { id: "onboarding", label: "Onboarding drop-off", kind: "list", note: lastP(w) },
    ],
  },
  {
    key: "appstore",
    title: "App Store",
    source: "App Store Connect",
    scope: "numbers.revenue",
    // Up to 30 daily sales reports, ten at a time: more than the default 8 s. Apple's reports are a day behind, so
    // six hours of cache loses nothing.
    timeoutMs: APP_STORE_TIMEOUT_MS,
    cacheTtlMs: APP_STORE_CACHE_MS,
    placeholders: (w) => [
      {
        id: "downloads",
        label: "Downloads",
        kind: "number",
        note: `${lastP(Math.min(w, 30))}, to yesterday`,
      },
      { id: "rating", label: "Rating", kind: "rating", note: "all time" },
    ],
  },
  {
    key: "googleplay",
    title: "Google Play",
    source: "Play Console",
    scope: "numbers.revenue",
    placeholders: (w) => [
      {
        id: "installs",
        label: "Installs",
        kind: "number",
        note: `${lastP(Math.min(w, 90))}, to a few days ago`,
      },
    ],
  },
];

/** Which groups a person with these scopes may receive. The server uses this; the page only hides what it is not sent. */
export function groupsFor(scopes: readonly string[]): GroupDef[] {
  return GROUP_DEFS.filter((g) => scopes.includes(g.scope));
}

export const NUMBERS_FORBIDDEN_MESSAGE = "Forbidden: missing scope numbers.read";

/** A provider that is switched off: its env is not set. Not an error; shown as "Not connected". */
export class NotConnectedError extends Error {
  /** `envNames`: the names (never the values) of the settings that are missing, so the page can say what to set. */
  constructor(
    public readonly reason: string,
    public readonly envNames: readonly string[] = [],
  ) {
    super(reason);
    this.name = "NotConnectedError";
  }
}

export type SourceContext = {
  windowDays: WindowDays;
  signal: AbortSignal;
  now: Date;
  /** The own-database aggregates, fetched once per request and shared (the cost group derives from them). */
  own: () => Promise<OwnAggregates>;
  /** The growth aggregates (previous windows, series, by course ...), fetched once per request; may reject. */
  growth?: () => Promise<GrowthAggregates>;
};

export type OwnFn = (ctx: {
  windowDays: WindowDays;
  now: Date;
  signal: AbortSignal;
}) => Promise<OwnAggregates>;
/** What admin_numbers_growth(p_days) returns (counts only). Previous-window values are null when not comparable. */
export type GrowthAggregates = {
  newPrev: number | null;
  activePrev: number | null;
  lessonsPrev: number | null;
  storiesPrev: number | null;
  storiesRead: number;
  /** Share of finished lessons answered perfectly; null with no lessons in the window. */
  perfectPct: number | null;
  byCourse: { language: string; learners: number }[];
  dauSeries: { day: string; active: number }[];
  reactivated: number;
};
export type GrowthFn = (ctx: {
  windowDays: WindowDays;
  now: Date;
  signal: AbortSignal;
}) => Promise<GrowthAggregates>;
export type SourceFn = (ctx: SourceContext) => Promise<Tile[]>;
export type Sources = Record<GroupKey, SourceFn>;

/** What admin_numbers_own(p_days) returns (counts only). */
export type OwnAggregates = {
  newToday: number;
  newWindow: number;
  activeToday: number;
  activeWindow: number;
  lessons: number;
  practiceCalls: number;
  podcastsFinished: number;
  avgStreak: number | null;
  retention: { d1: number | null; d7: number | null; d30: number | null };
  openReports: number;
  openTickets: number;
  aiByKind: Record<string, number>;
};

/** Kinds that are not calls (so they stay out of the "AI calls by kind" list). */
export const NON_CALL_KINDS: readonly string[] = ["stt_seconds"];

// ---------------------------------------------------------------------------------------------------------------

type CacheEntry = { at: number; tiles: Tile[] };
const cache = new Map<string, CacheEntry>();
export function clearNumbersCache(): void {
  cache.clear();
}

function placeholdersAs(def: GroupDef, windowDays: WindowDays, reason: string): Tile[] {
  return def.placeholders(windowDays).map((p) => ({ ...p, value: null, reason }));
}

/** The time one group may take: a test override wins, then the group's own budget, then the 8 s default. */
export function groupBudgetMs(def: Pick<GroupDef, "timeoutMs">, override?: number): number {
  return override ?? def.timeoutMs ?? PROVIDER_TIMEOUT_MS;
}

async function runGroup(
  def: GroupDef,
  sources: Sources,
  base: Omit<SourceContext, "signal">,
  timeoutMs: number,
  useCache: boolean,
): Promise<NumbersGroup> {
  const head = { key: def.key, title: def.title, source: def.source };
  const cacheKey = `${def.key}:${base.windowDays}`;
  const hit = cache.get(cacheKey);
  if (useCache && hit && base.now.getTime() - hit.at < (def.cacheTtlMs ?? CACHE_TTL_MS)) {
    return { ...head, state: "ok", tiles: hit.tiles };
  }
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        controller.abort();
        reject(new Error("timeout"));
      }, timeoutMs);
    });
    const tiles = await Promise.race([
      sources[def.key]({ ...base, signal: controller.signal }),
      timeout,
    ]);
    cache.set(cacheKey, { at: base.now.getTime(), tiles });
    return { ...head, state: "ok", tiles };
  } catch (e) {
    if (e instanceof NotConnectedError) {
      return {
        ...head,
        state: "not_connected",
        tiles: placeholdersAs(def, base.windowDays, e.reason),
        ...(e.envNames.length > 0 ? { envNames: [...e.envNames] } : {}),
      };
    }
    // The cause stays on the server; the page only learns that this group could not load.
    console.error(`numbers: ${def.key} failed`, e instanceof Error ? e.message : "unknown");
    return {
      ...head,
      state: "error",
      tiles: placeholdersAs(def, base.windowDays, "Try again in a minute"),
    };
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/**
 * Builds the response for one person. Only the groups their scopes allow are even attempted (a group they may not
 * see is never fetched, so its data cannot leak by a bug further down). Each group runs on its own: one failing or
 * timing out leaves the others intact.
 */
export async function collectNumbers(input: {
  scopes: readonly string[];
  windowDays: unknown;
  sources: Sources;
  /** Reads the own-database aggregates once; the "own" and "aicost" sources both go through ctx.own(). */
  fetchOwn: OwnFn;
  /** Reads the growth aggregates once. Optional: without it the tiles that need it say "Could not read". */
  fetchGrowth?: GrowthFn;
  now?: Date;
  refresh?: boolean;
  timeoutMs?: number;
  /** Only these groups (the Home money card asks for three, not all seven). Scope filtering still applies first. */
  only?: readonly GroupKey[];
}): Promise<NumbersResponse> {
  const windowDays = parseWindow(input.windowDays);
  if (windowDays === null) throw new Error("Choose today, 7, 30 or 90 days.");
  const allowed = groupsFor(input.scopes).filter((g) => !input.only || input.only.includes(g.key));
  if (allowed.length === 0) throw new Error(NUMBERS_FORBIDDEN_MESSAGE);
  const now = input.now ?? new Date();

  let ownPromise: Promise<OwnAggregates> | null = null;
  const own = () => {
    ownPromise ??= (async () => {
      const controller = new AbortController();
      const t = setTimeout(() => controller.abort(), input.timeoutMs ?? PROVIDER_TIMEOUT_MS);
      try {
        return await input.fetchOwn({ windowDays, now, signal: controller.signal });
      } finally {
        clearTimeout(t);
      }
    })();
    return ownPromise;
  };

  let growthPromise: Promise<GrowthAggregates> | null = null;
  const growth = () => {
    growthPromise ??= (async () => {
      if (!input.fetchGrowth) throw new Error("growth not configured");
      const controller = new AbortController();
      const t = setTimeout(() => controller.abort(), input.timeoutMs ?? PROVIDER_TIMEOUT_MS);
      try {
        return await input.fetchGrowth({ windowDays, now, signal: controller.signal });
      } finally {
        clearTimeout(t);
      }
    })();
    return growthPromise;
  };

  const groups = await Promise.all(
    allowed.map((def) =>
      runGroup(
        def,
        input.sources,
        { windowDays, now, own, growth },
        groupBudgetMs(def, input.timeoutMs),
        !input.refresh,
      ),
    ),
  );
  return { windowDays, generatedAt: now.toISOString(), groups };
}

// ---------------------------------------------------------------------------------------------------------------
// The group built from the own aggregates (pure; the tests feed them numbers).

/**
 * The own-database tiles. `growth` is null when its read failed: the tiles that need it then say "Could not read" (never
 * a 0), and the rest are unaffected. A previous-window value is attached only when it was read.
 */
export function ownTiles(
  a: OwnAggregates,
  windowDays: WindowDays,
  growth: GrowthAggregates | null = null,
): Tile[] {
  const ph = GROUP_DEFS[0]!.placeholders(windowDays);
  const note = (id: string) => ph.find((p) => p.id === id)!;
  const t = (
    id: string,
    value: number | null,
    reason?: string,
    previous?: number | null,
  ): Tile => ({
    ...note(id),
    value,
    ...(reason ? { reason } : {}),
    ...(previous !== undefined && previous !== null ? { previous } : {}),
  });
  const noCohort = "Nobody joined that day";
  const g = <K extends keyof GrowthAggregates>(k: K): GrowthAggregates[K] | null =>
    growth ? growth[k] : null;
  const unread = "Could not read";
  const calls = Object.entries(a.aiByKind)
    .filter(([k]) => !NON_CALL_KINDS.includes(k))
    .sort((x, y) => y[1] - x[1] || x[0].localeCompare(y[0]))
    .map(([label, value]) => ({ label, value }));
  const courseRows = (growth?.byCourse ?? []).map((c) => ({
    label: c.language,
    value: c.learners,
  }));
  const series = growth?.dauSeries.map((p) => ({ day: p.day, value: p.active })) ?? [];
  const tiles: Tile[] = [
    t("new_today", a.newToday),
    t("new_window", a.newWindow, undefined, g("newPrev")),
    t("dau", a.activeToday),
    t("active_window", a.activeWindow, undefined, g("activePrev")),
    t("lessons", a.lessons, undefined, g("lessonsPrev")),
    growth
      ? t("stories", growth.storiesRead, undefined, growth.storiesPrev)
      : t("stories", null, unread),
    growth
      ? t("perfect", growth.perfectPct, "No lessons in this window")
      : t("perfect", null, unread),
    !growth
      ? { ...note("by_course"), value: null, reason: unread }
      : courseRows.length > 0
        ? { ...note("by_course"), value: null, rows: courseRows }
        : { ...note("by_course"), value: null, reason: "No lessons in this window" },
    !growth
      ? { ...note("dau_series"), value: null, reason: unread }
      : series.length >= 2
        ? { ...note("dau_series"), value: null, series }
        : { ...note("dau_series"), value: null, reason: "No data yet" },
    growth ? t("reactivated", growth.reactivated) : t("reactivated", null, unread),
    t("practice", a.practiceCalls),
    t("podcasts", a.podcastsFinished),
    t("avg_streak", a.avgStreak, "No active streaks"),
    t("ret_d1", a.retention.d1, noCohort),
    t("ret_d7", a.retention.d7, noCohort),
    t("ret_d30", a.retention.d30, noCohort),
    { ...note("open"), value: `${a.openReports} / ${a.openTickets}` },
    calls.length > 0
      ? { ...note("ai_calls"), value: null, rows: calls }
      : { ...note("ai_calls"), value: null, reason: "No AI calls in this window" },
  ];
  return tiles.map((tile) =>
    tile.value === null && tile.reason === undefined && !tile.rows && !tile.series
      ? { ...tile, reason: "No data" }
      : tile,
  );
}
