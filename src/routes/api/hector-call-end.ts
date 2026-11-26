import { noStoreJson } from "@/lib/api-json";
import { createFileRoute } from "@tanstack/react-router";
import { isCourse, type Course } from "@/data/courses";
import { filterModelOutputs, makeBlockedTermCheck } from "@/lib/ai-safety";
import { boundTranscript } from "@/lib/chat-transcript-limits";
import { resolveLlmApiKey, resolveLlmChatModel } from "@/lib/llm-chat-model.server";
import { RECAP_MIN_LEARNER_TURNS, learnerTurnCount, recapStrings } from "@/lib/call-recap";
import { isCallId } from "@/lib/practice-calls.server";
import { timedRoute } from "@/lib/stage-timer.server";

/**
 * POST /api/hector-call-end { callId, messages, course, cefrLevel? }: the end of a Hector call on the web. Writes what
 * the call taught Hector about the learner: a weakness event per topic and, for a PRO learner (decided here from
 * RevenueCat, never from the request), one tutor_memory line per mistake, which the next call reads into Hector's
 * prompt (hector-memory.server.ts). Same product rules as the practice-call recap (/api/call-recap): AI consent,
 * the 'recap' quota, at least RECAP_MIN_LEARNER_TURNS learner turns, the same strict checks of what the model wrote,
 * and no learner words are stored (only the corrected form).
 *
 * The page sends this when the learner leaves the call, so the answer is never shown. Every refusal is a plain 200
 * with `saved: false`; a failure is logged as a structured `hector_call_end_failed` line with its stage, so a call that
 * leaves no memory can never be silent again. One write per callId.
 */
const log = (event: string, extra: Record<string, unknown> = {}) =>
  console.warn(JSON.stringify({ event, ...extra }));
const NOT_SAVED = (reason: string) => noStoreJson({ saved: false, reason });

export const Route = createFileRoute("/api/hector-call-end")({
  server: {
    handlers: {
      POST: ({ request }) =>
        timedRoute("hector-call-end", async (timer) => {
          const key = resolveLlmApiKey();
          if (!key) {
            log("hector_call_end_failed", { stage: "not_configured" });
            return NOT_SAVED("not_configured");
          }
          let body: { callId?: unknown; messages?: unknown; course?: unknown; cefrLevel?: unknown };
          try {
            body = await request.json();
          } catch {
            return noStoreJson({ error: "Invalid JSON" }, { status: 400 });
          }
          const turns = boundTranscript(body.messages);
          if (!isCallId(body.callId) || learnerTurnCount(turns) < RECAP_MIN_LEARNER_TURNS)
            return NOT_SAVED("short_call");
          const callId = body.callId;
          const course: Course =
            typeof body.course === "string" && isCourse(body.course) ? body.course : "en";

          const { authorizeAiRequest } = await import("@/lib/ai-consent.server");
          const access = await timer.time("auth", () =>
            authorizeAiRequest(request, "recap", { route: "hector-call-end", deferQuota: true }),
          );
          if (!access.ok) return access.response;
          const { userId } = access;

          // Memory is a Pro feature: a free learner spends no AI call and nothing is written.
          const { generateCallRecap, proStateFor } = await import("@/lib/call-recap.server");
          const pro = await timer.time("entitlement", () => proStateFor(userId));
          if (pro !== "active") {
            if (pro === "unavailable") log("hector_call_end_failed", { stage: "entitlement" });
            return NOT_SAVED(pro === "unavailable" ? "entitlement_unavailable" : "not_pro");
          }

          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          const admin = supabaseAdmin as unknown as import("@supabase/supabase-js").SupabaseClient;
          // One write per call: a retry, a second tab or a pagehide plus an unmount must not count it twice.
          const { data: done, error: doneError } = await admin
            .from("tutor_memory")
            .select("id")
            .eq("user_id", userId)
            .eq("call_id", callId)
            .limit(1);
          if (doneError) log("hector_call_end_failed", { stage: "dedup" });
          if (done && done.length > 0) return NOT_SAVED("already_saved");

          const blocked = await access.chargeQuota?.();
          if (blocked) return blocked;

          const cefr = typeof body.cefrLevel === "string" ? body.cefrLevel.slice(0, 4) : undefined;
          const recap = await timer.time("llm", () =>
            generateCallRecap({
              apiKey: key,
              model: resolveLlmChatModel(),
              userId,
              course,
              cefrLevel: cefr,
              scene: "Open conversation with the tutor Hector",
              turns,
              signal: AbortSignal.any([request.signal, AbortSignal.timeout(12_000)]),
            }),
          );
          if (!recap) {
            log("hector_call_end_failed", { stage: "recap" });
            return NOT_SAVED("no_recap");
          }
          const verdicts = await filterModelOutputs(recapStrings(recap), {
            check: makeBlockedTermCheck(supabaseAdmin),
            course,
            route: "hector-call-end",
          });
          const kept = recap.corrections.filter((_, i) => !verdicts[i]);
          if (kept.length === 0) return NOT_SAVED("nothing_to_keep");

          const memo = await timer.time("memory", async () =>
            admin.rpc("remember_call_recap", {
              _user_id: userId,
              _course: course,
              _call_id: callId,
              _topics: [...new Set(kept.map((c) => c.topic))],
              // Only the corrected form: never the learner's own words (they can hold names or details).
              _mistakes: kept.map((c) => ({ topic: c.topic, text: c.fixed })),
              _save: true,
            }),
          );
          if (memo.error) {
            log("hector_call_end_failed", { stage: "write", code: memo.error.code ?? null });
            return NOT_SAVED("write_failed");
          }
          log("hector_call_end_saved", { lines: kept.length });
          return noStoreJson({ saved: true, lines: kept.length });
        }),
    },
  },
});
