import { createFileRoute } from "@tanstack/react-router";
import { noStoreJson } from "@/lib/api-json";
import { isCourse } from "@/data/course-meta";
import { presetSummaries } from "@/lib/rehearsal-presets";
import { rehearsalsEnabled, rehearsalsEnabledFor } from "@/lib/rehearsals-flag";
import { timedRoute } from "@/lib/stage-timer.server";

/**
 * GET /api/rehearsal-presets?course=en|fr|es -> { presets: PresetSummary[] }: the eight quick-start rehearsals the
 * picker offers, in picker order (rehearsal-presets.ts). The server owns all of the content; the apps hard-code none of
 * it. A signed-in learner only. While rehearsals are off (globally or for this account) the answer is the same
 * 404 not_enabled as /api/rehearsal's. A preset is created through POST /api/rehearsal { action: "create", course, preset }.
 */
export const Route = createFileRoute("/api/rehearsal-presets")({
  server: {
    handlers: {
      GET: ({ request }) =>
        timedRoute("rehearsal-presets", async (timer) => {
          const course = new URL(request.url).searchParams.get("course");
          if (!course || !isCourse(course))
            return noStoreJson({ error: "invalid_course" }, { status: 400 });
          if (!rehearsalsEnabled()) return noStoreJson({ error: "not_enabled" }, { status: 404 });
          const { verifyAuth } = await import("@/lib/ai-quota.server");
          const auth = await timer.time("auth", () => verifyAuth(request));
          if (!auth.ok) return noStoreJson({ error: auth.message }, { status: auth.status });
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          if (!(await rehearsalsEnabledFor(supabaseAdmin, auth.userId)))
            return noStoreJson({ error: "not_enabled" }, { status: 404 });
          return noStoreJson({ presets: presetSummaries(course) });
        }),
    },
  },
});
