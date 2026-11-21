import { useEffect, useState, type ReactNode } from "react";
import type { HomeMetrics, HomeRange, MoneyTile } from "../../../lib/staff-home.functions";
import { ageLabel } from "../../../lib/support-inbox-copy";
import { auditSentence, auditTone } from "../../../lib/audit-labels";
import { greetingWord, waitingLabel } from "../../../lib/console-format";
import { opsEventLabel } from "../../../lib/ops-events-config";
import { Figure } from "../Figure";
import { useNow } from "../useNow";
import { QueueCard } from "./QueueCard";
import { TicketDrawer } from "./TicketDrawer";
import type { HomeApi, HomeData } from "./homeApi";

export type HomeMe = { displayName: string | null; scopes: readonly string[] };

const RANGES: { key: HomeRange; label: string }[] = [
  { key: "today", label: "Today" },
  { key: "7", label: "7 days" },
  { key: "30", label: "30 days" },
];
const RANGE_NOTE: Record<HomeRange, string> = {
  today: "today (UTC)",
  "7": "last 7 days",
  "30": "last 30 days",
};

function Card({
  title,
  aside,
  children,
}: {
  title: string;
  aside?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section
      aria-label={title}
      className="overflow-hidden rounded-2xl border border-ds-line bg-ds-card"
    >
      <div className="flex items-center justify-between gap-2 border-b border-ds-line px-4 py-3">
        <h2 className="text-sm font-bold text-ds-ink">{title}</h2>
        {aside}
      </div>
      {children}
    </section>
  );
}

function Metric({ title, children, sub }: { title: string; children: ReactNode; sub?: ReactNode }) {
  return (
    <div
      data-metric={title}
      className="grid content-start gap-2 rounded-2xl border border-ds-line bg-ds-card p-4"
    >
      <p className="text-xs font-bold uppercase tracking-wider text-ds-ink-soft">{title}</p>
      <p className="font-display text-3xl font-bold leading-none text-ds-ink">{children}</p>
      {sub ? <p className="text-xs font-semibold text-ds-ink-soft">{sub}</p> : null}
    </div>
  );
}

const DOT: Record<string, string> = {
  green: "bg-ds-right",
  amber: "bg-ds-action",
  red: "bg-ds-wrong",
  bad: "bg-ds-wrong",
  warn: "bg-ds-action",
  info: "bg-ds-choice",
};
const DOT_WORD: Record<string, string> = { green: "fine", amber: "watch", red: "problem" };

/**
 * The console Home. Every figure on it comes from a real read the route made (or this screen makes on demand) and is
 * written through <Figure>: no value means the reason, never a sample and never a 0. A card the person's scopes do not
 * allow is omitted; a card whose read failed says so. Nothing here is live: it is read when the page loads, and the
 * range buttons and the queue tabs read again.
 */
