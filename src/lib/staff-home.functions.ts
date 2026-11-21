import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import type { Tile } from "./numbers-core";
import { requireStaff } from "./staff-middleware";
import { callRpc } from "./untyped-rpc";
import { consumeStaffLimit, STAFF_LIMITS } from "./staff-rate-limit";

/**
 * What the console shell and Home read, each call gated by the scope of the thing it counts. Counts, ages and names of
 * staff only: never a learner's name, email or message text. A failed read throws (the screen then says "Could not
 * read"); nothing here ever returns a 0 for a number it could not read.
 */

export const TOO_MANY_HOME = "Too many requests. Wait a minute and try again.";

async function allowed(client: Parameters<typeof consumeStaffLimit>[0], actor: string) {
  if (!(await consumeStaffLimit(client, actor, STAFF_LIMITS.home))) throw new Error(TOO_MANY_HOME);
}

const finite = (v: unknown): number | null =>
  typeof v === "number" && Number.isFinite(v) ? v : null;

export type NavCounts = {
  /** Tickets that need a reply. Present only for someone holding support.read; null when it could not be read. */
  support?: number | null;
  /** Open reports. Present only for someone holding reports.manage; null when it could not be read. */
  reports?: number | null;
};

/**
 * The rail's pips, one call. Only the counts the caller's scopes allow are asked for and returned (a key that is absent
 * means "no pip", a null means "could not read": either way the rail shows no number).
 */
export const staffNavCounts = createServerFn({ method: "GET" })
  .middleware([requireStaff()])
  .handler(async ({ context }): Promise<NavCounts> => {
    await allowed(context.supabaseAdmin, context.userId);
    const out: NavCounts = {};
    const jobs: Promise<void>[] = [];
    if (context.staffScopes.includes("support.read")) {
      jobs.push(
        (async () => {
          const { data, error } = await context.supabaseAdmin.rpc("staff_support_inbox", {
            p_actor: context.userId,
            p_filter: "open",
            p_assigned: "any",
            p_cursor_at: null,
            p_cursor_id: null,
            p_limit: 1,
          } as never);
          out.support = error
            ? null
            : finite((data as { counts?: { open?: unknown } } | null)?.counts?.open);
        })(),
      );
    }
    if (context.staffScopes.includes("reports.manage")) {
      jobs.push(
        (async () => {
          const { count, error } = await context.supabaseAdmin
            .from("content_reports")
            .select("id", { count: "exact", head: true });
          out.reports = error ? null : finite(count);
        })(),
      );
    }
    await Promise.all(jobs);
    return out;
  });

export const HOME_RANGES = ["today", "7", "30"] as const;
export type HomeRange = (typeof HOME_RANGES)[number];

export type HomeMetrics = {
  range: HomeRange;
  generatedAt: string;
  /** Each is null when the database did not return a number for it. */
  newLearners: number | null;
  lessons: number | null;
  /** Distinct learners with activity today (UTC), whatever the range. */
  activeToday: number | null;
};

export const staffHomeMetrics = createServerFn({ method: "POST" })
  .middleware([requireStaff("numbers.read")])
  .inputValidator((d: unknown) =>
    z
      .object({ range: z.enum(HOME_RANGES) })
      .strict()
      .parse(d),
  )
  .handler(async ({ data, context }): Promise<HomeMetrics> => {
    await allowed(context.supabaseAdmin, context.userId);
    const { data: raw, error } = await callRpc(context.supabaseAdmin, "staff_home_metrics", {
      p_range: data.range,
    });
    if (error || !raw || typeof raw !== "object") throw new Error("Could not read the numbers.");
    const r = raw as Record<string, unknown>;
    return {
      range: data.range,
      generatedAt: new Date().toISOString(),
      newLearners: finite(r.newLearners),
      lessons: finite(r.lessons),
      activeToday: finite(r.activeToday),
    };
  });

export type MoneyTile = Pick<Tile, "id" | "label" | "kind" | "value" | "note" | "reason"> & {
  /** The group's own state: "not_connected" needs a key, "error" means the provider did not answer. */
  state: "ok" | "not_connected" | "error";
};

/** The three Home money tiles and where each comes from (groups of the Numbers page). */
export const HOME_MONEY_TILES = [
  { group: "aicost", tile: "spend_today", label: "AI cost today" },
  { group: "revenuecat", tile: "mrr", label: "MRR (estimate)" },
  { group: "appstore", tile: "downloads", label: "App Store downloads" },
] as const;

/** Owner only (numbers.revenue). A provider without its key answers "Not connected", never a number. */
export const staffHomeMoney = createServerFn({ method: "POST" })
  .middleware([requireStaff("numbers.revenue")])
  .handler(async ({ context }): Promise<{ generatedAt: string; tiles: MoneyTile[] }> => {
    await allowed(context.supabaseAdmin, context.userId);
    const { collectNumbers } = await import("./numbers-core");
    const { createSources, createOwnFetcher } = await import("./numbers-sources.server");
    const res = await collectNumbers({
      scopes: context.staffScopes,
      windowDays: 7,
      sources: createSources(process.env),
      fetchOwn: createOwnFetcher(),
      only: HOME_MONEY_TILES.map((t) => t.group),
    });
    const tiles = HOME_MONEY_TILES.map((want): MoneyTile => {
      const group = res.groups.find((g) => g.key === want.group);
      const tile = group?.tiles.find((t) => t.id === want.tile);
      if (!group || !tile) {
        return {
          id: want.tile,
          label: want.label,
          kind: "number",
          value: null,
          note: "",
          reason: "Could not read",
          state: "error",
        };
      }
      return {
        id: tile.id,
        label: want.label,
        kind: tile.kind,
        value: tile.value,
        note: tile.note,
        reason: tile.reason,
        state: group.state,
      };
    });
    return { generatedAt: res.generatedAt, tiles };
  });

export type FeedRow = { id: number; at: string; action: string; actorName: string | null };

/** How many action-record rows the "Just happened" card reads. */
export const FEED_SIZE = 8;

/**
 * The newest rows of the action record for the Home feed (scope audit.read). Who and what only: the learner a row is
 * about is NOT named (a feed that names learners would make them browsable; staff open one by searching). A learner
 * view ("user.view") is left out of the feed as noise; the Audit page still lists it.
 */
export const staffHomeFeed = createServerFn({ method: "GET" })
  .middleware([requireStaff("audit.read")])
  .handler(async ({ context }): Promise<{ rows: FeedRow[] }> => {
    await allowed(context.supabaseAdmin, context.userId);
    const { data, error } = await context.supabaseAdmin
      .from("staff_audit_log")
      .select("id, at, actor_user_id, action")
      .neq("action", "user.view")
      .order("id", { ascending: false })
      .limit(FEED_SIZE);
    if (error) throw new Error("Could not read the action record.");
    const rows = data ?? [];
    const ids = [...new Set(rows.map((r) => r.actor_user_id).filter((v): v is string => !!v))];
    const names = new Map<string, string | null>();
    if (ids.length > 0) {
      const { data: profiles } = await context.supabaseAdmin
        .from("profiles")
        .select("id, display_name")
        .in("id", ids);
      for (const p of profiles ?? []) names.set(p.id, p.display_name as string | null);
    }
    return {
      rows: rows.map((r) => ({
        id: r.id,
        at: r.at,
        action: r.action,
        actorName: r.actor_user_id ? (names.get(r.actor_user_id) ?? null) : null,
      })),
    };
  });
