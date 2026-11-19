import { noStoreJson } from "@/lib/api-json";
import { createFileRoute } from "@tanstack/react-router";
import { LEARNER_PROFILE_KEY, parseLearnerProfile } from "@/lib/learner-profile";
import { isCourse } from "@/data/courses";
import { topicLabel } from "@/lib/call-recap";
import { saveLearnerProfileFor } from "@/lib/learner-profile.server";

/**
 * What Alphonso remembers (Pro). Every read and write is scoped to the user id from the verified token.
 *
 *   GET                       the learner's memory lines and their goals. PRO ONLY, checked here from RevenueCat:
 *                             403 not-entitled for anyone else, 503 when the entitlement cannot be read.
 *   DELETE { id }             removes one line, and with it the matching weakness events and review items.
 *   DELETE { events: true }   removes only the learner's weakness events (topic labels); any signed-in learner.
 *   DELETE { all: true }      forget everything: every line, every weakness event, every weakness review item and
 *                             recap review item (one transaction), then the goals on this page.
 *
 * Deleting is open to every signed-in learner, Pro or not: a lapsed subscriber can always remove what was kept.
 * Lessons, stars, streak, XP and the learner's own saved words are never touched.
 */
type Admin = (typeof import("@/integrations/supabase/client.server"))["supabaseAdmin"];
const json = (body: unknown, status = 200) =>
  noStoreJson(body, { status, headers: { "Cache-Control": "no-store" } });

async function authenticate(request: Request, admin: Admin): Promise<string | Response> {
  const token = request.headers.get("Authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) return json({ error: "unauthorized" }, 401);
  const { data, error } = await admin.auth.getUser(token);
  if (error || !data?.user) return json({ error: "unauthorized" }, 401);
  return data.user.id;
}

type MemoryRow = {
  id: string;
  course: string;
  kind: "mistake" | "phrase";
  memory_key: string;
  text: string;
  detail: string | null;
  seen_count: number;
  last_seen_at: string;
};

export const Route = createFileRoute("/api/tutor-memory")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const { supabaseAdmin: admin } = await import("@/integrations/supabase/client.server");
        const auth = await authenticate(request, admin);
        if (typeof auth !== "string") return auth;
        const { proStateFor } = await import("@/lib/call-recap.server");
        const pro = await proStateFor(auth);
        if (pro === "unavailable") return json({ error: "entitlement-unavailable" }, 503);
        if (pro !== "active") return json({ error: "not-entitled" }, 403);

        const [rows, user] = await Promise.all([
          (admin as unknown as import("@supabase/supabase-js").SupabaseClient)
            .from("tutor_memory")
            .select("id,course,kind,memory_key,text,detail,seen_count,last_seen_at")
            .eq("user_id", auth)
            .order("last_seen_at", { ascending: false })
            .limit(200),
          admin.auth.admin.getUserById(auth),
        ]);
        if (rows.error || user.error)
          return json({ error: "Could not load this. Try again." }, 500);
        const meta = (user.data.user.user_metadata ?? {}) as Record<string, unknown>;
        const profile = parseLearnerProfile(meta[LEARNER_PROFILE_KEY]);
        const lines = (rows.data ?? []) as MemoryRow[];
        return json({
          mistakes: lines
            .filter((r) => r.kind === "mistake" && isCourse(r.course))
            .map((r) => ({
              id: r.id,
              course: r.course,
              topic: r.memory_key,
              label: topicLabel(r.course as "en", r.memory_key) ?? r.memory_key,
              example: r.text,
              seenCount: r.seen_count,
              lastSeenAt: new Date(r.last_seen_at).toISOString(),
            })),
          phrases: lines
            .filter((r) => r.kind === "phrase")
            .map((r) => ({ id: r.id, course: r.course, text: r.text, meaning: r.detail ?? "" })),
          goals: {
            goal: profile.goal ?? null,
            dailyMinutes: profile.dailyMinutes ?? null,
            interests: profile.interests ?? [],
          },
        });
      },

      DELETE: async ({ request }) => {
        const { supabaseAdmin: admin } = await import("@/integrations/supabase/client.server");
        const auth = await authenticate(request, admin);
        if (typeof auth !== "string") return auth;
        let body: { id?: unknown; all?: unknown; events?: unknown };
        try {
          body = await request.json();
        } catch {
          return json({ error: "Invalid JSON" }, 400);
        }
        const rpc = admin as unknown as import("@supabase/supabase-js").SupabaseClient;
        // Topic notes only: the weakness events every learner gets after a recap (a label, no text). Open to free
        // learners, who have no memory page. Memory lines, review items, goals and everything else stay.
        if (body.events === true) {
          const { error } = await (
            admin as unknown as import("@supabase/supabase-js").SupabaseClient
          )
            .from("weakness_events")
            .delete()
            .eq("user_id", auth);
          if (error) return json({ error: "Could not delete these. Try again." }, 500);
          return json({ removed: "events" });
        }
        if (body.all === true) {
          const { data, error } = await rpc.rpc("forget_tutor_memory", { _user_id: auth });
          if (error) return json({ error: "Could not forget everything. Try again." }, 500);
          try {
            await saveLearnerProfileFor(
              admin,
              auth,
              { patch: { clear: ["goal", "dailyMinutes", "interests"] } },
              () => Promise.resolve({ error: null }),
            );
          } catch {
            return json(
              { error: "Most of it was forgotten, but your goals were not. Try again." },
              500,
            );
          }
          return json({ forgotten: data });
        }
        if (typeof body.id !== "string" || !/^[0-9a-f-]{36}$/i.test(body.id)) {
          return json({ error: "invalid-id" }, 400);
        }
        const { data, error } = await rpc.rpc("delete_tutor_memory_line", {
          _user_id: auth,
          _id: body.id,
        });
        if (error) return json({ error: "Could not remove that. Try again." }, 500);
        return json({ removed: data });
      },
    },
  },
});
