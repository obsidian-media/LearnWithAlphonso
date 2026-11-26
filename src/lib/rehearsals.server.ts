import type { SupabaseClient } from "@supabase/supabase-js";
import type { Course } from "@/data/course-meta";
import { filterModelOutputs, makeBlockedTermCheck } from "./ai-safety";
import { llmChatCompletion } from "./llm-chat.server";
import {
  buildBriefPrompt,
  briefStrings,
  fallbackBrief,
  parseBrief,
  type RehearsalBrief,
} from "./rehearsal-brief";
import type { EventKind, Intake } from "./rehearsal-rules";

/**
 * The server half of Rehearsals: reading a learner's rehearsals, and writing a brief. The writes that must be atomic
 * (create with the free marker, adjust, cancel) are SECURITY DEFINER functions in 20261128220000_rehearsals.sql.
 * `db` is the service-role client, typed loosely because the new tables are not in types.ts until it is regenerated.
 */
export type Db = SupabaseClient;

/** A rehearsals row as stored (snake case, as PostgREST returns it). */
export type RehearsalRow = {
  id: string;
  user_id: string;
  course: Course;
  event_kind: EventKind;
  event_date: string | null;
  counterpart: string;
  worries: string | null;
  brief: RehearsalBrief;
  status: "active" | "done" | "cancelled";
  free: boolean;
  outcome: unknown;
  created_at: string;
  closed_at: string | null;
};

/** What the clients receive: the learner's own rehearsal, camel case. */
export type Rehearsal = {
  id: string;
  course: Course;
  eventKind: EventKind;
  eventDate: string | null;
  counterpart: string;
  worries: string | null;
  brief: RehearsalBrief;
  status: RehearsalRow["status"];
  free: boolean;
  outcome: unknown;
  createdAt: string;
  closedAt: string | null;
};

/** A closed rehearsal in the history list: no brief, no words of the learner's. */
export type RehearsalSummary = Pick<
  Rehearsal,
  | "id"
  | "course"
  | "eventKind"
  | "eventDate"
  | "status"
  | "free"
  | "outcome"
  | "createdAt"
  | "closedAt"
>;

export function toRehearsal(row: RehearsalRow): Rehearsal {
  return {
    id: row.id,
    course: row.course,
    eventKind: row.event_kind,
    eventDate: row.event_date,
    counterpart: row.counterpart,
    worries: row.worries,
    brief: row.brief,
    status: row.status,
    free: row.free,
    outcome: row.outcome ?? null,
    createdAt: row.created_at,
    closedAt: row.closed_at,
  };
}

export function toSummary(row: RehearsalRow): RehearsalSummary {
  const { id, course, eventKind, eventDate, status, free, outcome, createdAt, closedAt } =
    toRehearsal(row);
  return { id, course, eventKind, eventDate, status, free, outcome, createdAt, closedAt };
}

const HISTORY_LIMIT = 20;

export async function hasUsedFreeRehearsal(db: Db, userId: string): Promise<boolean> {
  const { data, error } = await db
    .from("rehearsal_free_used")
    .select("user_id")
    .eq("user_id", userId)
    .maybeSingle();
  // A failed read is not "unused": it would hand out a second free rehearsal on an outage.
  if (error) throw new Error("rehearsal_free_used read failed");
  return data !== null;
}

export async function loadActiveRehearsal(
  db: Db,
  userId: string,
  course: Course,
): Promise<RehearsalRow | null> {
  const { data, error } = await db
    .from("rehearsals")
    .select("*")
    .eq("user_id", userId)
    .eq("course", course)
    .eq("status", "active")
    .maybeSingle();
  if (error) throw new Error("rehearsals read failed");
  return (data as RehearsalRow | null) ?? null;
}

/** The state the clients render: the active rehearsal, the closed ones, and whether the free one is still there. */
export async function loadRehearsalState(db: Db, userId: string, course: Course) {
  const [active, history, used] = await Promise.all([
    loadActiveRehearsal(db, userId, course),
    db
      .from("rehearsals")
      .select("*")
      .eq("user_id", userId)
      .eq("course", course)
      .neq("status", "active")
      .order("created_at", { ascending: false })
      .limit(HISTORY_LIMIT),
    hasUsedFreeRehearsal(db, userId),
  ]);
  if (history.error) throw new Error("rehearsals history read failed");
  return {
    active: active ? toRehearsal(active) : null,
    history: ((history.data ?? []) as RehearsalRow[]).map(toSummary),
    freeAvailable: !used,
  };
}

const BRIEF_TIMEOUT_MS = 20_000;
const BRIEF_MAX_TOKENS = 1500;

/**
 * One brief for an intake. The model is asked up to twice; a reply that is not valid JSON of the schema, or that the
 * blocked-term filter flags, counts as a failed attempt. After two, the per-kind fallback is used, so creating a
 * rehearsal never fails because of the model. Never throws.
 */
export async function generateBrief(
  db: Db,
  args: {
    apiKey: string | null;
    model: string;
    userId: string;
    intake: Pick<Intake, "course" | "eventKind" | "counterpart" | "worries">;
    signal?: AbortSignal;
  },
): Promise<RehearsalBrief> {
  const { intake } = args;
  if (!args.apiKey) return fallbackBrief(intake.eventKind, intake.course);
  const system = buildBriefPrompt(intake);
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const resp = await llmChatCompletion({
        apiKey: args.apiKey,
        signal: AbortSignal.any([
          ...(args.signal ? [args.signal] : []),
          AbortSignal.timeout(BRIEF_TIMEOUT_MS),
        ]),
        body: {
          model: args.model,
          messages: [
            { role: "system", content: system },
            { role: "user", content: "Write the brief now." },
          ],
          max_tokens: BRIEF_MAX_TOKENS,
        },
        track: { userId: args.userId, kind: "rehearsal_brief" },
      });
      if (!resp.ok) continue;
      const data = (await resp.json()) as { choices?: { message?: { content?: string } }[] };
      const brief = parseBrief(data.choices?.[0]?.message?.content ?? "");
      if (!brief) continue;
      const verdicts = await filterModelOutputs(briefStrings(brief), {
        check: makeBlockedTermCheck(db),
        course: intake.course,
        route: "rehearsal",
      });
      if (verdicts.some(Boolean)) continue;
      return brief;
    } catch {
      // Timed out or unreadable: the next attempt, then the fallback.
    }
  }
  return fallbackBrief(intake.eventKind, intake.course);
}
