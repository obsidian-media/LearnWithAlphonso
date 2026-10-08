import { useState } from "react";
import { AI_CONSENT_COPY } from "@/lib/ai-consent-copy";
import { useAiConsent } from "@/lib/ai-consent-context";

/** The Settings switch for account AI consent. Turning it off withdraws at once; turning it on shows the consent sheet. */
export function AiFeaturesSetting() {
  const consent = useAiConsent();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const on = consent.granted;

  async function toggle() {
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

  return (
    <section aria-labelledby="ai-features-heading">
      <h2 id="ai-features-heading" className="mt-8 font-display text-[18px] font-semibold text-ink">
        {AI_CONSENT_COPY.settingsTitle}
      </h2>
      {consent.status === "unknown" ? (
        <div
          role="alert"
          className="mt-3 flex items-center justify-between gap-3 rounded-2xl border border-hairline bg-parchment px-4 py-3"
        >
          <span className="text-sm text-ink">{AI_CONSENT_COPY.checkFailedTitle}</span>
          <button
            type="button"
            onClick={() => void consent.refresh()}
            className="rounded-full border border-hairline bg-surface px-3 py-1.5 text-xs font-semibold text-ink"
          >
            {AI_CONSENT_COPY.retry}
          </button>
        </div>
      ) : (
        <div className="mt-3 flex items-center justify-between rounded-2xl border border-hairline bg-parchment px-4 py-3">
          <span className="text-sm text-ink">{on ? "On" : "Off"}</span>
          <button
            type="button"
            role="switch"
            aria-checked={on}
            aria-label={AI_CONSENT_COPY.settingsTitle}
            disabled={busy || consent.status === "loading"}
            onClick={() => void toggle()}
            className={`relative h-7 w-12 rounded-full transition ${on ? "bg-moss" : "bg-hairline"} disabled:opacity-50`}
          >
            <span
              className={`absolute top-0.5 size-6 rounded-full bg-surface transition ${on ? "left-5" : "left-0.5"}`}
            />
          </button>
        </div>
      )}
      <p className="mt-2 text-xs text-ink-soft">{AI_CONSENT_COPY.settingsFooter}</p>
      {error && (
        <p role="alert" className="mt-2 text-xs text-rose-700">
          {error}
        </p>
      )}
    </section>
  );
}
