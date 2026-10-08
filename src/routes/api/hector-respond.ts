import { createFileRoute } from "@tanstack/react-router";
import { quotaFailureResponse } from "@/lib/ai-quota-response";
import { upstreamErrorResponse } from "@/lib/api-response.server";
import { filterModelOutput, makeBlockedTermCheck } from "@/lib/ai-safety";
import { isCourse } from "@/data/courses";
import { nvidiaChatCompletion } from "@/lib/nvidia-chat.server";
import { resolveNvidiaChatModel } from "@/lib/nvidia-chat-model.server";
import { createStageTimer, type StageTimer } from "@/lib/stage-timer.server";
import {
  buildHectorMessages,
  buildHectorSystemPrompt,
  deepgramVoiceForLanguage,
  shapeTutorReply,
  type TutorHistoryMessage,
} from "@/lib/hector-conversation";

async function handleTurn(request: Request, timer: StageTimer): Promise<Response> {
  const nvidiaKey = process.env.NVIDIA_API_KEY;
  const deepgramKey = process.env.DEEPGRAM_API_KEY;
  if (!nvidiaKey || !deepgramKey) {
    return Response.json({ error: "Hector is not configured" }, { status: 500 });
  }

  // Auth: the MAIN app's Supabase token. This is the decoupling --
  // Hector no longer has its own account.
  const accessToken = request.headers.get("Authorization")?.replace(/^Bearer\s+/i, "");
  if (!accessToken) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: userData, error: userError } = await timer.time("auth", async () =>
    supabaseAdmin.auth.getUser(accessToken),
  );
  if (userError || !userData?.user) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
  const userId = userData.user.id;

  // Account consent comes before entitlement and quota: a learner who has not allowed AI sees the consent sheet,
  // not the paywall, and a refused request spends nothing.
  const { requireAiConsent } = await import("@/lib/ai-consent.server");
  const denied = await requireAiConsent(userId, { db: supabaseAdmin, route: "hector-respond" });
  if (denied) return denied;

  // Pro gate, fail-closed -- same posture as /api/hector-shadow-account.
  const entitled = await timer.time("entitlement", async () => {
    const { revenueCatConfigFromEnv, isProSubscriber } =
      await import("@/lib/revenuecat-entitlement");
    const rcConfig = revenueCatConfigFromEnv();
    return !!rcConfig && (await isProSubscriber(rcConfig, userId));
  });
  if (!entitled) {
    return Response.json({ error: "not-entitled" }, { status: 403 });
  }

  // Rate-limit like the other AI routes.
  const quota = await timer.time("quota", async () => {
    const { consumeQuota } = await import("@/lib/ai-quota.server");
    return consumeQuota(request, "chat");
  });
  if (!quota.ok) return quotaFailureResponse(quota);

  let body: {
    session_id?: string;
    text?: string;
    language?: string;
    agent_id?: string;
    history?: TutorHistoryMessage[];
  };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const text = (body.text ?? "").trim();
  if (!text) return Response.json({ error: "text required" }, { status: 400 });
  const language = body.language || "en";
  const sessionId = body.session_id || crypto.randomUUID();
  const agent = body.agent_id || "tutor";

  // --- LLM turn (NVIDIA NIM, OpenAI-compatible, same as /api/chat) ---
  const llmStart = performance.now();
  const llm = await timer.time("llm", async () => {
    const llmResp = await nvidiaChatCompletion({
      apiKey: nvidiaKey,
      body: {
        model: resolveNvidiaChatModel(),
        messages: buildHectorMessages(body.history ?? [], text, buildHectorSystemPrompt("en", "")),
      },
    });
    if (!llmResp.ok) {
      return {
        ok: false as const,
        failure: await upstreamErrorResponse(
          "NVIDIA",
          llmResp.status,
          await llmResp.text().catch(() => ""),
        ),
      };
    }
    const llmData = (await llmResp.json()) as {
      choices?: { message?: { content?: string } }[];
    };
    return { ok: true as const, reply: (llmData.choices?.[0]?.message?.content ?? "").trim() };
  });
  if (!llm.ok) return llm.failure;
  const reply = llm.reply;
  const llmMs = performance.now() - llmStart;
  if (!reply) {
    return Response.json({ error: "empty reply from model" }, { status: 502 });
  }

  // What the learner hears is what they read: a blocked reply is replaced before it is spoken.
  const safeReply = (
    await filterModelOutput(reply, {
      check: makeBlockedTermCheck(supabaseAdmin),
      course: isCourse(language) ? language : "en",
      route: "hector-respond",
    })
  ).text;

  // --- TTS (Deepgram, same as /api/tts) → base64 for the client ---
  const ttsModel = deepgramVoiceForLanguage(language);
  const ttsStart = performance.now();
  const tts = await timer.time("tts", async () => {
    const ttsResp = await fetch(
      `https://api.deepgram.com/v1/speak?model=${encodeURIComponent(ttsModel)}&encoding=mp3&mip_opt_out=true`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Token ${deepgramKey}` },
        body: JSON.stringify({ text: safeReply }),
      },
    );
    if (!ttsResp.ok) {
      return {
        ok: false as const,
        failure: await upstreamErrorResponse(
          "Deepgram TTS",
          ttsResp.status,
          await ttsResp.text().catch(() => ""),
        ),
      };
    }
    return {
      ok: true as const,
      audioBase64: Buffer.from(await ttsResp.arrayBuffer()).toString("base64"),
    };
  });
  if (!tts.ok) return tts.failure;
  const audioBase64 = tts.audioBase64;
  const ttsMs = performance.now() - ttsStart;

  return Response.json(
    shapeTutorReply({
      requestId: crypto.randomUUID(),
      sessionId,
      agent,
      reply: safeReply,
      audioBase64,
      ttsModel,
      language,
      llmMs,
      ttsMs,
    }),
  );
}

/**
 * Hector, decoupled — the tutor turn running in OUR backend against the
 * MAIN account, replacing the call to AlphonsoEcosystem's Cloud Voice
 * (docs/superpowers/specs/2026-09-27-hector-decoupling-design.md).
 *
 * It is turn-based (LLM reply + TTS audio), the same pipeline `/api/chat`
 * and `/api/tts` already run, so no new infrastructure — just this route.
 * Because it authenticates with the main Supabase token and stores
 * nothing, deleting the account leaves no Hector data behind: the
 * cross-project deletion problem stops existing rather than being patched.
 *
 * Response matches Cloud Voice's `VoiceResponse` exactly so the iOS
 * `TutorConversationClient` only needs its endpoint repointed.
 */
export const Route = createFileRoute("/api/hector-respond")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const timer = createStageTimer();
        const res = await handleTurn(request, timer);
        timer.log("hector-respond", res.status);
        res.headers.set("Server-Timing", timer.serverTiming());
        return res;
      },
    },
  },
});
