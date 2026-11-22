import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  deriveBanner,
  type Banner,
  type HealthData,
  type ServiceRow,
  type ServiceState,
  type Uptime,
} from "../../../lib/health-core";
import { waitingLabel } from "../../../lib/console-format";
import { opsEventLabel, thresholdFor, type OpsStatus } from "../../../lib/ops-events-config";
import { ConsoleCard } from "../../staff/ConsoleCard";
import { Figure } from "../Figure";
import { useNow } from "../useNow";
import type { HealthApi } from "./healthApi";

const DOT: Record<ServiceState, string> = {
  healthy: "bg-ds-right",
  degraded: "bg-ds-action",
  configured: "bg-ds-choice",
  not_connected: "bg-ds-ink-faint",
  unknown: "bg-ds-ink-faint",
};
const BADGE: Record<ServiceState, { word: string; cls: string }> = {
  healthy: { word: "Healthy", cls: "bg-ds-right-tint text-ds-right-ink" },
  degraded: { word: "Degraded", cls: "bg-ds-action-tint text-ds-action-text" },
  configured: { word: "Configured", cls: "border border-ds-line bg-ds-sunk text-ds-ink" },
  not_connected: {
    word: "Not connected",
    cls: "border border-ds-line bg-ds-sunk text-ds-ink-soft",
  },
  unknown: { word: "Unknown", cls: "border border-ds-line bg-ds-sunk text-ds-ink-soft" },
};
const OPS_PILL: Record<OpsStatus, { text: string; cls: string }> = {
  green: { text: "OK", cls: "bg-ds-right-tint text-ds-right-ink" },
  amber: { text: "Watch", cls: "border border-ds-line bg-ds-sunk text-ds-ink" },
  red: { text: "Act", cls: "bg-ds-wrong-tint text-ds-wrong-ink" },
};
const BAR: Record<"up" | "partial" | "down" | "nodata", string> = {
  up: "bg-ds-right",
  partial: "bg-ds-action",
  down: "bg-ds-wrong",
  nodata: "bg-ds-sunk",
};
const BAR_WORD = { up: "up", partial: "partly down", down: "down", nodata: "no data" } as const;

/** "3m ago", or "just now" under a minute. Null when the time is unusable or the clock is not known yet. */
function agoWords(iso: string | null, now: number | null): string | null {
  if (!iso || now === null) return null;
  const label = waitingLabel(iso, now);
  if (label === null) return null;
  return label === "<1m" ? "just now" : `${label} ago`;
}

const whenOf = (iso: string | null) => (iso ? new Date(iso).toLocaleString() : "never");
const dayOf = (iso: string) =>
  new Date(iso).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });

function Slab({ title }: { title: string }) {
  return (
    <div className="mt-8 flex items-center gap-3">
      <h2 className="font-display text-sm font-extrabold uppercase tracking-[0.14em] text-ds-ink-soft">
        {title}
      </h2>
      <span aria-hidden="true" className="h-px flex-1 bg-ds-line" />
    </div>
  );
}

/** The one-line verdict. It never says everything is fine while any row is unknown or not connected. */
function StatusBanner({ banner, services }: { banner: Banner; services: ServiceRow[] }) {
  const tone =
    banner.kind === "degraded"
      ? "border-ds-action bg-ds-action-tint text-ds-ink"
      : banner.kind === "ok" && banner.configuredOnly === 0
        ? "border-ds-line bg-ds-right-tint text-ds-ink"
        : "border-ds-line bg-ds-sunk text-ds-ink";
  const configuredOnly = banner.kind === "degraded" ? 0 : banner.configuredOnly;
  let title: ReactNode;
  let sub: ReactNode;
  if (banner.kind === "degraded") {
    title = (
      <>
        <Figure value={banner.degraded} reason="" />{" "}
        {banner.degraded === 1 ? "service" : "services"} degraded
      </>
    );
    sub = (
      <>
        {services
          .filter((s) => s.state === "degraded")
          .map((s) => s.name)
          .join(", ")}
        .
        {banner.unchecked > 0 ? (
          <>
            {" "}
            <Figure value={banner.unchecked} reason="" /> could not be checked.
          </>
        ) : null}
      </>
    );
  } else if (banner.kind === "unchecked") {
    title = (
      <>
        No problems found, but <Figure value={banner.unchecked} reason="" />{" "}
        {banner.unchecked === 1 ? "service" : "services"} could not be checked
      </>
    );
    sub = "They show as Unknown or Not connected below. Nothing is assumed to be fine.";
  } else {
    title = "Everything that was checked is healthy";
    sub = "Each service below was read just now.";
  }
  return (
    <div
      role="status"
      data-banner={banner.kind}
      className={`mt-5 flex items-start gap-3 rounded-2xl border p-4 ${tone}`}
    >
      <div className="min-w-0">
        <p className="font-display text-lg font-bold">{title}</p>
        <p className="mt-0.5 text-sm text-ds-ink-soft">
          {sub}
          {configuredOnly > 0
            ? " Services marked Configured have their key set, but nothing tests them live."
            : ""}
        </p>
      </div>
    </div>
  );
}

