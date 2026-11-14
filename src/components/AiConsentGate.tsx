import { useRef, type ReactNode } from "react";
import { AI_CONSENT_COPY } from "@/lib/ai-consent-copy";
import { useAiConsent } from "@/lib/ai-consent-context";
import { DsButton, PoseCard } from "@/components/ds/Blocks";

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
      <p role="status" className="p-8 text-center ds-type-footnote text-ds-ink-soft">
        Loading…
      </p>
    );
  }

  const prompt =
    consent.status === "unknown" ? (
      <div role="alert" className="mx-auto grid max-w-md gap-2 p-6">
        <PoseCard
          src="/mascots/alphonso-encouraging.png"
          title={AI_CONSENT_COPY.checkFailedTitle}
          body={AI_CONSENT_COPY.checkFailedBody}
        >
          <DsButton small onClick={() => void consent.refresh()}>
            {AI_CONSENT_COPY.retry}
          </DsButton>
          <BackLink backTo={backTo} />
        </PoseCard>
      </div>
    ) : (
      <div className="mx-auto grid max-w-md gap-2 p-6">
        <PoseCard
          src="/mascots/alphonso-thinking.png"
          title={AI_CONSENT_COPY.gateTitle}
          body={AI_CONSENT_COPY.gateBody}
        >
          <DsButton small onClick={() => void consent.requestConsent()}>
            {AI_CONSENT_COPY.gateAction}
          </DsButton>
          <BackLink backTo={backTo} />
        </PoseCard>
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
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-ds-surface/95">
          {prompt}
        </div>
      )}
    </>
  );
}

function BackLink({ backTo }: { backTo: string }) {
  return (
    <p>
      <a href={backTo} className="ds-type-footnote text-ds-ink-soft underline">
        Back
      </a>
    </p>
  );
}
