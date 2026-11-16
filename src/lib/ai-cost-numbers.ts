import type { Tile, WindowDays } from "./numbers-core";
import { MICRO } from "./ai-cost";
import type { CostConfig } from "./ai-cost-config";

/**
 * The Numbers page's "AI cost" group from what admin_ai_cost returns (20261118200000_ai_cost_log.sql), as pure functions
 * so every rule is tested. Money is ESTIMATED USD: the vendor's own charge when it reported one, else our price table
 * (ai-prices.ts); a call whose price is unknown is counted in "Calls without a price", never added as 0.
 * Nothing here carries a name or an email: a learner appears only as the first 8 characters of their id.
 */

export type CostPeriod = {
  micro: number;
  calls: number;
  unpriced: number;
  byVendor: Record<string, number>;
  byKind: Record<string, number>;
};

export type CostPayload = {
  windowDays: number;
  loggedCalls: number;
  periods: { today: CostPeriod; d7: CostPeriod; d30: CostPeriod };
  users: {
    active: number;
    avg: number | null;
    median: number | null;
    p90: number | null;
    max: number | null;
  };
  heavy: number;
  top: { id: string; micro: number; calls: number }[];
  tts: { calls: number; hits: number };
};

const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);
const record = (v: unknown): Record<string, unknown> | null =>
  v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;

/**
 * Strict, like parseOwn: a payload that is not the expected object THROWS (the group then shows "Could not load")
 * instead of turning a missing answer into zeros that would read as real $0.
 */
export function parseCostPayload(raw: unknown): CostPayload {
  const r = record(raw);
  if (!r) throw new Error("unexpected AI cost payload");
  const must = (src: Record<string, unknown>, k: string): number => {
    const v = num(src[k]);
    if (v === null) throw new Error(`AI cost payload: ${k} missing or not a number`);
    return v;
  };
  const nullable = (src: Record<string, unknown>, k: string): number | null => {
    if (!(k in src)) throw new Error(`AI cost payload: ${k} missing`);
    if (src[k] === null) return null;
    return must(src, k);
  };
  const map = (v: unknown, what: string): Record<string, number> => {
    const m = record(v);
    if (!m) throw new Error(`AI cost payload: ${what} missing`);
    const out: Record<string, number> = {};
    for (const [k, x] of Object.entries(m)) {
      const n = num(x);
      if (n === null) throw new Error(`AI cost payload: ${what} value not a number`);
      out[k] = n;
    }
    return out;
  };
  const periods = record(r.periods);
  if (!periods) throw new Error("AI cost payload: periods missing");
  const period = (name: string): CostPeriod => {
    const p = record(periods[name]);
    if (!p) throw new Error(`AI cost payload: period ${name} missing`);
    return {
      micro: must(p, "micro"),
      calls: must(p, "calls"),
      unpriced: must(p, "unpriced"),
      byVendor: map(p.byVendor, "byVendor"),
      byKind: map(p.byKind, "byKind"),
    };
  };
  const users = record(r.users);
  const tts = record(r.tts);
  if (!users || !tts || !Array.isArray(r.top)) throw new Error("AI cost payload: shape");
  return {
    windowDays: must(r, "windowDays"),
    loggedCalls: must(r, "loggedCalls"),
    periods: { today: period("today"), d7: period("d7"), d30: period("d30") },
    users: {
      active: must(users, "active"),
      avg: nullable(users, "avg"),
      median: nullable(users, "median"),
      p90: nullable(users, "p90"),
      max: nullable(users, "max"),
    },
    heavy: must(r, "heavy"),
    top: r.top.map((t) => {
      const row = record(t);
      if (!row || typeof row.id !== "string") throw new Error("AI cost payload: top row");
      return { id: row.id, micro: must(row, "micro"), calls: must(row, "calls") };
    }),
    tts: { calls: must(tts, "calls"), hits: must(tts, "hits") },
  };
}

const usd = (micro: number): number => micro / MICRO;
/** Whole cents are too coarse for a per-call cost: round to a tenth of a cent. */
const usdRounded = (micro: number): number => Math.round(usd(micro) * 1000) / 1000;

const PERIODS: { key: "today" | "d7" | "d30"; label: string; note: string }[] = [
  { key: "today", label: "today", note: "today (UTC day)" },
  { key: "d7", label: "7 days", note: "last 7 days" },
  { key: "d30", label: "30 days", note: "last 30 days" },
];

const sortedRows = (m: Record<string, number>) =>
  Object.entries(m)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([label, micro]) => ({ label, value: usdRounded(micro), unit: "usd" as const }));

