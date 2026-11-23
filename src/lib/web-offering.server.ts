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

/**
 * `price` is RevenueCat's indicative price, which is for one country (`priceCountry`, e.g. "US"). Checkout charges a
 * learner elsewhere in their own currency (CA$12.99 in Canada), so the route only shows `price` in that country.
 */
export type WebOffering = {
  price: string;
  priceCountry: string | null;
  /** The same price as a number, so the paywall can work out a per-month line and the yearly saving. */
  amountMicros: number;
  currency: string;
  period: BillingPeriod;
  trialDays: number | null;
};

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

/** One entry per product, so the yearly and monthly plans do not evict each other. */
const cache = new Map<string, { at: number; value: WebOffering }>();

/** Tests only. */
export function clearWebOfferingCache(): void {
  cache.clear();
}

type V2Product = {
  id?: string;
  store_identifier?: string;
  subscription?: { duration?: string; trial_duration?: string | null };
  indicative_price?: unknown;
};

/** RevenueCat's v2 project ids are "proj" + the id in the dashboard URL; accept either spelling. */
export function normalizeProjectId(raw: string): string {
  const id = raw.trim();
  return /^proj/i.test(id) ? id : `proj${id}`;
}

function warn(reason: string, extra: Record<string, string | number> = {}): void {
  // Never the key, the project id or a user id: a reason code and, at most, the product reference being looked up.
  console.warn(`[web-offering] ${reason} ${JSON.stringify(extra)}`);
}

/** Every product of the project, following RevenueCat's pages (at most 5 of 100). Null with the reason logged. */
async function listProducts(
  config: RevenueCatConfig,
  fetchImpl: typeof fetch,
): Promise<V2Product[] | null> {
  const project = encodeURIComponent(normalizeProjectId(config.projectId!));
  let url: string | null =
    `${API}/projects/${project}/products?expand=items.indicative_price&limit=100`;
  const all: V2Product[] = [];
  for (let page = 0; url && page < 5; page += 1) {
    const res: Response = await fetchImpl(url, {
      headers: { Authorization: `Bearer ${config.v2SecretKey}` },
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) {
      warn("v2-http-error", { status: res.status });
      return null;
    }
    const body = (await res.json()) as { items?: V2Product[]; next_page?: string | null };
    all.push(...(body?.items ?? []));
    const next: unknown = body?.next_page;
    // next_page is a path on the same API (e.g. "/v2/projects/.../products?starting_after=..."): never another host.
    url =
      typeof next === "string" && next.startsWith("/v2/")
        ? `https://api.revenuecat.com${next}`
        : null;
  }
  return all;
}

/**
 * The offer for a product, or null when it cannot be read (then no price is shown). `productRef` is a RevenueCat
 * product id ("prod...") or the store identifier ("alphonso_pro_monthly_web"): whichever the env holds. Every null is
 * logged with the step that failed.
 */
export async function getWebOffering(
  config: RevenueCatConfig,
  productRef: string,
  fetchImpl: typeof fetch = fetch,
): Promise<WebOffering | null> {
  if (!config.v2SecretKey || !config.projectId) {
    warn("missing-v2-settings");
    return null;
  }
  const ref = productRef.trim();
  const key = `${normalizeProjectId(config.projectId)}/${ref}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.value;
  try {
    const items = await listProducts(config, fetchImpl);
    if (!items) return null;
    const product =
      items.find((p) => p?.id === ref) ?? items.find((p) => p?.store_identifier === ref);
    if (!product) {
      warn("product-not-found", { ref, productsSeen: items.length });
      return null;
    }
    const priceRaw = Array.isArray(product.indicative_price)
      ? product.indicative_price[0]
      : product.indicative_price;
    const { currency, amount_micros, country } = (priceRaw ?? {}) as {
      currency?: string;
      amount_micros?: number;
      country?: unknown;
    };
    if (typeof currency !== "string" || typeof amount_micros !== "number") {
      warn("missing-price", { ref });
      return null;
    }
    const period = periodOf(parseIsoDuration(product.subscription?.duration));
    if (!period) {
      warn("unknown-period", { ref, duration: String(product.subscription?.duration) });
      return null;
    }
    const value: WebOffering = {
      price: new Intl.NumberFormat("en", { style: "currency", currency }).format(
        amount_micros / 1_000_000,
      ),
      priceCountry: typeof country === "string" && country ? country.toUpperCase() : null,
      amountMicros: amount_micros,
      currency,
      period,
      trialDays: daysOf(parseIsoDuration(product.subscription?.trial_duration)),
    };
    cache.set(key, { at: Date.now(), value });
    return value;
  } catch (e) {
    warn("v2-request-failed", { error: e instanceof Error ? e.name : "unknown" });
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
