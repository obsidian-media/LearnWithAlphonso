import { useEffect, useState } from "react";
import { getMyProfile } from "@/lib/leaderboard.functions";
import { cardFirstName } from "@/lib/paywall-copy";

/** The learner's first name for the Pro card; null until known, or for a generated handle. */
export function useCardName(): string | null {
  const [name, setName] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    void Promise.resolve()
      .then(() => getMyProfile())
      .then((p) => {
        if (live)
          setName(cardFirstName((p as { display_name?: string | null } | null)?.display_name));
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, []);
  return name;
}
