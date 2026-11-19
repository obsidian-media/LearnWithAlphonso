import { thresholdFor, type OpsStatus } from "../../lib/ops-events-config";
import type { OpsHealth } from "../../lib/staff-health.functions";

const PILL: Record<OpsStatus, { text: string; cls: string }> = {
  green: { text: "OK", cls: "bg-ds-right-tint text-ds-right-ink" },
  amber: { text: "Watch", cls: "border border-ds-line bg-ds-sunk text-ds-ink" },
  red: { text: "Act", cls: "bg-ds-wrong-tint text-ds-wrong-ink" },
};

const when = (iso: string | null) => (iso ? new Date(iso).toLocaleString() : "never");

export function SystemHealthView({
  data,
  error,
}: {
  data: OpsHealth | null;
  error: string | null;
}) {
  return (
    <div className="grid gap-4">
      <h1 className="font-display text-2xl font-semibold text-ds-ink">System health</h1>
      <p className="ds-type-footnote text-ds-ink-soft">
        Server-side failures that used to be only log lines. Ids and codes only, no learner content.
      </p>
      {error ? (
        <p role="alert" className="text-sm font-bold text-ds-wrong-ink">
          {error}
        </p>
      ) : null}
      {!data && !error ? <p className="text-sm text-ds-ink-soft">Loading...</p> : null}
      {data ? (
        <>
          <ul className="grid gap-2">
            {data.events.map((e) => (
              <li
                key={e.event}
                className="grid gap-1 rounded-2xl border border-ds-line bg-ds-card px-3.5 py-3"
              >
                <div className="flex items-center justify-between gap-2">
                  <code className="text-sm font-bold text-ds-ink">{e.event}</code>
                  <span
                    className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${PILL[e.status].cls}`}
                  >
                    {PILL[e.status].text}
                  </span>
                </div>
                <p className="ds-type-footnote text-ds-ink-soft">
                  24 h: {e.count24h} · 7 d: {e.count7d} · last: {when(e.lastAt)} · watch at{" "}
                  {thresholdFor(e.event).amberAt}, act at {thresholdFor(e.event).redAt} per day
                </p>
              </li>
            ))}
          </ul>
          <h2 className="font-display text-lg font-semibold text-ds-ink">Latest 50</h2>
          {data.latest.length === 0 ? (
            <p className="text-sm text-ds-ink-soft">Nothing recorded.</p>
          ) : (
            <div className="overflow-x-auto rounded-2xl border border-ds-line bg-ds-card">
              <table className="w-full text-left text-xs">
                <thead className="text-ds-ink-soft">
                  <tr>
                    <th className="p-2">When</th>
                    <th className="p-2">Event</th>
                    <th className="p-2">Source</th>
                    <th className="p-2">Learner</th>
                    <th className="p-2">Detail</th>
                  </tr>
                </thead>
                <tbody>
                  {data.latest.map((r) => (
                    <tr key={r.id} className="border-t border-ds-line">
                      <td className="p-2 whitespace-nowrap">{when(r.createdAt)}</td>
                      <td className="p-2">{r.event}</td>
                      <td className="p-2">{r.source}</td>
                      <td className="p-2">{r.userId ? r.userId.slice(0, 8) : ""}</td>
                      <td className="p-2">
                        <code>{JSON.stringify(r.detail)}</code>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      ) : null}
    </div>
  );
}
