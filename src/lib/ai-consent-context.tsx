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
}: {
  children: ReactNode;
  api?: AiConsentApi;
  /** Tests only: start from a known state instead of "loading". The first read still replaces it. */
  initialGrantedAt?: string | null;
}) {
  const [status, setStatus] = useState<AiConsentStatus>(
    initialGrantedAt === undefined ? "loading" : initialGrantedAt ? "granted" : "denied",
  );
  const [grantedAt, setGrantedAt] = useState<string | null>(initialGrantedAt ?? null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pending = useRef<((ok: boolean) => void) | null>(null);

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

  const settle = useCallback((ok: boolean) => {
    pending.current?.(ok);
    pending.current = null;
    setSheetOpen(false);
  }, []);

  const requestConsent = useCallback(() => {
    if (status === "granted") return Promise.resolve(true);
    setError(null);
    setSheetOpen(true);
    return new Promise<boolean>((resolve) => {
      pending.current = resolve;
    });
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
        open={sheetOpen}
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
