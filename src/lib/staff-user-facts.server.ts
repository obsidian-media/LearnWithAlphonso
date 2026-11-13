import type { SupabaseClient } from "@supabase/supabase-js";
import {
  getAccountSubscriberSummary,
  revenueCatConfigFromEnv,
  type AccountSubscriberSummary,
} from "./revenuecat-entitlement";

/**
 * What staff may see about a learner: account facts and nothing else. No payment details (not even the billing
 * portal link), no lesson answers, no chat texts, no tokens. The shape is deliberately small; a new field needs a
 * reason a support person needs it.
 */
export type LearnerFacts = {
  id: string;
  email: string;
  displayName: string | null;
  createdAt: string | null;
  lastActiveAt: string | null;
  course: string | null;
  level: string | null;
  streak: number;
  xp: number;
  /** `unavailable` is true when RevenueCat could not be read: that is not the same as "no Pro". */
  pro: {
    active: boolean;
    source: "store" | "gift" | "none";
    until: string | null;
    unavailable: boolean;
  };
  platforms: string[];
  restrictions: { kind: string; reason: string; createdAt: string; liftedAt: string | null }[];
  reportsAgainst: number;
  gifts: { endsAt: string; reason: string; revokedAt: string | null }[];
  notes: { author: string; body: string; createdAt: string }[];
};

export type RawLearnerFacts = {
  user: { id: string; email: string | null; createdAt: string | null };
  displayName: string | null;
  languageProgress: {
    language: string;
    cefr_level: string | null;
    xp: number;
    updated_at: string;
  }[];
  streak: number;
  lastActiveDay: string | null;
  platforms: string[];
  reportsAgainst: number;
  restrictions: { kind: string; reason: string; created_at: string; lifted_at: string | null }[];
  grants: { ends_at: string; reason: string; revoked_at: string | null }[];
  notes: { author: string; body: string; created_at: string }[];
  /** null when RevenueCat is not configured or could not be asked. */
  subscriber: AccountSubscriberSummary | null;
};

/** Pure assembly of the facts object from what the loaders read. */
export function buildLearnerFacts(raw: RawLearnerFacts, now: number = Date.now()): LearnerFacts {
  const course = [...raw.languageProgress].sort((a, b) =>
    b.updated_at.localeCompare(a.updated_at),
  )[0];
  const sub = raw.subscriber;
  let pro: LearnerFacts["pro"] = { active: false, source: "none", until: null, unavailable: false };
  if (!sub || sub.status === "unavailable") {
    pro = { ...pro, unavailable: true };
  } else if (sub.status === "active") {
    if (sub.store === "promotional") {
      const live = raw.grants
        .filter((g) => !g.revoked_at && Date.parse(g.ends_at) > now)
        .sort((a, b) => b.ends_at.localeCompare(a.ends_at))[0];
      pro = { active: true, source: "gift", until: live?.ends_at ?? null, unavailable: false };
    } else {
      pro = { active: true, source: "store", until: null, unavailable: false };
    }
  }
  return {
    id: raw.user.id,
    email: raw.user.email ?? "",
    displayName: raw.displayName,
    createdAt: raw.user.createdAt,
    lastActiveAt: raw.lastActiveDay,
    course: course?.language ?? null,
    level: course?.cefr_level ?? null,
    streak: raw.streak,
    xp: course?.xp ?? 0,
    pro,
    platforms: [...new Set(raw.platforms)].sort(),
    restrictions: raw.restrictions.map((r) => ({
      kind: r.kind,
      reason: r.reason,
      createdAt: r.created_at,
      liftedAt: r.lifted_at,
    })),
    reportsAgainst: raw.reportsAgainst,
    gifts: raw.grants.map((g) => ({
      endsAt: g.ends_at,
      reason: g.reason,
      revokedAt: g.revoked_at,
    })),
    notes: raw.notes.map((n) => ({ author: n.author, body: n.body, createdAt: n.created_at })),
  };
}

function ok<T>(
  result: { data: T | null; error: { message: string } | null },
  what: string,
): T | null {
  if (result.error) throw new Error(`Could not read ${what}.`);
  return result.data;
}

/**
 * Reads one learner's facts with the service-role client. A failed read throws: an incomplete page that looks
 * complete (no restrictions shown when they could not be read) is worse than an error.
 */
export async function loadLearnerFacts(
  admin: SupabaseClient,
  userId: string,
  fetchImpl: typeof fetch = fetch,
): Promise<LearnerFacts> {
  const { data: authData, error: authError } = await admin.auth.admin.getUserById(userId);
  if (authError || !authData?.user) throw new Error("That learner does not exist.");
  const user = authData.user;

  const config = revenueCatConfigFromEnv();
  const [lang, progress, active, tokens, reports, restrictions, grants, notes, subscriber] =
    await Promise.all([
      admin
        .from("language_progress")
        .select("language, cefr_level, xp, updated_at")
        .eq("user_id", userId),
      admin.from("user_progress").select("streak").eq("user_id", userId).maybeSingle(),
      admin
        .from("activity_days")
        .select("day")
        .eq("user_id", userId)
        .order("day", { ascending: false })
        .limit(1),
      admin.from("device_tokens").select("platform").eq("user_id", userId),
      admin
        .from("content_reports")
        .select("id", { count: "exact", head: true })
        .eq("reported", userId),
      admin
        .from("user_restrictions")
        .select("kind, reason, created_at, lifted_at")
        .eq("user_id", userId)
        .order("created_at", { ascending: false }),
      admin
        .from("pro_grants")
        .select("ends_at, reason, revoked_at")
        .eq("user_id", userId)
        .order("starts_at", { ascending: false }),
      admin
        .from("staff_notes")
        .select("author_id, body, created_at")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(100),
      config ? getAccountSubscriberSummary(config, userId, fetchImpl) : Promise.resolve(null),
    ]);
  if (reports.error) throw new Error("Could not read reports.");
  const noteRows = (ok(notes, "notes") ?? []) as {
    author_id: string | null;
    body: string;
    created_at: string;
  }[];

  const ids = [
    ...new Set([userId, ...noteRows.map((n) => n.author_id).filter((x): x is string => !!x)]),
  ];
  const names = new Map<string, string | null>(
    (
      (ok(await admin.from("profiles").select("id, display_name").in("id", ids), "profiles") ??
        []) as {
        id: string;
        display_name: string | null;
      }[]
    ).map((p) => [p.id, p.display_name]),
  );

  return buildLearnerFacts({
    user: { id: user.id, email: user.email ?? null, createdAt: user.created_at ?? null },
    displayName: names.get(userId) ?? null,
    languageProgress: (ok(lang, "progress") ?? []) as RawLearnerFacts["languageProgress"],
    streak: (ok(progress, "progress") as { streak: number } | null)?.streak ?? 0,
    lastActiveDay: ((ok(active, "activity") ?? []) as { day: string }[])[0]?.day ?? null,
    platforms: ((ok(tokens, "devices") ?? []) as { platform: string }[]).map((t) => t.platform),
    reportsAgainst: reports.count ?? 0,
    restrictions: (ok(restrictions, "restrictions") ?? []) as RawLearnerFacts["restrictions"],
    grants: (ok(grants, "gifts") ?? []) as RawLearnerFacts["grants"],
    notes: noteRows.map((n) => ({
      author: (n.author_id && names.get(n.author_id)) || "staff",
      body: n.body,
      created_at: n.created_at,
    })),
    subscriber,
  });
}
