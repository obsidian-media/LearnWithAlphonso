import type { RevenueCatConfig } from "./revenuecat-entitlement";
import type { BillingPeriod, PaywallSource } from "./paywall-copy";

/**
 * The website's Alphonso Pro offer, read from RevenueCat so no price is ever typed into the app.
 *
 * RevenueCat's v1 offerings carry no prices; v2 products do, with `expand=items.indicative_price`
 * ({ currency, amount_micros }) and ISO-8601 durations. That needs the v2 secret key. The exact response shape is
 * from RevenueCat's v2 docs; confirm it against the sandbox product (web Hector plan, Task 0).
 */
const API = "https://api.revenuecat.com/v2";
const CACHE_MS = 10 * 60 * 1000;

export type WebOffering = { price: string; period: BillingPeriod; trialDays: number | null };

type Duration = { unit: "day" | "week" | "month" | "year"; value: number };

export function parseIsoDuration(raw: unknown): Duration | null {
  if (typeof raw !== "string") return null;
  const m = /^P(\d+)([DWMY])$/.exec(raw);
  if (!m) return null;
  const unit = ({ D: "day", W: "week", M: "month", Y: "year" } as const)[
    m[2] as "D" | "W" | "M" | "Y"
  ];
  return { unit, value: Number(m[1]) };
}

function periodOf(d: Duration | null): BillingPeriod | null {
  if (!d) return null;
  if ((d.unit === "month" && d.value === 12) || (d.unit === "year" && d.value === 1)) return "year";
  if (d.unit === "month" && d.value === 1) return "month";
  return null;
}

function daysOf(d: Duration | null): number | null {
  if (!d) return null;
  if (d.unit === "day") return d.value;
  if (d.unit === "week") return d.value * 7;
  return null; // a month-long trial has no exact day count; show none rather than a wrong one
}

let cache: { key: string; at: number; value: WebOffering } | null = null;

/** Tests only. */
export function clearWebOfferingCache(): void {
  cache = null;
}

/** The offer for `productId` (a RevenueCat product id), or null when it cannot be read: then no price is shown. */
export async function getWebOffering(
  config: RevenueCatConfig,
  productId: string,
  fetchImpl: typeof fetch = fetch,
): Promise<WebOffering | null> {
  if (!config.v2SecretKey || !config.projectId) return null;
  const key = `${config.projectId}/${productId}`;
  if (cache && cache.key === key && Date.now() - cache.at < CACHE_MS) return cache.value;
  try {
    const res = await fetchImpl(
      `${API}/projects/${encodeURIComponent(config.projectId)}/products?expand=items.indicative_price`,
      {
        headers: { Authorization: `Bearer ${config.v2SecretKey}` },
        signal: AbortSignal.timeout(5000),
      },
    );
    if (!res.ok) return null;
    const body = (await res.json()) as {
      items?: {
        id?: string;
        subscription?: { duration?: string; trial_duration?: string | null };
        indicative_price?: unknown;
      }[];
    };
    const product = body?.items?.find((p) => p?.id === productId);
    if (!product) return null;
    const priceRaw = Array.isArray(product.indicative_price)
      ? product.indicative_price[0]
      : product.indicative_price;
    const { currency, amount_micros } = (priceRaw ?? {}) as {
      currency?: string;
      amount_micros?: number;
    };
    if (typeof currency !== "string" || typeof amount_micros !== "number") return null;
    const period = periodOf(parseIsoDuration(product.subscription?.duration));
    if (!period) return null;
    const value: WebOffering = {
      price: new Intl.NumberFormat("en", { style: "currency", currency }).format(
        amount_micros / 1_000_000,
      ),
      period,
      trialDays: daysOf(parseIsoDuration(product.subscription?.trial_duration)),
    };
    cache = { key, at: Date.now(), value };
    return value;
  } catch {
    return null;
  }
}

/**
 * A RevenueCat Web Purchase Link for this learner: the url-encoded app user id is appended as a path segment (so
 * the purchase lands on this account), and the paywall source rides as purchase metadata.
 */
export function buildPurchaseUrl(link: string, appUserId: string, source: PaywallSource): string {
  const base = link.replace(/\/+$/, "");
  const url = new URL(`${base}/${encodeURIComponent(appUserId)}`);
  url.searchParams.set("metadata[paywall_source]", source);
  return url.toString();
}
