import type { Course } from "@/data/course-meta";
import { authHeaders } from "./auth-headers";
import type { RehearsalBrief } from "./rehearsal-brief";
import type { EventKind } from "./rehearsal-rules";

/**
 * The browser side of /api/rehearsal (src/routes/api/rehearsal.ts). The shapes here are what the server returns, so
 * the native clients decode the same JSON.
 */
export type Rehearsal = {
  id: string;
  course: Course;
  eventKind: EventKind;
  eventDate: string | null;
  counterpart: string;
  worries: string | null;
  brief: RehearsalBrief;
  status: "active" | "done" | "cancelled";
  free: boolean;
  outcome: unknown;
  createdAt: string;
  closedAt: string | null;
};

/** A closed rehearsal in the history list: no brief, no words of the learner's. */
export type RehearsalSummary = Pick<
  Rehearsal,
  | "id"
  | "course"
  | "eventKind"
  | "eventDate"
  | "status"
  | "free"
  | "outcome"
  | "createdAt"
  | "closedAt"
>;

export type RehearsalState = {
  active: Rehearsal | null;
  history: RehearsalSummary[];
  /** True while the account's one free rehearsal has not been used. */
  freeAvailable: boolean;
};

export type RehearsalIntake = {
  course: Course;
  eventKind: EventKind;
  /** YYYY-MM-DD, or null for "not sure yet". */
  eventDate: string | null;
  counterpart: string;
  worries: string | null;
};

/** What a refused request means to the learner; the screens turn each into words. */
export type RehearsalError =
  | "paywall"
  | "retry"
  | "blocked_text"
  | "active_exists"
  | "not_found"
  | "not_enabled"
  | "invalid"
  | "consent"
  | "failed";

export type Result<T> = { ok: true; value: T } | { ok: false; error: RehearsalError };

function errorOf(status: number, code: unknown): RehearsalError {
  if (status === 402) return "paywall";
  if (status === 503) return "retry";
  if (status === 409) return "active_exists";
  if (status === 404) return code === "not_enabled" ? "not_enabled" : "not_found";
  if (status === 403) return "consent";
  if (status === 400) return code === "blocked_text" ? "blocked_text" : "invalid";
  return "failed";
}

async function call<T>(init: () => Promise<Response>): Promise<Result<T>> {
  try {
    const res = await init();
    const body = (await res.json().catch(() => ({}))) as { error?: unknown };
    if (!res.ok) return { ok: false, error: errorOf(res.status, body.error) };
    return { ok: true, value: body as T };
  } catch {
    return { ok: false, error: "failed" };
  }
}

async function post<T>(body: Record<string, unknown>): Promise<Result<T>> {
  return call<T>(async () =>
    fetch("/api/rehearsal", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(await authHeaders()) },
      body: JSON.stringify(body),
    }),
  );
}

export const fetchRehearsals = (course: Course) =>
  call<RehearsalState>(async () =>
    fetch(`/api/rehearsal?course=${course}`, { headers: await authHeaders() }),
  );

export const createRehearsal = (intake: RehearsalIntake) =>
  post<{ rehearsal: Rehearsal }>({ action: "create", ...intake });

export const adjustRehearsal = (id: string, intake: RehearsalIntake) =>
  post<{ rehearsal: Rehearsal }>({ action: "adjust", id, ...intake });

export const cancelRehearsal = (id: string) =>
  post<{ rehearsal: Rehearsal }>({ action: "cancel", id });

export const deleteRehearsal = (id: string) => post<{ ok: true }>({ action: "delete", id });
