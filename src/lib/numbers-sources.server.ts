import { createSign, createPrivateKey } from "node:crypto";
import { gunzipSync } from "node:zlib";
import {
  GROUP_DEFS,
  NotConnectedError,
  ownTiles,
  type GroupKey,
  type OwnAggregates,
  type OwnFn,
  type SourceContext,
  type SourceFn,
  type Sources,
  type Tile,
  type WindowDays,
} from "./numbers-core";
import {
  aiCostTilesFromPayload,
  cappedTile,
  parseCapCounts,
  parseCostPayload,
  type CapCounts,
} from "./ai-cost-numbers";
import { monthlyCapConfig } from "./ai-monthly-cap";
import { costConfig } from "./ai-cost-config";
import { MICRO } from "./ai-cost";

/**
 * The real data behind the numbers dashboard. SERVER ONLY: every key is read from process.env here and never leaves
 * the server. A missing key means NotConnectedError (shown as "Not connected", never a 0); a provider that answers
 * with an error throws (the group shows "Could not load"; the others still render).
 *
 * Provider references (endpoints, auth and fields checked against the official docs on 2026-11-15):
 *  Sentry        https://docs.sentry.io/api/releases/retrieve-release-health-session-statistics/
 *                https://docs.sentry.io/api/events/list-an-organizations-issues/
 *                Bearer token with org:read (sessions) and event:read (issues).
 *  RevenueCat    https://www.revenuecat.com/docs/api-v2/charts-and-metrics
 *                v2 secret key with ONLY charts_metrics:overview:read and charts_metrics:charts:read; 25 requests/min.
 *  PostHog       https://posthog.com/docs/api/queries   (personal API key with Query Read)
 *  App Store     https://developer.apple.com/documentation/appstoreconnectapi/get-v1-salesreports (sales reports,
 *                gzip TSV; JWT ES256, key role Sales/Finance) and the public iTunes lookup for the rating:
 *                https://developer.apple.com/library/archive/documentation/AudioVideo/Conceptual/iTuneSearchAPI/LookupExamples.html
 *  Google Play   https://support.google.com/googleplay/android-developer/answer/6135870 (installs CSVs in the
 *                developer's Cloud Storage bucket; service account with devstorage.read_only).
 */

export type Env = Record<string, string | undefined>;
type FetchLike = typeof fetch;

function need(env: Env, names: string[], reason: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const n of names) {
    const v = env[n]?.trim();
    if (!v) throw new NotConnectedError(reason);
    out[n] = v;
  }
  return out;
}

/** A bare host name only (no scheme, path or port tricks), so a key can never be sent somewhere unexpected. */
export function cleanHost(raw: string | undefined, fallback: string): string {
  const v = (raw?.trim() || fallback).replace(/^https:\/\//i, "").replace(/\/+$/, "");
  if (!/^[a-z0-9]([a-z0-9.-]*[a-z0-9])?$/i.test(v)) throw new Error("bad host");
  return v;
}

async function getJson(
  f: FetchLike,
  url: string,
  init: RequestInit,
  signal: AbortSignal,
): Promise<unknown> {
  const res = await f(url, { ...init, signal });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

const obj = (v: unknown): Record<string, unknown> =>
  v && typeof v === "object" ? (v as Record<string, unknown>) : {};
const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);

/** Keeps a title useful but free of anything personal: emails, long digit runs and tokens are masked, then cut. */
export function sanitizeTitle(raw: string): string {
  return raw
    .replace(/[^\s@]+@[^\s@]+\.[^\s@]+/g, "[email]")
    .replace(/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi, "[id]")
    .replace(/\d{6,}/g, "[n]")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80);
}

const pct1 = (x: number) => Math.round(x * 1000) / 10;

// ----------------------------------------------------------------------------------------------- Sentry
const SENTRY_ID_TTL_MS = 6 * 60 * 60_000;
const sentryIds = new Map<string, { at: number; byslug: Map<string, string> }>();
export function clearSentryIdCache(): void {
  sentryIds.clear();
}

