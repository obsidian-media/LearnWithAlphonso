import type { ReactElement } from "react";
import { AiConsentProvider, type AiConsentApi } from "../ai-consent-context";

export function fakeConsentApi(
  grantedAt: string | null = "2026-10-09T10:00:00Z",
): AiConsentApi & { setCalls: boolean[]; initial: string | null } {
  let current = grantedAt;
  const setCalls: boolean[] = [];
  return {
    setCalls,
    initial: grantedAt,
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
  api: AiConsentApi & { initial?: string | null } = fakeConsentApi(),
): ReactElement {
  // Starts from the fake's state so a test does not have to wait for the first read.
  return (
    <AiConsentProvider api={api} initialGrantedAt={api.initial}>
      {ui}
    </AiConsentProvider>
  );
}
