import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { getConsent } from "./CookieConsent";
import {
  captureAttribution,
  flushAttribution,
  type AttributionDeps,
} from "@/lib/signup-attribution";
import { recordSignupAttribution } from "@/lib/signup-attribution.functions";

function area(pick: () => Storage): Storage | null {
  try {
    return pick();
  } catch {
    return null; // storage blocked
  }
}

function attributionDeps(): AttributionDeps {
  return {
    consent: getConsent(),
    local: area(() => window.localStorage),
    session: area(() => window.sessionStorage),
  };
}

/**
 * Mounted once at the root. Remembers utm_source / utm_medium / utm_campaign from the landing URL
 * (read from the browser address, so it works even where a route drops unknown query params) and
 * sends them once after sign-in. Renders nothing. Privacy rules: lib/signup-attribution.ts.
 */
export function AttributionBridge() {
  useEffect(() => {
    captureAttribution(window.location.search, attributionDeps());

    const flush = () =>
      void flushAttribution(
        async (a) =>
          (
            await recordSignupAttribution({
              data: {
                source: a.source,
                medium: a.medium,
                campaign: a.campaign,
                landedAt: a.landedAt,
              },
            })
          ).result,
        attributionDeps(),
      );

    void supabase.auth.getSession().then(({ data }) => {
      if (data.session) flush();
    });
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (session && event === "SIGNED_IN") flush();
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  return null;
}
