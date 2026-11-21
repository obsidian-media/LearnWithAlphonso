import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  WINDOW_CHOICES,
  type GroupKey,
  type NumbersGroup,
  type NumbersResponse,
  type Tile,
  type WindowDays,
} from "../../../lib/numbers-core";
import { Figure } from "../Figure";
import { DauChart } from "./DauChart";
import type { NumbersApi } from "./numbersApi";

export type NumbersMe = { scopes: readonly string[] };

const WINDOW_WORD: Record<WindowDays, string> = {
  1: "Today",
  7: "7 days",
  30: "30 days",
  90: "90 days",
};

/** The provider each group reads, as a fixed label (never data). */
const SOURCE_LABEL: Record<GroupKey, string> = {
  own: "Database",
  sentry: "Sentry",
  posthog: "PostHog",
  revenuecat: "RevenueCat",
  aicost: "AI cost log",
  appstore: "App Store",
  googleplay: "Google Play",
};

const STATE_WORD: Record<NumbersGroup["state"], string> = {
  ok: "Connected",
  not_connected: "Not connected",
  error: "Could not load",
};
const STATE_DOT: Record<NumbersGroup["state"], string> = {
  ok: "bg-ds-right",
  not_connected: "bg-ds-ink-faint",
  error: "bg-ds-wrong",
};

const find = (groups: NumbersGroup[], key: GroupKey) => groups.find((g) => g.key === key);
const tileOf = (group: NumbersGroup | undefined, id: string) =>
  group?.tiles.find((t) => t.id === id);

/** What a tile says when it has no value: the group's state first, then the reason the source gave. */
function reasonFor(group: NumbersGroup | undefined, tile: Tile | undefined): string {
  if (!group) return "Could not read";
  if (group.state === "not_connected") return "Not connected";
  if (group.state === "error") return "Could not load";
  return tile?.reason ?? "No data yet";
}

function Slab({ title, aside }: { title: string; aside?: ReactNode }) {
  return (
    <div className="mt-8 flex items-center gap-3">
      <h2 className="font-display text-sm font-extrabold uppercase tracking-[0.14em] text-ds-ink-soft">
        {title}
      </h2>
      <span aria-hidden="true" className="h-px flex-1 bg-ds-line" />
      {aside}
    </div>
  );
}

function SourceBadge({ group }: { group: NumbersGroup | undefined }) {
  if (!group) return null;
  return (
    <span className="inline-flex items-center gap-1.5 text-[0.68rem] font-bold uppercase tracking-wider text-ds-ink-faint">
      {SOURCE_LABEL[group.key]}
      <span aria-hidden="true" className={`h-1.5 w-1.5 rounded-full ${STATE_DOT[group.state]}`} />
      <span className="sr-only">{STATE_WORD[group.state]}</span>
    </span>
  );
}

/** The change against the previous equal window. Shown only when both numbers are real and the previous is above zero. */
export function Delta({
  current,
  previous,
  windowDays,
}: {
  current: number | string | null | undefined;
  previous: number | null | undefined;
  windowDays: WindowDays;
}) {
  if (
    windowDays === 1 ||
    typeof current !== "number" ||
    typeof previous !== "number" ||
    !Number.isFinite(current) ||
    previous <= 0
  )
    return null;
  const pct = Math.round(((current - previous) / previous) * 100);
  const tone = pct > 0 ? "text-ds-right-ink" : pct < 0 ? "text-ds-action-text" : "text-ds-ink-soft";
  return (
    <span data-delta="" className={`text-xs font-bold ${tone}`}>
      <span aria-hidden="true">{pct > 0 ? "▲" : pct < 0 ? "▼" : "•"}</span>
      <span className="sr-only">{pct > 0 ? "up" : pct < 0 ? "down" : "no change,"}</span>{" "}
      {pct === 0 ? null : <Figure value={Math.abs(pct)} kind="percent" reason="" />}{" "}
      <span className="font-semibold text-ds-ink-soft">vs previous {WINDOW_WORD[windowDays]}</span>
    </span>
  );
}

function RowsList({ tile }: { tile: Tile }) {
  if (!tile.rows) return null;
  const max = Math.max(...tile.rows.map((r) => r.value), 0);
  const bars = tile.rows.every((r) => !r.unit);
  return (
    <ul className="mt-1 grid gap-2">
      {tile.rows.map((r) => (
        <li key={r.label} className="grid gap-1 text-sm">
          <span className="flex justify-between gap-2">
            <span className="min-w-0 break-words font-semibold text-ds-ink">{r.label}</span>
            <b className="tabular-nums text-ds-ink">
              <Figure
                value={r.value}
                kind={r.unit === "%" ? "percent" : r.unit === "usd" ? "usd" : "number"}
                reason=""
              />
            </b>
          </span>
          {bars && max > 0 ? (
            <span
              aria-hidden="true"
              className="block h-1.5 overflow-hidden rounded-full bg-ds-sunk"
            >
              <i
                className="block h-full rounded-full bg-ds-choice"
                style={{ width: `${Math.max(2, (r.value / max) * 100)}%` }}
              />
            </span>
          ) : null}
        </li>
      ))}
    </ul>
  );
}

