import { authHeaders } from "./auth-headers";
import type { Course } from "../data/courses";
import { RECAP_MIN_LEARNER_TURNS } from "./call-recap";
import { goalLines } from "./tutor-memory-view";

/** The browser side of /api/call-recap, /api/call-recap-review and /api/tutor-memory. */
export type RecapView = {
  corrections: { said: string; fixed: string; why: string; topic: string; label: string | null }[];
  phrase: { text: string; meaning: string } | null;
  reviewToken: string | null;
  /** True when this recap was kept in What Alphonso remembers (a Pro learner). */
  saved: boolean;
  reviewCount: number;
};

/** The client waits at most this long for a recap, then the slip shows. The server stops at 8 s itself. */
export const RECAP_CLIENT_TIMEOUT_MS = 10_000;

export type Transcript = { role: "user" | "assistant"; content: string }[];

/** Whether a finished call is long enough to ask for a recap at all. Under that nothing is sent and nothing shows. */
export const callQualifiesForRecap = (turns: Transcript): boolean =>
  turns.filter((t) => t.role === "user").length >= RECAP_MIN_LEARNER_TURNS;

/**
 * Asks for the recap of a finished call. null on anything but a clean answer (short call, offline, timeout, the AI or
 * its checks failing, consent off, over the limit): the result screen then simply keeps its slip. One attempt, no retry.
 */
export async function fetchCallRecap(args: {
  callId: string;
  messages: Transcript;
  cefrLevel?: string;
  scene?: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}): Promise<RecapView | null> {
  if (!callQualifiesForRecap(args.messages)) return null;
  const doFetch = args.fetchImpl ?? fetch;
  try {
    const resp = await doFetch("/api/call-recap", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(await authHeaders()) },
      body: JSON.stringify({
        callId: args.callId,
        messages: args.messages,
        cefrLevel: args.cefrLevel,
        scene: args.scene,
      }),
      signal: AbortSignal.timeout(args.timeoutMs ?? RECAP_CLIENT_TIMEOUT_MS),
    });
    if (!resp.ok) return null;
    const body = (await resp.json()) as { recap?: RecapView | null };
    const r = body.recap;
    if (!r || !Array.isArray(r.corrections)) return null;
    if (r.corrections.length === 0 && !r.phrase) return null;
    return r;
  } catch {
    return null;
  }
}

export async function addRecapToReview(callId: string, reviewToken: string): Promise<boolean> {
  try {
    const resp = await fetch("/api/call-recap-review", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(await authHeaders()) },
      body: JSON.stringify({ callId, reviewToken }),
    });
    return resp.ok;
  } catch {
    return false;
  }
}

// ------------------------------------------------------------------------------ What Alphonso remembers

export type MemoryData = {
  mistakes: {
    id: string;
    course: Course;
    topic: string;
    label: string;
    example: string;
    seenCount: number;
    lastSeenAt: string;
  }[];
  phrases: { id: string; course: Course; text: string; meaning: string }[];
  goals: { goal: string | null; dailyMinutes: number | null; interests: string[] };
};

export type MemoryLoad =
  { status: "ok"; data: MemoryData } | { status: "not-pro" } | { status: "error" };

export async function fetchTutorMemory(): Promise<MemoryLoad> {
  try {
    const resp = await fetch("/api/tutor-memory", { headers: await authHeaders() });
    if (resp.status === 403) return { status: "not-pro" };
    if (!resp.ok) return { status: "error" };
    return { status: "ok", data: (await resp.json()) as MemoryData };
  } catch {
    return { status: "error" };
  }
}

async function del(body: unknown): Promise<boolean> {
  try {
    const resp = await fetch("/api/tutor-memory", {
      method: "DELETE",
      headers: { "Content-Type": "application/json", ...(await authHeaders()) },
      body: JSON.stringify(body),
    });
    return resp.ok;
  } catch {
    return false;
  }
}
export const removeMemoryLine = (id: string) => del({ id });
export const forgetEverything = () => del({ all: true });
/** Free or Pro: removes only the topic labels recorded after calls. */
export const forgetTopicNotes = () => del({ events: true });

/** Adds or removes one goal answer through the account's own learner-profile route (presets only, checked there). */
export async function saveGoalPatch(patch: Record<string, unknown>): Promise<boolean> {
  try {
    const resp = await fetch("/api/learner-profile", {
      method: "PUT",
      headers: { "Content-Type": "application/json", ...(await authHeaders()) },
      body: JSON.stringify({ patch }),
    });
    return resp.ok;
  } catch {
    return false;
  }
}

/** "Travel, 10 minutes a day": the learner's own first-run answers, for the locked page. null when there are none. */
export async function fetchGoalsNote(): Promise<string | null> {
  try {
    const resp = await fetch("/api/learner-profile", { headers: await authHeaders() });
    if (!resp.ok) return null;
    const { profile } = (await resp.json()) as {
      profile?: { goal?: string; dailyMinutes?: number };
    };
    const lines = goalLines({
      goal: profile?.goal ?? null,
      dailyMinutes: profile?.dailyMinutes ?? null,
      interests: [],
    });
    return lines.length ? lines.map((l) => l.title).join(", ") : null;
  } catch {
    return null;
  }
}
