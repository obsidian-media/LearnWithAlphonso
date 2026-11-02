import { createFileRoute } from "@tanstack/react-router";
import { isPaywallSource } from "@/lib/paywall-copy";

/**
 * GET /api/pro-offering?source=<paywall source>: the website's Alphonso Pro price and trial (read from RevenueCat,
 * never typed in) and this learner's checkout link (RevenueCat's hosted Web Purchase Link, on Stripe).
 *
 * One free trial per person: a learner who already had any subscription gets no trial line and, when it is set, the
 * no-trial link. RevenueCat's own product setting ("Didn't have any subscription yet") enforces it at checkout.
 * Anything missing or unreadable is 503 offering-unavailable, and the paywall then shows no price.
 */
async function handle(request: Request): Promise<Response> {
  const accessToken = request.headers.get("Authorization")?.replace(/^Bearer\s+/i, "");
  if (!accessToken) return Response.json({ error: "unauthorized" }, { status: 401 });
  const source = new URL(request.url).searchParams.get("source");
  if (!isPaywallSource(source)) return Response.json({ error: "bad source" }, { status: 400 });

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin.auth.getUser(accessToken);
  if (error || !data?.user) return Response.json({ error: "unauthorized" }, { status: 401 });

  const unavailable = () => Response.json({ error: "offering-unavailable" }, { status: 503 });
  const productId = process.env.REVENUECAT_WEB_PRODUCT_ID;
  const trialLink = process.env.REVENUECAT_WEB_PURCHASE_LINK;
  const plainLink = process.env.REVENUECAT_WEB_PURCHASE_LINK_NO_TRIAL || trialLink;
  if (!productId || !trialLink || !plainLink) return unavailable();

  const { revenueCatConfigFromEnv, getSubscriberSummary } =
    await import("@/lib/revenuecat-entitlement");
  const { getWebOffering, buildPurchaseUrl } = await import("@/lib/web-offering.server");
  const config = revenueCatConfigFromEnv();
  if (!config) return unavailable();
  const [offer, summary] = await Promise.all([
    getWebOffering(config, productId),
    getSubscriberSummary(config, data.user.id),
  ]);
  if (!offer || summary.status === "unavailable") return unavailable();
  // Already Pro (on any store): no checkout, so nobody can pay twice.
  if (summary.status === "active") return Response.json({ error: "already-pro" }, { status: 409 });

  const trialDays = summary.trialEligible ? offer.trialDays : null;
  return Response.json(
    {
      price: offer.price,
      period: offer.period,
      trialDays,
      purchaseUrl: buildPurchaseUrl(trialDays ? trialLink : plainLink, data.user.id, source),
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}

export const Route = createFileRoute("/api/pro-offering")({
  server: {
    handlers: {
      GET: async ({ request }) => handle(request),
    },
  },
});