/** Turns each wanted project (numeric id or slug) into a numeric id. An unknown slug throws (group: Could not load). */
export async function resolveSentryProjects(
  f: FetchLike,
  base: string,
  host: string,
  orgKey: string,
  headers: Record<string, string>,
  signal: AbortSignal,
  wanted: { label: string; ref: string }[],
): Promise<{ label: string; id: string }[]> {
  const isId = (v: string) => /^\d+$/.test(v);
  const slugs = wanted.filter((w) => !isId(w.ref));
  let byslug = new Map<string, string>();
  if (slugs.length > 0) {
    const key = `${host}/${orgKey}`;
    const hit = sentryIds.get(key);
    if (
      hit &&
      Date.now() - hit.at < SENTRY_ID_TTL_MS &&
      slugs.every((w) => hit.byslug.has(w.ref))
    ) {
      byslug = hit.byslug;
    } else {
      const list = await getJson(f, `${base}/projects/?per_page=100`, { headers }, signal);
      for (const p of Array.isArray(list) ? list : []) {
        const r = obj(p);
        if (typeof r.slug === "string" && typeof r.id === "string") byslug.set(r.slug, r.id);
      }
      sentryIds.set(key, { at: Date.now(), byslug });
    }
  }
  return wanted.map((w) => {
    if (isId(w.ref)) return { label: w.label, id: w.ref };
    const id = byslug.get(w.ref);
    if (!id) throw new Error("unknown Sentry project");
    return { label: w.label, id };
  });
}

export function sentrySource(env: Env, f: FetchLike): SourceFn {
  return async ({ windowDays, signal }) => {
    const k = need(
      env,
      ["SENTRY_API_TOKEN", "SENTRY_ORG", "SENTRY_PROJECTS"],
      "Add a Sentry token (owner step)",
    );
    const host = cleanHost(env.SENTRY_HOST, "sentry.io");
    const org = encodeURIComponent(k.SENTRY_ORG!);
    const headers = { Authorization: `Bearer ${k.SENTRY_API_TOKEN}` };
    // SENTRY_PROJECTS: "ios:lwa-ios,web:lwa-web" (label:slug), plain slugs, or numeric ids. The sessions and issues
    // endpoints take numeric project IDs in `project` (docs above), so slugs are resolved once through
    // GET /api/0/organizations/{org}/projects/ (needs org:read),
    // https://docs.sentry.io/api/organizations/list-an-organizations-projects/ and remembered for six hours.
    const wanted = k
      .SENTRY_PROJECTS!.split(",")
      .map((p) => p.trim())
      .filter(Boolean)
      .map((p) => {
        const [a, b] = p.split(":");
        return { label: b ? a! : p, ref: b ?? p };
      });
    const base = `https://${host}/api/0/organizations/${org}`;
    const projects = await resolveSentryProjects(
      f,
      base,
      host,
      k.SENTRY_ORG!,
      headers,
      signal,
      wanted,
    );
    const rates = await Promise.all(
      projects.map(async (p) => {
        const qs = new URLSearchParams({
          project: p.id,
          field: "crash_free_rate(session)",
          statsPeriod: `${windowDays}d`,
          interval: "1d",
        });
        const body = obj(await getJson(f, `${base}/sessions/?${qs}`, { headers }, signal));
        const group = obj((Array.isArray(body.groups) ? body.groups : [])[0]);
        const rate = num(obj(group.totals)["crash_free_rate(session)"]);
        return rate === null ? null : { label: p.label, value: pct1(rate), unit: "%" as const };
      }),
    );
    const iq = new URLSearchParams({
      query: `is:unresolved firstSeen:-${windowDays}d`,
      sort: "freq",
      limit: "5",
    });
    for (const p of projects) iq.append("project", p.id);
    const issues = await getJson(f, `${base}/issues/?${iq}`, { headers }, signal);
    const rows = (Array.isArray(issues) ? issues : []).map((i) => {
      const r = obj(i);
      return { label: sanitizeTitle(String(r.title ?? "Unknown")), value: Number(r.count) || 0 };
    });
    const [ph0, ph1] = GROUP_DEFS.find((g) => g.key === "sentry")!.placeholders(windowDays);
    const crash = rates.filter((r): r is NonNullable<typeof r> => r !== null);
    return [
      {
        ...ph0!,
        value: null,
        rows: crash,
        ...(crash.length === 0 ? { reason: "No sessions in this window" } : {}),
      },
      {
        ...ph1!,
        value: null,
        rows,
        ...(rows.length === 0 ? { reason: "No new issues in this window" } : {}),
      },
    ];
  };
}