function ServiceLine({ s, now }: { s: ServiceRow; now: number | null }) {
  const badge = BADGE[s.state];
  const lastRun = s.jobs ? agoWords(s.jobs.lastRunAt, now) : null;
  return (
    <li
      data-service={s.key}
      data-state={s.state}
      className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-ds-line px-4 py-3 last:border-0"
    >
      <span aria-hidden="true" className={`h-2.5 w-2.5 flex-none rounded-full ${DOT[s.state]}`} />
      <div className="min-w-0 flex-1 basis-40">
        <p className="font-bold text-ds-ink">{s.name}</p>
        {s.detail ? <p className="break-words text-xs text-ds-ink-soft">{s.detail}</p> : null}
        {s.state !== "healthy" && s.reason ? (
          <p className="break-words text-xs font-semibold text-ds-ink-soft">{s.reason}</p>
        ) : null}
      </div>
      <div className="flex items-center gap-3 text-sm">
        {s.key === "jobs" ? (
          <span className="text-right text-xs text-ds-ink-soft">
            <Figure
              value={lastRun}
              reason="No run on record"
              className="block font-semibold text-ds-ink"
            />
            {s.jobs && s.state !== "unknown" ? (
              <span>
                <Figure value={s.jobs.failed24h} reason="" /> failed in 24 h
              </span>
            ) : null}
          </span>
        ) : s.state === "healthy" ? (
          <span className="text-right text-xs text-ds-ink-soft">
            <Figure
              value={s.latencyMs === null ? null : `${s.latencyMs} ms`}
              reason="Healthy"
              className="block font-semibold text-ds-ink"
            />
            <span>just now</span>
          </span>
        ) : null}
        <span
          className={`rounded-lg px-2 py-0.5 text-xs font-extrabold uppercase tracking-wide ${badge.cls}`}
        >
          {badge.word}
        </span>
      </div>
    </li>
  );
}

function UptimeCard({ service, uptime }: { service: ServiceRow; uptime: Uptime | null }) {
  return (
    <ConsoleCard>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="text-xs font-bold uppercase tracking-wider text-ds-ink-soft">
          {service.key === "auth" ? "Auth data (database read)" : service.name} · last 90 days
        </span>
        <span className="font-display text-xl font-bold text-ds-ink">
          <Figure
            value={uptime?.percent ?? null}
            kind="percent"
            reason={uptime ? "No data yet" : "Could not read"}
          />
        </span>
      </div>
      {uptime ? (
        <>
          <div
            role="img"
            aria-label={`${service.name} uptime, one bar per day, oldest first`}
            data-uptime={service.key}
            className="flex h-9 items-stretch gap-px"
          >
            {uptime.bars.map((b) => (
              <i
                key={b.day}
                data-bar={b.state}
                title={`${b.day}: ${BAR_WORD[b.state]}`}
                className={`block min-w-0 flex-1 rounded-[1px] ${BAR[b.state]}`}
              />
            ))}
          </div>
          <div className="flex flex-wrap justify-between gap-2 text-xs font-semibold text-ds-ink-faint">
            <span>90 days ago</span>
            <span>today</span>
          </div>
          <p className="text-xs text-ds-ink-soft">
            {uptime.firstAt ? (
              <>
                Collecting since {dayOf(uptime.firstAt)}. Grey days have no checks and are left out
                of the percentage (<Figure value={uptime.daysWithData} reason="" /> with data).
              </>
            ) : (
              "No checks recorded yet. The first one is written by the next maintenance run."
            )}
          </p>
        </>
      ) : (
        <p className="text-sm font-semibold text-ds-ink-soft">Could not read the history.</p>
      )}
    </ConsoleCard>
  );
}

