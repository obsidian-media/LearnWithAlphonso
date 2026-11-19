import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { deviceTimeZone, syncTimeZone } from "@/lib/learner-time-zone-sync";
import { setTimeZone } from "@/lib/profile.functions";

function storage(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

/**
 * Mounted once at the root. After sign-in, tells the server the browser's time zone when it differs from the last one
 * sent for this account, so streaks and daily goals follow the learner's local day. Renders nothing and never blocks.
 */
export function TimeZoneBridge() {
  useEffect(() => {
    const run = (userId: string) =>
      void syncTimeZone({
        userId,
        zone: deviceTimeZone(),
        storage: storage(),
        send: (zone) => setTimeZone({ data: { timeZone: zone } }),
      });
    void supabase.auth.getSession().then(({ data }) => {
      if (data.session) run(data.session.user.id);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (session && event === "SIGNED_IN") run(session.user.id);
    });
    return () => sub.subscription.unsubscribe();
  }, []);
  return null;
}
