import { createFileRoute } from "@tanstack/react-router";
import { isPaywallSource } from "@/lib/paywall-copy";
import type { WebOffering } from "@/lib/web-offering.server";

/**
 * GET /api/pro-offering?source=<paywall source>: the website's Alphonso Pro price and trial (read from RevenueCat,
 * never typed in) and this learner's checkout link (RevenueCat's hosted Web Purchase Link, on Stripe).
 *
 * One free trial per person: a learner who already had any subscription gets no trial line and the no-trial link (a
 * purchase link whose product has no trial). RevenueCat's product setting ("Didn't have any subscription yet") is a
 * second guard at checkout, not the only one.
 * The answer is { plans }: yearly first when it is set up (REVENUECAT_WEB_YEARLY_*), then monthly.
 * Settings missing on this deployment are 503 offering-unavailable with reason "not-configured" (the paywall says Pro
 * is coming); anything unreadable is a plain 503 offering-unavailable (the paywall offers a retry). Neither shows a
 * price.
 */
function httpsLinkOrNull(value: string | undefined): string | null {
  if (!value) return null;
  try {
    return new URL(value).protocol === "https:" ? value : null;
  } catch {
    return null;
  }
}

type PlanEnv = { productId: string; trialLink: string; plainLink: string };

/** A plan's product id and its two links, or null when any is missing or not https. */
function planEnv(prefix: "REVENUECAT_WEB" | "REVENUECAT_WEB_YEARLY"): PlanEnv | null {
  const productId = process.env[`${prefix}_PRODUCT_ID`];
  const trialLink = httpsLinkOrNull(process.env[`${prefix}_PURCHASE_LINK`]);
  const plainLink = httpsLinkOrNull(process.env[`${prefix}_PURCHASE_LINK_NO_TRIAL`]);
  return productId && trialLink && plainLink ? { productId, trialLink, plainLink } : null;
}

async function handle(request: Request): Promise<Response> {
  const accessToken = request.headers.get("Authorization")?.replace(/^Bearer\s+/i, "");
  if (!accessToken) return Response.json({ error: "unauthorized" }, { status: 401 });
  const source = new URL(request.url).searchParams.get("source");
  if (!isPaywallSource(source)) return Response.json({ error: "bad source" }, { status: 400 });

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin.auth.getUser(accessToken);
  if (error || !data?.user) return Response.json({ error: "unauthorized" }, { status: 401 });

  const unavailable = () => Response.json({ error: "offering-unavailable" }, { status: 503 });
  // Not set up on this deployment (no products or links yet): the paywall says Pro is coming, not "try again".
  const notConfigured = () =>
    Response.json({ error: "offering-unavailable", reason: "not-configured" }, { status: 503 });
  // The monthly plan is required. Both its links must be absolute https URLs; the no-trial link is what keeps it to
  // one free trial per person, so there is no falling back to the trial link. The yearly plan is optional and is
  // left out (never an error) when any of its three settings is missing or unreadable.
  const monthly = planEnv("REVENUECAT_WEB");
  const yearly = planEnv("REVENUECAT_WEB_YEARLY");
  if (!monthly) return notConfigured();

  const { revenueCatConfigFromEnv, getAccountSubscriberSummary } =
    await import("@/lib/revenuecat-entitlement");
  const { getWebOffering, buildPurchaseUrl } = await import("@/lib/web-offering.server");
  const config = revenueCatConfigFromEnv();
  if (!config) return notConfigured();
  const [monthOffer, yearOffer, summary] = await Promise.all([
    getWebOffering(config, monthly.productId),
    yearly ? getWebOffering(config, yearly.productId) : Promise.resolve(null),
    getAccountSubscriberSummary(config, data.user.id),
  ]);
  // A monthly setting that names a yearly product would sell two yearly plans: refuse it rather than guess.
  if (!monthOffer || monthOffer.period !== "month") return unavailable();
  if (summary.status === "unavailable" || !summary.loginId) return unavailable();
  // Already Pro (on any store): no checkout, so nobody can pay twice.
  if (summary.status === "active") return Response.json({ error: "already-pro" }, { status: 409 });
  const loginId = summary.loginId;

  // RevenueCat's price is for one country; checkout bills everyone else in their own currency, so elsewhere the
  // paywall shows no number rather than a wrong one. Vercel sets the country header; without it (local runs) the
  // price shows.
  const viewerCountry = request.headers.get("x-vercel-ip-country")?.trim().toUpperCase() || null;
  const plan = (offer: WebOffering, env: PlanEnv) => {
    const priceHere =
      offer.priceCountry !== null &&
      (viewerCountry === null || viewerCountry === offer.priceCountry);
    const trialDays = summary.trialEligible ? offer.trialDays : null;
    return {
      price: priceHere ? offer.price : null,
      amountMicros: priceHere ? offer.amountMicros : null,
      currency: priceHere ? offer.currency : null,
      period: offer.period,
      trialDays,
      // The purchase lands on the account's subscription identifier, never on its visible account id.
      purchaseUrl: buildPurchaseUrl(trialDays ? env.trialLink : env.plainLink, loginId, source),
    };
  };
  const plans = [
    ...(yearly && yearOffer && yearOffer.period === "year" ? [plan(yearOffer, yearly)] : []),
    plan(monthOffer, monthly),
  ];
  return Response.json({ plans }, { headers: { "Cache-Control": "no-store" } });
}

export const Route = createFileRoute("/api/pro-offering")({
  server: {
    handlers: {
      GET: async ({ request }) => handle(request),
    },
  },
});
