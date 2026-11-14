import type { SupabaseClient } from "@supabase/supabase-js";
import {
  getAccountSubscriberSummary,
  revenueCatConfigFromEnv,
  type AccountSubscriberSummary,
} from "./revenuecat-entitlement";

/**
 * What the Help chat's AI may know about the learner it is talking to (docs/superpowers/plans/2026-11-14-support-help-chat.md,
 * "The AI agent: exact rules"). A small, separate shape on purpose: loadLearnerFacts (staff) includes the email, notes
 * and reasons, so the AI must never use it.
 *
 * NEVER in here: email, display name, user id, staff notes, gift or restriction reasons, reports against the learner,
 * other learners, payment details, lesson answers, chats with Alphonso or Hector, ticket text. A field added here is a
 * privacy decision: support-facts.test.ts pins the key list and says to update the spec and docs/privacy-and-data.md.
 */
export type SupportFacts = {
  /** `unavailable` is true when RevenueCat could not be read: "unknown" is not "no Pro". */
  pro: {
    active: boolean;
    source: "store" | "gift" | "none";
    until: string | null;
    unavailable: boolean;
  };
  course: string | null;
  level: string | null;
  streak: number;
  daysActiveLast30: number;
  lastActiveDay: string | null;
  lessonsLast7Days: number;
  lastLessonDay: string | null;
  platforms: string[];
  /** True or false only; never why. */
  socialBlocked: boolean;
  previousTickets: { status: string; topic: string | null; day: string }[];
};

/** The exact top-level keys, in order. The allowlist test compares against this; do not widen it casually. */
export const SUPPORT_FACT_KEYS = [
  "pro",
  "course",
  "level",
  "streak",
  "daysActiveLast30",
  "lastActiveDay",
  "lessonsLast7Days",
  "lastLessonDay",
  "platforms",
  "socialBlocked",
  "previousTickets",
] as const satisfies readonly (keyof SupportFacts)[];

const MAX_PREVIOUS_TICKETS = 3;

export type RawSupportFacts = {
  languageProgress: { language: string; cefr_level: string | null; updated_at: string }[];
  streak: number;
  /** Days (YYYY-MM-DD) with activity in the last 30 days. */
  activeDaysLast30: string[];
  lastActiveDay: string | null;
  /** completed_at of each lesson finished in the last 7 days. */
  lessonTimesLast7Days: string[];
  lastLessonAt: string | null;
  platforms: string[];
  /** Whether an unlifted social block exists (the reason is not read). */
  socialBlocked: boolean;
  grants: { ends_at: string; revoked_at: string | null }[];
  previousTickets: { status: string; topic: string | null; created_at: string }[];
  /** null when RevenueCat is not configured or could not be asked. */
  subscriber: AccountSubscriberSummary | null;
};

const dayOf = (iso: string): string => iso.slice(0, 10);

/** Pure assembly of the snapshot from what the loaders read. Copies only the fields above, never a whole row. */
export function buildSupportFacts(raw: RawSupportFacts, now: number = Date.now()): SupportFacts {
  const sub = raw.subscriber;
  let pro: SupportFacts["pro"] = { active: false, source: "none", until: null, unavailable: false };
  if (!sub || sub.status === "unavailable") {
    pro = { ...pro, unavailable: true };
  } else if (sub.status === "active") {
    if (sub.store === "promotional") {
      const live = raw.grants
        .filter((g) => !g.revoked_at && Date.parse(g.ends_at) > now)
        .sort((a, b) => b.ends_at.localeCompare(a.ends_at))[0];
      pro = {
        active: true,
        source: "gift",
        until: live ? dayOf(live.ends_at) : null,
        unavailable: false,
      };
    } else {
      pro = { active: true, source: "store", until: null, unavailable: false };
    }
  }
  const current = [...raw.languageProgress].sort((a, b) =>
    b.updated_at.localeCompare(a.updated_at),
  )[0];
  const cutoff30 = new Date(now - 30 * 86_400_000).toISOString().slice(0, 10);
  const cutoff7 = now - 7 * 86_400_000;
  return {
    pro,
    course: current?.language ?? null,
    level: current?.cefr_level ?? null,
    streak: Math.max(0, Math.trunc(raw.streak) || 0),
    daysActiveLast30: new Set(raw.activeDaysLast30.filter((d) => d >= cutoff30)).size,
    lastActiveDay: raw.lastActiveDay ? dayOf(raw.lastActiveDay) : null,
    lessonsLast7Days: raw.lessonTimesLast7Days.filter((t) => Date.parse(t) >= cutoff7).length,
    lastLessonDay: raw.lastLessonAt ? dayOf(raw.lastLessonAt) : null,
    platforms: [...new Set(raw.platforms)].sort(),
    socialBlocked: raw.socialBlocked === true,
    previousTickets: [...raw.previousTickets]
      .sort((a, b) => b.created_at.localeCompare(a.created_at))
      .slice(0, MAX_PREVIOUS_TICKETS)
      .map((t) => ({ status: t.status, topic: t.topic, day: dayOf(t.created_at) })),
  };
}

