import type { SupabaseClient } from "@supabase/supabase-js";
import type { Course } from "@/data/course-meta";
import { filterModelOutputs, makeBlockedTermCheck } from "./ai-safety";
import { llmChatCompletion } from "./llm-chat.server";
import { readLearnerTimeZone } from "./learner-time-zone.server";
import { localDay } from "./local-day";
import {
  buildBriefPrompt,
  briefStrings,
  fallbackBrief,
  parseBrief,
  type RehearsalBrief,
} from "./rehearsal-brief";
import type { Rehearsal, RehearsalSummary } from "./rehearsal-api";
import {
  nextStage,
  stageProgress,
  type EventKind,
  type Intake,
  type RunMemory,
  type Stage,
} from "./rehearsal-rules";

export type { Rehearsal, RehearsalSummary } from "./rehearsal-api";

/**
 * The server half of Rehearsals: reading a learner's rehearsals, and writing a brief. The writes that must be atomic
 * (create with the free marker, adjust, cancel) are SECURITY DEFINER functions in 20261129100000_rehearsals.sql.
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

/** What a closed rehearsal held: how many finished runs, how many stages had one, how many corrected forms in all. */
export type SummaryStats = Pick<RehearsalSummary, "runs" | "stagesDone" | "corrections">;
const NO_STATS: SummaryStats = { runs: 0, stagesDone: 0, corrections: 0 };

export function toSummary(row: RehearsalRow, stats: SummaryStats = NO_STATS): RehearsalSummary {
  const { id, course, eventKind, eventDate, status, free, outcome, createdAt, closedAt } =
    toRehearsal(row);
  return { id, course, eventKind, eventDate, status, free, outcome, createdAt, closedAt, ...stats };
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

/**
 * Ends the learner's ACTIVE rehearsals that ran out of time (7 days after the event date by the learner's own calendar
 * day, or 30 days after the last activity when undated), with outcome "none" and no memory line. It runs before the
 * reads that decide what is active (the plan, creating one, the chat, the path), so a rehearsal that timed out
 * neither shows nor blocks a new one. Ended history stays readable. Never throws: a failure leaves the rehearsal as it
 * was, and the daily database job closes it later (close_stale_rehearsals, 20261130100000).
 */
export async function closeStaleRehearsals(
  db: Db,
  userId: string,
  timeZone?: string | null,
): Promise<void> {
  try {
    const zone = timeZone === undefined ? await readLearnerTimeZone(db, userId) : timeZone;
    await db.rpc("close_stale_rehearsals", {
      _user_id: userId,
      _today: localDay(Date.now(), zone),
    });
  } catch {
    // Left as it was.
  }
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

/** One of the learner's own rehearsals by id, whatever its status; null for an unknown id or someone else's. */
export async function loadRehearsalById(
  db: Db,
  userId: string,
  id: string,
): Promise<RehearsalRow | null> {
  const { data, error } = await db
    .from("rehearsals")
    .select("*")
    .eq("id", id)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw new Error("rehearsals read failed");
  return (data as RehearsalRow | null) ?? null;
}

type RunRow = {
  stage: Stage;
  finished_at: string;
  moments_shown: string[] | null;
  went_well: string[] | null;
  corrections: string[] | null;
};

/** What the finished runs of a rehearsal taught the tutor (rehearsal_runs), oldest first. */
export async function loadRuns(db: Db, userId: string, rehearsalId: string): Promise<RunMemory[]> {
  const { data, error } = await db
    .from("rehearsal_runs")
    .select("stage,finished_at,moments_shown,went_well,corrections")
    .eq("rehearsal_id", rehearsalId)
    .eq("user_id", userId)
    .order("finished_at", { ascending: true });
  if (error) throw new Error("rehearsal_runs read failed");
  return ((data ?? []) as RunRow[]).map((x) => ({
    stage: x.stage,
    finishedAt: x.finished_at,
    momentsShown: x.moments_shown ?? [],
    wentWell: x.went_well ?? [],
    corrections: x.corrections ?? [],
  }));
}

/** Run counts per rehearsal, for the history list (the paywall names what the learner already did). */
async function loadSummaryStats(
  db: Db,
  userId: string,
  ids: string[],
): Promise<Map<string, SummaryStats>> {
  const out = new Map<string, SummaryStats>();
  if (ids.length === 0) return out;
  const { data, error } = await db
    .from("rehearsal_runs")
    .select("rehearsal_id,stage,corrections")
    .eq("user_id", userId)
    .in("rehearsal_id", ids);
  if (error) throw new Error("rehearsal_runs read failed");
  const stages = new Map<string, Set<string>>();
  for (const r of (data ?? []) as {
    rehearsal_id: string;
    stage: string;
    corrections: string[] | null;
  }[]) {
    const cur = out.get(r.rehearsal_id) ?? { runs: 0, stagesDone: 0, corrections: 0 };
    const seen = stages.get(r.rehearsal_id) ?? new Set<string>();
    seen.add(r.stage);
    stages.set(r.rehearsal_id, seen);
    out.set(r.rehearsal_id, {
      runs: cur.runs + 1,
      stagesDone: seen.size,
      corrections: cur.corrections + (r.corrections?.length ?? 0),
    });
  }
  return out;
}

/** The state the clients render: the active rehearsal, the closed ones, and whether the free one is still there. */
export async function loadRehearsalState(db: Db, userId: string, course: Course) {
  await closeStaleRehearsals(db, userId);
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
  // Which of the three stages are done, and which to offer next, from the finished runs.
  const runs = active ? await loadRuns(db, userId, active.id) : [];
  const progress = active ? stageProgress(runs) : null;
  const closed = (history.data ?? []) as RehearsalRow[];
  const stats = await loadSummaryStats(
    db,
    userId,
    closed.map((r) => r.id),
  );
  return {
    active: active ? toRehearsal(active) : null,
    progress,
    nextStage: progress ? nextStage(progress, runs) : null,
    // Labels and corrected forms only (never the learner's words): the plan's debrief reads the latest run from here.
    runs,
    history: closed.map((r) => toSummary(r, stats.get(r.id))),
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
