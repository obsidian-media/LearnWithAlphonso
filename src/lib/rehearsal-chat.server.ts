import type { SupabaseClient } from "@supabase/supabase-js";
import type { Course } from "@/data/course-meta";
import type { Level } from "@/data/levels";
import { noStoreJson } from "./api-json";
import { currentCefrLevel } from "./learner-level.server";
import { localDay } from "./local-day";
import { isCallId } from "./practice-calls.server";
import { buildRehearsalPrompt } from "./rehearsal-prompt";
import {
  FREE_REHEARSAL_MAX_RUNS,
  decideRunStart,
  isPersona,
  isRehearsalId,
  isStage,
  rehearsalTimedOut,
  runModeAllowed,
  runNeedsPro,
  type Persona,
  type RunMemory,
  type Stage,
} from "./rehearsal-rules";
import type { RehearsalRow } from "./rehearsals.server";

/**
 * The rehearsal half of /api/chat. The request names a rehearsal and a stage, never prompt text. Everything is
 * checked against the learner's OWN rehearsal row before the quota is spent or the model is called: an id that is
 * not theirs is a 404 exactly like one that does not exist, a closed rehearsal is a 409, and the free rehearsal stops
 * at its run cap (counted in FINISHED runs, rehearsal_runs, so a call abandoned under the finish rule never uses one up).
 * A rehearsal that has run out of time is closed too. The prompt is then built here from the stored brief and the memory
 * of earlier runs, and the course AND the learner's level come from the server (the row and language_progress), never
 * from a request field.
 */
export type RehearsalChat =
  | {
      ok: true;
      prompt: string;
      course: Course;
      rehearsalId: string;
      stage: Stage;
      /** Who plays the partner and whether it is hard mode: the call's stored mode, or the request on a run's first turn. */
      run: { persona: Persona; hard: boolean };
      /** True on a run's first turn (the call row does not exist yet): the caller stores the mode with the first reply. */
      firstTurn: boolean;
    }
  | { ok: false; response: Response };

const refuse = (status: number, error: string): { ok: false; response: Response } => ({
  ok: false,
  response: noStoreJson({ error }, { status }),
});

const LEVELS: readonly Level[] = ["A1", "A2", "B1", "B2", "C1"];
/** The partner's level: the learner's real one, with C2 spoken to as C1 (the prompt's top level). */
const partnerLevel = (level: string): Level =>
  level === "C2" ? "C1" : (LEVELS.find((l) => l === level) ?? "A1");

type ProState = "active" | "inactive" | "unavailable";

const defaultProState = async (userId: string): Promise<ProState> => {
  const { proStateFor } = await import("./call-recap.server");
  return proStateFor(userId);
};

type RunRow = {
  practice_call_id: string | null;
  stage: Stage;
  finished_at: string;
  moments_shown: string[] | null;
  went_well: string[] | null;
  corrections: string[] | null;
};

