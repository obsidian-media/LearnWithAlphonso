import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { AiConsentSheet } from "@/components/AiConsentSheet";
import { AI_CONSENT_COPY } from "./ai-consent-copy";
import { useNamePromptBlocking } from "./name-prompt-gate";

export type AiConsentApi = {
  get: () => Promise<string | null>;
  set: (granted: boolean) => Promise<string | null>;
};

// The server functions are imported on first use, not at module load: this file is reached from many components
// (save word, speaking, translate) and a static import would drag the auth middleware into every page test.
const serverApi: AiConsentApi = {
  get: async () => (await (await import("./ai-consent.functions")).getAiConsent()).grantedAt,
  set: async (granted) =>
    (await (await import("./ai-consent.functions")).setAiConsent({ data: { granted } })).grantedAt,
};

// Loaded on first use for the same reason as serverApi, and failures (no browser client in a test) are quiet.
function subscribeToAuthChanges(onChange: () => void): () => void {
  let unsubscribe: (() => void) | undefined;
  let cancelled = false;
  void import("@/integrations/supabase/client")
    .then(({ supabase }) => {
      if (cancelled) return;
      const { data } = supabase.auth.onAuthStateChange((event) => {
        if (event === "SIGNED_IN" || event === "SIGNED_OUT" || event === "USER_UPDATED") onChange();
      });
      unsubscribe = () => data.subscription.unsubscribe();
    })
    .catch(() => {});
  return () => {
    cancelled = true;
    unsubscribe?.();
  };
}

export type AiConsentStatus = "loading" | "granted" | "denied" | "unknown";
export type AiConsent = {
  status: AiConsentStatus;
  grantedAt: string | null;
  granted: boolean;
  /** Opens the consent sheet. Resolves true once consent is saved, false on "Not now". */
  requestConsent: () => Promise<boolean>;
  setConsent: (granted: boolean) => Promise<void>;
  /** Call on a 403 ai-consent-required: consent was withdrawn elsewhere. */
  markWithdrawn: () => void;
  refresh: () => Promise<void>;
};

const AiConsentContext = createContext<AiConsent | null>(null);

/**
 * One account-level AI consent for the whole signed-in web app (mounted in _authenticated/route.tsx).
 * Reads get_ai_consent on mount and whenever the tab becomes visible, so a withdrawal on iOS shows up here.
 */
export function AiConsentProvider({
  children,
  api = serverApi,
  initialGrantedAt,
  subscribeAuth = subscribeToAuthChanges,
}: {
  children: ReactNode;
  api?: AiConsentApi;
  /** Tests only: start from a known state instead of "loading". The first read still replaces it. */
  initialGrantedAt?: string | null;
  /** Calls back when the signed-in account changes. Returns the unsubscribe. */
  subscribeAuth?: ((onChange: () => void) => () => void) | null;
}) {
  const [status, setStatus] = useState<AiConsentStatus>(
    initialGrantedAt === undefined ? "loading" : initialGrantedAt ? "granted" : "denied",
  );
  const [grantedAt, setGrantedAt] = useState<string | null>(initialGrantedAt ?? null);
  const [sheetOpen, setSheetOpen] = useState(false);
  // The one-time name prompt has priority: a requested sheet waits (its caller stays pending) until it closes.
  const nameBlocking = useNamePromptBlocking();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // The one outstanding request for the sheet. A second request while it is open shares it, so no caller is orphaned.
  const pending = useRef<{ promise: Promise<boolean>; resolve: (ok: boolean) => void } | null>(
    null,
  );

  const apply = useCallback((stamp: string | null) => {
    setGrantedAt(stamp);
    setStatus(stamp ? "granted" : "denied");
  }, []);

  const refresh = useCallback(async () => {
    try {
      apply(await api.get());
    } catch {
      setStatus((s) => (s === "loading" ? "unknown" : s));
    }
  }, [api, apply]);

  useEffect(() => {
    void refresh();
    const onVisible = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [refresh]);

  // A different account on the same browser has its own consent: read it again on every sign-in or sign-out.
  useEffect(() => {
    if (!subscribeAuth) return;
    return subscribeAuth(() => void refresh());
  }, [subscribeAuth, refresh]);

  const settle = useCallback((ok: boolean) => {
    pending.current?.resolve(ok);
    pending.current = null;
    setSheetOpen(false);
  }, []);

  const requestConsent = useCallback(() => {
    if (status === "granted") return Promise.resolve(true);
    if (pending.current) return pending.current.promise;
    setError(null);
    setSheetOpen(true);
    let resolve!: (ok: boolean) => void;
    const promise = new Promise<boolean>((r) => {
      resolve = r;
    });
    pending.current = { promise, resolve };
    return promise;
  }, [status]);

  const allow = useCallback(async () => {
    setSaving(true);
    setError(null);
    try {
      apply(await api.set(true));
      settle(true);
    } catch {
      setError(AI_CONSENT_COPY.saveFailed);
    } finally {
      setSaving(false);
    }
  }, [api, apply, settle]);

  const setConsent = useCallback(
    async (granted: boolean) => apply(await api.set(granted)),
    [api, apply],
  );
  const markWithdrawn = useCallback(() => apply(null), [apply]);

  const value = useMemo<AiConsent>(
    () => ({
      status,
      grantedAt,
      granted: status === "granted",
      requestConsent,
      setConsent,
      markWithdrawn,
      refresh,
    }),
    [status, grantedAt, requestConsent, setConsent, markWithdrawn, refresh],
  );

  return (
    <AiConsentContext.Provider value={value}>
      {children}
      <AiConsentSheet
        open={sheetOpen && !nameBlocking}
        saving={saving}
        error={error}
        onAllow={() => void allow()}
        onDecline={() => settle(false)}
      />
    </AiConsentContext.Provider>
  );
}

export function useAiConsent(): AiConsent {
  const ctx = useContext(AiConsentContext);
  if (!ctx) throw new Error("useAiConsent must be used inside <AiConsentProvider>");
  return ctx;
}

/** For components that also render outside the signed-in app (placement, tests). null = no provider. */
export function useOptionalAiConsent(): AiConsent | null {
  return useContext(AiConsentContext);
}

export async function isAiConsentRequired(resp: Response): Promise<boolean> {
  if (resp.status !== 403) return false;
  try {
    const body = (await resp.clone().json()) as { error?: unknown };
    return body.error === "ai-consent-required";
  } catch {
    return false;
  }
}
