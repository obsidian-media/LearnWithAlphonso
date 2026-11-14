import { useState } from "react";
import { SettingSwitchCard } from "@/components/ds/Blocks";
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

  function toggle(next: boolean) {
    setAnalyticsConsent(next);
    setOn(next);
  }

  return (
    <SettingSwitchCard
      id="analytics-heading"
      title={TITLE}
      on={on}
      onChange={toggle}
      icon="compass"
      body="Which lessons and screens are used, never what you type or say, and never your name or email. Turn it off any time."
    />
  );
}
