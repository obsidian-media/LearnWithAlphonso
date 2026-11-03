import { useCallback, useEffect, useState } from "react";
import { authHeaders, currentUserId } from "./auth-headers";

export type ProStore = "app_store" | "web" | "play_store" | null;

/**
 * Set by /pro-return. For an hour after paying, that same account, while not yet active, sees "activating", never
 * the paywall. It is keyed to the account so a different account signed in on the same tab still gets the paywall.
 */
export const JUST_PAID_KEY = "alphonso.pro.justPaidAt";
const JUST_PAID_MS = 60 * 60 * 1000;

export function markJustPaid(userId: string | null): void {
  if (!userId) return;
  try {
    sessionStorage.setItem(JUST_PAID_KEY, JSON.stringify({ at: Date.now(), user: userId }));
  } catch {
    /* private mode: the paywall may show again, which is the old behaviour */
  }
}

export function justPaidRecently(userId: string | null, now = Date.now()): boolean {
  if (!userId) return false;
  try {
    const saved = JSON.parse(sessionStorage.getItem(JUST_PAID_KEY) ?? "null") as {
      at?: unknown;
      user?: unknown;
    } | null;
    const at = typeof saved?.at === "number" ? saved.at : 0;
    return saved?.user === userId && at > 0 && now - at < JUST_PAID_MS;
  } catch {
    return false;
  }
}

/** The signed-in account, or null; never throws, so the "just paid" check cannot break the status check. */
async function userIdOrNull(): Promise<string | null> {
  try {
    return await currentUserId();
  } catch {
    return null;
  }
}

export type ProStatus = {
  /** "error" means RevenueCat could not be read: show "couldn't check", never a paywall. */
  state: "loading" | "pro" | "free" | "error";
  store: ProStore;
  trialEligible: boolean;
  manageUrl: string | null;
  /** Not Pro yet, but this account came back from checkout within the hour. */
  justPaid: boolean;
  retry: () => Promise<ProStatus["state"]>;
};

/** Reads /api/pro-status. Presentation only: /api/hector-respond checks the entitlement itself on every turn. */
export function useProStatus(): ProStatus {
  const [s, setS] = useState<Omit<ProStatus, "retry">>({
    state: "loading",
    store: null,
    trialEligible: false,
    manageUrl: null,
    justPaid: false,
  });

  const load = useCallback(async (): Promise<ProStatus["state"]> => {
    try {
      const res = await fetch("/api/pro-status", { headers: await authHeaders() });
      if (!res.ok) {
        setS((p) => ({ ...p, state: "error" }));
        return "error";
      }
      const body = (await res.json()) as {
        pro: boolean;
        store: ProStore;
        trialEligible: boolean;
        manageUrl: string | null;
      };
      const state = body.pro ? "pro" : "free";
      const justPaid = !body.pro && justPaidRecently(await userIdOrNull());
      setS({
        state,
        store: body.store,
        trialEligible: body.trialEligible,
        manageUrl: body.manageUrl,
        justPaid,
      });
      return state;
    } catch {
      setS((p) => ({ ...p, state: "error" }));
      return "error";
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return { ...s, retry: load };
}
