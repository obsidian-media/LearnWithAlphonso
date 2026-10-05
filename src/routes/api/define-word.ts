import { createFileRoute } from "@tanstack/react-router";
import { resolveNvidiaChatModel } from "@/lib/nvidia-chat-model.server";
import { createStageTimer, type StageTimer } from "@/lib/stage-timer.server";
import { SAVED_WORD_LIMIT, buildSavedWordCard, validateSavedWordInput } from "@/lib/saved-word";
import { defineWord, savedWordItemKey } from "@/lib/saved-word.server";

/**
 * Save-any-word (docs/superpowers/specs/2026-10-05-save-any-word-design.md).
 * One NVIDIA call turns a tapped word plus its sentence into a stored
 * multiple-choice review card. The server builds the card and inserts it with
 * supabaseAdmin (review_items has no direct client writes); the client never
 * supplies choices or the answer.
 *
 * Cheap, free checks run first so a repeat tap or a full list never spends
 * quota or an AI call: validate, already-saved, cap, THEN quota, THEN the model.
 *
 * No Pro check: the Save affordance only exists on screens the learner can
 * already reach (Hector is Pro-only; Practice and Campaign are free), and cost is
 * bounded by the `define` quota.
 */
async function handleDefine(request: Request, timer: StageTimer): Promise<Response> {
  const nvidiaKey = process.env.NVIDIA_API_KEY;
  if (!nvidiaKey) return Response.json({ error: "Word saving is not configured" }, { status: 500 });

  const accessToken = request.headers.get("Authorization")?.replace(/^Bearer\s+/i, "");
  if (!accessToken) return Response.json({ error: "unauthorized" }, { status: 401 });

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: userData, error: userError } = await timer.time("auth", () =>
    supabaseAdmin.auth.getUser(accessToken),
  );
  if (userError || !userData?.user)
    return Response.json({ error: "unauthorized" }, { status: 401 });
  const userId = userData.user.id;

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const parsed = validateSavedWordInput(raw);
  if (!parsed.ok) return Response.json({ error: parsed.error }, { status: 400 });
  const input = parsed.value;
  const itemKey = savedWordItemKey(input.course, input.word);

  // The generated columns are nullable, but the review_items CHECK requires all
  // three for a saved_word row, so the fallbacks below are never reached in practice.
  type StoredWord = {
    saved_word: string | null;
    saved_context: string | null;
    explanation: string | null;
  };
  const loadExisting = async () => {
    const { data, error } = await supabaseAdmin
      .from("review_items")
      .select("saved_word,saved_context,explanation")
      .eq("user_id", userId)
      .eq("item_key", itemKey)
      .eq("language", input.course)
      .maybeSingle();
    return { row: data as StoredWord | null, error };
  };
  const dbError = () => Response.json({ error: "Could not save that word." }, { status: 500 });
  const alreadySaved = (row: StoredWord) =>
    Response.json({
      alreadySaved: true,
      word: row.saved_word ?? "",
      sentence: row.saved_context ?? "",
      explanation: row.explanation ?? "",
    });

  // A failed CHEAP check must stop the request, not be read as "not saved" /
  // "under the cap": that would carry on to spend a quota unit and an AI call
  // because of a database blip.
  const existing = await timer.time("lookup", loadExisting);
  if (existing.error) {
    console.error(`[define-word] lookup failed: ${existing.error.message}`);
    return dbError();
  }
  if (existing.row) return alreadySaved(existing.row);

  const { count, error: countError } = await timer.time("count", async () =>
    supabaseAdmin
      .from("review_items")
      .select("item_key", { count: "exact", head: true })
      .eq("user_id", userId)
      .eq("source", "saved_word")
      .eq("language", input.course),
  );
  if (countError) {
    console.error(`[define-word] count failed: ${countError.message}`);
    return dbError();
  }
  if ((count ?? 0) >= SAVED_WORD_LIMIT) {
    return Response.json({ error: "saved-word-limit" }, { status: 409 });
  }

  const quota = await timer.time("quota", async () => {
    const { consumeQuota } = await import("@/lib/ai-quota.server");
    return consumeQuota(request, "define");
  });
  if (!quota.ok) return Response.json({ error: quota.message }, { status: quota.status });

  const definition = await timer.time("llm", () =>
    defineWord({ input, apiKey: nvidiaKey, model: resolveNvidiaChatModel() }),
  );
  if (!definition) {
    return Response.json({ error: "Could not look that word up. Try again." }, { status: 502 });
  }

  const card = buildSavedWordCard({ word: input.word, sentence: input.sentence, definition });
  // First review tomorrow: the learner has just read the meaning.
  const dueOn = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);
  const { error } = await timer.time("insert", async () =>
    supabaseAdmin.from("review_items").insert({
      user_id: userId,
      item_key: itemKey,
      lesson_id: "savedword",
      level: "A1",
      language: input.course,
      ease: 2.5,
      interval_days: 0,
      repetitions: 0,
      due_on: dueOn,
      source: "saved_word",
      saved_word: input.word,
      saved_context: input.sentence,
      prompt: card.prompt,
      choices: card.choices,
      answer_index: card.answerIndex,
      explanation: card.explanation,
    }),
  );
  if (error) {
    // Two taps (or two devices) raced: the other insert won. That is a save,
    // not a failure.
    if (error.code === "23505") {
      const { row: winner } = await loadExisting();
      if (winner) return alreadySaved(winner);
    }
    console.error(`[define-word] insert failed: ${error.message}`);
    return dbError();
  }

  return Response.json({
    alreadySaved: false,
    word: input.word,
    sentence: input.sentence,
    explanation: card.explanation,
  });
}

export const Route = createFileRoute("/api/define-word")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const timer = createStageTimer();
        const res = await handleDefine(request, timer);
        timer.log("define-word", res.status);
        res.headers.set("Server-Timing", timer.serverTiming());
        return res;
      },
    },
  },
});
