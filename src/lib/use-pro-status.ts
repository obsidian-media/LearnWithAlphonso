import { useCallback, useEffect, useState } from "react";
import { authHeaders } from "./auth-headers";

export type ProStore = "app_store" | "web" | "play_store" | null;

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
