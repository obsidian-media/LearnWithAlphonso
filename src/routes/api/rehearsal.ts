import { createFileRoute } from "@tanstack/react-router";
import { noStoreJson } from "@/lib/api-json";
import { isCourse, type Course } from "@/data/course-meta";
import { filterModelOutputs, makeBlockedTermCheck } from "@/lib/ai-safety";
import { resolveLlmApiKey, resolveLlmChatModel } from "@/lib/llm-chat-model.server";
import {
  applyOutcome,
  canCreateRehearsal,
  isRehearsalId,
  validateIntake,
  type Intake,
} from "@/lib/rehearsal-rules";
import { rehearsalsEnabled } from "@/lib/rehearsals-flag";
import { timedRoute } from "@/lib/stage-timer.server";

/**
 * Rehearsals (the learner prepares one real upcoming conversation). Off unless REHEARSALS_ENABLED is set.
 *
 * GET  /api/rehearsal?course=en  -> { active, progress, nextStage, history, freeAvailable }
 * POST /api/rehearsal { action: "create" | "adjust" | "cancel" | "delete" | "outcome", ... } -> { rehearsal } (create,
 *   adjust, cancel, outcome) or { ok: true } (delete). Errors: 400 invalid_* / blocked_text, 402 paywall, 404
 *   not_found, 409 active_exists (or closed, for an outcome on a closed rehearsal), 503 retry.
 * outcome { id, choice: "well" | "ok" | "hard" | "moved", newDate? } is "How did it go?": taps only. The first three
 *   close the rehearsal with one fixed memory line; moved needs a date after the learner's local today.
 *
 * The free rule is enforced here and in the database: one free rehearsal per account, ever, recorded in
 * rehearsal_free_used (which outlives the rehearsal). Pro state "unavailable" refuses creation with "retry" and never
 * uses the free one up. The learner's own words are filtered, then reach the model only as fenced, quoted data.
 */
const NOT_ENABLED = () => noStoreJson({ error: "not_enabled" }, { status: 404 });
const bad = (error: string) => noStoreJson({ error }, { status: 400 });

type RpcError = { message?: string; code?: string } | null;
const isFreeUsed = (e: RpcError) =>
  e?.code === "P0001" && /rehearsal_free_used/.test(e.message ?? "");
const isNotFound = (e: RpcError) => e?.code === "P0002";
const isActiveExists = (e: RpcError) => e?.code === "23505";