// ------------------------------------------------------------------------------------------- RevenueCat
/** Sums (or averages) a chart's numeric points. Returns null when the shape is not one we understand: never a 0. */
export function chartTotal(values: unknown, how: "sum" | "mean"): number | null {
  if (!Array.isArray(values)) return null;
  const points: number[] = [];
  for (const item of values) {
    const direct = num(item);
    const fromArray = Array.isArray(item) ? num(item[item.length - 1]) : null;
    const fromObject = num(obj(item).value);
    const v = direct ?? fromArray ?? fromObject;
    if (v !== null) points.push(v);
  }
  if (points.length === 0) return null;
  const sum = points.reduce((a, b) => a + b, 0);
  return how === "sum" ? sum : sum / points.length;
}

export function revenueCatSource(env: Env, f: FetchLike): SourceFn {
  return async ({ windowDays, signal, now }) => {
    const k = need(
      env,
      ["REVENUECAT_METRICS_KEY", "REVENUECAT_PROJECT_ID"],
      "Add a RevenueCat metrics key (owner step)",
    );
    const headers = { Authorization: `Bearer ${k.REVENUECAT_METRICS_KEY}` };
    const root = `https://api.revenuecat.com/v2/projects/${encodeURIComponent(k.REVENUECAT_PROJECT_ID!)}`;
    const day = (d: Date) => d.toISOString().slice(0, 10);
    const start = new Date(now.getTime() - windowDays * 86_400_000);
    const chart = async (name: string): Promise<unknown> => {
      const qs = new URLSearchParams({
        realtime: "false",
        start_date: day(start),
        end_date: day(now),
        resolution: "day",
      });
      try {
        return obj(await getJson(f, `${root}/charts/${name}?${qs}`, { headers }, signal)).values;
      } catch {
        return undefined; // one chart failing leaves its tile empty; the overview below still decides the group
      }
    };
    const [overview, newSubs, churn] = await Promise.all([
      getJson(f, `${root}/metrics/overview?currency=USD`, { headers }, signal),
      chart("actives_new"),
      chart("churn"),
    ]);
    const metrics = new Map<string, number | null>();
    for (const m of Array.isArray(obj(overview).metrics)
      ? (obj(overview).metrics as unknown[])
      : []) {
      const r = obj(m);
      if (typeof r.id === "string") metrics.set(r.id, num(r.value));
    }
    const ph = GROUP_DEFS.find((g) => g.key === "revenuecat")!.placeholders(windowDays);
    const fromOverview = (id: string): { value: number | null; reason?: string } => {
      const v = metrics.get(id);
      return v === undefined || v === null
        ? { value: null, reason: "Not reported by RevenueCat" }
        : { value: v };
    };
    const chartTile = (tileId: string, values: unknown, how: "sum" | "mean") => {
      const v = chartTotal(values, how);
      return v === null
        ? { value: null, reason: "Not reported by RevenueCat" }
        : { value: how === "sum" ? Math.round(v) : Math.round(v * 10) / 10 };
    };
    const byId: Record<string, { value: number | null; reason?: string }> = {
      active_pro: fromOverview("active_subscriptions"),
      trials: fromOverview("active_trials"),
      new_subs: chartTile("new_subs", newSubs, "sum"),
      churn: chartTile("churn", churn, "mean"),
      mrr: fromOverview("mrr"),
    };
    return ph.map((p) => ({ ...p, ...byId[p.id]! }));
  };
}

