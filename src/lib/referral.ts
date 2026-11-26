/**
 * Referral program, the web side (design: docs/superpowers/specs/2026-11-17-referral-design.md; rules live in the
 * database, 20261120140000_referral_program.sql). This file holds the constants the page shows (a test pins them equal
 * to the SQL), how a ?ref= code is kept through signup, and the words the Invite screen uses. It never decides whether
 * anything is granted.
 */

/** Hearts a referral grants (hearts are hard-capped at 5, so this is a full refill). Same value as the SQL constant. */
export const REFERRAL_REWARD_HEARTS = 5;
/** Rewarded referrals per referrer per UTC calendar month. Same value as the SQL constant. */
export const REFERRAL_MONTHLY_CAP = 20;
/** Streak freezes a Pro referrer can hold before the freeze reward is skipped. Same value as the SQL constant. */
export const REFERRAL_FREEZE_CAP = 3;

export const REFERRAL_STORAGE_KEY = "lwa.ref.v1";
/** A captured code is forgotten after this long if the visitor never signs up. */
export const REFERRAL_KEEP_MS = 30 * 24 * 60 * 60 * 1000;

/** An invite code is the opaque token from friend_invite_codes: short, URL-safe or base64. Anything else is ignored. */
const CODE = /^[A-Za-z0-9+/=_-]{4,32}$/;

/** A bare code as typed or decoded from a URL, or null when empty or not shaped like a code. */
export function parseRefCode(raw: string | null | undefined): string | null {
  if (!raw) return null;
  // Form decoding turns "+" into a space; a base64 code that lost its "+" is put back.
  const code = raw.trim().replace(/ /g, "+");
  return CODE.test(code) ? code : null;
}

/** The code from a query string (`?ref=...`), or null when absent or not shaped like a code. */
export function parseRefParam(search: string): string | null {
  return parseRefCode(new URLSearchParams(search).get("ref"));
}

type Store = Pick<Storage, "getItem" | "setItem" | "removeItem">;
type Stored = { code: string; at: number };

/** Remembers a code from the landing URL. The FIRST code wins (a later link never replaces it); storage may be blocked. */
export function captureRef(search: string, store: Store | null, now = Date.now()): void {
  captureRefCode(parseRefParam(search), store, now);
}

/** Same as captureRef for a code already read from the address (the `/r/<code>` share link). Junk is ignored. */
export function captureRefCode(
  raw: string | null | undefined,
  store: Store | null,
  now = Date.now(),
): void {
  const code = parseRefCode(raw);
  if (!code || !store) return;
  try {
    if (readPendingRef(store, now)) return;
    store.setItem(REFERRAL_STORAGE_KEY, JSON.stringify({ code, at: now } satisfies Stored));
  } catch {
    // storage blocked: the referral is simply not carried
  }
}

export function readPendingRef(store: Store | null, now = Date.now()): string | null {
  try {
    const raw = store?.getItem(REFERRAL_STORAGE_KEY);
    if (!raw) return null;
    const v = JSON.parse(raw) as Partial<Stored>;
    if (typeof v.code !== "string" || typeof v.at !== "number") return null;
    if (now - v.at > REFERRAL_KEEP_MS || now < v.at - 60_000) {
      store?.removeItem(REFERRAL_STORAGE_KEY);
      return null;
    }
    return CODE.test(v.code) ? v.code : null;
  } catch {
    return null;
  }
}

export function clearPendingRef(store: Store | null): void {
  try {
    store?.removeItem(REFERRAL_STORAGE_KEY);
  } catch {
    // nothing to clear
  }
}

export type ClaimReason =
  "unauthenticated" | "unknown-code" | "self" | "already-referred" | "too-late";
export type ClaimResult = { ok: true } | { ok: false; reason: ClaimReason | "error" };

const CLAIM_REASONS: readonly string[] = [
  "unauthenticated",
  "unknown-code",
  "self",
  "already-referred",
  "too-late",
];
export function claimReason(raw: string | null | undefined): ClaimReason | "error" {
  return raw && CLAIM_REASONS.includes(raw) ? (raw as ClaimReason) : "error";
}