export async function resolveRehearsalChat(
  db: SupabaseClient,
  args: {
    userId: string;
    rehearsal: unknown;
    callId: unknown;
    /** The Pro state, read at most once per run start. The default asks RevenueCat; tests pass their own. */
    proState?: (userId: string) => Promise<ProState>;
    /** The clock, for tests. */
    now?: () => number;
  },
): Promise<RehearsalChat> {
  const r = args.rehearsal as {
    id?: unknown;
    stage?: unknown;
    persona?: unknown;
    hardMode?: unknown;
  } | null;
  if (!r || typeof r !== "object" || !isRehearsalId(r.id) || !isStage(r.stage))
    return refuse(400, "invalid_rehearsal");
  // Who plays the partner, and hard mode. Both are optional (an older app sends neither: Alphonso, normal level).
  if (r.persona !== undefined && !isPersona(r.persona)) return refuse(400, "invalid_rehearsal");
  if (r.hardMode !== undefined && typeof r.hardMode !== "boolean")
    return refuse(400, "invalid_rehearsal");
  const requested: { persona: Persona; hard: boolean } = {
    persona: r.persona ?? "alphonso",
    hard: r.hardMode === true,
  };
  // Hard mode is Hector on the last stage only, however the request is worded.
  if (!runModeAllowed(requested, r.stage)) return refuse(400, "invalid_mode");
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

  // Finished runs, oldest first. The free cap and "what the earlier runs taught" both come from here.
  const runsRead = await db
    .from("rehearsal_runs")
    .select("practice_call_id,stage,finished_at,moments_shown,went_well,corrections")
    .eq("rehearsal_id", id)
    .eq("user_id", args.userId)
    .order("finished_at", { ascending: true });
  if (runsRead.error) return refuse(500, "rehearsal_unavailable");
  const runRows = (runsRead.data ?? []) as RunRow[];

  // A rehearsal that ran out of time is over, even if the daily close has not reached it yet. The day is the safe one
  // (yesterday in UTC): it can only be a little late, never early, for a learner in any time zone.
  const nowMs = (args.now ?? Date.now)();
  const lastRunAt = runRows.length > 0 ? runRows[runRows.length - 1]!.finished_at : null;
  if (
    rehearsalTimedOut(
      { eventDate: row.event_date, createdAt: row.created_at },
      lastRunAt,
      nowMs,
      localDay(nowMs - 86_400_000, null),
    )
  )
    return refuse(409, "rehearsal_closed");

  if (row.free) {
    // Only a FINISHED run (one that met the finish rule) uses one of the free rehearsal's runs. A call still in progress
    // is not one yet, and a call abandoned under the floor never is.
    if (
      runRows.length >= FREE_REHEARSAL_MAX_RUNS &&
      !runRows.some((x) => x.practice_call_id === args.callId)
    ) {
      const { recordRehearsalUsage } = await import("./rehearsal-usage.server");
      await recordRehearsalUsage("rehearsal_paywall", { reason: "free_runs" });
      return refuse(402, "free_runs_used");
    }
  }

  // The run's mode belongs to its CALL. A plain Alphonso request reads nothing here (the common case costs no extra
  // read). A Hector or hard-mode request looks the call up: once it exists (the first recorded reply creates it) its
  // stored mode is the mode, whatever this request says, so a free call cannot be turned into a Hector call halfway
  // and a Hector call is never checked for Pro again. Only the first turn of a Pro-only run reads the Pro state, once.
  let run = requested;
  let firstTurn = false;
  if (runNeedsPro(requested)) {
    const started = await db
      .from("practice_calls")
      .select("id,persona,hard_mode")
      .eq("id", args.callId)
      .eq("user_id", args.userId)
      .maybeSingle();
    if (started.error) return refuse(500, "rehearsal_unavailable");
    const call = started.data as { persona?: string | null; hard_mode?: boolean | null } | null;
    if (call) {
      run = {
        persona: isPersona(call.persona) ? call.persona : "alphonso",
        hard: call.hard_mode === true,
      };
    } else {
      firstTurn = true;
      let pro: "pro" | "free" | "unavailable" = "unavailable";
      try {
        const state = await (args.proState ?? defaultProState)(args.userId);
        pro = state === "active" ? "pro" : state === "inactive" ? "free" : "unavailable";
      } catch {
        pro = "unavailable";
      }
      const start = decideRunStart(true, pro);
      if (start === "retry") return refuse(503, "retry");
      if (start === "paywall") return refuse(402, "pro_required");
    }
  }

  const runs: RunMemory[] = runRows.map((x) => ({
    stage: x.stage,
    finishedAt: x.finished_at,
    momentsShown: x.moments_shown ?? [],
    wentWell: x.went_well ?? [],
    corrections: x.corrections ?? [],
  }));

  // The learner's real level in this rehearsal's course, read here (language_progress), not trusted from the request.
  const level = partnerLevel(await currentCefrLevel(db as never, args.userId, row.course));
  return {
    ok: true,
    prompt: buildRehearsalPrompt({
      course: row.course,
      stage,
      level,
      brief: row.brief,
      runs,
      eventKind: row.event_kind,
      persona: run.persona,
      hard: run.hard,
    }),
    course: row.course,
    rehearsalId: id,
    stage,
    run,
    firstTurn,
  };
}
