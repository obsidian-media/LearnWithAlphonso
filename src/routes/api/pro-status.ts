import { createFileRoute } from "@tanstack/react-router";

/**
 * GET /api/pro-status: whether the signed-in learner has Alphonso Pro, where it came from, whether they can still
 * start a free trial, and (for a web subscription) where to manage it. RevenueCat is the only source of truth.
 *
 * Fails closed: if RevenueCat cannot be read the answer is 503 entitlement-unavailable, which the web shows as
 * "couldn't check, try again", never as a paywall and never as Pro. This is presentation only: /api/hector-respond
 * checks the entitlement itself on every turn.
 */
async function handle(request: Request): Promise<Response> {
  const accessToken = request.headers.get("Authorization")?.replace(/^Bearer\s+/i, "");
  if (!accessToken) return Response.json({ error: "unauthorized" }, { status: 401 });
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin.auth.getUser(accessToken);
  if (error || !data?.user) return Response.json({ error: "unauthorized" }, { status: 401 });

  const { revenueCatConfigFromEnv, getSubscriberSummary } =
    await import("@/lib/revenuecat-entitlement");
  const config = revenueCatConfigFromEnv();
  const summary = config ? await getSubscriberSummary(config, data.user.id) : null;
  if (!summary || summary.status === "unavailable") {
    return Response.json({ error: "entitlement-unavailable" }, { status: 503 });
  }
  return Response.json(
    {
      pro: summary.status === "active",
      store: summary.store,
      trialEligible: summary.trialEligible,
      manageUrl: summary.managementUrl,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}

export const Route = createFileRoute("/api/pro-status")({
  server: {
    handlers: {
      GET: async ({ request }) => handle(request),
    },
  },
});