async function handlePost(
  request: Request,
  timer: Parameters<Parameters<typeof timedRoute>[1]>[0],
) {
  let body: Record<string, unknown>;
  try {
    const parsed: unknown = await request.json();
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed))
      return bad("invalid_body");
    body = parsed as Record<string, unknown>;
  } catch {
    return bad("invalid_json");
  }
  const action = body.action;
  if (
    action !== "create" &&
    action !== "adjust" &&
    action !== "cancel" &&
    action !== "delete" &&
    action !== "outcome"
  )
    return bad("invalid_action");

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const admin = supabaseAdmin as unknown as import("@supabase/supabase-js").SupabaseClient;

  // "How did it go?": taps only (well, ok, hard, or moved with a new date). Not an AI call, a session is enough.
  if (action === "outcome") {
    const { verifyAuth } = await import("@/lib/ai-quota.server");
    const auth = await timer.time("auth", () => verifyAuth(request));
    if (!auth.ok) return noStoreJson({ error: auth.message }, { status: auth.status });
    if (!isRehearsalId(body.id)) return bad("invalid_id");
    const server = await import("@/lib/rehearsals.server");
    let row: Awaited<ReturnType<typeof server.loadRehearsalById>>;
    try {
      row = await server.loadRehearsalById(admin, auth.userId, body.id);
    } catch {
      return noStoreJson({ error: "failed" }, { status: 500 });
    }
    if (!row) return noStoreJson({ error: "not_found" }, { status: 404 });
    // "Future" is the learner's own calendar day, not the server's UTC one.
    const { readLearnerTimeZone } = await import("@/lib/learner-time-zone.server");
    const { localDay } = await import("@/lib/local-day");
    const today = localDay(Date.now(), await readLearnerTimeZone(admin, auth.userId));
    const applied = applyOutcome(
      { status: row.status, eventKind: row.event_kind },
      body.choice,
      body.newDate,
      today,
    );
    if (!applied.ok) {
      if (applied.error === "closed") return noStoreJson({ error: "closed" }, { status: 409 });
      return bad(applied.error);
    }
    const { data, error } =
      applied.action === "move"
        ? await admin.rpc("move_rehearsal", {
            _user_id: auth.userId,
            _id: body.id,
            _event_date: applied.eventDate,
          })
        : await admin.rpc("close_rehearsal", {
            _user_id: auth.userId,
            _id: body.id,
            _outcome: applied.outcome,
            _memory_text: applied.memoryText,
          });
    if (error?.code === "P0001" && /rehearsal_closed/.test(error.message ?? ""))
      return noStoreJson({ error: "closed" }, { status: 409 });
    if (isNotFound(error)) return noStoreJson({ error: "not_found" }, { status: 404 });
    if (error) return noStoreJson({ error: "failed" }, { status: 500 });
    return noStoreJson({ rehearsal: server.toRehearsal(data as never) });
  }

  // Cancel and delete are not AI calls: a session is enough, no consent or quota.
  if (action === "cancel" || action === "delete") {
    const { verifyAuth } = await import("@/lib/ai-quota.server");
    const auth = await timer.time("auth", () => verifyAuth(request));
    if (!auth.ok) return noStoreJson({ error: auth.message }, { status: auth.status });
    if (!isRehearsalId(body.id)) return bad("invalid_id");
    if (action === "cancel") {
      const { data, error } = await admin.rpc("cancel_rehearsal", {
        _user_id: auth.userId,
        _id: body.id,
      });
      if (isNotFound(error)) return noStoreJson({ error: "not_found" }, { status: 404 });
      if (error) return noStoreJson({ error: "failed" }, { status: 500 });
      const { toRehearsal } = await import("@/lib/rehearsals.server");
      return noStoreJson({ rehearsal: toRehearsal(data as never) });
    }
    // The learner's own row only. The free marker is a different table and stays.
    const { data, error } = await admin
      .from("rehearsals")
      .delete()
      .eq("id", body.id)
      .eq("user_id", auth.userId)
      .select("id");
    if (error) return noStoreJson({ error: "failed" }, { status: 500 });
    if (!data || data.length === 0) return noStoreJson({ error: "not_found" }, { status: 404 });
    return noStoreJson({ ok: true });
  }

  // create and adjust: auth, the AI switch and consent now; the brief's quota only once the request is accepted.
  const { authorizeAiRequest } = await import("@/lib/ai-consent.server");
  const access = await timer.time("auth", () =>
    authorizeAiRequest(request, "rehearsal_brief", { route: "rehearsal", deferQuota: true }),
  );
  if (!access.ok) return access.response;
  const { userId } = access;

  if (action === "adjust" && !isRehearsalId(body.id)) return bad("invalid_id");
  const checked = validateIntake(body);
  if (!checked.ok) return bad(checked.error);
  const intake: Intake = checked.value;

  // The learner's own words go through the same blocked-term filter as the model's. It fails closed.
  const texts = [intake.counterpart, ...(intake.worries ? [intake.worries] : [])];
  const verdicts = await filterModelOutputs(texts, {
    check: makeBlockedTermCheck(supabaseAdmin),
    course: intake.course,
    route: "rehearsal",
  });
  if (verdicts.some(Boolean)) return bad("blocked_text");

  const server = await import("@/lib/rehearsals.server");
  let decision: ReturnType<typeof canCreateRehearsal> = "ok_pro";
  if (action === "create") {
    const { proStateFor } = await import("@/lib/call-recap.server");
    const state = await proStateFor(userId);
    try {
      decision = canCreateRehearsal(
        state === "active" ? "pro" : state === "inactive" ? "free" : "unavailable",
        state === "inactive" ? await server.hasUsedFreeRehearsal(admin, userId) : false,
      );
    } catch {
      decision = "retry";
    }
    if (decision === "retry") return noStoreJson({ error: "retry" }, { status: 503 });
    if (decision === "paywall") return noStoreJson({ error: "paywall" }, { status: 402 });
    if (await server.loadActiveRehearsal(admin, userId, intake.course))
      return noStoreJson({ error: "active_exists" }, { status: 409 });
  }

  const refused = await access.chargeQuota?.();
  if (refused) return refused;
  const brief = await timer.time("brief", () =>
    server.generateBrief(admin, {
      apiKey: resolveLlmApiKey() ?? null,
      model: resolveLlmChatModel(),
      userId,
      intake,
      signal: request.signal,
    }),
  );

  const { data, error } =
    action === "create"
      ? await admin.rpc("create_rehearsal", {
          _user_id: userId,
          _course: intake.course,
          _event_kind: intake.eventKind,
          _event_date: intake.eventDate,
          _counterpart: intake.counterpart,
          _worries: intake.worries,
          _brief: brief,
          _free: decision === "ok_free",
        })
      : await admin.rpc("adjust_rehearsal", {
          _user_id: userId,
          _id: body.id,
          _event_kind: intake.eventKind,
          _event_date: intake.eventDate,
          _counterpart: intake.counterpart,
          _worries: intake.worries,
          _brief: brief,
        });
  if (isFreeUsed(error)) return noStoreJson({ error: "paywall" }, { status: 402 });
  if (isActiveExists(error)) return noStoreJson({ error: "active_exists" }, { status: 409 });
  if (isNotFound(error)) return noStoreJson({ error: "not_found" }, { status: 404 });
  if (error) {
    console.error(JSON.stringify({ event: "rehearsal_write_failed", action }));
    return noStoreJson({ error: "failed" }, { status: 500 });
  }
  return noStoreJson({ rehearsal: server.toRehearsal(data as never) });
}

export const Route = createFileRoute("/api/rehearsal")({
  server: {
    handlers: {
      GET: ({ request }) =>
        timedRoute("rehearsal-get", async (timer) => {
          if (!rehearsalsEnabled()) return NOT_ENABLED();
          const course = new URL(request.url).searchParams.get("course");
          if (!course || !isCourse(course)) return bad("invalid_course");
          const { verifyAuth } = await import("@/lib/ai-quota.server");
          const auth = await timer.time("auth", () => verifyAuth(request));
          if (!auth.ok) return noStoreJson({ error: auth.message }, { status: auth.status });
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          const { loadRehearsalState } = await import("@/lib/rehearsals.server");
          try {
            return noStoreJson(
              await loadRehearsalState(
                supabaseAdmin as unknown as import("@supabase/supabase-js").SupabaseClient,
                auth.userId,
                course as Course,
              ),
            );
          } catch {
            return noStoreJson({ error: "failed" }, { status: 500 });
          }
        }),
      POST: ({ request }) =>
        timedRoute("rehearsal", async (timer) => {
          if (!rehearsalsEnabled()) return NOT_ENABLED();
          return handlePost(request, timer);
        }),
    },
  },
});
