import type { Course } from "../data/courses";
import { authHeaders } from "./auth-headers";
import { RECAP_MIN_LEARNER_TURNS } from "./call-recap";

/**
 * The browser side of /api/hector-call-end: when a Hector call ends (the learner leaves the screen, or closes the tab),
 * the conversation goes to the server once, which saves what it taught Hector about the learner (Pro) so the next
 * call can build on it. Nothing here is shown to the learner.
 */
export type CallTurn = { role: "user" | "assistant"; content: string };

export const hectorCallQualifies = (turns: CallTurn[]): boolean =>
  turns.filter((t) => t.role === "user").length >= RECAP_MIN_LEARNER_TURNS;

/** One call's end, sent at most once however many ways the screen can be left. */
export function createHectorCallEnd(args: {
  callId: string;
  course: Course;
  getTurns: () => CallTurn[];
  getCefr: () => string;
  fetchImpl?: typeof fetch;
}): () => Promise<boolean> {
  let sent = false;
  return async () => {
    const turns = args.getTurns();
    if (sent || !hectorCallQualifies(turns)) return false;
    sent = true;
    const doFetch = args.fetchImpl ?? fetch;
    try {
      const resp = await doFetch("/api/hector-call-end", {
        method: "POST",
        keepalive: true,
        headers: { "Content-Type": "application/json", ...(await authHeaders()) },
        body: JSON.stringify({
          callId: args.callId,
          course: args.course,
          cefrLevel: args.getCefr() || undefined,
          messages: turns.map(({ role, content }) => ({ role, content })),
        }),
      });
      if (!resp.ok) console.warn("[hector-call-end] not saved", resp.status);
      return resp.ok;
    } catch {
      console.warn("[hector-call-end] request failed");
      return false;
    }
  };
}
