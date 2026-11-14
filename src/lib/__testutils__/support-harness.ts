import type { PGlite } from "@electric-sql/pglite";
import { vi } from "vitest";
import {
  SupportCapError,
  type LearnerView,
  type SupportRuntime,
  type SupportStore,
} from "../support-chat.server";
import type { SupportFacts } from "../support-facts.server";
import type { QuotaResult } from "../ai-quota.server";

/**
 * A SupportStore backed by the REAL SQL functions (whole migration history replayed in PGlite, run as service_role),
 * plus a SupportRuntime whose model, switches, consent and quota are fakes a test controls. The route logic under
 * test is the production code; only the outside world is faked.
 */
export function pgliteStore(db: PGlite): SupportStore {
  const asServer = async <T>(fn: () => Promise<T>): Promise<T> => {
    await db.exec("SET ROLE service_role");
    try {
      return await fn();
    } finally {
      await db.exec("RESET ROLE");
    }
  };
  const one = async <T>(sql: string, params: unknown[]): Promise<T> =>
    asServer(async () => (await db.query<{ v: T }>(sql, params)).rows[0]!.v);
  return {
    openConversation: (u, c) =>
      one<string>("SELECT public.support_open_conversation($1,$2) v", [u, c]),
    async addLearnerMessage(u, conv, text, clientId) {
      try {
        return Number(
          await one<string>("SELECT public.support_add_learner_message($1,$2,$3,$4) v", [
            u,
            conv,
            text,
            clientId,
          ]),
        );
      } catch (e) {
        const m = (e as Error).message;
        if (m.includes("support_daily_cap")) throw new SupportCapError("daily");
        if (m.includes("support_conversation_cap")) throw new SupportCapError("conversation");
        throw e;
      }
    },
    conversationStatus: (conv) =>
      asServer(async () =>
        String(
          (
            await db.query<{ status: string }>(
              "SELECT status FROM public.support_conversations WHERE id=$1",
              [conv],
            )
          ).rows[0]?.status ?? "",
        ),
      ),
    hasMessagesAfter: (conv, id) =>
      asServer(
        async () =>
          (
            await db.query(
              "SELECT 1 FROM public.support_messages WHERE conversation_id=$1 AND id>$2 LIMIT 1",
              [conv, id],
            )
          ).rows.length > 0,
      ),
    recentTurns: (conv, limit) =>
      asServer(async () =>
        (
          await db.query<{ author_kind: "learner" | "ai" | "staff" | "system"; body: string }>(
            "SELECT author_kind, body FROM public.support_messages WHERE conversation_id=$1 ORDER BY id DESC LIMIT $2",
            [conv, limit],
          )
        ).rows
          .reverse()
          .map((m) => ({ kind: m.author_kind, body: m.body })),
      ),
    async addAiMessage(conv, body, facts, handoff) {
      const id = await one<string | null>(
        "SELECT public.support_add_ai_message($1,$2,$3::jsonb,$4::jsonb) v",
        [conv, body, JSON.stringify(facts), handoff ? JSON.stringify(handoff) : null],
      );
      return id === null ? null : Number(id);
    },
    handoff: (u, conv, reason, topic, summary) =>
      one<boolean>("SELECT public.support_handoff($1,$2,$3,$4,$5) v", [
        u,
        conv,
        reason,
        topic,
        summary,
      ]),
    view: (u) => one<LearnerView | null>("SELECT public.support_learner_view($1) v", [u]),
  };
}

export const SAMPLE_FACTS: SupportFacts = {
  pro: { active: false, source: "none", until: null, unavailable: false },
  course: "en",
  level: "A1",
  streak: 2,
  daysActiveLast30: 5,
  lastActiveDay: "2026-11-13",
  lessonsLast7Days: 2,
  lastLessonDay: "2026-11-13",
  platforms: ["ios"],
  socialBlocked: false,
  previousTickets: [],
};

export const GOOD_REPLY = JSON.stringify({
  reply: "Tap Restore Purchases on the subscription screen.",
  handoff: false,
  reason: null,
  topic: "restore",
  summary: "",
});

export type Fakes = {
  switchOn: boolean;
  consent: "granted" | "missing" | "error";
  quota: () => QuotaResult;
  facts: (userId: string) => SupportFacts | Error;
  /** Returns the model's text, null for a failed call. */
  model: (messages: unknown[]) => string | null;
};

export function makeRuntime(db: PGlite, overrides: Partial<Fakes> = {}) {
  const fakes: Fakes = {
    switchOn: true,
    consent: "granted",
    quota: () => ({ ok: true, used: 1, limit: 30 }),
    facts: () => SAMPLE_FACTS,
    model: () => GOOD_REPLY,
    ...overrides,
  };
  const spies = {
    consumeQuota: vi.fn(),
    loadFacts: vi.fn(),
    callModel: vi.fn(),
    blocked: vi.fn(),
  };
  const logged: string[] = [];
  const runtime: SupportRuntime = {
    store: pgliteStore(db),
    aiSwitchedOn: async () => fakes.switchOn,
    consent: async () => fakes.consent,
    consumeQuota: async () => {
      spies.consumeQuota();
      return fakes.quota();
    },
    loadFacts: async (userId, conversationId) => {
      spies.loadFacts(userId, conversationId);
      const f = fakes.facts(userId);
      if (f instanceof Error) throw f;
      return f;
    },
    callModel: async (messages) => {
      spies.callModel(messages);
      return fakes.model(messages as unknown[]);
    },
    blocked: async (text, course) => {
      spies.blocked(text, course);
      return false;
    },
    // Same shape as production: one JSON line on console.info.
    log: (event) => {
      logged.push(JSON.stringify(event));
      console.info(JSON.stringify(event));
    },
  };
  return { runtime, fakes, spies, logged };
}
