import { createFileRoute } from "@tanstack/react-router";

/**
 * GET /api/subscription-login: the id the signed-in learner's app gives RevenueCat (`Purchases.logIn`). It is the
 * account's separate subscription identifier (never shown anywhere, so an id other learners can see is never the key
 * to someone's subscription), except for an account whose purchases are only under its account id, bought on an app
 * build from before the identifier existed. Without SUBSCRIPTION_ID_SECRET (or RevenueCat) it is the account id, as
 * before.
 *
 * 503 when RevenueCat cannot be read: the app then logs in with the account id, which the server also accepts, so a
 * failure here never hides Pro.
 */
async function handle(request: Request): Promise<Response> {
  const accessToken = request.headers.get("Authorization")?.replace(/^Bearer\s+/i, "");
  if (!accessToken) return Response.json({ error: "unauthorized" }, { status: 401 });
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin.auth.getUser(accessToken);
  if (error || !data?.user) return Response.json({ error: "unauthorized" }, { status: 401 });

  const { revenueCatConfigFromEnv, getAccountSubscriberSummary } =
    await import("@/lib/revenuecat-entitlement");
  const config = revenueCatConfigFromEnv();
  const headers = { "Cache-Control": "no-store" };
  if (!config?.subscriptionIdSecret) {
    return Response.json({ appUserId: data.user.id }, { headers });
  }
  const summary = await getAccountSubscriberSummary(config, data.user.id);
  if (!summary.loginId) {
    return Response.json({ error: "entitlement-unavailable" }, { status: 503, headers });
  }
  return Response.json({ appUserId: summary.loginId }, { headers });
}

export const Route = createFileRoute("/api/subscription-login")({
  server: {
    handlers: {
      GET: async ({ request }) => handle(request),
    },
  },
});
