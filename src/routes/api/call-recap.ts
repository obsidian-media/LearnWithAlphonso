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
import { REHEARSAL_FINISH_MIN_REPLIES, isCallId } from "@/lib/practice-calls.server";
import { isRehearsalId, isStage } from "@/lib/rehearsal-rules";
import { buildRunMemory } from "@/lib/rehearsal-run-memory";
import { timedRoute } from "@/lib/stage-timer.server";

/**
 * POST /api/call-recap { callId, messages, cefrLevel?, scene? }: the after-call recap (free). Up to three corrections
 * and one new phrase, written once per finished call by one short AI call. Every refusal is a plain 200 with
 * `recap: null`: the result screen never waits for this and never shows an error for it (a short call, a call that is
 * not this learner's or not finished, a recap already written, a model reply that did not check out). Only the gates
 * every AI route has (consent 403, quota 429, AI switched off 503, no session 401) answer with their usual status; the
 * clients hide the recap on any non-200.
 *
 * A failed attempt never consumes the call: the claim is an expiring lease (practice_calls.recap_claimed_at, 2 minutes),
 * the completed marker (recap_at) is set only by finish_call_recap together with the memory write, and a model or write
 * failure releases the claim and answers `{ recap: null, retry: true }` so the client can offer "Try again".
 *
 * The call's course and ownership come from the server's own practice_calls row, never from the request. The recap is
 * saved to the learner's memory (tutor_memory) for every learner (free for everyone, owner decision 2026-11-26),
 * behind the same consent, switch and quota gates as the recap itself. Hector's memory stays a Pro feature
 * (hector-call-end.ts, hector-respond.ts).
 */
const NONE = () => noStoreJson({ recap: null });
/** The attempt failed in a way a second try may fix (model, memory write, a database hiccup): the client offers "Try again". */
const RETRY = () => noStoreJson({ recap: null, retry: true });

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
              .select("course,finished_at,recap_at,kind,item_key,replies")
              .eq("id", callId)
              .eq("user_id", userId)
              .maybeSingle(),
          );
          const row = call as {
            course: string;
            finished_at: string | null;
            recap_at: string | null;
            kind?: string;
            item_key?: string;
            replies?: number;
          } | null;
          if (!row || !row.finished_at || row.recap_at || !isCourse(row.course)) return NONE();
          const course: Course = row.course;

          // A rehearsal call is a run only with the rehearsal finish rule's replies: fewer is no run (no AI call, no
          // memory, no stage done). A run also names its rehearsal, so the recap can say which hard moments came up.
          let runOf: { rehearsalId: string; labels: string[] } | null = null;
          if (row.kind === "rehearsal") {
            if ((row.replies ?? 0) < REHEARSAL_FINISH_MIN_REPLIES) return NONE();
            const [rehearsalId, stage] = (row.item_key ?? "").split(":");
            if (isRehearsalId(rehearsalId) && isStage(stage)) {
              const { data: found } = await timer.time("rehearsal", async () =>
                admin
                  .from("rehearsals")
                  .select("brief")
                  .eq("id", rehearsalId)
                  .eq("user_id", userId)
                  .maybeSingle(),
              );
              const moments = (found as { brief?: { hardMoments?: { label?: unknown }[] } } | null)
                ?.brief?.hardMoments;
              if (found)
                runOf = {
                  rehearsalId,
                  labels: (moments ?? []).flatMap((m) =>
                    typeof m.label === "string" ? [m.label] : [],
                  ),
                };
            }
          }

          // One attempt at a time: an expiring claim before the AI call, so a second device or a reopened result cannot
          // bill twice while one is running. It is released on failure and only recap_at (set by finish_call_recap) ends it.
          const claim = await timer.time("claim", async () =>
            admin.rpc("claim_call_recap", { _user_id: userId, _call_id: callId }),
          );
          if (claim.error) return RETRY();
          if (claim.data !== true) return NONE();
          const release = async () => {
            try {
              await admin.rpc("release_call_recap", { _user_id: userId, _call_id: callId });
            } catch {
              // The lease expires by itself.
            }
          };
          const attempt = async () => {
            const { generateCallRecap, issueRecapToken } = await import("@/lib/call-recap.server");
            const cefr =
              typeof body.cefrLevel === "string" ? body.cefrLevel.slice(0, 4) : undefined;
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
                ...(runOf ? { rehearsalLabels: runOf.labels } : {}),
                signal: AbortSignal.any([request.signal, AbortSignal.timeout(8000)]),
              }),
            );
            if (!recap) {
              await release();
              return RETRY();
            }

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
            const nothingToShow = kept.corrections.length === 0 && !kept.phrase;

            // Topic labels become weakness events (what native recorded through analyze-weaknesses); memory lines are kept too.
            const topics = [...new Set(kept.corrections.map((c) => c.topic))];
            const finishArgs = {
              _user_id: userId,
              _course: course,
              _call_id: callId,
              _topics: nothingToShow ? [] : topics,
              _mistakes: (nothingToShow ? [] : kept.corrections).map((c) => ({
                topic: c.topic,
                // Only the corrected form is kept: never the learner's own words (they can hold names or details).
                text: c.fixed,
              })),
              _save: true,
            };
            // A rehearsal run: the same finish also writes the run's memory (moment labels and corrected forms only),
            // in one transaction, once per call.
            const run = runOf
              ? buildRunMemory({
                  corrections: kept.corrections,
                  moments: recap.moments ?? null,
                  labels: runOf.labels,
                })
              : null;
            const memo = await timer.time("memory", async () =>
              run
                ? admin.rpc("finish_rehearsal_recap", {
                    ...finishArgs,
                    _moments: run.momentsShown,
                    _went_well: run.wentWell,
                    _corrections: run.corrections,
                  })
                : admin.rpc("finish_call_recap", finishArgs),
            );
            if (memo.error) {
              console.error("[call-recap] memory write failed");
              await release();
              return RETRY();
            }
            // The database's own finish rule refused the run: nothing was written, so nothing shows and the claim goes.
            if (run && memo.data === -2) {
              await release();
              return NONE();
            }
            // Everything it had to say was filtered out: the call is completed with nothing written, and nothing shows.
            if (nothingToShow) return NONE();

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
                phrase: kept.phrase
                  ? { text: kept.phrase.text, meaning: kept.phrase.meaning }
                  : null,
                reviewToken: token,
                saved: !memo.error,
                reviewCount: kept.corrections.length + (kept.phrase ? 1 : 0),
              },
            });
          };
          try {
            return await attempt();
          } catch {
            await release();
            return RETRY();
          }
        }),
    },
  },
});
