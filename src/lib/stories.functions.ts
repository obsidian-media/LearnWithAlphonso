import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { publicError } from "./public-error";
import type { PodcastQuizResult } from "./podcast-quiz.functions";
import { clampSegment, isStoryCourse, type Story, type StorySummary } from "./stories";

// Not in the generated types until they are regenerated against a database that has the migration.
type Rows = { data: unknown[] | null; error: { message: string } | null };
type LooseQuery = PromiseLike<Rows> & {
  select: (cols: string) => LooseQuery;
  eq: (col: string, val: unknown) => LooseQuery;
  in: (col: string, vals: string[]) => LooseQuery;
  order: (col: string) => LooseQuery;
};
type Loose = { from: (t: string) => LooseQuery };
const loose = (client: unknown) => client as unknown as Loose;

type StoryRow = {
  id: string;
  course: string;
  level_id: string;
  slug: string;
  title: string;
  segments: unknown;
  sort_order: number;
  published: boolean;
};
type ProgressRow = {
  story_id: string;
  segment_index: number;
  best_correct: number | null;
  check_total: number | null;
  completed_at: string | null;
};

const STORY_COLS = "id,course,level_id,slug,title,segments,sort_order,published";
const PROGRESS_COLS = "story_id,segment_index,best_correct,check_total,completed_at";

const segmentsOf = (v: unknown): string[] =>
  Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];

/**
 * The stories the signed-in learner may see in one course, with their own progress. Read with the learner's client, so
 * the database's rules decide: an unpublished story returns nothing. `.eq("published", true)` states the same intent.
 */
export const listStories = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ course: z.string() }).parse(d))
  .handler(async ({ data, context }): Promise<StorySummary[]> => {
    if (!isStoryCourse(data.course)) return [];
    const db = loose(context.supabase);
    const res = await db
      .from("stories")
      .select(STORY_COLS)
      .eq("course", data.course)
      .eq("published", true)
      .order("sort_order");
    if (res.error) throw publicError(null, res.error);
    const rows = (res.data ?? []) as StoryRow[];
    if (rows.length === 0) return [];
    const prog = await db
      .from("story_progress")
      .select(PROGRESS_COLS)
      .eq("user_id", context.userId)
      .in(
        "story_id",
        rows.map((r) => r.id),
      );
    const byStory = new Map(((prog.data ?? []) as ProgressRow[]).map((p) => [p.story_id, p]));
    return rows.map((r) => {
      const p = byStory.get(r.id);
      return {
        id: r.id,
        course: r.course as StorySummary["course"],
        level: r.level_id,
        slug: r.slug,
        title: r.title,
        sortOrder: r.sort_order,
        published: r.published,
        segmentIndex: p?.segment_index ?? 0,
        segmentCount: segmentsOf(r.segments).length,
        bestCorrect: p?.best_correct ?? null,
        checkTotal: p?.check_total ?? null,
        completed: !!p?.completed_at,
      };
    });
  });

/** One published story with its check questions; null when it does not exist or is not published. */
export const getStory = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ storyId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }): Promise<Story | null> => {
    const db = loose(context.supabase);
    const res = await db
      .from("stories")
      .select(STORY_COLS)
      .eq("id", data.storyId)
      .eq("published", true);
    if (res.error) throw publicError(null, res.error);
    const row = ((res.data ?? []) as StoryRow[])[0];
    if (!row || !isStoryCourse(row.course)) return null;
    const qs = await db
      .from("story_quiz_questions")
      .select("position,prompt,choices,answer_index")
      .eq("story_id", row.id)
      .order("position");
    if (qs.error) throw publicError(null, qs.error);
    const prog = await db
      .from("story_progress")
      .select(PROGRESS_COLS)
      .eq("user_id", context.userId)
      .eq("story_id", row.id);
    const segments = segmentsOf(row.segments);
    const p = ((prog.data ?? []) as ProgressRow[])[0];
    const questions = (
      (qs.data ?? []) as {
        position: number;
        prompt: string;
        choices: string[];
        answer_index: number;
      }[]
    ).map((q) => ({
      id: `q${q.position}`,
      prompt: q.prompt,
      choices: q.choices,
      answerIndex: q.answer_index,
    }));
    return {
      id: row.id,
      course: row.course,
      level: row.level_id,
      title: row.title,
      segments,
      questions,
      segmentIndex: clampSegment(p?.segment_index ?? 0, segments.length),
    };
  });

/** Saves where the learner has read up to. Garnish: the reader never blocks on it. */
export const saveStoryProgress = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({ storyId: z.string().uuid(), segmentIndex: z.number().int().min(0).max(59) })
      .parse(d),
  )
  .handler(async ({ data, context }): Promise<void> => {
    const rpc = context.supabase.rpc.bind(context.supabase) as unknown as (
      name: string,
      args: Record<string, unknown>,
    ) => Promise<{ error: { message: string } | null }>;
    const { error } = await rpc("save_story_progress", {
      p_story_id: data.storyId,
      p_segment_index: data.segmentIndex,
    });
    if (error) throw publicError(null, error);
  });

/**
 * Submits the answers to a story's check. The database grades from the stored key and credits the reading skill once,
 * for the learner's first attempt (public.submit_story_check). Throws the stable codes "not-found" and
 * "invalid-answers", like the podcast quiz.
 */
export const completeStoryCheck = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        storyId: z.string().uuid(),
        answers: z
          .array(
            z.object({
              questionId: z.string().regex(/^q[0-9]{1,2}$/),
              choiceIndex: z.number().int().min(0).max(3),
            }),
          )
          .min(1)
          .max(10),
      })
      .parse(d),
  )
  .handler(async ({ data, context }): Promise<PodcastQuizResult> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const rpc = supabaseAdmin.rpc.bind(supabaseAdmin) as unknown as (
      name: string,
      args: Record<string, unknown>,
    ) => Promise<{
      data: {
        status?: string;
        correct?: number;
        total?: number;
        bestCorrect?: number;
        missedQuestionIds?: string[];
      } | null;
      error: { message: string } | null;
    }>;
    const { data: r, error } = await rpc("submit_story_check", {
      _user_id: context.userId,
      _story_id: data.storyId,
      _answers: data.answers,
    });
    if (error || !r) throw new Error("Could not save the check; retry");
    if (r.status === "not-found") throw new Error("not-found");
    if (r.status === "invalid") throw new Error("invalid-answers");
    if (r.status !== "applied") throw new Error("Could not save the check; retry");
    // Same shape as a podcast quiz result so the shared quiz reducer is reused; a story check pays no XP.
    return {
      status: "applied",
      correct: r.correct ?? 0,
      total: r.total ?? 0,
      xpGain: 0,
      streak: 0,
      bestCorrect: r.bestCorrect ?? 0,
      bestXp: 0,
      missedQuestionIds: r.missedQuestionIds ?? [],
    };
  });
