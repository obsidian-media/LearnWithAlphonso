// Mirrored in supabase/functions/_shared/local-day.ts (Edge Functions bundle each function on its own); keep identical.

/**
 * The learner's calendar day (YYYY-MM-DD) for an instant, in their stored IANA time zone (learner_time_zones).
 * An unknown, empty or invalid zone is UTC: the day rule before local days existed, and still the rule for a learner
 * who never sent a zone. Uses the platform's own time zone data, so daylight saving time is right.
 */
export function localDay(instantMs: number, timeZone: string | null | undefined): string {
  const zone = timeZone?.trim();
  if (zone) {
    try {
      const parts = new Intl.DateTimeFormat("en-CA", {
        timeZone: zone,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).formatToParts(new Date(instantMs));
      const get = (t: string) => parts.find((p) => p.type === t)?.value;
      const y = get("year");
      const m = get("month");
      const d = get("day");
      if (y && m && d) return `${y}-${m}-${d}`;
    } catch {
      // An invalid zone name falls through to UTC.
    }
  }
  return new Date(instantMs).toISOString().slice(0, 10);
}

/**
 * True while a learner's streak still counts days the old way (UTC dates): `user_progress.day_basis` is "utc" (or
 * unknown). The first completion after the switch bridges one extra day, so a streak written as a UTC date never
 * drops just because the learner's local yesterday is two UTC dates back; every write after that is "local".
 */
export function streakBridge(dayBasis: string | null | undefined): boolean {
  return dayBasis !== "local";
}
