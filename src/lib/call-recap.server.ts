import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import type { Course } from "../data/courses";
import { llmChatCompletion } from "./llm-chat.server";
import {
  RECAP_MAX_TOKENS,
  RECAP_TIMEOUT_MS,
  buildAlphonsoPriming,
  parseRecap,
  recapSystemPrompt,
  recapUserMessage,
  reviewItemsFromRecap,
  type Recap,
  type Turn,
} from "./call-recap";

/**
 * The server half of the call recap: the one AI call, the signed hand-off to "Review these", the review rows, and
 * Alphonso's Pro priming. Every learner-facing decision (who is Pro, whose call this is, what the model may add) is
 * made here, never taken from the request.
 */

export async function generateCallRecap(args: {
  apiKey: string;
  model: string;
  userId: string;
  course: Course;
  cefrLevel?: string;
  scene?: string;
  turns: Turn[];
  signal?: AbortSignal;
}): Promise<Recap | null> {
  try {
    const resp = await llmChatCompletion({
      apiKey: args.apiKey,
      signal: args.signal ?? AbortSignal.timeout(RECAP_TIMEOUT_MS),
      track: { userId: args.userId, kind: "recap" },
      body: {
        model: args.model,
        max_tokens: RECAP_MAX_TOKENS,
        messages: [
          { role: "system", content: recapSystemPrompt(args.course) },
          {
            role: "user",
            content: recapUserMessage({
              course: args.course,
              cefrLevel: args.cefrLevel,
              scene: args.scene,
              turns: args.turns,
            }),
          },
        ],
      },
    });
    if (!resp.ok) {
      console.error(`[call-recap] AI provider returned ${resp.status}`);
      return null;
    }
    const data = (await resp.json()) as { choices?: { message?: { content?: string } }[] };
    const recap = parseRecap(data.choices?.[0]?.message?.content ?? "", args.turns, args.course);
    if (!recap) console.error("[call-recap] reply was not usable JSON");
    return recap;
  } catch (err) {
    console.error(`[call-recap] AI call failed: ${err instanceof Error ? err.name : "error"}`);
    return null;
  }
}

// ------------------------------------------------------------------------------ Pro

export type ProState = "active" | "inactive" | "unavailable";

/** RevenueCat is the only source of truth. Not configured or unreachable is "unavailable", never Pro. */
export async function proStateFor(userId: string): Promise<ProState> {
  try {
    const { revenueCatConfigFromEnv, getProEntitlementStatus } =
      await import("./revenuecat-entitlement");
    const config = revenueCatConfigFromEnv();
    return config ? await getProEntitlementStatus(config, userId) : "unavailable";
  } catch {
    return "unavailable";
  }
}

// ------------------------------------------------------------------------------ the hand-off token

const TOKEN_MAX_AGE_MS = 24 * 60 * 60 * 1000;

function secret(): string {
  const s = process.env.LESSON_SESSION_SECRET;
  if (!s) throw new Error("LESSON_SESSION_SECRET is not set");
  return s;
}
const sign = (payloadB64: string) =>
  createHmac("sha256", secret()).update(`recap.${payloadB64}`).digest("base64url");

/**
 * Proves "Review these" is asking for exactly what this server wrote for this learner's call: the recap rides in the
 * token, signed, so no recap text is stored for a learner who never taps the button and the client cannot add its own.
 */
export function issueRecapToken(
  userId: string,
  callId: string,
  course: Course,
  recap: Recap,
): string {
  const payloadB64 = Buffer.from(
    JSON.stringify({ u: userId, c: callId, k: course, r: recap, iat: Date.now() }),
  ).toString("base64url");
  return `${payloadB64}.${sign(payloadB64)}`;
}

export function verifyRecapToken(
  token: unknown,
  userId: string,
  callId: string,
  now: number = Date.now(),
): { course: Course; recap: Recap } | null {
  if (typeof token !== "string") return null;
  const [payloadB64, sig] = token.split(".");
  if (!payloadB64 || !sig) return null;
  try {
    const expected = Buffer.from(sign(payloadB64));
    const got = Buffer.from(sig);
    if (got.length !== expected.length || !timingSafeEqual(got, expected)) return null;
    const p = JSON.parse(Buffer.from(payloadB64, "base64url").toString("utf8")) as {
      u?: string;
      c?: string;
      k?: Course;
      r?: Recap;
      iat?: number;
    };
    if (p.u !== userId || p.c !== callId || !p.k || !p.r) return null;
    if (typeof p.iat !== "number" || now - p.iat > TOKEN_MAX_AGE_MS) return null;
    return { course: p.k, recap: p.r };
  } catch {
    return null;
  }
}

