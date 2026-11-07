import type { Course } from "../data/courses";
import { authHeaders } from "./auth-headers";
import type { PracticeHubData } from "./practice-hub";

/** The browser side of /api/practice (src/routes/api/practice.ts). */
export type PracticeResult = {
  kind: "scenario" | "scene";
  itemKey: string;
  stars: number;
  bestBefore: number;
  bestAfter: number;
  replies: number;
  rightReplies: number;
  shortReplies: number;
  englishReplies: number;
  finishMinReplies: number;
};

export async function fetchPracticeHub(course: Course): Promise<PracticeHubData> {
  const resp = await fetch(`/api/practice?course=${course}`, { headers: await authHeaders() });
  if (!resp.ok) throw new Error(`practice hub ${resp.status}`);
  return (await resp.json()) as PracticeHubData;
}

/**
 * Finishes a call on the server, which scores it from the replies it judged. null when no reply of this call was
 * ever judged (nothing to score) or the server could not be reached; the caller then simply leaves the call.
 */
export async function finishPracticeCall(callId: string): Promise<PracticeResult | null> {
  try {
    const resp = await fetch("/api/practice", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(await authHeaders()) },
      body: JSON.stringify({ callId }),
    });
    if (!resp.ok) return null;
    const body = (await resp.json()) as Partial<PracticeResult>;
    const counts = [
      body.stars,
      body.replies,
      body.rightReplies,
      body.shortReplies,
      body.englishReplies,
    ];
    return counts.every((n) => typeof n === "number") ? (body as PracticeResult) : null;
  } catch {
    return null;
  }
}

/** A fresh id for one call; every learner reply in it carries the id to /api/chat. */
export function newCallId(): string {
  return crypto.randomUUID();
}
