import { useCallback, useEffect, useState } from "react";
import { authHeaders } from "./auth-headers";

export type ProStore = "app_store" | "web" | "play_store" | null;

/** Set by /pro-return. For an hour after paying, a not-yet-active learner sees "activating", never the paywall. */
export const JUST_PAID_KEY = "alphonso.pro.justPaidAt";
const JUST_PAID_MS = 60 * 60 * 1000;

export function markJustPaid(): void {
  try {
    sessionStorage.setItem(JUST_PAID_KEY, String(Date.now()));
  } catch {
    /* private mode: the paywall may show again, which is the old behaviour */
  }
}

export function justPaidRecently(now = Date.now()): boolean {
  try {
    const at = Number(sessionStorage.getItem(JUST_PAID_KEY));
    return at > 0 && now - at < JUST_PAID_MS;
  } catch {
    return false;
  }
}

export type ProStatus = {
  /** "error" means RevenueCat could not be read: show "couldn't check", never a paywall. */
  state: "loading" | "pro" | "free" | "error";
  store: ProStore;
  trialEligible: boolean;
  manageUrl: string | null;
  retry: () => Promise<ProStatus["state"]>;
};

/** Reads /api/pro-status. Presentation only: /api/hector-respond checks the entitlement itself on every turn. */
export function useProStatus(): ProStatus {
  const [s, setS] = useState<Omit<ProStatus, "retry">>({
    state: "loading",
    store: null,
    trialEligible: false,
    manageUrl: null,
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
      setS({
        state,
        store: body.store,
        trialEligible: body.trialEligible,
        manageUrl: body.manageUrl,
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