// ------------------------------------------------------------------------------ Review these

export const recapItemKey = (callId: string, index: number) =>
  `recap:${createHash("sha256").update(`${callId}:${index}`).digest("hex").slice(0, 16)}`;

type Rpc = {
  rpc: (
    fn: string,
    args: Record<string, unknown>,
  ) => PromiseLike<{ data: unknown; error: unknown }>;
};
type Table = {
  from: (t: string) => {
    upsert: (
      rows: unknown,
      opts: { onConflict: string; ignoreDuplicates: boolean },
    ) => PromiseLike<{ error: { message: string } | null }>;
  };
};

/** Adds the recap's items to the learner's review queue. A second tap upserts the same keys: nothing more is added. */
export async function addRecapToReview(
  admin: Rpc & Table,
  args: { userId: string; callId: string; course: Course; recap: Recap; remember: boolean },
): Promise<{ added: number } | { error: true }> {
  const items = reviewItemsFromRecap(args.recap, args.course);
  if (items.length === 0) return { added: 0 };
  const dueOn = new Date().toISOString().slice(0, 10);
  const rows = items.map((i) => ({
    user_id: args.userId,
    item_key: recapItemKey(args.callId, i.index),
    lesson_id: i.source === "weakness" ? "weakness" : "savedword",
    level: "A1",
    language: args.course,
    ease: 2.5,
    interval_days: 0,
    repetitions: 0,
    due_on: dueOn,
    source: i.source,
    ...(i.source === "weakness"
      ? { weakness_label: i.topic, weakness_display: i.display }
      : { saved_word: i.savedWord, saved_context: i.savedContext }),
    prompt: i.prompt,
    choices: i.choices,
    answer_index: i.answerIndex,
    explanation: i.explanation,
  }));
  const { error } = await admin
    .from("review_items")
    .upsert(rows, { onConflict: "user_id,item_key,language", ignoreDuplicates: true });
  if (error) {
    console.error(`[call-recap] review insert failed: ${error.message}`);
    return { error: true };
  }
  if (args.remember && args.recap.phrase) {
    const phraseItem = items.find((i) => i.source === "saved_word");
    if (phraseItem) {
      await admin.rpc("remember_recap_phrase", {
        _user_id: args.userId,
        _course: args.course,
        _call_id: args.callId,
        _text: args.recap.phrase.text,
        _meaning: args.recap.phrase.meaning,
        _review_key: recapItemKey(args.callId, phraseItem.index),
      });
    }
  }
  return { added: rows.length };
}

// ------------------------------------------------------------------------------ Alphonso's memory

type MemoryReader = {
  from: (t: string) => {
    select: (c: string) => {
      eq: (
        k: string,
        v: string,
      ) => {
        eq: (
          k: string,
          v: string,
        ) => {
          eq: (
            k: string,
            v: string,
          ) => {
            order: (
              c: string,
              o: { ascending: boolean },
            ) => {
              limit: (n: number) => PromiseLike<{ data: { memory_key: string }[] | null }>;
            };
          };
        };
      };
    };
  };
};

/**
 * Alphonso's priming for a call: topic labels from the learner's own memory lines (free for every learner). A learner
 * with no memory costs one cheap read. Best effort: any failure is no priming. Hector's memory stays Pro (hector-respond).
 */
export async function loadAlphonsoPriming(
  db: unknown,
  userId: string,
  course: Course,
): Promise<Turn | null> {
  try {
    const { data } = await (db as MemoryReader)
      .from("tutor_memory")
      .select("memory_key")
      .eq("user_id", userId)
      .eq("course", course)
      .eq("kind", "mistake")
      .order("last_seen_at", { ascending: false })
      .limit(3);
    if (!data || data.length === 0) return null;
    return buildAlphonsoPriming(
      course,
      data.map((r) => r.memory_key),
    );
  } catch {
    return null;
  }
}

export type { Rpc as RecapRpc };
