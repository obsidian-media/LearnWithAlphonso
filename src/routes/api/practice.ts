import { createFileRoute } from "@tanstack/react-router";
import type { SupabaseClient } from "@supabase/supabase-js";
import { isCourse } from "@/data/courses";
import { finishMinReplies, isCallId, starsForRow, type CallRow } from "@/lib/practice-calls.server";
import type { PracticeHubData } from "@/lib/practice-hub";

/**
 * Practice stars (BACKLOG 0.0-bj; migration 20261107032021_practice_stars.sql). For web now and iOS/Android later.
 *
 *   GET  ?course=es        the hub's rows: best stars per item, the learner's CEFR level, their weakness events
 *   POST { callId }        finishes a call: stars from the server's own tally of it, best kept (SQL greatest)
 *
 * Every read and write is scoped to the user id from the verified token, never from the request. The stars are
 * computed here from the practice_calls row /api/chat wrote as each reply was judged; the request names the call
 * and nothing else. Finishing an already finished call answers its stored result, so a retried request is safe.
 */
type Admin = (typeof import("@/integrations/supabase/client.server"))["supabaseAdmin"];

/**
 * practice_stars and practice_calls are not in types.ts until the migration is deployed and the types workflow runs
 * (types.ts is only ever regenerated from the live schema, never hand-edited). Until then these two tables are read
 * through an untyped view of the same client. Follow-up: drop this once types.ts has them.
 */
const practiceTables = (admin: Admin) => admin as unknown as SupabaseClient;

const json = (body: unknown, status = 200) => Response.json(body, { status });
const iso = (t: string) => new Date(t).toISOString();

async function authenticate(request: Request, admin: Admin): Promise<string | Response> {
  const token = request.headers.get("Authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) return json({ error: "unauthorized" }, 401);
  const { data, error } = await admin.auth.getUser(token);
  if (error || !data?.user) return json({ error: "unauthorized" }, 401);
  return data.user.id;
}

type StoredStar = { kind: string; item_key: string; best_stars: number; last_played_at: string };

async function hub(admin: Admin, userId: string, course: string): Promise<Response> {
  const [stars, level, weak] = await Promise.all([
    practiceTables(admin)
      .from("practice_stars")
      .select("kind,item_key,best_stars,last_played_at")
      .eq("user_id", userId)
      .eq("course", course),
    admin
      .from("language_progress")
      .select("cefr_level")
      .eq("user_id", userId)
      .eq("language", course)
      .maybeSingle(),
    admin
      .from("weakness_events")
      .select("category,event_type,created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: true }),
  ]);
  // "No error" is not "no data": a failed read must not show a learner zero stars.
  if (stars.error || level.error || weak.error)
    return json({ error: "Could not load Practice." }, 500);
  const body: PracticeHubData = {
    stars: ((stars.data ?? []) as StoredStar[]).map((r) => ({
      kind: r.kind as "scenario" | "scene",
      itemKey: r.item_key,
      bestStars: r.best_stars,
      lastPlayedAt: iso(r.last_played_at),
    })),
    cefrLevel: level.data?.cefr_level ?? null,
    weaknessEvents: (weak.data ?? []).map((r) => ({
      category: r.category,
      eventType: r.event_type as "detected" | "resolved",
      createdAt: iso(r.created_at),
    })),
  };
  return json(body);
}

/** The result's shape is shared with the browser (src/lib/practice-api.ts). */
export type { PracticeResult } from "@/lib/practice-api";
import type { PracticeResult } from "@/lib/practice-api";

async function readCall(admin: Admin, userId: string, callId: string) {
  return practiceTables(admin)
    .from("practice_calls")
    .select("*")
    .eq("id", callId)
    .eq("user_id", userId)
    .maybeSingle();
}

async function bestOf(admin: Admin, userId: string, row: CallRow): Promise<number> {
  const { data } = await practiceTables(admin)
    .from("practice_stars")
    .select("best_stars")
    .eq("user_id", userId)
    .eq("course", row.course)
    .eq("kind", row.kind)
    .eq("item_key", row.item_key)
    .maybeSingle();
  return data?.best_stars ?? 0;
}

function result(
  row: CallRow,
  stars: number,
  bestBefore: number,
  bestAfter: number,
): PracticeResult {
  return {
    kind: row.kind,
    itemKey: row.item_key,
    stars,
    bestBefore,
    bestAfter,
    replies: row.replies,
    rightReplies: row.right_replies,
    shortReplies: row.short_replies,
    englishReplies: row.english_replies,
    finishMinReplies: finishMinReplies(row.kind, row.item_key) ?? 0,
  };
}

async function finish(admin: Admin, userId: string, callId: unknown): Promise<Response> {
  if (!isCallId(callId)) return json({ error: "invalid-call" }, 400);
  // A reply can land between reading the tally and finishing; the function refuses a stale tally, so read again.
  for (let attempt = 0; attempt < 2; attempt++) {
    const read = await readCall(admin, userId, callId);
    if (read.error) return json({ error: "Could not finish the call." }, 500);
    // No row: no reply was ever judged in this call (or it is someone else's). Nothing to score.
    if (!read.data) return json({ error: "no-call" }, 404);
    const row = read.data as unknown as CallRow & { stars: number | null };
    if (row.finished_at) {
      const best = await bestOf(admin, userId, row);
      return json(result(row, row.stars ?? 0, best, best));
    }
    const stars = starsForRow(row);
    const { data, error } = await practiceTables(admin).rpc("finish_practice_call", {
      _user_id: userId,
      _call_id: callId,
      _replies: row.replies,
      _stars: stars,
    });
    if (error) continue;
    const out = (Array.isArray(data) ? data[0] : data) as
      { call_stars: number; best_before: number; best_after: number } | undefined;
    if (!out) continue;
    return json(result(row, out.call_stars, out.best_before, out.best_after));
  }
  return json({ error: "Could not finish the call." }, 409);
}

export const Route = createFileRoute("/api/practice")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const { supabaseAdmin: admin } = await import("@/integrations/supabase/client.server");
        const auth = await authenticate(request, admin);
        if (typeof auth !== "string") return auth;
        const course = new URL(request.url).searchParams.get("course") ?? "";
        if (!isCourse(course)) return json({ error: "invalid-course" }, 400);
        return hub(admin, auth, course);
      },
      POST: async ({ request }) => {
        const { supabaseAdmin: admin } = await import("@/integrations/supabase/client.server");
        const auth = await authenticate(request, admin);
        if (typeof auth !== "string") return auth;
        let body: { callId?: unknown };
        try {
          body = await request.json();
        } catch {
          return json({ error: "Invalid JSON" }, 400);
        }
        return finish(admin, auth, body?.callId);
      },
    },
  },
});
