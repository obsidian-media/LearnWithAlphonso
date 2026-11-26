import type { Course } from "../data/courses";
import { authHeaders, currentUserId } from "./auth-headers";
import { RECAP_MIN_LEARNER_TURNS } from "./call-recap";
import { boundTranscript } from "./chat-transcript-limits";

/**
 * The browser side of /api/hector-call-end: when a Hector call ends (the learner leaves the screen, or closes the tab),
 * the conversation goes to the server once, which saves what it taught Hector about the learner (Pro) so the next
 * call can build on it. Nothing here is shown to the learner.
 *
 * A failed save is not lost: before the request goes out, a receipt (callId, course, the bounded transcript) is kept
 * in localStorage. It is removed only when the server gave a final answer (saved, already saved, or an intentional
 * skip); a network error, a 5xx, a 401 or a retryable reason keeps it, and the next Hector visit or app load sends it
 * again with the SAME callId (the server's per-call claim makes that safe), at most MAX_ATTEMPTS times within
 * MAX_AGE_MS (24 hours). The receipt holds the transcript, so it is wiped on sign-out and when another account signs in
 * (forgetHectorCallEndsOnAuthChange), and it is never stored without knowing whose it is.
 */
export type CallTurn = { role: "user" | "assistant"; content: string };

export const hectorCallQualifies = (turns: CallTurn[]): boolean =>
  turns.filter((t) => t.role === "user").length >= RECAP_MIN_LEARNER_TURNS;

export const PENDING_KEY = "hector.callEnd.pending";
export const MAX_ATTEMPTS = 3;
export const MAX_AGE_MS = 24 * 60 * 60 * 1000;
const MAX_RECEIPTS = 5;

type Receipt = {
  callId: string;
  userId: string;
  course: Course;
  cefr?: string;
  turns: CallTurn[];
  attempts: number;
  createdAt: number;
};

/** The server's answers that end the matter: nothing to retry. */
const FINAL_REASONS = new Set(["already_saved", "short_call", "not_pro", "nothing_to_keep"]);
/** Answers with `saved: false` that a later attempt can turn into a save. */
const RETRY_REASONS = new Set([
  "write_failed",
  "no_recap",
  "entitlement_unavailable",
  "in_progress", // another request holds the call's claim; if it fails the claim is released
]);

function load(): Receipt[] {
  try {
    const raw = JSON.parse(window.localStorage.getItem(PENDING_KEY) ?? "[]");
    return Array.isArray(raw) ? (raw as Receipt[]) : [];
  } catch {
    return [];
  }
}
function store(list: Receipt[]) {
  try {
    if (list.length === 0) window.localStorage.removeItem(PENDING_KEY);
    else window.localStorage.setItem(PENDING_KEY, JSON.stringify(list.slice(-MAX_RECEIPTS)));
  } catch {
    // Storage blocked or full: the call is then sent once, best effort, as before.
  }
}
function put(receipt: Receipt) {
  store([...load().filter((r) => r.callId !== receipt.callId), receipt]);
}
function drop(callId: string) {
  store(load().filter((r) => r.callId !== callId));
}

/** Forgets every unsent call on this device. */
export function clearPendingHectorCallEnds() {
  store([]);
}

/** The auth listener's hook: wipe on SIGNED_OUT, and on SIGNED_IN as an account other than the one loaded. */
export function forgetHectorCallEndsOnAuthChange(
  event: string,
  newUserId: string | undefined,
  loadedUserId: string | null | undefined,
) {
  const switched =
    event === "SIGNED_IN" && !!newUserId && !!loadedUserId && newUserId !== loadedUserId;
  if (event === "SIGNED_OUT" || switched) clearPendingHectorCallEnds();
}

/** true: final, forget it. false: keep the receipt and try again later. */
async function send(r: Receipt, doFetch: typeof fetch): Promise<boolean> {
  try {
    const resp = await doFetch("/api/hector-call-end", {
      method: "POST",
      keepalive: true,
      headers: { "Content-Type": "application/json", ...(await authHeaders()) },
      body: JSON.stringify({
        callId: r.callId,
        course: r.course,
        cefrLevel: r.cefr,
        messages: r.turns,
      }),
    });
    if (resp.status >= 500 || resp.status === 401) {
      console.warn("[hector-call-end] not saved, will retry", resp.status);
      return false;
    }
    if (!resp.ok) {
      console.warn("[hector-call-end] refused", resp.status);
      return true; // another 4xx will not change on a retry
    }
    const body = (await resp.json().catch(() => null)) as {
      saved?: unknown;
      reason?: unknown;
    } | null;
    if (body?.saved === true) return true;
    const reason = typeof body?.reason === "string" ? body.reason : "";
    if (FINAL_REASONS.has(reason)) return true;
    console.warn("[hector-call-end] not saved", reason || "unreadable answer");
    return !(RETRY_REASONS.has(reason) || !reason);
  } catch {
    console.warn("[hector-call-end] request failed");
    return false;
  }
}

/** One call's end, sent at most once per screen however many ways the screen can be left. */
export function createHectorCallEnd(args: {
  callId: string;
  course: Course;
  getTurns: () => CallTurn[];
  getCefr: () => string;
  fetchImpl?: typeof fetch;
}): () => Promise<boolean> {
  let started = false;
  return async () => {
    const turns = args.getTurns();
    if (started || !hectorCallQualifies(turns)) return false;
    started = true;
    const doFetch = args.fetchImpl ?? fetch;
    const userId = await currentUserId().catch(() => null);
    const receipt: Receipt = {
      callId: args.callId,
      userId: userId ?? "",
      course: args.course,
      cefr: args.getCefr() || undefined,
      turns: boundTranscript(turns),
      attempts: 1,
      createdAt: Date.now(),
    };
    // Without an account there is no one to keep it for (and nothing to save): send it once, store nothing.
    if (!userId) return send(receipt, doFetch);
    // Kept BEFORE the request: closing the tab mid-request must not lose the call.
    put(receipt);
    const done = await send(receipt, doFetch);
    if (done) drop(receipt.callId);
    return done;
  };
}

let retrying: Promise<void> | null = null;

/** Sends the receipts left by earlier failed saves (this learner's, within the limits). Safe to call often. */
export function retryPendingHectorCallEnds(fetchImpl?: typeof fetch): Promise<void> {
  retrying ??= (async () => {
    try {
      const doFetch = fetchImpl ?? fetch;
      const now = Date.now();
      const me = await currentUserId().catch(() => null);
      if (!me) return; // signed out: not an attempt, the receipt waits for the learner
      for (const r of load()) {
        if (r.attempts >= MAX_ATTEMPTS || now - r.createdAt > MAX_AGE_MS) {
          drop(r.callId);
          continue;
        }
        if (r.userId !== me) {
          drop(r.callId); // another account's call has no business on this account's device storage
          continue;
        }
        put({ ...r, attempts: r.attempts + 1 });
        if (await send(r, doFetch)) drop(r.callId);
      }
    } finally {
      retrying = null;
    }
  })();
  return retrying;
}