// ----------------------------------------------------------------------------------------------- PostHog
export function postHogSource(env: Env, f: FetchLike): SourceFn {
  return async ({ windowDays, signal }) => {
    const k = need(
      env,
      ["POSTHOG_PERSONAL_API_KEY", "POSTHOG_PROJECT_ID"],
      "PostHog is not connected yet",
    );
    const host = cleanHost(env.POSTHOG_HOST, "us.posthog.com");
    const url = `https://${host}/api/projects/${encodeURIComponent(k.POSTHOG_PROJECT_ID!)}/query/`;
    const run = async (query: string): Promise<unknown[][]> => {
      const body = obj(
        await getJson(
          f,
          url,
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${k.POSTHOG_PERSONAL_API_KEY}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ query: { kind: "HogQLQuery", query }, name: "admin numbers" }),
          },
          signal,
        ),
      );
      return Array.isArray(body.results) ? (body.results as unknown[][]) : [];
    };
    const w = Number(windowDays); // 7, 30 or 90: a number, never user text
    const [funnel, steps] = await Promise.all([
      run(
        `select uniqIf(distinct_id, event = 'app_open'), uniqIf(distinct_id, event = 'lesson_completed') from events where event in ('app_open', 'lesson_completed') and timestamp >= now() - interval ${w} day`,
      ),
      run(
        `select properties.step, uniq(distinct_id) as n from events where event = 'onboarding_step' and timestamp >= now() - interval ${w} day group by properties.step order by n desc limit 8`,
      ),
    ]);
    const opened = num(funnel[0]?.[0]);
    const lessoned = num(funnel[0]?.[1]);
    const [ph0, ph1] = GROUP_DEFS.find((g) => g.key === "posthog")!.placeholders(windowDays);
    const rows = steps
      .map((r) => ({ label: sanitizeTitle(String(r[0] ?? "unknown")), value: num(r[1]) ?? 0 }))
      .filter((r) => r.label);
    return [
      opened && opened > 0 && lessoned !== null
        ? { ...ph0!, value: Math.round((1000 * lessoned) / opened) / 10 }
        : { ...ph0!, value: null, reason: "No app opens in this window" },
      {
        ...ph1!,
        value: null,
        rows,
        ...(rows.length === 0 ? { reason: "No onboarding events in this window" } : {}),
      },
    ];
  };
}

// ------------------------------------------------------------------------------------------- App Store
const b64url = (b: Buffer | string) => Buffer.from(b).toString("base64url");

export function appStoreToken(keyId: string, issuer: string, pem: string, nowSec: number): string {
  const header = b64url(JSON.stringify({ alg: "ES256", kid: keyId, typ: "JWT" }));
  const payload = b64url(
    JSON.stringify({ iss: issuer, iat: nowSec, exp: nowSec + 600, aud: "appstoreconnect-v1" }),
  );
  const sign = createSign("sha256");
  sign.update(`${header}.${payload}`);
  const sig = sign.sign({ key: createPrivateKey(pem), dsaEncoding: "ieee-p1363" });
  return `${header}.${payload}.${b64url(sig)}`;
}

/** First-time downloads in one daily SALES/SUMMARY report (tab separated): Units where the product type is an app. */
export function countDownloads(tsv: string, appId: string | undefined): number {
  const lines = tsv.split(/\r?\n/).filter(Boolean);
  const head = (lines[0] ?? "").split("\t");
  const iUnits = head.indexOf("Units");
  const iType = head.indexOf("Product Type Identifier");
  const iApp = head.indexOf("Apple Identifier");
  if (iUnits < 0 || iType < 0) throw new Error("unexpected report columns");
  const APP_DOWNLOAD = new Set(["1", "1F", "1T", "F1"]);
  let total = 0;
  for (const line of lines.slice(1)) {
    const c = line.split("\t");
    if (!APP_DOWNLOAD.has(c[iType] ?? "")) continue;
    if (appId && iApp >= 0 && c[iApp] !== appId) continue;
    total += Number(c[iUnits]) || 0;
  }
  return total;
}

