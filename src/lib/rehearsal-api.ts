import type { Course } from "@/data/course-meta";
import { authHeaders } from "./auth-headers";
import type { RehearsalBrief } from "./rehearsal-brief";
import type { EventKind, OutcomeChoice, RunMemory, Stage, StageProgress } from "./rehearsal-rules";

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
export type RehearsalSummary = RehearsalSummaryBase & {
  /** Finished runs, stages that have one, and corrected forms kept: what the paywall names the learner already did. */
  runs: number;
  stagesDone: number;
  corrections: number;
};
type RehearsalSummaryBase = Pick<
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
  /** Which of the three stages have a finished run, and which to offer next; null with no active rehearsal. */
  progress: StageProgress | null;
  nextStage: Stage | null;
  /** The active rehearsal's finished runs, oldest first: moment labels and corrected forms only. */
  runs: RunMemory[];
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
  | "closed"
  | "not_found"
  | "not_enabled"
  | "invalid"
  | "consent"
  | "failed";

export type Result<T> = { ok: true; value: T } | { ok: false; error: RehearsalError };

function errorOf(status: number, code: unknown): RehearsalError {
  if (status === 402) return "paywall";
  if (status === 503) return "retry";
  if (status === 409) return code === "closed" ? "closed" : "active_exists";
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

/**
 * Checks the shape the screens read. An older server's answer has no `runs`: it reads as an empty list, so a new web
 * build never breaks on it. Anything that is not a state is null.
 */
export function parseRehearsalState(v: unknown): RehearsalState | null {
  if (typeof v !== "object" || v === null) return null;
  const o = v as Record<string, unknown>;
  if (!("active" in o) || !Array.isArray(o.history) || typeof o.freeAvailable !== "boolean")
    return null;
  return { ...o, runs: Array.isArray(o.runs) ? o.runs : [] } as RehearsalState;
}

export async function fetchRehearsals(course: Course): Promise<Result<RehearsalState>> {
  const r = await call<unknown>(async () =>
    fetch(`/api/rehearsal?course=${course}`, { headers: await authHeaders() }),
  );
  if (!r.ok) return r;
  const state = parseRehearsalState(r.value);
  return state ? { ok: true, value: state } : { ok: false, error: "failed" };
}

export const createRehearsal = (intake: RehearsalIntake) =>
  post<{ rehearsal: Rehearsal }>({ action: "create", ...intake });

export const adjustRehearsal = (id: string, intake: RehearsalIntake) =>
  post<{ rehearsal: Rehearsal }>({ action: "adjust", id, ...intake });

export const cancelRehearsal = (id: string) =>
  post<{ rehearsal: Rehearsal }>({ action: "cancel", id });

/** "How did it go?": taps only. `moved` carries the new date (YYYY-MM-DD), the others close the rehearsal. */
export const rehearsalOutcome = (id: string, choice: OutcomeChoice, newDate?: string) =>
  post<{ rehearsal: Rehearsal }>({ action: "outcome", id, choice, newDate });

export const deleteRehearsal = (id: string) => post<{ ok: true }>({ action: "delete", id });