/** The placeholders the page draws when the group has no data (not connected / error), in the same order and ids. */
export function aiCostPlaceholders(
  windowDays: WindowDays,
): { id: string; label: string; kind: Tile["kind"]; note: string }[] {
  const w = `last ${windowDays} days`;
  return [
    ...PERIODS.map((p) => ({
      id: `spend_${p.key}`,
      label: `Spend, ${p.label}`,
      kind: "usd" as const,
      note: `${p.note}, estimate`,
    })),
    ...PERIODS.map((p) => ({
      id: `vendor_${p.key}`,
      label: `By vendor, ${p.label}`,
      kind: "list" as const,
      note: `${p.note}, estimate`,
    })),
    ...PERIODS.map((p) => ({
      id: `kind_${p.key}`,
      label: `By kind, ${p.label}`,
      kind: "list" as const,
      note: `${p.note}, estimate`,
    })),
    { id: "per_user", label: "Cost per active learner", kind: "list", note: `${w}, estimate` },
    { id: "heavy", label: "Heavy learners", kind: "number", note: "last 30 days, estimate" },
    { id: "top", label: "Top 20 learners by cost", kind: "list", note: `${w}, short id only` },
    { id: "tts_hit", label: "Voice cache hit rate", kind: "percent", note: w },
    { id: "unpriced", label: "Calls without a price", kind: "number", note: "last 30 days" },
  ];
}

export function aiCostTilesFromPayload(
  p: CostPayload,
  windowDays: WindowDays,
  cfg: CostConfig,
): Tile[] {
  const ph = new Map(aiCostPlaceholders(windowDays).map((t) => [t.id, t]));
  const base = (id: string) => ph.get(id)!;
  const tiles: Tile[] = [];
  for (const per of PERIODS) {
    const d = p.periods[per.key];
    tiles.push({
      ...base(`spend_${per.key}`),
      value: usdRounded(d.micro),
      note:
        d.unpriced > 0
          ? `${base(`spend_${per.key}`).note}; ${d.unpriced} call(s) not priced`
          : base(`spend_${per.key}`).note,
    });
  }
  for (const per of PERIODS) {
    const d = p.periods[per.key];
    tiles.push({
      ...base(`vendor_${per.key}`),
      value: null,
      rows: [
        { label: "All vendors", value: usdRounded(d.micro), unit: "usd" },
        ...sortedRows(d.byVendor),
      ],
    });
  }
  for (const per of PERIODS) {
    const d = p.periods[per.key];
    tiles.push(
      d.calls === 0
        ? { ...base(`kind_${per.key}`), value: null, reason: "No AI calls logged" }
        : { ...base(`kind_${per.key}`), value: null, rows: sortedRows(d.byKind) },
    );
  }
  const u = p.users;
  tiles.push(
    u.active === 0 || u.avg === null
      ? { ...base("per_user"), value: null, reason: "No active learners in this window" }
      : {
          ...base("per_user"),
          value: null,
          note: `${base("per_user").note}; ${u.active} active`,
          rows: [
            { label: "Average", value: usdRounded(u.avg), unit: "usd" },
            { label: "Median", value: usdRounded(u.median ?? 0), unit: "usd" },
            { label: "90th percentile", value: usdRounded(u.p90 ?? 0), unit: "usd" },
            { label: "Highest", value: usdRounded(u.max ?? 0), unit: "usd" },
          ],
        },
  );
  tiles.push({
    ...base("heavy"),
    value: p.heavy,
    note: `over $${cfg.heavyMonthlyUsd.toFixed(2)} a month (CAD ${cfg.heavyPriceCad} x ${Math.round(
      cfg.heavyShare * 100,
    )}% at ${cfg.usdPerCad} USD per CAD), last 30 days, estimate`,
  });
  tiles.push(
    p.top.length === 0
      ? { ...base("top"), value: null, reason: "No AI calls in this window" }
      : {
          ...base("top"),
          value: null,
          rows: p.top.map((t) => ({
            label: t.id,
            value: usdRounded(t.micro),
            unit: "usd" as const,
          })),
        },
  );
  tiles.push(
    p.tts.calls === 0
      ? { ...base("tts_hit"), value: null, reason: "No speech calls in this window" }
      : {
          ...base("tts_hit"),
          value: Math.round((1000 * p.tts.hits) / p.tts.calls) / 10,
          note: `${base("tts_hit").note}; ${p.tts.hits} of ${p.tts.calls} served from our own store`,
        },
  );
  tiles.push({ ...base("unpriced"), value: p.periods.d30.unpriced });
  return tiles;
}
