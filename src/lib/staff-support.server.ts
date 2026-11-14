import type { SupabaseClient } from "@supabase/supabase-js";
import { stripSupportLink } from "./support-links";
import { SUPPORT_FACT_KEYS, type SupportFacts } from "./support-facts.server";

/**
 * What the staff inbox reads for one ticket. Every reader of support_messages.body goes through the link parser
 * (stripSupportLink, support-links.ts), so an AI answer's trailing [[link:id]] marker never shows to staff as text
 * (support-body-guard.test.ts scans this file). Internal notes and the learner's facts are read here too, and nothing
 * more: no email, no display name of the learner, no payment details, no lesson answers.
 */

export type TicketMessageKind = "learner" | "ai" | "staff" | "system";

export type TicketMessage = {
  id: number;
  kind: TicketMessageKind;
  body: string;
  at: string;
  /** The staff member's display name, for staff rows only. */
  authorName: string | null;
};

export type TicketNote = { id: string; body: string; at: string; authorName: string | null };

export type TicketDetail = {
  id: string;
  status: string;
  topic: string | null;
  channel: string;
  handoffReason: string | null;
  createdAt: string;
  updatedAt: string;
  solvedAt: string | null;
  assignedTo: string | null;
  assignedName: string | null;
  /** The AI's hand-off summary, marker-free. Labelled "may be wrong" in the UI. */
  aiSummary: string | null;
  messages: TicketMessage[];
  notes: TicketNote[];
  /** Exactly the snapshot the AI saw on its latest turn, or rebuilt when it never answered; null when neither is available. */
  facts: SupportFacts | null;
  factsSource: "ai" | "rebuilt" | "unavailable";
  /** Set only when the viewer also holds users.read, so the console can link to the learner page. */
  learnerId: string | null;
};

const MAX_MESSAGES = 500;

/**
 * The stored snapshot copied through the allowlist, so a stored field that should not be there (a future bug, a
 * hand-edited row) can never reach the screen. Anything that does not look like a snapshot returns null.
 */
export function pickSupportFacts(raw: unknown): SupportFacts | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const src = raw as Record<string, unknown>;
  const pro = src.pro && typeof src.pro === "object" ? (src.pro as Record<string, unknown>) : null;
  if (!pro) return null;
  const str = (v: unknown): string | null => (typeof v === "string" ? v : null);
  const num = (v: unknown): number => (typeof v === "number" && Number.isFinite(v) ? v : 0);
  const source = pro.source === "store" || pro.source === "gift" ? pro.source : "none";
  const tickets = Array.isArray(src.previousTickets) ? src.previousTickets.slice(0, 3) : [];
  const picked: SupportFacts = {
    pro: {
      active: pro.active === true,
      source,
      until: str(pro.until),
      unavailable: pro.unavailable === true,
    },
    course: str(src.course),
    level: str(src.level),
    streak: num(src.streak),
    daysActiveLast30: num(src.daysActiveLast30),
    lastActiveDay: str(src.lastActiveDay),
    lessonsLast7Days: num(src.lessonsLast7Days),
    lastLessonDay: str(src.lastLessonDay),
    platforms: Array.isArray(src.platforms)
      ? src.platforms.filter((p): p is string => typeof p === "string")
      : [],
    socialBlocked: src.socialBlocked === true,
    previousTickets: tickets.flatMap((t) => {
      if (!t || typeof t !== "object") return [];
      const row = t as Record<string, unknown>;
      return [{ status: str(row.status) ?? "", topic: str(row.topic), day: str(row.day) ?? "" }];
    }),
  };
  // Keep the key list and the picker in step: a field added to SupportFacts without being copied here fails this.
  for (const key of SUPPORT_FACT_KEYS) if (!(key in picked)) return null;
  return picked;
}

type ConversationRow = {
  id: string;
  user_id: string;
  status: string;
  topic: string | null;
  channel: string;
  handoff_reason: string | null;
  assigned_to: string | null;
  ai_summary: string | null;
  created_at: string;
  updated_at: string;
  solved_at: string | null;
};

