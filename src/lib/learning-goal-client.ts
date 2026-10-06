import { authHeaders } from "./auth-headers";
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
  constructor(readonly kind: GoalErrorKind) {
    super(kind);
    this.name = "GoalError";
  }
}

export function goalErrorMessage(kind: GoalErrorKind): string {
  switch (kind) {
    case "invalid":
      return "That goal can't be saved. Check the level and date.";
    case "notSignedIn":
      return "Sign in again to use goals.";
    case "unavailable":
      return "Couldn't load your goal. Try again.";
    case "offline":
      return "You're offline. Showing your last saved plan.";
  }
}

const STATUSES = ["done", "just_started", "ahead", "on_track", "behind"];
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
  return isStr(g.course) && isStr(g.targetLevel) && isStr(g.targetDate) && isStr(g.createdAt);
}

const cacheKey = (course: GoalCourse) => `lingua.learning-goal.v1.${course}`;

/** The last goal and plan this device saw, or null. Storage can be blocked or corrupt. */
export function readCachedGoal(course: GoalCourse): { goal: StoredGoal; plan: GoalPlan } | null {
  try {
    const raw = window.localStorage.getItem(cacheKey(course));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { goal?: unknown; plan?: unknown };
    return isGoal(parsed.goal) && isPlan(parsed.plan)
      ? { goal: parsed.goal, plan: parsed.plan }
      : null;
  } catch {
    return null;
  }
}

function writeCache(course: GoalCourse, state: GoalState | null) {
  try {
    if (state?.goal && state.plan) {
      window.localStorage.setItem(cacheKey(course), JSON.stringify(state));
    } else {
      window.localStorage.removeItem(cacheKey(course));
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
  if (!response.ok) throw new GoalError(kindForStatus(response.status));
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
  writeCache(course, state);
  return state;
}

function parseState(body: Partial<GoalState> | null): GoalState {
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
  writeCache(course, state);
  return state;
}

export async function removeGoal(
  course: GoalCourse,
  fetchImpl: typeof fetch = fetch,
): Promise<void> {
  await call(`${endpoint}?course=${course}`, { method: "DELETE" }, fetchImpl);
  writeCache(course, null);
}
