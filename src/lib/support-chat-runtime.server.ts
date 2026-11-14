import type { SupportFacts } from "./support-facts.server";
import {
  SUPPORT_TIMEOUT_MS,
  type HandoffReason,
  type SupportTopic,
  type SupportTurn,
} from "./support-ai.server";
import {
  SupportCapError,
  type HandlerResult,
  type LearnerView,
  type SupportRuntime,
  type SupportStore,
} from "./support-chat.server";

/**
 * Production wiring for the Help chat (support-chat.server.ts holds the logic and is tested against fakes and the
 * real SQL). Two jobs: authenticate the learner from the verified session, and build the SupportRuntime from the
 * real services. The support tables are reached only through the SECURITY DEFINER functions (writes) and narrow
 * service-role reads of the learner's own conversation; no client privilege exists on them.
 */

type RpcResult = PromiseLike<{ data: unknown; error: { message: string; code?: string } | null }>;
/** The slice of the service-role client the store uses. Loosely typed: the new tables are not in the generated types. */
export type LooseAdmin = {
  rpc(fn: string, args: Record<string, unknown>): RpcResult;
  // The query builder is chained dynamically (eq, gt, order, limit), so it stays untyped here.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  from(table: string): any;
};

function must<T>(
  r: { data: T; error: { message: string; code?: string } | null },
  what: string,
): T {
  if (r.error) throw new Error(`${what} failed`);
  return r.data;
}

export function supabaseSupportStore(admin: LooseAdmin): SupportStore {
  return {
    async openConversation(userId, channel) {
      return String(
        must(
          await admin.rpc("support_open_conversation", { p_user: userId, p_channel: channel }),
          "open",
        ),
      );
    },
    async addLearnerMessage(userId, conversationId, text, clientId) {
      const r = await admin.rpc("support_add_learner_message", {
        p_user: userId,
        p_conversation: conversationId,
        p_body: text,
        p_client_id: clientId,
      });
      if (r.error) {
        if (r.error.message.includes("support_daily_cap")) throw new SupportCapError("daily");
        if (r.error.message.includes("support_conversation_cap"))
          throw new SupportCapError("conversation");
        throw new Error("add message failed");
      }
      return Number(r.data);
    },
    async conversationStatus(conversationId) {
      const r = await admin
        .from("support_conversations")
        .select("status")
        .eq("id", conversationId)
        .maybeSingle();
      return String((must(r, "status") as { status?: string } | null)?.status ?? "");
    },
    async hasMessagesAfter(conversationId, messageId) {
      const r = await admin
        .from("support_messages")
        .select("id")
        .eq("conversation_id", conversationId)
        .gt("id", messageId)
        .limit(1);
      return (must(r, "later messages") as unknown[]).length > 0;
    },
    async recentTurns(conversationId, limit) {
      const r = await admin
        .from("support_messages")
        .select("author_kind, body")
        .eq("conversation_id", conversationId)
        .order("id", { ascending: false })
        .limit(limit);
      const rows = must(r, "turns") as { author_kind: SupportTurn["kind"]; body: string }[];
      return rows.reverse().map((m) => ({ kind: m.author_kind, body: m.body }));
    },
    async addAiMessage(conversationId, body, facts: SupportFacts, handoff) {
      const r = await admin.rpc("support_add_ai_message", {
        p_conversation: conversationId,
        p_body: body,
        p_facts: facts,
        p_handoff: handoff,
      });
      const id = must(r, "add ai message");
      return id === null || id === undefined ? null : Number(id);
    },
    async handoff(userId, conversationId, reason: HandoffReason, topic: SupportTopic, summary) {
      const r = await admin.rpc("support_handoff", {
        p_user: userId,
        p_conversation: conversationId,
        p_reason: reason,
        p_topic: topic,
        p_summary: summary,
      });
      return must(r, "handoff") === true;
    },
    async view(userId) {
      const r = await admin.rpc("support_learner_view", { p_user: userId });
      return (must(r, "view") ?? null) as LearnerView | null;
    },
  };
}