/** The conversation row, or null when it does not exist or is still with the AI (not a ticket). */
export async function readTicketRow(
  admin: SupabaseClient,
  id: string,
): Promise<ConversationRow | null> {
  const { data, error } = await admin
    .from("support_conversations")
    .select(
      "id, user_id, status, topic, channel, handoff_reason, assigned_to, ai_summary, created_at, updated_at, solved_at",
    )
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error("Could not read the ticket.");
  const row = data as ConversationRow | null;
  return row && row.status !== "ai" ? row : null;
}

/**
 * The rest of a ticket. The caller has already recorded the view (recordUserView): no record, no data.
 * `rebuildFacts` runs only when the AI never answered in this conversation.
 */
export async function loadTicketDetail(
  admin: SupabaseClient,
  row: ConversationRow,
  opts: {
    canSeeLearner: boolean;
    rebuildFacts: (userId: string) => Promise<SupportFacts>;
  },
): Promise<TicketDetail> {
  const [messages, notes] = await Promise.all([
    admin
      .from("support_messages")
      .select("id, author_kind, author_id, body, created_at, ai_facts")
      .eq("conversation_id", row.id)
      .order("id", { ascending: true })
      .limit(MAX_MESSAGES),
    admin
      .from("support_notes")
      .select("id, author_id, body, created_at")
      .eq("conversation_id", row.id)
      .order("created_at", { ascending: true })
      .limit(200),
  ]);
  if (messages.error || notes.error) throw new Error("Could not read the ticket.");
  const msgRows = (messages.data ?? []) as {
    id: number;
    author_kind: TicketMessageKind;
    author_id: string | null;
    body: string;
    created_at: string;
    ai_facts: unknown;
  }[];
  const noteRows = (notes.data ?? []) as {
    id: string;
    author_id: string;
    body: string;
    created_at: string;
  }[];

  const staffIds = [
    ...new Set(
      [
        row.assigned_to,
        ...msgRows.map((m) => m.author_id),
        ...noteRows.map((n) => n.author_id),
      ].filter((v): v is string => !!v),
    ),
  ];
  const names = new Map<string, string | null>();
  if (staffIds.length > 0) {
    const { data: profiles } = await admin
      .from("profiles")
      .select("id, display_name")
      .in("id", staffIds);
    for (const p of (profiles ?? []) as { id: string; display_name: string | null }[]) {
      names.set(p.id, p.display_name);
    }
  }

  let facts: SupportFacts | null = null;
  let factsSource: TicketDetail["factsSource"] = "unavailable";
  const lastAi = [...msgRows].reverse().find((m) => m.author_kind === "ai" && m.ai_facts != null);
  if (lastAi) {
    facts = pickSupportFacts(lastAi.ai_facts);
    if (facts) factsSource = "ai";
  }
  if (!facts) {
    try {
      facts = await opts.rebuildFacts(row.user_id);
      factsSource = "rebuilt";
    } catch {
      facts = null;
    }
  }

  return {
    id: row.id,
    status: row.status,
    topic: row.topic,
    channel: row.channel,
    handoffReason: row.handoff_reason,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    solvedAt: row.solved_at,
    assignedTo: row.assigned_to,
    assignedName: row.assigned_to ? (names.get(row.assigned_to) ?? null) : null,
    aiSummary: row.ai_summary ? stripSupportLink(row.ai_summary) : null,
    messages: msgRows.map((m) => ({
      id: m.id,
      kind: m.author_kind,
      // Only an AI body carries the marker; every body goes through the parser anyway.
      body: m.author_kind === "ai" ? stripSupportLink(m.body) : m.body,
      at: m.created_at,
      authorName:
        m.author_kind === "staff" && m.author_id ? (names.get(m.author_id) ?? null) : null,
    })),
    notes: noteRows.map((n) => ({
      id: n.id,
      body: n.body,
      at: n.created_at,
      authorName: names.get(n.author_id) ?? null,
    })),
    facts,
    factsSource,
    learnerId: opts.canSeeLearner ? row.user_id : null,
  };
}
