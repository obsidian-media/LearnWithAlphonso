import { createFileRoute } from "@tanstack/react-router";
import { upstreamErrorResponse } from "@/lib/api-response.server";
import { resolveNvidiaChatModel } from "@/lib/nvidia-chat-model.server";
import {
  buildHectorMessages,
  deepgramVoiceForLanguage,
  shapeTutorReply,
  type TutorHistoryMessage,
} from "@/lib/hector-conversation";

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
        const { data: userData, error: userError } = await supabaseAdmin.auth.getUser(accessToken);
        if (userError || !userData?.user) {
          return Response.json({ error: "unauthorized" }, { status: 401 });
        }

        // Pro gate, fail-closed -- same posture as /api/hector-shadow-account.
        const { revenueCatConfigFromEnv, isProSubscriber } =
          await import("@/lib/revenuecat-entitlement");
        const rcConfig = revenueCatConfigFromEnv();
        if (!rcConfig || !(await isProSubscriber(rcConfig, userData.user.id))) {
          return Response.json({ error: "not-entitled" }, { status: 403 });
        }

        // Rate-limit like the other AI routes.
        const { consumeQuota } = await import("@/lib/ai-quota.server");
        const quota = await consumeQuota(request, "chat");
        if (!quota.ok) return Response.json({ error: quota.message }, { status: quota.status });

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
        const llmResp = await fetch("https://integrate.api.nvidia.com/v1/chat/completions", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${nvidiaKey}` },
          body: JSON.stringify({
            model: resolveNvidiaChatModel(),
            messages: buildHectorMessages(body.history ?? [], text),
          }),
        });
        if (!llmResp.ok) {
          return upstreamErrorResponse(
            "NVIDIA",
            llmResp.status,
            await llmResp.text().catch(() => ""),
          );
        }
        const llmData = (await llmResp.json()) as {
          choices?: { message?: { content?: string } }[];
        };
        const reply = (llmData.choices?.[0]?.message?.content ?? "").trim();
        const llmMs = performance.now() - llmStart;
        if (!reply) {
          return Response.json({ error: "empty reply from model" }, { status: 502 });
        }

        // --- TTS (Deepgram, same as /api/tts) → base64 for the client ---
        const ttsModel = deepgramVoiceForLanguage(language);
        const ttsStart = performance.now();
        const ttsResp = await fetch(
          `https://api.deepgram.com/v1/speak?model=${encodeURIComponent(ttsModel)}&encoding=mp3`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Token ${deepgramKey}` },
            body: JSON.stringify({ text: reply }),
          },
        );
        if (!ttsResp.ok) {
          return upstreamErrorResponse(
            "Deepgram TTS",
            ttsResp.status,
            await ttsResp.text().catch(() => ""),
          );
        }
        const audioBase64 = Buffer.from(await ttsResp.arrayBuffer()).toString("base64");
        const ttsMs = performance.now() - ttsStart;

        return Response.json(
          shapeTutorReply({
            requestId: crypto.randomUUID(),
            sessionId,
            agent,
            reply,
            audioBase64,
            ttsModel,
            language,
            llmMs,
            ttsMs,
          }),
        );
      },
    },
  },
});
