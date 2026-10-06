import { authHeaders, currentUserId } from "./auth-headers";
import type { GoalCourse, GoalPlan } from "./learning-goal";
import { LEVEL_ORDER } from "./learning-goal";

/**
 * The browser side of /api/learning-goal. The plan is computed by the server
 * (planGoal); this only asks for it, caches the last answer for offline viewing,
 * and refuses a response that is not the contract's shape. iOS and Android decode
 * the same JSON (src/lib/learning-goal.fixtures.json).
 */
export type StoredGoal = {
  course: GoalCourse;
  targetLevel: string;
  targetDate: string;
  createdAt: string;
};
export type GoalState = { goal: StoredGoal | null; plan: GoalPlan | null };

export type GoalErrorKind = "invalid" | "notSignedIn" | "unavailable" | "offline";
export class GoalError extends Error {
  /** `detail` is the server's own reason on a 400 ("That level is below yours"). */
  constructor(
    readonly kind: GoalErrorKind,
    readonly detail?: string,
  ) {
    super(kind);
    this.name = "GoalError";
  }
}

export function goalErrorMessage(kind: GoalErrorKind, detail?: string): string {
  switch (kind) {
    case "invalid":
      return detail ?? "That goal can't be saved. Check the level and date.";
    case "notSignedIn":
      return "Sign in again to use goals.";
    case "unavailable":
      return "Couldn't load your goal. Try again.";
    case "offline":
      return "You're offline. Showing your last saved plan.";
  }
}

const STATUSES = ["done", "expired", "just_started", "ahead", "on_track", "behind"];
const REALISM = ["ok", "ambitious", "unrealistic"];
const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const isStr = (v: unknown): v is string => typeof v === "string";

export function isPlan(value: unknown): value is GoalPlan {
  if (!value || typeof value !== "object") return false;
  const p = value as Record<string, unknown>;
  return (
    LEVEL_ORDER.includes(p.currentLevel as never) &&
    LEVEL_ORDER.includes(p.targetLevel as never) &&
    isStr(p.targetDate) &&
    isNum(p.lessonsInScope) &&
    isNum(p.lessonsRemaining) &&
    isNum(p.lessonsDoneLast7Days) &&
    isNum(p.requiredPerWeek) &&
    STATUSES.includes(p.status as string) &&
    REALISM.includes(p.realism as string) &&
    (p.suggestedDate === null || isStr(p.suggestedDate)) &&
    isStr(p.asOf)
  );
}

function isGoal(value: unknown): value is StoredGoal {
  if (!value || typeof value !== "object") return false;
  const g = value as Record<string, unknown>;
  return (
    isStr(g.course) &&
    isStr(g.targetLevel) &&
    isStr(g.targetDate) &&
    // The route normalises to ISO-8601 with milliseconds and Z; Swift's decoders reject
    // PostgREST's microseconds and +00:00, so a raw value here is a server bug.
    isStr(g.createdAt) &&
    /^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9:]{8}[.][0-9]{3}Z$/.test(g.createdAt)
  );
}

const cacheKey = (userId: string, course: GoalCourse) =>
  `lingua.learning-goal.v1.${userId}.${course}`;

/**
 * The last goal and plan THIS USER saw on this device, or null. Keyed by user id so a
 * shared browser never shows one account's goal to the next. Storage can be blocked
 * or corrupt.
 */
export async function readCachedGoal(
  course: GoalCourse,
): Promise<{ goal: StoredGoal; plan: GoalPlan } | null> {
  try {
    const userId = await currentUserId();
    if (!userId) return null;
    const raw = window.localStorage.getItem(cacheKey(userId, course));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { goal?: unknown; plan?: unknown };
    return isGoal(parsed.goal) && isPlan(parsed.plan)
      ? { goal: parsed.goal, plan: parsed.plan }
      : null;
  } catch {
    return null;
  }
}

async function writeCache(course: GoalCourse, state: GoalState | null) {
  try {
    const userId = await currentUserId();
    if (!userId) return;
    if (state?.goal && state.plan) {
      window.localStorage.setItem(cacheKey(userId, course), JSON.stringify(state));
    } else {
      window.localStorage.removeItem(cacheKey(userId, course));
    }
  } catch {
    // Not persisting is fine: the card just has nothing to show offline.
  }
}

function kindForStatus(status: number): GoalErrorKind {
  if (status === 400) return "invalid";
  if (status === 401 || status === 403) return "notSignedIn";
  return "unavailable";
}

async function call(url: string, init: RequestInit, fetchImpl: typeof fetch): Promise<unknown> {
  let response: Response;
  try {
    response = await fetchImpl(url, {
      ...init,
      headers: { "Content-Type": "application/json", ...(await authHeaders()) },
    });
  } catch {
    throw new GoalError("offline");
  }
  if (!response.ok) {
    let detail: string | undefined;
    if (response.status === 400) {
      try {
        const body = (await response.json()) as { error?: unknown };
        if (typeof body.error === "string") detail = body.error;
      } catch {
        // No readable reason: the generic message is used.
      }
    }
    throw new GoalError(kindForStatus(response.status), detail);
  }
  try {
    return await response.json();
  } catch {
    throw new GoalError("unavailable");
  }
}

const endpoint = "/api/learning-goal";

export async function fetchGoal(
  course: GoalCourse,
  fetchImpl: typeof fetch = fetch,
): Promise<GoalState> {
  const body = (await call(`${endpoint}?course=${course}`, {}, fetchImpl)) as Partial<GoalState>;
  const state = parseState(body);
  await writeCache(course, state);
  return state;
}

export function parseState(body: Partial<GoalState> | null): GoalState {
  if (!body || typeof body !== "object") throw new GoalError("unavailable");
  const goal = body.goal ?? null;
  const plan = body.plan ?? null;
  if (goal !== null && !isGoal(goal)) throw new GoalError("unavailable");
  if (plan !== null && !isPlan(plan)) throw new GoalError("unavailable");
  return { goal, plan };
}

export async function previewGoal(
  course: GoalCourse,
  targetLevel: string,
  targetDate: string,
  fetchImpl: typeof fetch = fetch,
): Promise<GoalPlan> {
  const query = `course=${course}&targetLevel=${encodeURIComponent(targetLevel)}&targetDate=${encodeURIComponent(targetDate)}`;
  const body = (await call(`${endpoint}?${query}`, {}, fetchImpl)) as { plan?: unknown };
  if (!isPlan(body?.plan)) throw new GoalError("unavailable");
  return body.plan;
}

export async function saveGoal(
  course: GoalCourse,
  targetLevel: string,
  targetDate: string,
  fetchImpl: typeof fetch = fetch,
): Promise<GoalState> {
  const body = (await call(
    endpoint,
    { method: "PUT", body: JSON.stringify({ course, targetLevel, targetDate }) },
    fetchImpl,
  )) as Partial<GoalState>;
  const state = parseState(body);
  await writeCache(course, state);
  return state;
}

export async function removeGoal(
  course: GoalCourse,
  fetchImpl: typeof fetch = fetch,
): Promise<void> {
  await call(`${endpoint}?course=${course}`, { method: "DELETE" }, fetchImpl);
  await writeCache(course, null);
}
