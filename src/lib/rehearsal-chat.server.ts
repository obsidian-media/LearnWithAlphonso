import type { SupabaseClient } from "@supabase/supabase-js";
import type { Course } from "@/data/course-meta";
import type { Level } from "@/data/levels";
import { noStoreJson } from "./api-json";
import { isCallId } from "./practice-calls.server";
import { buildRehearsalPrompt } from "./rehearsal-prompt";
import {
  FREE_REHEARSAL_MAX_RUNS,
  isRehearsalId,
  isStage,
  type RunMemory,
  type Stage,
} from "./rehearsal-rules";
import type { RehearsalRow } from "./rehearsals.server";

/**
 * The rehearsal half of /api/chat. The request names a rehearsal and a stage, never prompt text. Everything is
 * checked against the learner's OWN rehearsal row before the quota is spent or the model is called: an id that is
 * not theirs is a 404 exactly like one that does not exist, a closed rehearsal is a 409, and the free rehearsal stops
 * at its run cap. The prompt is then built here from the stored brief and the memory of earlier runs, and the course
 * comes from the row, never from a request field.
 */
export type RehearsalChat =
  | {
      ok: true;
      prompt: string;
      course: Course;
      rehearsalId: string;
      stage: Stage;
    }
  | { ok: false; response: Response };

const refuse = (status: number, error: string): { ok: false; response: Response } => ({
  ok: false,
  response: noStoreJson({ error }, { status }),
});

const LEVELS: readonly Level[] = ["A1", "A2", "B1", "B2", "C1"];

type RunRow = {
  stage: Stage;
  finished_at: string;
  moments_shown: string[] | null;
  went_well: string[] | null;
  corrections: string[] | null;
};

export async function resolveRehearsalChat(
  db: SupabaseClient,
  args: { userId: string; rehearsal: unknown; callId: unknown; cefrLevel: unknown },
): Promise<RehearsalChat> {
  const r = args.rehearsal as { id?: unknown; stage?: unknown } | null;
  if (!r || typeof r !== "object" || !isRehearsalId(r.id) || !isStage(r.stage))
    return refuse(400, "invalid_rehearsal");
  if (!isCallId(args.callId)) return refuse(400, "invalid_call");
  const { id, stage } = { id: r.id, stage: r.stage };

  // Scoped to the caller: someone else's id finds nothing, exactly like an id that does not exist.
  const found = await db
    .from("rehearsals")
    .select("*")
    .eq("id", id)
    .eq("user_id", args.userId)
    .maybeSingle();
  if (found.error) return refuse(500, "rehearsal_unavailable");
  const row = found.data as RehearsalRow | null;
  if (!row) return refuse(404, "not_found");
  if (row.status !== "active") return refuse(409, "rehearsal_closed");

  if (row.free) {
    const calls = await db
      .from("practice_calls")
      .select("id")
      .eq("user_id", args.userId)
      .eq("kind", "rehearsal")
      .like("item_key", `${id}:%`);
    if (calls.error) return refuse(500, "rehearsal_unavailable");
    const ids = ((calls.data ?? []) as { id: string }[]).map((c) => c.id);
    // Continuing a run that is already one of the runs is not a new run.
    if (ids.length >= FREE_REHEARSAL_MAX_RUNS && !ids.includes(args.callId))
      return refuse(402, "free_runs_used");
  }

  const runsRead = await db
    .from("rehearsal_runs")
    .select("stage,finished_at,moments_shown,went_well,corrections")
    .eq("rehearsal_id", id)
    .eq("user_id", args.userId)
    .order("finished_at", { ascending: true });
  if (runsRead.error) return refuse(500, "rehearsal_unavailable");
  const runs: RunMemory[] = ((runsRead.data ?? []) as RunRow[]).map((x) => ({
    stage: x.stage,
    finishedAt: x.finished_at,
    momentsShown: x.moments_shown ?? [],
    wentWell: x.went_well ?? [],
    corrections: x.corrections ?? [],
  }));

  // A prompt-shaping hint, not a trust boundary (the same as every other chat request's cefrLevel).
  const level = LEVELS.find((l) => l === args.cefrLevel) ?? "B1";
  return {
    ok: true,
    prompt: buildRehearsalPrompt({
      course: row.course,
      stage,
      level,
      brief: row.brief,
      runs,
      eventKind: row.event_kind,
    }),
    course: row.course,
    rehearsalId: id,
    stage,
  };
}