/** Whether a failed claim should keep the stored code to retry (only an unexplained error); every real answer is final. */
export function claimIsFinal(result: ClaimResult): boolean {
  return result.ok || result.reason !== "error";
}

/**
 * Sends the kept code once the learner is signed in. The stored code is cleared on every FINAL answer (claimed, or
 * refused for a real reason: the app has nothing more to try) and kept only for an unexplained error, so a flaky
 * network does not lose the referral. Returns what happened, for tests and the page.
 */
export async function claimPendingRef(
  store: Store | null,
  claim: (code: string) => Promise<ClaimResult>,
  now = Date.now(),
): Promise<"none" | "claimed" | "refused" | "retry-later"> {
  const code = readPendingRef(store, now);
  if (!code) return "none";
  let result: ClaimResult;
  try {
    result = await claim(code);
  } catch {
    result = { ok: false, reason: "error" };
  }
  if (!claimIsFinal(result)) return "retry-later";
  clearPendingRef(store);
  return result.ok ? "claimed" : "refused";
}

/** The shareable link for a code: the site's origin plus /r/<code> (an app link; old ?ref= links still work). */
export function referralLink(origin: string, code: string): string {
  return `${origin.replace(/\/$/, "")}/r/${encodeURIComponent(code)}`;
}

export type ReferralSummary = {
  /** Friends who joined with this learner's link and finished a first lesson. */
  completed: number;
  /** Friends who joined with the link and have not finished a lesson yet. */
  pending: number;
  /** Rewarded referrals this UTC month (counts toward the cap). */
  rewardedThisMonth: number;
};

export type ReferralRow = {
  status: string;
  capped: boolean;
  completed_at: string | null;
  reward_granted?: boolean;
};

/** The start of the UTC calendar month (the database counts the cap in UTC). */
export function utcMonthStart(now: number): number {
  const d = new Date(now);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1);
}

/**
 * Counts from the learner's own referral rows (as referrer). `completed` is every friend who finished a first lesson,
 * even past the cap (they did join); `rewardedThisMonth` mirrors the database's cap count: completed this UTC month and
 * not capped.
 */
export function summarizeReferrals(
  rows: readonly ReferralRow[],
  now = Date.now(),
): ReferralSummary {
  const monthStart = utcMonthStart(now);
  let completed = 0;
  let pending = 0;
  let rewardedThisMonth = 0;
  for (const r of rows) {
    if (r.status === "pending") {
      pending += 1;
      continue;
    }
    if (r.status !== "completed") continue;
    completed += 1;
    const at = r.completed_at ? Date.parse(r.completed_at) : NaN;
    if (!r.capped && Number.isFinite(at) && at >= monthStart) rewardedThisMonth += 1;
  }
  return { completed, pending, rewardedThisMonth };
}

export function capReached(s: Pick<ReferralSummary, "rewardedThisMonth">): boolean {
  return s.rewardedThisMonth >= REFERRAL_MONTHLY_CAP;
}

export function rewardsLeft(s: Pick<ReferralSummary, "rewardedThisMonth">): number {
  return Math.max(0, REFERRAL_MONTHLY_CAP - s.rewardedThisMonth);
}

export function referralCountLine(s: ReferralSummary): string {
  const n = s.completed;
  const done =
    n === 0
      ? "No friends have finished a first lesson yet"
      : `${n} friend${n === 1 ? "" : "s"} joined and finished a first lesson`;
  return s.pending > 0 ? `${done}. ${s.pending} still to start.` : `${done}.`;
}

export const REFERRAL_COPY = {
  title: "Invite friends",
  explainer:
    "Share your link. When a friend signs up and finishes their first lesson, you both get your hearts back to full. If you have Pro, you get a free streak freeze instead.",
  proNote: "Pro already has unlimited hearts, so you get a streak freeze (up to 3 at a time).",
  capReached:
    "Monthly invite reward limit reached. Friends can still join, and rewards start again next month.",
  loadError: "Couldn't load your invites. Try again.",
  copy: "Copy invite link",
  copied: "Link copied!",
  share: "Share",
  shareText: "Learn with me on Alphonso. English, French and Spanish, one lesson at a time.",
} as const;
