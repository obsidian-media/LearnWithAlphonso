import type { ReactElement } from "react";
import { AiConsentProvider, type AiConsentApi } from "../ai-consent-context";

export function fakeConsentApi(
  grantedAt: string | null = "2026-10-09T10:00:00Z",
): AiConsentApi & { setCalls: boolean[] } {
  let current = grantedAt;
  const setCalls: boolean[] = [];
  return {
    setCalls,
    get: async () => current,
    set: async (granted: boolean) => {
      setCalls.push(granted);
      current = granted ? "2026-10-09T10:00:00Z" : null;
      return current;
    },
  };
}

export function withAiConsent(
  ui: ReactElement,
  api: AiConsentApi = fakeConsentApi(),
): ReactElement {
  return <AiConsentProvider api={api}>{ui}</AiConsentProvider>;
}
