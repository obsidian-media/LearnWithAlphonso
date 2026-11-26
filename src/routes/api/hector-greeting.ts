import { noStoreJson } from "@/lib/api-json";
import { createFileRoute } from "@tanstack/react-router";
import { isCourse, type Course } from "@/data/courses";
import { LEARNER_PROFILE_KEY, parseLearnerProfile } from "@/lib/learner-profile";
import { buildHectorGreeting, hectorTopicLabel, pickGreetingVariant } from "@/lib/hector-greeting";
import { openMemoryCategories, type WeaknessEventRow } from "@/lib/profile-overview";

/**
 * POST /api/hector-greeting { course, cefrLevel?, lastVariant? }: the line Hector says when a call opens, for clients
 * that do not build it themselves (the native apps). No AI call and no quota: it is one of our own fixed sentences
 * (src/lib/hector-greeting.ts), chosen from what the SERVER knows about this learner.
 *
 *   topic    the newest mistake topic saved by an earlier call (tutor_memory, Pro only), else the learner's most open
 *            weakness category; null when there is none. Only labels from our own lists are ever spoken.
 *   variant  which wording was chosen, never `lastVariant`: send it back next time and two calls in a row never open
 *            with the same words.
 *
 * Pro only, like Hector itself: 403 not-entitled, 503 entitlement-unavailable. Answer:
 *   { greeting: string, topic: string | null, variant: number, remembered: boolean }
 */
export const Route = createFileRoute("/api/hector-greeting")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const token = request.headers.get("Authorization")?.replace(/^Bearer\s+/i, "");
        if (!token) return noStoreJson({ error: "unauthorized" }, { status: 401 });
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data: userData, error } = await supabaseAdmin.auth.getUser(token);
        if (error || !userData?.user)
          return noStoreJson({ error: "unauthorized" }, { status: 401 });
        const user = userData.user;
        const { checkBan } = await import("@/lib/account-ban.server");
        const banned = await checkBan(user.id);
        if (banned) return noStoreJson({ error: banned.message }, { status: banned.status });

        const { proStateFor } = await import("@/lib/call-recap.server");
        const pro = await proStateFor(user.id);
        if (pro === "unavailable")
          return noStoreJson({ error: "entitlement-unavailable" }, { status: 503 });
        if (pro !== "active") return noStoreJson({ error: "not-entitled" }, { status: 403 });

        let body: { course?: unknown; cefrLevel?: unknown; lastVariant?: unknown } = {};
        try {
          body = await request.json();
        } catch {
          /* no body: English, no level */
        }
        const course: Course =
          typeof body.course === "string" && isCourse(body.course) ? body.course : "en";
        const cefr = typeof body.cefrLevel === "string" ? body.cefrLevel.slice(0, 4) : null;
        const last = Number.isInteger(body.lastVariant) ? (body.lastVariant as number) : null;

        const db = supabaseAdmin as unknown as import("@supabase/supabase-js").SupabaseClient;
        const [memory, events] = await Promise.all([
          db
            .from("tutor_memory")
            .select("memory_key")
            .eq("user_id", user.id)
            .eq("course", course)
            .eq("kind", "mistake")
            .order("last_seen_at", { ascending: false })
            .limit(5),
          db
            .from("weakness_events")
            .select("category,event_type,created_at")
            .eq("user_id", user.id)
            .eq("course", course),
        ]);
        if (memory.error || events.error) {
          console.warn(
            JSON.stringify({
              event: "hector_greeting_read_failed",
              memory: !!memory.error,
              events: !!events.error,
            }),
          );
        }
        const remembered =
          ((memory.data ?? []) as { memory_key: string }[]).find((r) =>
            hectorTopicLabel(course, r.memory_key),
          )?.memory_key ?? null;
        const open = openMemoryCategories((events.data ?? []) as WeaknessEventRow[]).find((c) =>
          hectorTopicLabel(course, c),
        );
        const topic = remembered ?? open ?? null;
        const variant = pickGreetingVariant(last, Math.random());
        return noStoreJson({
          greeting: buildHectorGreeting({
            course,
            cefr,
            name: parseLearnerProfile(user.user_metadata?.[LEARNER_PROFILE_KEY]).name,
            weakSpot: topic,
            variant,
          }),
          topic,
          variant,
          remembered: remembered !== null,
        });
      },
    },
  },
});
