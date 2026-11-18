/**
 * The learner's stored IANA time zone (learner_time_zones, written by set_learner_time_zone), or null when there is
 * none or it cannot be read. Null means UTC everywhere a day is booked (src/lib/local-day.ts): a failed read must
 * never fail a lesson. The learner may read their own row (RLS select-own), so the request's own client is enough.
 */
type ZoneReader = {
  from: (table: string) => {
    select: (cols: string) => {
      eq: (
        col: string,
        v: string,
      ) => { maybeSingle: () => PromiseLike<{ data: unknown; error: unknown }> };
    };
  };
};

export async function readLearnerTimeZone(
  client: unknown,
  userId: string,
  opts: { strict?: boolean } = {},
): Promise<string | null> {
  try {
    const { data, error } = await (client as ZoneReader)
      .from("learner_time_zones")
      .select("time_zone")
      .eq("user_id", userId)
      .maybeSingle();
    // strict: a caller that BOOKS A DAY from the zone must not book it from a zone it never read.
    if (error) {
      if (opts.strict) throw new Error("Could not load lesson progress");
      return null;
    }
    const zone = (data as { time_zone?: unknown } | null)?.time_zone;
    return typeof zone === "string" && zone.length > 0 ? zone : null;
  } catch (e) {
    if (opts.strict) throw e instanceof Error ? e : new Error("Could not load lesson progress");
    return null;
  }
}