export function appStoreSource(env: Env, f: FetchLike): SourceFn {
  return async ({ windowDays, signal, now }) => {
    const k = need(
      env,
      ["ASC_KEY_ID", "ASC_ISSUER_ID", "ASC_PRIVATE_KEY", "ASC_VENDOR_NUMBER"],
      "Add an App Store Connect key (owner step)",
    );
    const appId = env.ASC_APP_ID?.trim() || undefined;
    const token = appStoreToken(
      k.ASC_KEY_ID!,
      k.ASC_ISSUER_ID!,
      k.ASC_PRIVATE_KEY!.replace(/\\n/g, "\n"),
      Math.floor(now.getTime() / 1000),
    );
    const days = Math.min(windowDays, 30); // one report per day; the 30 most recent keep this inside the time limit
    const dates = Array.from({ length: days }, (_, i) =>
      new Date(now.getTime() - (i + 1) * 86_400_000).toISOString().slice(0, 10),
    );
    let total = 0;
    let found = 0;
    for (let i = 0; i < dates.length; i += 10) {
      const batch = await Promise.all(
        dates.slice(i, i + 10).map(async (d) => {
          const qs = new URLSearchParams({
            "filter[frequency]": "DAILY",
            "filter[reportType]": "SALES",
            "filter[reportSubType]": "SUMMARY",
            "filter[vendorNumber]": k.ASC_VENDOR_NUMBER!,
            "filter[reportDate]": d,
            "filter[version]": "1_0",
          });
          const res = await f(`https://api.appstoreconnect.apple.com/v1/salesReports?${qs}`, {
            headers: { Authorization: `Bearer ${token}`, Accept: "application/a-gzip" },
            signal,
          });
          if (res.status === 404) return null; // no report for that day (nothing sold, or not published yet)
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          return countDownloads(
            gunzipSync(Buffer.from(await res.arrayBuffer())).toString("utf8"),
            appId,
          );
        }),
      );
      for (const n of batch) {
        if (n !== null) {
          found += 1;
          total += n;
        }
      }
    }
    const [ph0, ph1] = GROUP_DEFS.find((g) => g.key === "appstore")!.placeholders(windowDays);
    const downloads: Tile =
      found === 0
        ? { ...ph0!, value: null, reason: "No sales reports yet" }
        : { ...ph0!, value: total };
    let rating: Tile = { ...ph1!, value: null, reason: "Add the App Store app id (owner step)" };
    if (appId) {
      const body = obj(
        await getJson(
          f,
          `https://itunes.apple.com/lookup?id=${encodeURIComponent(appId)}&country=us`,
          {},
          signal,
        ),
      );
      const first = obj((Array.isArray(body.results) ? body.results : [])[0]);
      const avg = num(first.averageUserRating);
      const count = num(first.userRatingCount);
      rating =
        avg === null
          ? { ...ph1!, value: null, reason: "No ratings yet" }
          : { ...ph1!, value: Math.round(avg * 10) / 10, note: `${count ?? 0} ratings, all time` };
    }
    return [downloads, rating];
  };
}

// ------------------------------------------------------------------------------------------ Google Play
function decodeReport(buf: Buffer): string {
  if (buf[0] === 0xff && buf[1] === 0xfe) return buf.subarray(2).toString("utf16le");
  return buf.toString("utf8");
}

/** Sums "Daily User Installs" over the rows whose Date falls in [from, to] (both YYYY-MM-DD). */
export function sumInstalls(csv: string, from: string, to: string): number {
  const lines = csv.split(/\r?\n/).filter(Boolean);
  const split = (l: string) => l.split(",").map((c) => c.replace(/^"|"$/g, "").trim());
  const head = split(lines[0] ?? "");
  const iDate = head.indexOf("Date");
  const iInst = head.indexOf("Daily User Installs");
  if (iDate < 0 || iInst < 0) throw new Error("unexpected report columns");
  let total = 0;
  for (const line of lines.slice(1)) {
    const c = split(line);
    const d = c[iDate] ?? "";
    if (d >= from && d <= to) total += Number(c[iInst]) || 0;
  }
  return total;
}

