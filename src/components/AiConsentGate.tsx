import type { ReactNode } from "react";
import { AI_CONSENT_COPY } from "@/lib/ai-consent-copy";
import { useAiConsent } from "@/lib/ai-consent-context";

/** Whole-screen gate for the screens that ARE AI (practice conversations, campaigns). Never used on lessons, review or placement. */
export function AiConsentGate({ children, backTo }: { children: ReactNode; backTo: string }) {
  const consent = useAiConsent();
  if (consent.status === "loading") {
    return (
      <p role="status" className="p-8 text-center text-sm text-ink-soft">
        Loading…
      </p>
    );
  }
  if (consent.granted) return <>{children}</>;
  return (
    <div className="mx-auto max-w-md p-8 text-center">
      <h2 className="font-display text-[20px] font-semibold text-ink">
        {AI_CONSENT_COPY.gateTitle}
      </h2>
      <p className="mt-2 text-sm text-ink-soft">{AI_CONSENT_COPY.gateBody}</p>
      <button
        type="button"
        onClick={() => void consent.requestConsent()}
        className="mt-5 rounded-2xl bg-moss px-5 py-3 text-base font-semibold text-surface"
      >
        {AI_CONSENT_COPY.gateAction}
      </button>
      <p className="mt-3">
        <a href={backTo} className="text-sm text-ink-soft underline">
          Back
        </a>
      </p>
    </div>
  );
}
