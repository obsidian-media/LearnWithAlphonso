import { useState } from "react";
import { DsButton, DsCard, SettingSwitchCard } from "@/components/ds/Blocks";
import { AI_CONSENT_COPY } from "@/lib/ai-consent-copy";
import { useAiConsent } from "@/lib/ai-consent-context";

/** The Settings switch for account AI consent. Turning it off withdraws at once; turning it on shows the consent sheet. */
export function AiFeaturesSetting() {
  const consent = useAiConsent();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const on = consent.granted;

  async function toggle(_next?: boolean) {
    setError(null);
    if (!on) {
      await consent.requestConsent();
      return;
    }
    setBusy(true);
    try {
      await consent.setConsent(false);
    } catch {
      setError(AI_CONSENT_COPY.saveFailed);
    } finally {
      setBusy(false);
    }
  }

  if (consent.status === "unknown") {
    return (
      <section aria-labelledby="ai-features-heading">
        <DsCard role="alert">
          <h2 id="ai-features-heading" className="ds-type-headline text-ds-ink">
            {AI_CONSENT_COPY.settingsTitle}
          </h2>
          <p className="ds-type-footnote text-ds-ink-soft">{AI_CONSENT_COPY.checkFailedTitle}</p>
          <div>
            <DsButton small variant="secondary" onClick={() => void consent.refresh()}>
              {AI_CONSENT_COPY.retry}
            </DsButton>
          </div>
        </DsCard>
      </section>
    );
  }
  return (
    <SettingSwitchCard
      id="ai-features-heading"
      title={AI_CONSENT_COPY.settingsTitle}
      on={on}
      onChange={() => void toggle()}
      disabled={busy || consent.status === "loading"}
      icon="sparkles"
      body={AI_CONSENT_COPY.settingsFooter}
    >
      {error && (
        <p role="alert" className="ds-type-caption text-ds-wrong-ink">
          {error}
        </p>
      )}
    </SettingSwitchCard>
  );
}
