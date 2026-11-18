import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { publicError } from "./public-error";
import type { PodcastQuizResult } from "./podcast-quiz.functions";
import type { StoryGraph } from "./branching";
import {
  clampSegment,
  isStoryCourse,
  type BranchingStory,
  type LoadedStory,
  type Story,
  type StorySummary,
} from "./stories";

const STORY_ART_BUCKET = "story-art";

/** The result of finishing a branching path; the ending and credit are the server's, never the client's. */
export type FinishBranchingResult = {
  endingId: string;
  quality: "good" | "ok" | "lesser";
  endingsFound: string[];
  endingsTotal: number;
  credited: boolean;
};

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
  branching: boolean;
  nodes: unknown;
};
type ProgressRow = {
  story_id: string;
  segment_index: number;
  best_correct: number | null;
  check_total: number | null;
  completed_at: string | null;
  endings_found: unknown;
  reading_credited: boolean | null;
};

const STORY_COLS = "id,course,level_id,slug,title,segments,sort_order,published,branching,nodes";
const PROGRESS_COLS =
  "story_id,segment_index,best_correct,check_total,completed_at,endings_found,reading_credited";

const segmentsOf = (v: unknown): string[] =>
  Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];

const stringsOf = (v: unknown): string[] =>
  Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];

/** Build the public URL for a story-art object key, or null when there is no key (graceful placeholder). */
const artUrlOf = (client: unknown, key: unknown): string | null => {
  if (typeof key !== "string" || key.length === 0) return null;
  const storage = (client as { storage?: { from: (b: string) => { getPublicUrl: (p: string) => { data: { publicUrl: string } } } } }).storage;
  const url = storage?.from(STORY_ART_BUCKET).getPublicUrl(key).data.publicUrl;
  return url ?? null;
};

/**
 * Turn the stored nodes jsonb into a StoryGraph, attaching a resolved art URL (or null) to each node. Returns null
 * when the graph is malformed (a draft error), so the reader shows "not found" rather than a broken tree.
 */
function toGraph(client: unknown, raw: unknown): StoryGraph | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as { start?: unknown; map?: unknown };
  if (typeof r.start !== "string" || !r.map || typeof r.map !== "object") return null;
  const map: StoryGraph["map"] = {};
  for (const [id, node] of Object.entries(r.map as Record<string, unknown>)) {
    if (!node || typeof node !== "object") return null;
    const n = node as Record<string, unknown>;
    map[id] = {
      segments: segmentsOf(n.segments),
      art: typeof n.art === "string" ? n.art : undefined,
      artUrl: artUrlOf(client, n.art),
      choice: n.choice as StoryGraph["map"][string]["choice"],
      next: typeof n.next === "string" ? n.next : undefined,
      ending: n.ending as StoryGraph["map"][string]["ending"],
    };
  }
  if (!map[r.start]) return null;
  return { start: r.start, map };
}

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
        branching: !!r.branching,
        segmentIndex: p?.segment_index ?? 0,
        segmentCount: segmentsOf(r.segments).length,
        bestCorrect: p?.best_correct ?? null,
        checkTotal: p?.check_total ?? null,
        completed: !!p?.completed_at,
      };
    });
  });

/**
 * One published story loaded for the reader: a linear read-along with its check questions, or a branching story with
 * its node graph (resolved art URLs) and the learner's endings. Null when it does not exist or is not published.
 */
export const getStory = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ storyId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }): Promise<LoadedStory | null> => {
    const db = loose(context.supabase);
    const res = await db
      .from("stories")
      .select(STORY_COLS)
      .eq("id", data.storyId)
      .eq("published", true);
    if (res.error) throw publicError(null, res.error);
    const row = ((res.data ?? []) as StoryRow[])[0];
    if (!row || !isStoryCourse(row.course)) return null;

    // A branching story carries its text in the node graph; there is no MC quiz.
    if (row.branching) {
      const graph = toGraph(context.supabase, row.nodes);
      if (!graph) return null;
      const bprog = await db
        .from("story_progress")
        .select(PROGRESS_COLS)
        .eq("user_id", context.userId)
        .eq("story_id", row.id);
      const bp = ((bprog.data ?? []) as ProgressRow[])[0];
      const branchingStory: BranchingStory = {
        id: row.id,
        course: row.course,
        level: row.level_id,
        title: row.title,
        branching: true,
        graph,
        endingsFound: stringsOf(bp?.endings_found),
        readingCredited: !!bp?.reading_credited,
      };
      return branchingStory;
    }

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

/**
 * Finishes a branching path. The server (public.finish_branching_story) re-walks the stored node graph from the
 * learner's choices and decides, from the stored graph alone, which ending was reached and whether the reading skill
 * is credited (once, on the first good ending) — the client's `path` can only pick options, never claim an ending or
 * a credit. Throws the stable code "not-found" (unpublished / not a branching story) or "invalid-path".
 */
export const finishBranchingStory = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        storyId: z.string().uuid(),
        // One option index per choice node on the path; a short, bounded list.
        path: z.array(z.number().int().min(0).max(9)).max(64),
      })
      .parse(d),
  )
  .handler(async ({ data, context }): Promise<FinishBranchingResult> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const rpc = supabaseAdmin.rpc.bind(supabaseAdmin) as unknown as (
      name: string,
      args: Record<string, unknown>,
    ) => Promise<{
      data: {
        status?: string;
        endingId?: string;
        quality?: "good" | "ok" | "lesser";
        endingsFound?: string[];
        endingsTotal?: number;
        credited?: boolean;
      } | null;
      error: { message: string } | null;
    }>;
    const { data: r, error } = await rpc("finish_branching_story", {
      _user_id: context.userId,
      _story_id: data.storyId,
      _path: data.path,
    });
    if (error || !r) throw new Error("Could not save your path; retry");
    if (r.status === "not-found") throw new Error("not-found");
    if (r.status === "invalid") throw new Error("invalid-path");
    if (r.status !== "applied") throw new Error("Could not save your path; retry");
    return {
      endingId: r.endingId ?? "",
      quality: r.quality ?? "lesser",
      endingsFound: r.endingsFound ?? [],
      endingsTotal: r.endingsTotal ?? 0,
      credited: !!r.credited,
    };
  });
