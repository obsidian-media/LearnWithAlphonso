import { createFileRoute } from "@tanstack/react-router";
import { quotaFailureResponse } from "@/lib/ai-quota-response";
import { filterModelOutputs, makeBlockedTermCheck } from "@/lib/ai-safety";
import {
  explainRequestSchema,
  languageDirection,
  parseExplanation,
  type ExplainRequest,
} from "@/lib/explain";
import { buildExplainMessages, explainCacheKey } from "@/lib/explain.server";
import { LEARNER_PROFILE_KEY, parseLearnerProfile } from "@/lib/learner-profile";
import { llmChatCompletion } from "@/lib/llm-chat.server";
import { resolveLlmApiKey, resolveLlmChatModel } from "@/lib/llm-chat-model.server";
import { createStageTimer, type StageTimer } from "@/lib/stage-timer.server";

/**
 * "Explain in my language" (BACKLOG 0.0-bc): a short WHY, in the learner's own language, for one wrong answer, one
 * word or one chat message. Asked for with a tap; the lesson itself never changes language.
 *
 * Order, like every AI route: auth, the owner's AI switch, consent, then the cheap free checks (the body, the
 * account's language, Pro for Hector, the cache), THEN quota, THEN the model. A cache hit spends nothing, and so does
 * every refusal before the quota line. The learner's language is read from the ACCOUNT, never from the request, and
 * the prompt is built here: the learner's text goes in only as JSON data (explain.server.ts).
 *
 * From Hector (`surface: "hector"`) the call needs Pro and spends Hector's own allowance; from everywhere else it
 * spends the free `explain` budget.
 */
async function handleExplain(request: Request, timer: StageTimer): Promise<Response> {
  const llmKey = resolveLlmApiKey();
  if (!llmKey) return Response.json({ error: "Explanations are not configured" }, { status: 500 });

  const accessToken = request.headers.get("Authorization")?.replace(/^Bearer\s+/i, "");
  if (!accessToken) return Response.json({ error: "unauthorized" }, { status: 401 });

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: userData, error: userError } = await timer.time("auth", () =>
    supabaseAdmin.auth.getUser(accessToken),
  );
  if (userError || !userData?.user)
    return Response.json({ error: "unauthorized" }, { status: 401 });
  const userId = userData.user.id;

  const { requireAiConsent, requireAiSwitchedOn } = await import("@/lib/ai-consent.server");
  const off = await requireAiSwitchedOn("explain");
  if (off) return off;
  const denied = await requireAiConsent(userId, { db: supabaseAdmin, route: "explain" });
  if (denied) return denied;

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const parsed = explainRequestSchema.safeParse(raw);
  if (!parsed.success) return Response.json({ error: "invalid-request" }, { status: 400 });
  const input: ExplainRequest = parsed.data;

  // The language the learner told us in first run (or changed in Settings). A value the account cannot hold, or none,
  // is "unsupported": there is no language to explain in.
  const { data: account, error: accountError } = await timer.time("account", () =>
    supabaseAdmin.auth.admin.getUserById(userId),
  );
  if (accountError || !account?.user) {
    return Response.json({ error: "Could not read your account." }, { status: 500 });
  }
  const native = parseLearnerProfile(
    account.user.user_metadata?.[LEARNER_PROFILE_KEY],
  ).nativeLanguage;
  if (!native) return Response.json({ error: "unsupported-language" }, { status: 422 });
  if (native === input.course) return Response.json({ error: "same-language" }, { status: 400 });

  const fromHector = input.surface === "hector";
  if (fromHector) {
    const { isSwitchOn } = await import("@/lib/app-switches.server");
    if (!(await isSwitchOn("tutor"))) {
      return Response.json({ error: "tutor-unavailable" }, { status: 503 });
    }
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
    if (entitlement === "inactive")
      return Response.json({ error: "not-entitled" }, { status: 403 });
  }

  const direction = languageDirection(native);
  const cacheKey = explainCacheKey(input, native);
  const shown = (explanation: string, cached: boolean) =>
    Response.json({ explanation, language: native, direction, cached });

  // A failed cache read is a miss, not an error: it only means one more generation.
  const { data: hit, error: cacheReadError } = await timer.time("cache", async () =>
    supabaseAdmin
      .from("explanation_cache")
      .select("explanation")
      .eq("cache_key", cacheKey)
      .maybeSingle(),
  );
  if (cacheReadError) console.error(`[explain] cache read failed: ${cacheReadError.message}`);
  const cached = (hit as { explanation?: string } | null)?.explanation;
  if (cached) return shown(cached, true);

  const quota = await timer.time("quota", async () => {
    const { consumeQuota } = await import("@/lib/ai-quota.server");
    return consumeQuota(request, fromHector ? "hector" : "explain");
  });
  if (!quota.ok) return quotaFailureResponse(quota);

  const unavailable = () =>
    Response.json({ error: "Could not explain that. Try again." }, { status: 502 });
  const explanation = await timer.time("llm", async () => {
    try {
      const resp = await llmChatCompletion({
        apiKey: llmKey,
        signal: AbortSignal.any([request.signal, AbortSignal.timeout(20_000)]),
        body: {
          model: resolveLlmChatModel(),
          messages: buildExplainMessages(input, native),
          max_tokens: 600,
        },
      });
      if (!resp.ok) {
        console.error(`[explain] the AI provider returned ${resp.status}`);
        await resp.body?.cancel().catch(() => {});
        return null;
      }
      const data = (await resp.json()) as { choices?: { message?: { content?: string } }[] };
      return parseExplanation(data.choices?.[0]?.message?.content);
    } catch (err) {
      console.error(`[explain] model call failed: ${String(err)}`);
      return null;
    }
  });
  if (!explanation) return unavailable();

  const [blocked] = await filterModelOutputs([explanation], {
    check: makeBlockedTermCheck(supabaseAdmin),
    course: input.course,
    route: "explain",
  });
  if (blocked) return unavailable();

  // Two learners asking at once both generate; the second write is a no-op (same key, same item).
  const { error: writeError } = await timer.time("store", async () =>
    supabaseAdmin.from("explanation_cache").upsert(
      {
        cache_key: cacheKey,
        kind: input.kind,
        course: input.course,
        native_language: native,
        explanation,
      },
      { onConflict: "cache_key", ignoreDuplicates: true },
    ),
  );
  if (writeError) console.error(`[explain] cache write failed: ${writeError.message}`);

  return shown(explanation, false);
}

export const Route = createFileRoute("/api/explain")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const timer = createStageTimer();
        const res = await handleExplain(request, timer);
        timer.log("explain", res.status);
        res.headers.set("Server-Timing", timer.serverTiming());
        return res;
      },
    },
  },
});
