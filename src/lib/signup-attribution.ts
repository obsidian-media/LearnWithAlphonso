/**
 * Which campaign brought a new account (utm_source / utm_medium / utm_campaign) and when the
 * visitor first landed. Docs: docs/attribution.md.
 *
 * Privacy rules this file enforces:
 *  - Optional analytics storage: nothing is kept unless the visitor chose "Accept all". While the
 *    cookie banner is unanswered the tags wait in sessionStorage (gone when the tab closes); "Accept
 *    all" moves them to localStorage; "Essential only" discards them.
 *  - Only three short plain tags and a timestamp. No IP, user agent, device id or referrer URL.
 *  - First touch wins: a later visit never overwrites the stored tags.
 *  - Sent once, after sign-in; the server ignores any account older than 7 days.
 */
import type { ConsentValue } from "@/components/CookieConsent";

export const ATTRIBUTION_KEY = "lwa.attribution.v1";
const TAG = /^[a-z0-9_.-]{1,64}$/;

export type Attribution = {
  source: string | null;
  medium: string | null;
  campaign: string | null;
  landedAt: string;
};

type Store = Pick<Storage, "getItem" | "setItem" | "removeItem">;
export type AttributionDeps = {
  consent: ConsentValue | null;
  local: Store | null;
  session: Store | null;
  now?: Date;
};

function tag(value: string | null): string | null {
  const v = value?.trim().toLowerCase() ?? "";
  return TAG.test(v) ? v : null;
}

/** The three tags from a query string, or null when none is a valid short tag. */
export function parseAttribution(search: string, now: Date = new Date()): Attribution | null {
  const params = new URLSearchParams(search);
  const source = tag(params.get("utm_source"));
  const medium = tag(params.get("utm_medium"));
  const campaign = tag(params.get("utm_campaign"));
  if (!source && !medium && !campaign) return null;
  return { source, medium, campaign, landedAt: now.toISOString() };
}

function read(store: Store | null): Attribution | null {
  try {
    const raw = store?.getItem(ATTRIBUTION_KEY);
    if (!raw) return null;
    const v = JSON.parse(raw) as Partial<Attribution>;
    const source = tag(v.source ?? null);
    const medium = tag(v.medium ?? null);
    const campaign = tag(v.campaign ?? null);
    if (!source && !medium && !campaign) return null;
    const landed = typeof v.landedAt === "string" && !Number.isNaN(Date.parse(v.landedAt));
    return { source, medium, campaign, landedAt: landed ? v.landedAt! : new Date().toISOString() };
  } catch {
    return null;
  }
}

function write(store: Store | null, value: Attribution) {
  try {
    store?.setItem(ATTRIBUTION_KEY, JSON.stringify(value));
  } catch {
    // storage blocked or full: attribution is best effort
  }
}

function clear(deps: AttributionDeps) {
  try {
    deps.local?.removeItem(ATTRIBUTION_KEY);
    deps.session?.removeItem(ATTRIBUTION_KEY);
  } catch {
    // ignore
  }
}

/** Call on every page load with window.location.search. */
export function captureAttribution(search: string, deps: AttributionDeps): void {
  if (deps.consent === "essential") {
    clear(deps);
    return;
  }
  const found = parseAttribution(search, deps.now);
  if (!found) return;
  if (read(deps.local) || read(deps.session)) return; // first touch wins
  write(deps.consent === "all" ? deps.local : deps.session, found);
}

/** Call right after the visitor chooses a cookie option. */
export function promoteAttribution(deps: AttributionDeps): void {
  if (deps.consent === "essential") {
    clear(deps);
    return;
  }
  if (deps.consent !== "all") return;
  const pending = read(deps.session);
  if (!pending) return;
  if (!read(deps.local)) write(deps.local, pending);
  try {
    deps.session?.removeItem(ATTRIBUTION_KEY);
  } catch {
    // ignore
  }
}

/**
 * Sends the stored tags once the visitor is signed in. Clears them after the server has
 * answered for good ("recorded", "already", "not_new", "empty"); keeps them if the call fails or
 * the session was not ready, so the next page load retries.
 */
export async function flushAttribution(
  send: (a: Attribution) => Promise<string>,
  deps: AttributionDeps,
): Promise<string | null> {
  if (deps.consent !== "all") {
    if (deps.consent === "essential") clear(deps);
    return null;
  }
  promoteAttribution(deps);
  const pending = read(deps.local);
  if (!pending) return null;
  try {
    const result = await send(pending);
    if (result !== "unauthenticated") clear(deps);
    return result;
  } catch {
    return null;
  }
}