function ok<T>(result: { data: T | null; error: { message: string } | null }, what: string): T {
  if (result.error) throw new Error(`Could not read ${what}.`);
  return (result.data ?? ([] as unknown)) as T;
}

/**
 * Reads ONE learner's facts with the service-role client. The id comes from the verified session and nothing else
 * (the caller never passes an id from a request body). A failed read throws: the route then hands the conversation
 * to a person instead of letting the AI answer from a partial picture.
 */
export async function loadSupportFacts(
  admin: SupabaseClient,
  userId: string,
  opts: { currentConversationId?: string; fetchImpl?: typeof fetch; now?: number } = {},
): Promise<SupportFacts> {
  const now = opts.now ?? Date.now();
  const since30 = new Date(now - 30 * 86_400_000).toISOString().slice(0, 10);
  const since7 = new Date(now - 7 * 86_400_000).toISOString();
  const config = revenueCatConfigFromEnv();
  const [
    lang,
    progress,
    active30,
    lastActive,
    lessons7,
    lastLesson,
    tokens,
    block,
    grants,
    tickets,
    subscriber,
  ] = await Promise.all([
    admin
      .from("language_progress")
      .select("language, cefr_level, updated_at")
      .eq("user_id", userId),
    admin.from("user_progress").select("streak").eq("user_id", userId).maybeSingle(),
    admin.from("activity_days").select("day").eq("user_id", userId).gte("day", since30),
    admin
      .from("activity_days")
      .select("day")
      .eq("user_id", userId)
      .order("day", { ascending: false })
      .limit(1),
    admin
      .from("lesson_completions")
      .select("completed_at")
      .eq("user_id", userId)
      .gte("completed_at", since7),
    admin
      .from("lesson_completions")
      .select("completed_at")
      .eq("user_id", userId)
      .order("completed_at", { ascending: false })
      .limit(1),
    admin.from("device_tokens").select("platform").eq("user_id", userId),
    admin
      .from("user_restrictions")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .eq("kind", "block")
      .is("lifted_at", null),
    admin.from("pro_grants").select("ends_at, revoked_at").eq("user_id", userId),
    admin
      .from("support_conversations")
      .select("id, status, topic, created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(MAX_PREVIOUS_TICKETS + 1),
    config
      ? getAccountSubscriberSummary(config, userId, opts.fetchImpl ?? fetch)
      : Promise.resolve(null),
  ]);
  if (block.error || progress.error) throw new Error("Could not read account status.");
  const ticketRows = ok(tickets as never, "tickets") as {
    id: string;
    status: string;
    topic: string | null;
    created_at: string;
  }[];
  return buildSupportFacts(
    {
      languageProgress: ok(lang as never, "progress") as RawSupportFacts["languageProgress"],
      streak: (progress.data as { streak: number } | null)?.streak ?? 0,
      activeDaysLast30: (ok(active30 as never, "activity") as { day: string }[]).map((r) => r.day),
      lastActiveDay: (ok(lastActive as never, "activity") as { day: string }[])[0]?.day ?? null,
      lessonTimesLast7Days: (ok(lessons7 as never, "lessons") as { completed_at: string }[]).map(
        (r) => r.completed_at,
      ),
      lastLessonAt:
        (ok(lastLesson as never, "lessons") as { completed_at: string }[])[0]?.completed_at ?? null,
      platforms: (ok(tokens as never, "devices") as { platform: string }[]).map((t) => t.platform),
      socialBlocked: (block.count ?? 0) > 0,
      grants: ok(grants as never, "gifts") as RawSupportFacts["grants"],
      previousTickets: ticketRows
        .filter((t) => t.id !== opts.currentConversationId)
        .map(({ status, topic, created_at }) => ({ status, topic, created_at })),
      subscriber,
    },
    now,
  );
}