export function HomeScreen({ me, data, api }: { me: HomeMe; data: HomeData; api: HomeApi }) {
  const has = (s: string) => me.scopes.includes(s);
  const now = useNow(30_000);
  const [range, setRange] = useState<HomeRange>("today");
  const [metrics, setMetrics] = useState<HomeMetrics | null | undefined>(data.metrics);
  const [metricsBusy, setMetricsBusy] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [money, setMoney] = useState<
    { state: "loading" } | { state: "error" } | { state: "ok"; tiles: MoneyTile[] }
  >({ state: "loading" });

  useEffect(() => {
    if (!has("numbers.revenue")) return;
    let live = true;
    api
      .money()
      .then((r) => live && setMoney({ state: "ok", tiles: r.tiles }))
      .catch(() => live && setMoney({ state: "error" }));
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once per page load
  }, []);

  async function pickRange(next: HomeRange) {
    setRange(next);
    setMetricsBusy(true);
    try {
      setMetrics(await api.metrics(next));
    } catch {
      setMetrics(null);
    } finally {
      setMetricsBusy(false);
    }
  }

  const queue = data.queue;
  const counts = queue?.counts ?? null;
  const redOrAmber = (data.health?.events ?? []).filter((e) => e.status !== "green");
  const oldest = now === null ? null : waitingLabel(counts?.oldestWaitingSince ?? null, now);

  // The attention banner: only what the real reads say. If a read failed it says it could not check, never "all clear".
  const items: { key: string; text: ReactNode; href: string }[] = [];
  if (has("support.read") && oldest && counts?.oldestWaitingSince) {
    items.push({
      key: "oldest",
      href: "/support",
      text: <>The oldest ticket has waited {oldest} for a reply</>,
    });
  }
  if (
    has("support.read") &&
    counts &&
    typeof counts.breaching === "number" &&
    counts.breaching > 0
  ) {
    items.push({
      key: "breaching",
      href: "/support",
      text: (
        <>
          <Figure value={counts.breaching} reason="" />{" "}
          {counts.breaching === 1 ? "ticket is" : "tickets are"} breaching
        </>
      ),
    });
  }
  for (const e of redOrAmber) {
    items.push({
      key: `health-${e.event}`,
      href: "/health",
      text: (
        <>
          {opsEventLabel(e.event)}: <Figure value={e.count24h} reason="" /> in 24 h (
          {e.status === "red" ? "problem" : "watch"})
        </>
      ),
    });
  }
  const failures = [
    has("support.read") && data.queue === null ? "the support queue" : null,
    has("numbers.read") && data.health === null ? "system health" : null,
  ].filter((v): v is string => v !== null);
  for (const f of failures) {
    items.push({ key: `fail-${f}`, href: "/", text: <>Could not check {f}</> });
  }

  const greetName = me.displayName?.trim();
  const hour = now === null ? null : new Date(now).getHours();
  const dateText =
    now === null
      ? ""
      : new Date(now).toLocaleDateString("en-GB", {
          weekday: "long",
          day: "numeric",
          month: "long",
        });
  const updated =
    now === null
      ? null
      : new Date(metrics?.generatedAt ?? data.loadedAt).toLocaleTimeString("en-GB", {
          hour: "2-digit",
          minute: "2-digit",
        });

  return (
    <main className="mx-auto max-w-[72rem] p-4 sm:p-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-ds-ink-faint">
            {dateText}
            {updated ? ` · updated ${updated}` : ""}
          </p>
          <h1 className="mt-1 font-display text-2xl font-semibold text-ds-ink">
            {hour === null ? "Hello" : greetingWord(hour)}
            {greetName ? `, ${greetName}` : ""}
          </h1>
        </div>
        {has("numbers.read") ? (
          <div
            role="group"
            aria-label="Range"
            className="inline-flex overflow-hidden rounded-xl border border-ds-line bg-ds-card"
          >
            {RANGES.map((r) => (
              <button
                key={r.key}
                type="button"
                aria-pressed={range === r.key}
                onClick={() => void pickRange(r.key)}
                className={`min-h-11 px-3 text-sm font-semibold ${
                  range === r.key ? "bg-ds-brand text-ds-on-hero" : "text-ds-ink-soft"
                }`}
              >
                {r.label}
              </button>
            ))}
          </div>
        ) : null}
      </div>

      {items.length > 0 ? (
        <section
          aria-label="Needs attention"
          className="mt-4 rounded-2xl border border-ds-action bg-ds-action-tint p-4"
        >
          <h2 className="text-sm font-extrabold text-ds-action-text">Needs attention</h2>
          <ul className="mt-2 flex flex-wrap gap-2">
            {items.map((i) => (
              <li key={i.key}>
                <a
                  href={i.href}
                  className="inline-flex min-h-9 items-center rounded-full border border-ds-action bg-ds-card px-3 text-sm font-semibold text-ds-ink"
                >
                  {i.text}
                </a>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <div
        className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4"
        aria-busy={metricsBusy}
      >
        {has("support.read") ? (
          <Metric
            title="Open tickets"
            sub={
              counts ? (
                <>
                  <Figure value={counts.openUnassigned} reason="" /> unassigned
                  {oldest ? <> · oldest {oldest}</> : null}
                </>
              ) : null
            }
          >
            <Figure value={counts?.open} reason="Could not read" />
          </Metric>
        ) : null}
        {has("numbers.read") ? (
          <>
            <Metric title="New learners" sub={RANGE_NOTE[range]}>
              <Figure value={metrics?.newLearners} reason="Could not read" />
            </Metric>
            <Metric title="Lessons done" sub={RANGE_NOTE[range]}>
              <Figure value={metrics?.lessons} reason="Could not read" />
            </Metric>
            <Metric title="Active today" sub="learners with activity today (UTC)">
              <Figure value={metrics?.activeToday} reason="Could not read" />
            </Metric>
          </>
        ) : null}
      </div>

      <div className="mt-5 grid grid-cols-1 gap-4 lg:grid-cols-[1.5fr_1fr]">
        {has("support.read") ? (
          <QueueCard
            initial={queue ?? null}
            api={api}
            now={now}
            onOpen={setOpenId}
            refreshKey={refreshKey}
          />
        ) : null}
        <div className="grid content-start gap-4">
          {has("audit.read") ? (
            <Card title="Just happened">
              {data.feed === null || data.feed === undefined ? (
                <p className="p-4 text-sm font-semibold text-ds-wrong-ink">
                  Could not read the action record.
                </p>
              ) : data.feed.rows.length === 0 ? (
                <p className="p-4 text-sm text-ds-ink-faint">Nothing recorded yet.</p>
              ) : (
                <ul className="max-h-80 overflow-auto">
                  {data.feed.rows.map((r) => (
                    <li
                      key={r.id}
                      className="flex gap-3 border-b border-ds-line px-4 py-3 text-sm last:border-0"
                    >
                      <span
                        aria-hidden="true"
                        className={`mt-1.5 h-2 w-2 flex-none rounded-full ${DOT[auditTone(r.action)]}`}
                      />
                      <span>
                        <span className="text-ds-ink">
                          <b>{r.actorName ?? "Someone"}</b> {auditSentence(r.action)}
                        </span>
                        <span className="block text-xs text-ds-ink-faint">
                          {ageLabel(r.at, now ?? Date.parse(data.loadedAt))}
                        </span>
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          ) : null}
          {has("numbers.revenue") ? (
            <Card
              title="Money"
              aside={
                <span className="rounded-full bg-ds-action-tint px-2 py-0.5 text-xs font-extrabold uppercase text-ds-action-text">
                  Owner only
                </span>
              }
            >
              {money.state === "loading" ? (
                <p className="p-4 text-sm text-ds-ink-soft">Loading…</p>
              ) : money.state === "error" ? (
                <p className="p-4 text-sm font-semibold text-ds-wrong-ink">
                  Could not read the money numbers.
                </p>
              ) : (
                <ul>
                  {money.tiles.map((t) => (
                    <li
                      key={t.id}
                      className="flex items-center justify-between gap-3 border-b border-ds-line px-4 py-3 text-sm last:border-0"
                    >
                      <span className="font-semibold text-ds-ink-soft">{t.label}</span>
                      <Figure
                        value={t.value}
                        kind={t.kind}
                        reason={
                          t.state === "not_connected"
                            ? (t.reason ?? "Not connected")
                            : (t.reason ?? "Could not read")
                        }
                        className="text-right font-display font-bold"
                      />
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          ) : null}
          {has("numbers.read") ? (
            <Card
              title="System health"
              aside={
                <a href="/health" className="text-xs font-semibold text-ds-choice">
                  Open health
                </a>
              }
            >
              {data.health === null || data.health === undefined ? (
                <p className="p-4 text-sm font-semibold text-ds-wrong-ink">
                  Could not read system health.
                </p>
              ) : (
                <ul className="flex flex-wrap gap-x-4 gap-y-2 p-4">
                  {data.health.events.map((e) => (
                    <li
                      key={e.event}
                      className="inline-flex items-center gap-2 text-sm font-semibold text-ds-ink"
                    >
                      <span
                        aria-hidden="true"
                        className={`h-2 w-2 flex-none rounded-full ${DOT[e.status]}`}
                      />
                      <span>
                        {opsEventLabel(e.event)}:{" "}
                        {e.count24h === 0 ? (
                          "no failures in 24 h"
                        ) : (
                          <>
                            <Figure value={e.count24h} reason="" />{" "}
                            {e.count24h === 1 ? "failure" : "failures"} in 24 h
                          </>
                        )}
                      </span>
                      <span className="sr-only"> {DOT_WORD[e.status]}</span>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          ) : null}
        </div>
      </div>

      {openId ? (
        <TicketDrawer
          ticketId={openId}
          scopes={me.scopes}
          api={api}
          onClose={() => setOpenId(null)}
          onChanged={() => setRefreshKey((k) => k + 1)}
        />
      ) : null}
    </main>
  );
}
