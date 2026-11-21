import type { SeriesPoint } from "../../../lib/numbers-core";
import { Figure } from "../Figure";

const W = 600;
const H = 150;
const PAD = 8;

const weekday = (day: string) =>
  new Date(`${day}T00:00:00Z`).toLocaleDateString("en-GB", { weekday: "short", timeZone: "UTC" });
const dayLabel = (day: string) =>
  new Date(`${day}T00:00:00Z`).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  });

/**
 * Active learners per UTC day, drawn from the real per-day counts and nothing else (a point is a real day; there is no
 * smoothing, no filler and no point before the data began). The line sits on a zero baseline so its height is honest.
 * The colour is a theme token (currentColor of a ds class), so it follows light and Royal Night. For a screen reader
 * (and anyone who wants the exact numbers) the same series is a table that is visually hidden, and the picture itself
 * carries a one-line summary.
 */
export function DauChart({ series }: { series: SeriesPoint[] }) {
  if (series.length < 2) return null;
  const max = Math.max(...series.map((p) => p.value));
  const top = max > 0 ? max : 1;
  const x = (i: number) => PAD + (i * (W - 2 * PAD)) / (series.length - 1);
  const y = (v: number) => H - PAD - (v / top) * (H - 2 * PAD);
  const points = series.map((p, i) => `${x(i).toFixed(1)},${y(p.value).toFixed(1)}`);
  const area = `${points.join(" ")} ${x(series.length - 1).toFixed(1)},${H - PAD} ${x(0).toFixed(1)},${H - PAD}`;
  const first = series[0]!;
  const lastPoint = series[series.length - 1]!;
  const summary = `Active learners per day, ${series.length} days from ${dayLabel(first.day)} to ${dayLabel(lastPoint.day)}. Highest ${max}. Latest ${lastPoint.value}.`;
  const labelEvery = series.length <= 8 ? 1 : Math.ceil(series.length / 6);
  return (
    <div data-chart="dau">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="none"
        role="img"
        aria-label={summary}
        className="h-32 w-full text-ds-choice"
      >
        <line
          x1={PAD}
          x2={W - PAD}
          y1={H - PAD}
          y2={H - PAD}
          stroke="currentColor"
          strokeOpacity={0.25}
        />
        <polygon points={area} fill="currentColor" fillOpacity={0.12} />
        <polyline
          points={points.join(" ")}
          fill="none"
          stroke="currentColor"
          strokeWidth={2.5}
          strokeLinecap="round"
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
        />
        <circle cx={x(series.length - 1)} cy={y(lastPoint.value)} r={4} fill="currentColor" />
      </svg>
      <div
        aria-hidden="true"
        className="mt-1 flex justify-between text-xs font-semibold text-ds-ink-faint"
      >
        {series.map((p, i) =>
          i % labelEvery === 0 || i === series.length - 1 ? (
            <span key={p.day}>{series.length <= 8 ? weekday(p.day) : dayLabel(p.day)}</span>
          ) : null,
        )}
      </div>
      <p className="mt-2 text-xs font-semibold text-ds-ink-soft">
        Highest <Figure value={max} reason="" /> · latest{" "}
        <Figure value={lastPoint.value} reason="" />
      </p>
      <table className="sr-only">
        <caption>Active learners per day (UTC)</caption>
        <thead>
          <tr>
            <th scope="col">Day</th>
            <th scope="col">Active learners</th>
          </tr>
        </thead>
        <tbody>
          {series.map((p) => (
            <tr key={p.day}>
              <th scope="row">{dayLabel(p.day)}</th>
              <td>
                <Figure value={p.value} reason="" />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