/** One number, its label, where it comes from, and (when real) its change. The value is always written by <Figure>. */
function Stat({
  group,
  tile,
  label,
  value,
  previousValue,
  windowDays,
  wide,
  children,
}: {
  group: NumbersGroup | undefined;
  tile: Tile | undefined;
  label?: string;
  /** Override the tile's own value (a derived number). */
  value?: number | null;
  /** With `value`: the previous window's value for the same derived number (absent means no change is shown). */
  previousValue?: number | null;
  windowDays: WindowDays;
  wide?: boolean;
  children?: ReactNode;
}) {
  const shown = value !== undefined ? value : (tile?.value ?? null);
  const missing = shown === null || (group !== undefined && group.state !== "ok");
  const hasRows = !!tile?.rows && group?.state === "ok";
  return (
    <div
      data-tile={tile?.id}
      className={`grid content-start gap-1.5 rounded-2xl border bg-ds-card p-4 ${
        missing && !hasRows ? "border-dashed border-ds-line" : "border-ds-line"
      } ${wide ? "sm:col-span-2 lg:col-span-4" : ""}`}
    >
      <div className="flex items-start justify-between gap-2">
        <p className="text-xs font-bold uppercase tracking-wider text-ds-ink-soft">
          {label ?? tile?.label}
        </p>
        <SourceBadge group={group} />
      </div>
      {hasRows ? (
        <RowsList tile={tile!} />
      ) : (
        <p className="font-display text-3xl font-bold leading-none text-ds-ink">
          <Figure
            value={group && group.state !== "ok" ? null : shown}
            kind={tile?.kind}
            reason={reasonFor(group, tile)}
          />
        </p>
      )}
      <p className="text-xs font-semibold text-ds-ink-faint">
        {group && group.state !== "ok" && tile?.reason ? `${tile.reason} · ` : ""}
        {tile?.note}
      </p>
      {!missing ? (
        <Delta
          current={shown}
          previous={value !== undefined ? previousValue : tile?.previous}
          windowDays={windowDays}
        />
      ) : null}
      {children}
    </div>
  );
}

/** "Add key": names the settings to set on the server, never a value. There is no key entry here, by design. */
function AddKey({ group }: { group: NumbersGroup }) {
  const [open, setOpen] = useState(false);
  if (group.state !== "not_connected" || !group.envNames || group.envNames.length === 0)
    return null;
  return (
    <div className="mt-2">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="min-h-11 rounded-full border border-ds-line bg-ds-card px-3 text-xs font-bold text-ds-ink hover:bg-ds-sunk"
      >
        Add key
      </button>
      {open ? (
        <p className="mt-2 text-xs text-ds-ink-soft">
          Set {group.envNames.length === 1 ? "this setting" : "these settings"} in the server
          environment, then press Refresh. Their values are never shown on this page:{" "}
          {group.envNames.map((n, i) => (
            <span key={n}>
              {i > 0 ? ", " : ""}
              <code className="font-mono font-semibold text-ds-ink">{n}</code>
            </span>
          ))}
        </p>
      ) : null}
    </div>
  );
}

function GroupHead({
  group,
  busy,
  onRetry,
}: {
  group: NumbersGroup;
  busy: boolean;
  onRetry: () => void;
}) {
  return (
    <div className="mt-4 flex flex-wrap items-center gap-2">
      <h3 className="text-sm font-bold text-ds-ink">{group.title}</h3>
      <span className="text-xs font-semibold text-ds-ink-faint">{SOURCE_LABEL[group.key]}</span>
      <span
        className={`rounded-lg px-2 py-0.5 text-[0.68rem] font-extrabold uppercase tracking-wide ${
          group.state === "ok"
            ? "bg-ds-right-tint text-ds-right-ink"
            : group.state === "error"
              ? "bg-ds-wrong-tint text-ds-wrong-ink"
              : "border border-ds-line bg-ds-sunk text-ds-ink-soft"
        }`}
      >
        {STATE_WORD[group.state]}
      </span>
      {group.state === "error" ? (
        <button
          type="button"
          onClick={onRetry}
          disabled={busy}
          className="min-h-11 rounded-full border border-ds-line bg-ds-card px-3 text-xs font-bold text-ds-ink hover:bg-ds-sunk disabled:opacity-50"
        >
          Try again
        </button>
      ) : null}
    </div>
  );
}

const GRID = "mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4";