export type LearnerAuth = { ok: true; userId: string } | { ok: false; response: Response };

/**
 * The session's user id, from the verified access token. A banned account's still-valid token is refused the same way
 * the other learner routes refuse it (the clients show the suspended screen on "account_suspended"). A blocked
 * learner keeps Help: a block removes social features only.
 */
export async function authenticateLearner(request: Request): Promise<LearnerAuth> {
  const accessToken = request.headers.get("Authorization")?.replace(/^Bearer\s+/i, "");
  if (!accessToken)
    return { ok: false, response: Response.json({ error: "unauthorized" }, { status: 401 }) };
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin.auth.getUser(accessToken);
  if (error || !data?.user) {
    return { ok: false, response: Response.json({ error: "unauthorized" }, { status: 401 }) };
  }
  const userId = data.user.id;
  try {
    const { data: banned, error: banError } = await supabaseAdmin.rpc("is_restricted", {
      p_user: userId,
      p_kind: "ban",
    });
    if (banError) console.error("[support] could not check the account status");
    else if (banned === true) {
      const { ACCOUNT_SUSPENDED_MESSAGE } = await import("@/integrations/supabase/auth-middleware");
      return {
        ok: false,
        response: Response.json({ error: ACCOUNT_SUSPENDED_MESSAGE }, { status: 403 }),
      };
    }
  } catch {
    console.error("[support] could not check the account status");
  }
  return { ok: true, userId };
}

/** The real services behind one request. */
export async function createSupportRuntime(request: Request): Promise<SupportRuntime> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const admin = supabaseAdmin as unknown as LooseAdmin;
  return {
    store: supabaseSupportStore(admin),
    async aiSwitchedOn() {
      const { isSwitchOn } = await import("./app-switches.server");
      return (await isSwitchOn("ai")) && (await isSwitchOn("support_ai"));
    },
    async consent(userId) {
      const { readAiConsent } = await import("./ai-consent.server");
      return readAiConsent(supabaseAdmin, userId);
    },
    async consumeQuota() {
      const { consumeQuota } = await import("./ai-quota.server");
      return consumeQuota(request, "support");
    },
    async loadFacts(userId, conversationId) {
      const { loadSupportFacts } = await import("./support-facts.server");
      return loadSupportFacts(supabaseAdmin, userId, { currentConversationId: conversationId });
    },
    async callModel(messages) {
      const { resolveLlmApiKey, resolveLlmChatModel } = await import("./llm-chat-model.server");
      const apiKey = resolveLlmApiKey();
      if (!apiKey) return null;
      try {
        const { llmChatCompletion } = await import("./llm-chat.server");
        const { buildSupportRequestBody } = await import("./support-ai.server");
        const resp = await llmChatCompletion({
          apiKey,
          signal: AbortSignal.any([request.signal, AbortSignal.timeout(SUPPORT_TIMEOUT_MS)]),
          body: buildSupportRequestBody(resolveLlmChatModel(), messages),
        });
        if (!resp.ok) {
          // The status only: the body can echo the learner's text.
          console.error(`[support] the AI provider returned ${resp.status}`);
          await resp.body?.cancel().catch(() => {});
          return null;
        }
        const data = (await resp.json()) as { choices?: { message?: { content?: string } }[] };
        return data.choices?.[0]?.message?.content ?? null;
      } catch {
        console.error("[support] model call failed");
        return null;
      }
    },
    async blocked(text, course) {
      const { filterModelOutputs, makeBlockedTermCheck } = await import("./ai-safety");
      const [hit] = await filterModelOutputs([text], {
        check: makeBlockedTermCheck(supabaseAdmin),
        course,
        route: "support",
      });
      return hit === true;
    },
    log(event) {
      console.info(JSON.stringify(event));
    },
  };
}

export const toResponse = ({ status, body }: HandlerResult): Response =>
  Response.json(body, { status });
