import { useCallback, useEffect, useRef, useState } from "react";
import type { Course } from "../data/courses";
import { authHeaders } from "./auth-headers";
import type { LearningPath, PathType } from "./path-plan";
import { PATH_TYPES } from "./path-plan";

/**
 * The browser side of /api/learning-path. The plan is computed by the server (planPath); this only asks for it and
 * refuses a response that is not the contract's shape. iOS and Android decode the same JSON
 * (src/lib/learning-path.fixtures.json).
 */
export type PathAction =
  | { action: "set_off"; off: Exclude<PathType, "lesson">[] }
  | { action: "lessons_first" }
  | { action: "resume" }
  | { action: "set_daily_minutes"; dailyMinutes: number }
  | { action: "set_rest_day"; restDay: number | "none" };

export type PathLoad =
  | { kind: "loading" }
  | { kind: "none" }
  | { kind: "ready"; path: LearningPath }
  | { kind: "error"; offline: boolean };

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object";

/** True when `value` has every part the screens read. Exported for the contract test. */
export function isPath(value: unknown): value is LearningPath {
  if (!isObj(value)) return false;
  const p = value;
  return (
    typeof p.status === "string" &&
    isObj(p.progress) &&
    Array.isArray(p.mix) &&
    p.mix.length === PATH_TYPES.length &&
    isObj(p.today) &&
    Array.isArray((p.today as { items?: unknown }).items) &&
    Array.isArray(p.week) &&
    Array.isArray(p.road) &&
    Array.isArray(p.recovery) &&
    Array.isArray(p.why) &&
    Array.isArray(p.streaks) &&
    typeof p.dailyMinutes === "number"
  );
}

class PathFetchError extends Error {
  constructor(readonly offline: boolean) {
    super(offline ? "offline" : "unavailable");
  }
}

async function request(
  course: Course,
  init: RequestInit | undefined,
  fetchImpl: typeof fetch,
): Promise<LearningPath | null> {
  let response: Response;
  try {
    response = await fetchImpl(
      init ? "/api/learning-path" : `/api/learning-path?course=${course}`,
      {
        ...init,
        headers: { "Content-Type": "application/json", ...(await authHeaders()) },
      },
    );
  } catch {
    throw new PathFetchError(true);
  }
  if (!response.ok) throw new PathFetchError(false);
  const body = (await response.json().catch(() => null)) as { path?: unknown } | null;
  if (!body || !("path" in body)) throw new PathFetchError(false);
  if (body.path === null) return null;
  if (!isPath(body.path)) throw new PathFetchError(false);
  return body.path;
}

export const fetchPath = (course: Course, fetchImpl: typeof fetch = fetch) =>
  request(course, undefined, fetchImpl);

export const changePath = (course: Course, change: PathAction, fetchImpl: typeof fetch = fetch) =>
  request(course, { method: "PUT", body: JSON.stringify({ course, ...change }) }, fetchImpl);

/** The path for one course, with a way to apply a choice and a way to reload (after the goal changes). */
export function usePath(course: Course) {
  const [state, setState] = useState<PathLoad>({ kind: "loading" });
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);
  const latest = useRef(0);

  const apply = useCallback(async (run: () => Promise<LearningPath | null>, isAction: boolean) => {
    const id = ++latest.current;
    if (isAction) setBusy(true);
    try {
      const path = await run();
      if (id !== latest.current) return;
      setFailed(null);
      setState(path ? { kind: "ready", path } : { kind: "none" });
    } catch (error) {
      if (id !== latest.current) return;
      const offline = error instanceof PathFetchError && error.offline;
      if (isAction)
        setFailed(
          offline
            ? "You are offline. Try again when connected."
            : "That could not be saved. Try again.",
        );
      else setState({ kind: "error", offline });
    } finally {
      if (isAction && id === latest.current) setBusy(false);
    }
  }, []);

  const reload = useCallback(() => {
    setState({ kind: "loading" });
    return apply(() => fetchPath(course), false);
  }, [apply, course]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const change = useCallback(
    (c: PathAction) => apply(() => changePath(course, c), true),
    [apply, course],
  );
  return { state, busy, failed, reload, change };
}