/** Which groups feed which section, so a group the server did not send (no scope) simply has no section. */
const MONEY_GROUPS: GroupKey[] = ["aicost", "revenuecat", "appstore", "googleplay"];

function Skeleton() {
  return (
    <div aria-busy="true" aria-label="Loading the numbers" className="mt-8 grid gap-3">
      {[0, 1, 2].map((i) => (
        <div key={i} className="h-24 rounded-2xl border border-ds-line bg-ds-sunk" />
      ))}
    </div>
  );
}

/**
 * Numbers. Every figure is written by <Figure> from what the server returned for THIS person's scopes: a group they may
 * not see (Money without numbers.revenue) was never sent, so it has no section. A provider with no key says "Not
 * connected" and names the setting to add; a read that failed says "Could not load"; nothing is ever shown as 0 unless
 * the source answered 0. Changes are against the previous equal window and appear only when both numbers are real.
 */
export function NumbersScreen({ api }: { me: NumbersMe; api: NumbersApi }) {
  const [windowDays, setWindowDays] = useState<WindowDays>(7);
  const [data, setData] = useState<NumbersResponse | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const latest = useRef(0);

  async function load(w: WindowDays, refresh: boolean) {
    const mine = ++latest.current;
    setBusy(true);
    setError(null);
    try {
      const result = await api.get(w, refresh);
      if (mine === latest.current) setData(result);
    } catch (e) {
      if (mine === latest.current)
        setError(e instanceof Error && e.message ? e.message : "Could not read the numbers.");
    } finally {
      if (mine === latest.current) setBusy(false);
    }
  }

  useEffect(() => {
    void load(7, false);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once per page load
  }, []);

  const groups = data?.groups ?? [];
  const own = find(groups, "own");
  const sentry = find(groups, "sentry");
  const posthog = find(groups, "posthog");
  const money = MONEY_GROUPS.map((k) => find(groups, k)).filter(
    (g): g is NumbersGroup => g !== undefined,
  );
  const sections = [
    own || posthog ? "Growth" : null,
    own ? "Learning" : null,
    own || sentry ? "App health" : null,
    money.length > 0 ? "Money" : null,
  ].filter((s): s is string => s !== null);

  // Avg lessons per active learner: derived from two real numbers, and only when both were read and learners > 0.
  const lessonsTile = tileOf(own, "lessons");
  const activeTile = tileOf(own, "active_window");
  const avgLessons =
    own?.state === "ok" &&
    typeof lessonsTile?.value === "number" &&
    typeof activeTile?.value === "number" &&
    activeTile.value > 0
      ? Math.round((lessonsTile.value / activeTile.value) * 10) / 10
      : null;
  // The previous window's average is derived the same way from the two previous counts (never the raw previous lessons).
  const avgLessonsPrev =
    typeof lessonsTile?.previous === "number" &&
    typeof activeTile?.previous === "number" &&
    lessonsTile.previous > 0 &&
    activeTile.previous > 0
      ? lessonsTile.previous / activeTile.previous
      : null;

  const generated = data
    ? new Date(data.generatedAt).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })
    : null;
  const series = tileOf(own, "dau_series");
  const hasChart = own?.state === "ok" && !!series?.series && series.series.length >= 2;
  const retry = () => void load(windowDays, true);

  return (
    <main className="mx-auto max-w-[72rem] p-4 sm:p-6" aria-busy={busy}>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-ds-ink-faint">
            {generated ? `As of ${generated} · your timezone` : "Loading"}
          </p>
          <h1 className="mt-1 font-display text-2xl font-semibold text-ds-ink">Numbers</h1>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div
            role="group"
            aria-label="Window"
            className="inline-flex overflow-hidden rounded-xl border border-ds-line bg-ds-card"
          >
            {WINDOW_CHOICES.map((w) => (
              <button
                key={w}
                type="button"
                aria-pressed={windowDays === w}
                onClick={() => {
                  setWindowDays(w);
                  setData(null);
                  void load(w, false);
                }}
                className={`min-h-11 px-3 text-sm font-semibold ${
                  windowDays === w ? "bg-ds-brand text-ds-on-hero" : "text-ds-ink-soft"
                }`}
              >
                {WINDOW_WORD[w]}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={() => void load(windowDays, true)}
            disabled={busy}
            className="min-h-11 rounded-xl border border-ds-line bg-ds-card px-4 text-sm font-bold text-ds-ink hover:bg-ds-sunk disabled:opacity-50"
          >
            Refresh
          </button>
        </div>
      </div>

      {data && sections.length > 0 ? (
        <p className="mt-4 rounded-xl border border-ds-line bg-ds-sunk px-3 py-2 text-xs font-semibold text-ds-ink-soft">
          You see {sections.join(", ")}.{money.length > 0 ? " Money is owner-only." : ""} Totals
          only, no personal data. A figure that cannot be read says so; it is never shown as 0.
        </p>
      ) : null}

      {error ? (
        <p role="alert" className="mt-4 text-sm font-semibold text-ds-wrong-ink">
          {error}{" "}
          <button
            type="button"
            onClick={() => void load(windowDays, false)}
            className="min-h-11 font-bold underline"
          >
            Try again
          </button>
        </p>
      ) : null}

      {!data && !error ? <Skeleton /> : null}

      {data && own ? (
        <>
          <Slab title="Growth" />
          {own.state !== "ok" ? <GroupHead group={own} busy={busy} onRetry={retry} /> : null}
          {hasChart ? (
            <section
              aria-label="Active learners per day"
              className="mt-3 rounded-2xl border border-ds-line bg-ds-card p-4"
            >
              <div className="flex items-start justify-between gap-2">
                <p className="text-xs font-bold uppercase tracking-wider text-ds-ink-soft">
                  Active learners per day
                </p>
                <SourceBadge group={own} />
              </div>
              <DauChart series={series!.series!} />
            </section>
          ) : (
            <Stat group={own} tile={series} windowDays={windowDays} wide />
          )}
          <div className={GRID}>
            <Stat group={own} tile={tileOf(own, "new_window")} windowDays={windowDays} />
            {windowDays !== 1 ? (
              <Stat group={own} tile={tileOf(own, "new_today")} windowDays={windowDays} />
            ) : null}
            <Stat
              group={own}
              tile={tileOf(own, "dau")}
              label="Active today"
              windowDays={windowDays}
            />
            <Stat group={own} tile={activeTile} windowDays={windowDays} />
            <Stat group={own} tile={tileOf(own, "ret_d1")} windowDays={windowDays} />
            <Stat group={own} tile={tileOf(own, "ret_d7")} windowDays={windowDays} />
            <Stat group={own} tile={tileOf(own, "ret_d30")} windowDays={windowDays} />
            <Stat group={own} tile={tileOf(own, "reactivated")} windowDays={windowDays} />
          </div>
          {posthog ? (
            <>
              <GroupHead group={posthog} busy={busy} onRetry={retry} />
              <div className={GRID}>
                {posthog.tiles.map((t) => (
                  <Stat key={t.id} group={posthog} tile={t} windowDays={windowDays} />
                ))}
              </div>
              <AddKey group={posthog} />
            </>
          ) : null}

          <Slab title="Learning" />
          <div className={GRID}>
            <Stat group={own} tile={lessonsTile} windowDays={windowDays} />
            <Stat group={own} tile={tileOf(own, "stories")} windowDays={windowDays} />
            <Stat
              group={own}
              tile={lessonsTile}
              label="Lessons per active learner"
              value={avgLessons}
              previousValue={avgLessonsPrev}
              windowDays={windowDays}
            />
            <Stat group={own} tile={tileOf(own, "perfect")} windowDays={windowDays} />
            <Stat group={own} tile={tileOf(own, "by_course")} windowDays={windowDays} wide />
            <Stat group={own} tile={tileOf(own, "practice")} windowDays={windowDays} />
            <Stat group={own} tile={tileOf(own, "podcasts")} windowDays={windowDays} />
            <Stat group={own} tile={tileOf(own, "avg_streak")} windowDays={windowDays} />
          </div>
        </>
      ) : null}

      {data && (own || sentry) ? (
        <>
          <Slab title="App health" />
          {sentry ? (
            <>
              <GroupHead group={sentry} busy={busy} onRetry={retry} />
              <div className={GRID}>
                {sentry.tiles.map((t) => (
                  <Stat key={t.id} group={sentry} tile={t} windowDays={windowDays} wide={false} />
                ))}
              </div>
              <AddKey group={sentry} />
            </>
          ) : null}
          {own ? (
            <div className={GRID}>
              <Stat group={own} tile={tileOf(own, "open")} windowDays={windowDays} />
              <Stat group={own} tile={tileOf(own, "ai_calls")} windowDays={windowDays} />
            </div>
          ) : null}
        </>
      ) : null}

      {data && money.length > 0 ? (
        <>
          <Slab
            title="Money"
            aside={
              <span className="rounded-full bg-ds-action-tint px-2 py-0.5 text-xs font-extrabold uppercase text-ds-action-text">
                Owner only
              </span>
            }
          />
          {money.map((g) => (
            <section key={g.key} aria-label={g.title} data-group={g.key} data-state={g.state}>
              <GroupHead group={g} busy={busy} onRetry={retry} />
              <div className={GRID}>
                {g.tiles.map((t) => (
                  <Stat key={t.id} group={g} tile={t} windowDays={windowDays} />
                ))}
              </div>
              <AddKey group={g} />
            </section>
          ))}
        </>
      ) : null}
    </main>
  );
}
