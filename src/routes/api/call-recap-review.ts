import { noStoreJson } from "@/lib/api-json";
import { createFileRoute } from "@tanstack/react-router";
import { isCallId } from "@/lib/practice-calls.server";

/**
 * POST /api/call-recap-review { callId, reviewToken }: "Review these". Adds the recap's items to the learner's review
 * queue, built from the signed recap this server wrote (call-recap.server.ts), so there is no second AI call and a
 * client cannot add text of its own. Keys are per call and item, so a second tap adds nothing. The phrase is also
 * kept in What Alphonso remembers (for every learner).
 */
const json = (body: unknown, status = 200) => noStoreJson(body, { status });

export const Route = createFileRoute("/api/call-recap-review")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const token = request.headers.get("Authorization")?.replace(/^Bearer\s+/i, "");
        if (!token) return json({ error: "unauthorized" }, 401);
        const { data: auth, error: authError } = await supabaseAdmin.auth.getUser(token);
        if (authError || !auth?.user) return json({ error: "unauthorized" }, 401);
        const userId = auth.user.id;
        let body: { callId?: unknown; reviewToken?: unknown };
        try {
          body = await request.json();
        } catch {
          return json({ error: "Invalid JSON" }, 400);
        }
        if (!isCallId(body.callId)) return json({ error: "invalid-call" }, 400);
        const { verifyRecapToken, addRecapToReview } = await import("@/lib/call-recap.server");
        const claim = verifyRecapToken(body.reviewToken, userId, body.callId);
        if (!claim) return json({ error: "invalid-token" }, 400);
        const { currentCefrLevel } = await import("@/lib/learner-level.server");
        const remember = Boolean(claim.recap.phrase);
        const out = await addRecapToReview(
          supabaseAdmin as unknown as Parameters<typeof addRecapToReview>[0],
          {
            userId,
            callId: body.callId,
            course: claim.course,
            recap: claim.recap,
            remember,
            level: await currentCefrLevel(
              supabaseAdmin as unknown as Parameters<typeof currentCefrLevel>[0],
              userId,
              claim.course,
            ),
          },
        );
        if ("error" in out) return json({ error: "Could not add these. Try again." }, 500);
        return json({ added: out.added });
      },
    },
  },
});
