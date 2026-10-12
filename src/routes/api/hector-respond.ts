import { createFileRoute } from "@tanstack/react-router";
import { quotaFailureResponse } from "@/lib/ai-quota-response";
import { upstreamErrorResponse } from "@/lib/api-response.server";
import { filterModelOutput, makeBlockedTermCheck } from "@/lib/ai-safety";
import { nvidiaChatCompletion } from "@/lib/nvidia-chat.server";
import { resolveNvidiaChatModel } from "@/lib/nvidia-chat-model.server";
import { createStageTimer, type StageTimer } from "@/lib/stage-timer.server";
import {
  buildHectorMessages,
  buildHectorSystemPrompt,
  deepgramVoiceForLanguage,
  resolveTutorCourse,
  shapeTutorReply,
  type TutorHistoryMessage,
} from "@/lib/hector-conversation";

async function boundedAudio(response: Response, maxBytes: number): Promise<Buffer | null> {
  if (!response.body) return Buffer.alloc(0);
  const reader = response.body.getReader();
  const chunks: Buffer[] = [];
  let bytes = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) return Buffer.concat(chunks, bytes);
    bytes += value.byteLength;
    if (bytes > maxBytes) {
      await reader.cancel();
      return null;
    }
    chunks.push(Buffer.from(value));
  }
}

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

  // A failed entitlement lookup must not masquerade as a lapsed subscription.
  const entitlement = await timer.time("entitlement", async () => {
    const { revenueCatConfigFromEnv, getProEntitlementStatus } =
      await import("@/lib/revenuecat-entitlement");
    const rcConfig = revenueCatConfigFromEnv();
    return rcConfig ? getProEntitlementStatus(rcConfig, userId) : "unavailable";
  });
  if (entitlement === "unavailable") {
    return Response.json({ error: "entitlement-unavailable" }, { status: 503 });
  }
  if (entitlement === "inactive") {
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
    course?: string;
    cefr_level?: string;
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
  // `course` and `cefr_level` come from current clients; `language` is what every earlier build sends ("en").
  // The resolved course drives the prompt, the voice, the output filter's fallback and the reply's `language`.
  const course = resolveTutorCourse(body.course, body.language);
  const systemPrompt = buildHectorSystemPrompt(course, body.cefr_level ?? "");
  const sessionId = body.session_id || crypto.randomUUID();
  const agent = body.agent_id || "tutor";

  // --- LLM turn (NVIDIA NIM, OpenAI-compatible, same as /api/chat) ---
  const llmStart = performance.now();
  const llm = await timer.time("llm", async () => {
    try {
      const llmResp = await nvidiaChatCompletion({
        apiKey: nvidiaKey,
        signal: AbortSignal.any([request.signal, AbortSignal.timeout(20_000)]),
        body: {
          model: resolveNvidiaChatModel(),
          messages: buildHectorMessages(body.history ?? [], text, systemPrompt),
          max_tokens: 512,
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
    } catch {
      return {
        ok: false as const,
        failure: Response.json({ error: "Hector reply unavailable" }, { status: 504 }),
      };
    }
  });
  if (!llm.ok) return llm.failure;
  const reply = llm.reply;
  const llmMs = performance.now() - llmStart;
  if (!reply) {
    return Response.json({ error: "empty reply from model" }, { status: 502 });
  }
  if (reply.length > 2_000) {
    return Response.json({ error: "Hector reply too long" }, { status: 502 });
  }

  // What the learner hears is what they read: a blocked reply is replaced before it is spoken.
  const safeReply = (
    await filterModelOutput(reply, {
      check: makeBlockedTermCheck(supabaseAdmin),
      course,
      route: "hector-respond",
    })
  ).text;

  // --- TTS (Deepgram, same as /api/tts) → base64 for the client ---
  const ttsModel = deepgramVoiceForLanguage(course);
  const ttsStart = performance.now();
  const tts = await timer.time("tts", async () => {
    try {
      const ttsResp = await fetch(
        `https://api.deepgram.com/v1/speak?model=${encodeURIComponent(ttsModel)}&encoding=mp3&mip_opt_out=true`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Token ${deepgramKey}` },
          body: JSON.stringify({ text: safeReply }),
          signal: AbortSignal.any([request.signal, AbortSignal.timeout(10_000)]),
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
      const audio = await boundedAudio(ttsResp, 1_500_000);
      if (!audio) {
        return {
          ok: false as const,
          failure: Response.json({ error: "Hector audio too large" }, { status: 502 }),
        };
      }
      return {
        ok: true as const,
        audioBase64: audio.toString("base64"),
      };
    } catch {
      return {
        ok: false as const,
        failure: Response.json({ error: "Hector voice unavailable" }, { status: 504 }),
      };
    }
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
      language: course,
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
