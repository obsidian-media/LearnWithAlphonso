import { useState } from "react";
import { analyticsConsent, setAnalyticsConsent } from "@/lib/analytics";
import { UNDER_13_KEY } from "@/lib/first-run";

const TITLE = "Share anonymous usage data";

function isUnder13(): boolean {
  try {
    return window.localStorage.getItem(UNDER_13_KEY) === "1";
  } catch {
    return false;
  }
}

/** The Settings switch for optional usage analytics. Off by default; turning it off stops sending at once. */
export function AnalyticsSetting() {
  const [on, setOn] = useState(() => analyticsConsent());
  if (isUnder13()) return null;

  function toggle() {
    const next = !on;
    setAnalyticsConsent(next);
    setOn(next);
  }

  return (
    <section aria-labelledby="analytics-heading">
      <h2 id="analytics-heading" className="mt-8 font-display ds-type-headline text-ds-ink">
        {TITLE}
      </h2>
      <div className="mt-3 flex items-center justify-between rounded-2xl border border-ds-line bg-ds-sunk px-4 py-3">
        <span className="text-sm text-ds-ink">{on ? "On" : "Off"}</span>
        <button
          type="button"
          role="switch"
          aria-checked={on}
          aria-label={TITLE}
          onClick={toggle}
          className={`relative h-7 w-12 rounded-full transition ${on ? "bg-ds-brand" : "bg-ds-line"}`}
        >
          <span
            className={`absolute top-0.5 size-6 rounded-full bg-ds-card transition ${on ? "left-5" : "left-0.5"}`}
          />
        </button>
      </div>
      <p className="mt-2 text-xs text-ds-ink-soft">
        Which lessons and screens are used, never what you type or say, and never your name or
        email. Turn it off any time.
      </p>
    </section>
  );
}