export function googlePlaySource(env: Env, f: FetchLike): SourceFn {
  return async ({ windowDays, signal, now }) => {
    const k = need(
      env,
      ["GOOGLE_PLAY_SERVICE_ACCOUNT_JSON", "GOOGLE_PLAY_PACKAGE", "GOOGLE_PLAY_REPORTS_BUCKET"],
      "Until the Play account exists",
    );
    let account: { client_email?: string; private_key?: string };
    try {
      account = JSON.parse(k.GOOGLE_PLAY_SERVICE_ACCOUNT_JSON!);
    } catch {
      throw new Error("service account json");
    }
    if (!account.client_email || !account.private_key) throw new Error("service account fields");
    const iat = Math.floor(now.getTime() / 1000);
    const head = b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
    const claim = b64url(
      JSON.stringify({
        iss: account.client_email,
        scope: "https://www.googleapis.com/auth/devstorage.read_only",
        aud: "https://oauth2.googleapis.com/token",
        iat,
        exp: iat + 600,
      }),
    );
    const sign = createSign("RSA-SHA256");
    sign.update(`${head}.${claim}`);
    const assertion = `${head}.${claim}.${b64url(sign.sign(account.private_key))}`;
    const tokenBody = obj(
      await getJson(
        f,
        "https://oauth2.googleapis.com/token",
        {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({
            grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
            assertion,
          }),
        },
        signal,
      ),
    );
    const accessToken = String(tokenBody.access_token ?? "");
    if (!accessToken) throw new Error("no token");

    const to = new Date(now.getTime() - 86_400_000).toISOString().slice(0, 10);
    const from = new Date(now.getTime() - windowDays * 86_400_000).toISOString().slice(0, 10);
    const months = [
      ...new Set([
        from.slice(0, 7).replace("-", ""),
        to.slice(0, 7).replace("-", ""),
        ...monthsBetween(from, to),
      ]),
    ];
    let total = 0;
    let found = 0;
    for (const m of months) {
      const object = `stats/installs/installs_${k.GOOGLE_PLAY_PACKAGE}_${m}_country.csv`;
      const res = await f(
        `https://storage.googleapis.com/storage/v1/b/${encodeURIComponent(k.GOOGLE_PLAY_REPORTS_BUCKET!)}/o/${encodeURIComponent(object)}?alt=media`,
        { headers: { Authorization: `Bearer ${accessToken}` }, signal },
      );
      if (res.status === 404) continue; // that month has no report (yet)
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      found += 1;
      total += sumInstalls(decodeReport(Buffer.from(await res.arrayBuffer())), from, to);
    }
    const [ph0] = GROUP_DEFS.find((g) => g.key === "googleplay")!.placeholders(windowDays);
    return [
      found === 0
        ? { ...ph0!, value: null, reason: "No install reports yet" }
        : { ...ph0!, value: total },
    ];
  };
}

function monthsBetween(from: string, to: string): string[] {
  const out: string[] = [];
  const d = new Date(`${from.slice(0, 7)}-01T00:00:00Z`);
  const end = new Date(`${to.slice(0, 7)}-01T00:00:00Z`);
  while (d <= end) {
    out.push(d.toISOString().slice(0, 7).replace("-", ""));
    d.setUTCMonth(d.getUTCMonth() + 1);
  }
  return out;
}

// ------------------------------------------------------------------------------------------ Our database
type RpcClient = {
  rpc(
    name: string,
    args: Record<string, unknown>,
  ): {
    abortSignal(s: AbortSignal): PromiseLike<{ data: unknown; error: { message: string } | null }>;
  };
};

/**
 * Strict: a payload that is not the expected object, or lacks a field, or has a non-numeric field, THROWS (the group
 * shows "Could not load"). It must never turn a missing answer into zeros that would render as real 0s.
 * Only avgStreak and the three retention rates may be null (no streaks / no cohort), and only when the key is present.
 */