function Events({ data }: { data: HealthData }) {
  if (data.opsError || !data.ops)
    return (
      <p role="alert" className="mt-3 text-sm font-semibold text-ds-wrong-ink">
        {data.opsError ?? "Could not read the events."}
      </p>
    );
  const { events, latest } = data.ops;
  return (
    <>
      <ul data-events="" className="mt-3 grid gap-2">
        {events.map((e) => (
          <li
            key={e.event}
            className="grid gap-1 rounded-2xl border border-ds-line bg-ds-card px-3.5 py-3"
          >
            <div className="flex items-center justify-between gap-2">
              <span className="min-w-0">
                <span className="text-sm font-bold text-ds-ink">{opsEventLabel(e.event)}</span>{" "}
                <code className="break-all text-xs text-ds-ink-faint">{e.event}</code>
              </span>
              <span
                className={`flex-none rounded-full px-2.5 py-0.5 text-xs font-bold ${OPS_PILL[e.status].cls}`}
              >
                {OPS_PILL[e.status].text}
              </span>
            </div>
            <p className="text-xs text-ds-ink-soft">
              24 h: <Figure value={e.count24h} reason="" /> · 7 d:{" "}
              <Figure value={e.count7d} reason="" /> · last: {whenOf(e.lastAt)} · watch at{" "}
              <Figure value={thresholdFor(e.event).amberAt} reason="" />, act at{" "}
              <Figure value={thresholdFor(e.event).redAt} reason="" /> per day
            </p>
          </li>
        ))}
      </ul>
      <h3 className="mt-6 text-sm font-bold text-ds-ink">Latest events</h3>
      {latest.length === 0 ? (
        <p className="mt-2 text-sm text-ds-ink-soft">Nothing recorded.</p>
      ) : (
        <ul data-latest="" className="mt-2 grid gap-2">
          {latest.map((r) => (
            <li
              key={r.id}
              className="grid gap-0.5 rounded-xl border border-ds-line bg-ds-card px-3.5 py-2.5 text-xs md:grid-cols-[11rem_1fr_6rem] md:items-start md:gap-3"
            >
              <span className="text-ds-ink-soft">{whenOf(r.createdAt)}</span>
              <span className="min-w-0 break-words">
                <b className="text-ds-ink">{r.event}</b> · {r.source}
                {r.userId ? <> · learner {r.userId.slice(0, 8)}</> : null}
                <code className="mt-0.5 block break-all text-ds-ink-soft">
                  {JSON.stringify(r.detail)}
                </code>
              </span>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

function Skeleton() {
  return (
    <div aria-busy="true" aria-label="Running the checks" className="mt-6 grid gap-3">
      {[0, 1, 2].map((i) => (
        <div key={i} className="h-20 rounded-2xl border border-ds-line bg-ds-sunk" />
      ))}
    </div>
  );
}

/**
 * Health. Every row is a real reading: the database and auth are probed live with a timeout (a probe that does not
 * answer is DEGRADED with its reason, never left out), the background jobs come from the job log, the AI provider and
 * payments say whether their key is set. A row with no reading is grey (Unknown, Not connected) and the banner never
 * calls the system fine while one exists. Uptime bars come from the checks the maintenance run stores: a day with no
 * check is grey, never green, and the percentage counts only days that have data.
 */
export function HealthScreen({ api }: { api: HealthApi }) {
  const [data, setData] = useState<HealthData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const latest = useRef(0);
  const now = useNow(30_000);

  async function load() {
    const mine = ++latest.current;
    setBusy(true);
    setError(null);
    try {
      const result = await api.get();
      if (mine === latest.current) setData(result);
    } catch (e) {
      if (mine === latest.current)
        setError(e instanceof Error && e.message ? e.message : "Could not run the checks.");
    } finally {
      if (mine === latest.current) setBusy(false);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once per page load
  }, []);

  const checked = data ? agoWords(data.checkedAt, now) : null;
  const withUptime = data?.services.filter((s) => s.key === "database" || s.key === "auth") ?? [];

  return (
    <main className="mx-auto max-w-[72rem] p-4 sm:p-6" aria-busy={busy}>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-ds-ink-faint">
            {data ? `System · checked ${checked ?? "just now"}` : "System"}
          </p>
          <h1 className="mt-1 font-display text-2xl font-semibold text-ds-ink">Health</h1>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          disabled={busy}
          className="min-h-11 rounded-xl border border-ds-line bg-ds-card px-4 text-sm font-bold text-ds-ink hover:bg-ds-sunk disabled:opacity-50"
        >
          Re-run checks
        </button>
      </div>

      {error ? (
        <p role="alert" className="mt-4 text-sm font-semibold text-ds-wrong-ink">
          {error}
        </p>
      ) : null}
      {!data && !error ? <Skeleton /> : null}

      {data ? (
        <>
          <StatusBanner banner={deriveBanner(data.services)} services={data.services} />

          <Slab title="Services" />
          <ul className="mt-3 overflow-hidden rounded-2xl border border-ds-line bg-ds-card">
            {data.services.map((s) => (
              <ServiceLine key={s.key} s={s} now={now} />
            ))}
          </ul>

          <Slab title="Uptime" />
          <div className="mt-3 grid gap-3 lg:grid-cols-2">
            {withUptime.map((s) => (
              <UptimeCard key={s.key} service={s} uptime={s.uptime} />
            ))}
          </div>

          <Slab title="Events" />
          <Events data={data} />
          <p data-footnote="website" className="mt-8 text-xs text-ds-ink-faint">
            The learner website&apos;s health is tracked by the deploy pipeline, not probed here.
          </p>
        </>
      ) : null}
    </main>
  );
}
