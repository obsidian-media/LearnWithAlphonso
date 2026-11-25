import { noStoreJson } from "@/lib/api-json";
import { createFileRoute } from "@tanstack/react-router";
import { isCourse, type Course } from "@/data/courses";
import { filterModelOutputs, makeBlockedTermCheck } from "@/lib/ai-safety";
import { boundTranscript } from "@/lib/chat-transcript-limits";
import { resolveLlmApiKey, resolveLlmChatModel } from "@/lib/llm-chat-model.server";
import {
  RECAP_MIN_LEARNER_TURNS,
  learnerTurnCount,
  recapStrings,
  topicLabel,
} from "@/lib/call-recap";
import { isCallId } from "@/lib/practice-calls.server";
import { timedRoute } from "@/lib/stage-timer.server";

/**
 * POST /api/call-recap { callId, messages, cefrLevel?, scene? }: the after-call recap (free). Up to three corrections
 * and one new phrase, written once per finished call by one short AI call. Every refusal is a plain 200 with
 * `recap: null`: the result screen never waits for this and never shows an error for it (a short call, a call that is
 * not this learner's or not finished, a recap already written, a model reply that did not check out). Only the gates
 * every AI route has (consent 403, quota 429, AI switched off 503, no session 401) answer with their usual status; the
 * clients hide the recap on any non-200.
 *
 * The call's course and ownership come from the server's own practice_calls row, never from the request. The recap is
 * saved to the learner's memory (tutor_memory) only when they are Pro, decided here from RevenueCat.
 */
const NONE = () => noStoreJson({ recap: null });

export const Route = createFileRoute("/api/call-recap")({
  server: {
    handlers: {
      POST: ({ request }) =>
        timedRoute("call-recap", async (timer) => {
          const key = resolveLlmApiKey();
          if (!key) return NONE();
          let body: { callId?: unknown; messages?: unknown; cefrLevel?: unknown; scene?: unknown };
          try {
            body = await request.json();
          } catch {
            return noStoreJson({ error: "Invalid JSON" }, { status: 400 });
          }
          const turns = boundTranscript(body.messages);
          // Short calls cost nothing: no AI call and no quota spent.
          if (!isCallId(body.callId) || learnerTurnCount(turns) < RECAP_MIN_LEARNER_TURNS)
            return NONE();
          const callId = body.callId;

          const { authorizeAiRequest } = await import("@/lib/ai-consent.server");
          const access = await timer.time("auth", () =>
            authorizeAiRequest(request, "recap", { route: "call-recap" }),
          );
          if (!access.ok) return access.response;
          const { userId } = access;

          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          const admin = supabaseAdmin as unknown as import("@supabase/supabase-js").SupabaseClient;
          const { data: call } = await timer.time("call", async () =>
            admin
              .from("practice_calls")
              .select("course,finished_at,recap_at")
              .eq("id", callId)
              .eq("user_id", userId)
              .maybeSingle(),
          );
          const row = call as {
            course: string;
            finished_at: string | null;
            recap_at: string | null;
          } | null;
          if (!row || !row.finished_at || row.recap_at || !isCourse(row.course)) return NONE();
          const course: Course = row.course;

          // One recap per call: claimed before the AI call, so a second device or a reopened result cannot bill twice.
          const claim = await timer.time("claim", async () =>
            admin.rpc("claim_call_recap", { _user_id: userId, _call_id: callId }),
          );
          if (claim.error || claim.data !== true) return NONE();

          const { generateCallRecap, issueRecapToken, proStateFor } =
            await import("@/lib/call-recap.server");
          const cefr = typeof body.cefrLevel === "string" ? body.cefrLevel.slice(0, 4) : undefined;
          const scene = typeof body.scene === "string" ? body.scene.slice(0, 120) : undefined;
          const recap = await timer.time("llm", () =>
            generateCallRecap({
              apiKey: key,
              model: resolveLlmChatModel(),
              userId,
              course,
              cefrLevel: cefr,
              scene,
              turns,
              signal: AbortSignal.any([request.signal, AbortSignal.timeout(8000)]),
            }),
          );
          if (!recap) return NONE();

          // The same blocked-term check every model-written line passes; a blocked item is dropped, not shown.
          const verdicts = await filterModelOutputs(recapStrings(recap), {
            check: makeBlockedTermCheck(supabaseAdmin),
            course,
            route: "call-recap",
          });
          const kept = {
            corrections: recap.corrections.filter((_, i) => !verdicts[i]),
            phrase: recap.phrase && !verdicts[recap.corrections.length] ? recap.phrase : null,
          };
          if (kept.corrections.length === 0 && !kept.phrase) return NONE();

          // Topic labels become weakness events (what native recorded through analyze-weaknesses); Pro also keeps memory.
          const pro = (await proStateFor(userId)) === "active";
          const topics = [...new Set(kept.corrections.map((c) => c.topic))];
          const memo = await timer.time("memory", async () =>
            admin.rpc("remember_call_recap", {
              _user_id: userId,
              _course: course,
              _call_id: callId,
              _topics: topics,
              _mistakes: kept.corrections.map((c) => ({
                topic: c.topic,
                // Only the corrected form is kept: never the learner's own words (they can hold names or details).
                text: c.fixed,
              })),
              _save: pro,
            }),
          );
          if (memo.error) console.error("[call-recap] memory write failed");

          let token: string | null = null;
          try {
            token = issueRecapToken(userId, callId, course, kept);
          } catch {
            // No signing secret: the recap still shows, "Review these" does not.
          }
          return noStoreJson({
            recap: {
              corrections: kept.corrections.map((c) => ({
                said: c.said,
                fixed: c.fixed,
                why: c.why,
                topic: c.topic,
                label: topicLabel(course, c.topic),
              })),
              phrase: kept.phrase ? { text: kept.phrase.text, meaning: kept.phrase.meaning } : null,
              reviewToken: token,
              saved: pro && !memo.error,
              reviewCount: kept.corrections.length + (kept.phrase ? 1 : 0),
            },
          });
        }),
    },
  },
});