export function parseOwn(raw: unknown): OwnAggregates {
  if (!raw || typeof raw !== "object" || Array.isArray(raw))
    throw new Error("unexpected numbers payload");
  const r = raw as Record<string, unknown>;
  const must = (k: string): number => {
    const v = num(r[k]);
    if (v === null) throw new Error(`numbers payload: ${k} missing or not a number`);
    return v;
  };
  const nullable = (src: Record<string, unknown>, k: string): number | null => {
    if (!(k in src)) throw new Error(`numbers payload: ${k} missing`);
    const v = src[k];
    if (v === null) return null;
    const n = num(v);
    if (n === null) throw new Error(`numbers payload: ${k} not a number`);
    return n;
  };
  const ret = r.retention;
  if (!ret || typeof ret !== "object" || Array.isArray(ret))
    throw new Error("numbers payload: retention missing");
  const ai = r.aiByKind;
  if (!ai || typeof ai !== "object" || Array.isArray(ai))
    throw new Error("numbers payload: aiByKind missing");
  const aiByKind: Record<string, number> = {};
  for (const [kind, v] of Object.entries(ai as Record<string, unknown>)) {
    const n = num(v);
    if (n === null) throw new Error("numbers payload: aiByKind value not a number");
    aiByKind[kind] = n;
  }
  const rr = ret as Record<string, unknown>;
  return {
    newToday: must("newToday"),
    newWindow: must("newWindow"),
    activeToday: must("activeToday"),
    activeWindow: must("activeWindow"),
    lessons: must("lessons"),
    practiceCalls: must("practiceCalls"),
    podcastsFinished: must("podcastsFinished"),
    avgStreak: nullable(r, "avgStreak"),
    retention: { d1: nullable(rr, "d1"), d7: nullable(rr, "d7"), d30: nullable(rr, "d30") },
    openReports: must("openReports"),
    openTickets: must("openTickets"),
    aiByKind,
  };
}

export async function fetchOwnAggregates(
  client: RpcClient,
  windowDays: WindowDays,
  signal: AbortSignal,
): Promise<OwnAggregates> {
  const { data, error } = await client
    .rpc("admin_numbers_own", { p_days: windowDays })
    .abortSignal(signal);
  if (error) throw new Error(error.message);
  return parseOwn(data);
}

export function createOwnFetcher(): OwnFn {
  return async ({ windowDays, signal }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    return fetchOwnAggregates(supabaseAdmin as unknown as RpcClient, windowDays, signal);
  };
}

/**
 * The AI cost group: measured spend from ai_cost_log through admin_ai_cost. The function missing (the migration is not
 * applied yet) or nothing logged in 90 days is "Not connected", never a $0: a $0 would read as a real, free month.
 */
export function aiCostSource(env: Env, rpcClient?: RpcClient): SourceFn {
  return async (ctx: SourceContext) => {
    const cfg = costConfig(env);
    const client =
      rpcClient ??
      ((await import("@/integrations/supabase/client.server"))
        .supabaseAdmin as unknown as RpcClient);
    const { data, error } = await client
      .rpc("admin_ai_cost", {
        p_days: ctx.windowDays,
        p_heavy_micro: Math.round(cfg.heavyMonthlyUsd * MICRO),
      })
      .abortSignal(ctx.signal);
    if (error) {
      if (/admin_ai_cost|schema cache|does not exist/i.test(error.message))
        throw new NotConnectedError("Cost log not deployed yet");
      throw new Error(error.message);
    }
    const payload = parseCostPayload(data);
    if (payload.loggedCalls === 0) throw new NotConnectedError("No AI calls logged yet");
    // The monthly-cap tile: its own function, so a missing one (migration not applied) only blanks this one tile.
    const cap = monthlyCapConfig(env);
    let counts: CapCounts | null = null;
    try {
      const capped = await client
        .rpc("admin_ai_cost_capped", { p_free_micro: cap.freeMicro, p_pro_micro: cap.proMicro })
        .abortSignal(ctx.signal);
      counts = capped.error ? null : parseCapCounts(capped.data);
    } catch {
      counts = null;
    }
    return aiCostTilesFromPayload(
      payload,
      ctx.windowDays,
      cfg,
      cappedTile(counts, cap.freeMicro / MICRO, cap.proMicro / MICRO, ctx.windowDays),
    );
  };
}

export function createSources(env: Env, f: FetchLike = fetch, rpcClient?: RpcClient): Sources {
  const own: Record<"own" | "aicost", SourceFn> = {
    own: async (ctx: SourceContext) => ownTiles(await ctx.own(), ctx.windowDays),
    aicost: aiCostSource(env, rpcClient),
  };
  const map: Record<GroupKey, SourceFn> = {
    ...own,
    revenuecat: revenueCatSource(env, f),
    sentry: sentrySource(env, f),
    posthog: postHogSource(env, f),
    appstore: appStoreSource(env, f),
    googleplay: googlePlaySource(env, f),
  };
  return map;
}
