import { useRef, type ReactNode } from "react";
import { AI_CONSENT_COPY } from "@/lib/ai-consent-copy";
import { useAiConsent } from "@/lib/ai-consent-context";

/**
 * Whole-screen gate for the screens that ARE AI (practice conversations, campaigns). Never used on lessons, review
 * or placement.
 *
 * Before consent has ever been seen the screen is not mounted at all. Once it has been shown it stays mounted for
 * good: if consent is withdrawn elsewhere, or a check fails, the prompt appears as an overlay over the (inert)
 * screen, so the conversation, the typed text and the scene progress are all still there when the learner allows AI
 * again.
 */
export function AiConsentGate({ children, backTo }: { children: ReactNode; backTo: string }) {
  const consent = useAiConsent();
  const shown = useRef(false);
  if (consent.granted) shown.current = true;

  const mountChildren = consent.granted || shown.current;
  // Loading while the screen is already up changes nothing; while it is not, say so.
  if (!mountChildren && consent.status === "loading") {
    return (
      <p role="status" className="p-8 text-center text-sm text-ink-soft">
        Loading…
      </p>
    );
  }

  const prompt =
    consent.status === "unknown" ? (
      <div role="alert" className="mx-auto max-w-md p-8 text-center">
        <h2 className="font-display text-[20px] font-semibold text-ink">
          {AI_CONSENT_COPY.checkFailedTitle}
        </h2>
        <p className="mt-2 text-sm text-ink-soft">{AI_CONSENT_COPY.checkFailedBody}</p>
        <button
          type="button"
          onClick={() => void consent.refresh()}
          className="mt-5 rounded-2xl bg-moss px-5 py-3 text-base font-semibold text-surface"
        >
          {AI_CONSENT_COPY.retry}
        </button>
        <BackLink backTo={backTo} />
      </div>
    ) : (
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
        <BackLink backTo={backTo} />
      </div>
    );

  if (!mountChildren) return prompt;

  const blocked = !consent.granted && consent.status !== "loading";
  return (
    <>
      <div className="contents" inert={blocked} aria-hidden={blocked ? true : undefined}>
        {children}
      </div>
      {blocked && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-surface/95">
          {prompt}
        </div>
      )}
    </>
  );
}

function BackLink({ backTo }: { backTo: string }) {
  return (
    <p className="mt-3">
      <a href={backTo} className="text-sm text-ink-soft underline">
        Back
      </a>
    </p>
  );
}
