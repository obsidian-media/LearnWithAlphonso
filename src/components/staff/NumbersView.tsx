import {
  WINDOW_CHOICES,
  type NumbersGroup,
  type NumbersResponse,
  type Tile,
  type WindowDays,
} from "../../lib/numbers-core";

/** How a tile's number is written. Pure so it is tested; a missing value is never written as 0. */
export function formatTile(tile: Tile): string {
  const v = tile.value;
  if (v === null) return "";
  if (typeof v === "string") return v;
  switch (tile.kind) {
    case "percent":
      return `${v}%`;
    case "money":
      return `$${v.toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
    case "days":
      return `${v} days`;
    case "rating":
      return v.toFixed(1);
    default:
      return v.toLocaleString("en-US");
  }
}

export function updatedLabel(iso: string): string {
  const d = new Date(iso);
  return `Updated ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

const STATE_PILL: Record<NumbersGroup["state"], { text: string; cls: string }> = {
  ok: { text: "Connected", cls: "bg-ds-right-tint text-ds-right-ink" },
  not_connected: {
    text: "Not connected",
    cls: "border border-ds-line bg-ds-sunk text-ds-ink-soft",
  },
  error: { text: "Could not load", cls: "bg-ds-wrong-tint text-ds-wrong-ink" },
};

function TileBox({ tile, state }: { tile: Tile; state: NumbersGroup["state"] }) {
  const empty = state !== "ok" || (tile.value === null && !tile.rows);
  const base = "grid content-start gap-0.5 rounded-2xl border px-3.5 py-3";
  const tone =
    state === "error"
      ? "border-ds-wrong bg-ds-wrong-tint"
      : empty
        ? "border-dashed border-ds-line bg-ds-sunk"
        : "border-ds-line bg-ds-card";
  const headline =
    state === "not_connected"
      ? "Not connected"
      : state === "error"
        ? "Could not load"
        : "Not available";
  return (
    <div className={`${base} ${tone}`} data-tile={tile.id} data-empty={empty ? "" : undefined}>
      <div className="text-xs font-bold text-ds-ink-soft">{tile.label}</div>
      {tile.rows && !empty ? (
        <ul className="mt-1 grid gap-1 text-[13px] font-semibold text-ds-ink">
          {tile.rows.map((r) => (
            <li key={r.label} className="flex justify-between gap-2">
              <span className="min-w-0 break-words">{r.label}</span>
              <b className="tabular-nums">
                {r.unit === "%" ? `${r.value}%` : r.value.toLocaleString("en-US")}
              </b>
            </li>
          ))}
        </ul>
      ) : empty ? (
        <div
          className={`text-[15px] font-bold ${state === "error" ? "text-ds-wrong-ink" : "text-ds-ink-soft"}`}
        >
          {headline}
        </div>
      ) : (
        <div className="font-display text-[28px] font-extrabold leading-tight text-ds-ink tabular-nums">
          {formatTile(tile)}
        </div>
      )}
      <div className="text-[11.5px] font-semibold text-ds-ink-faint">
        {empty && tile.reason ? `${tile.reason} · ` : ""}
        {tile.note}
      </div>
    </div>
  );
}

function Group({
  group,
  onRetry,
  busy,
}: {
  group: NumbersGroup;
  onRetry: () => void;
  busy: boolean;
}) {
  const pill = STATE_PILL[group.state];
  const wide = group.tiles.length <= 2;
  return (
    <section
      className="mt-6"
      aria-label={group.title}
      data-group={group.key}
      data-state={group.state}
    >
      <div className="flex flex-wrap items-center gap-2.5">
        <h2 className="font-display text-[17px] font-extrabold text-ds-ink">{group.title}</h2>
        <span
          className={`rounded-lg px-2 py-0.5 text-[10.5px] font-extrabold uppercase tracking-wide ${pill.cls}`}
        >
          {pill.text}
        </span>
        <span className="text-[12.5px] font-semibold text-ds-ink-soft">{group.source}</span>
        {group.state === "error" ? (
          <button
            type="button"
            onClick={onRetry}
            disabled={busy}
            className="min-h-8 rounded-full border border-ds-line bg-ds-card px-3 text-xs font-bold text-ds-ink hover:bg-ds-sunk disabled:opacity-50"
          >
            Try again
          </button>
        ) : null}
      </div>
      {group.key === "own" ? (
        <p className="ds-type-footnote mt-1 text-ds-ink-soft">
          Counted on our servers. A real zero is shown as 0; a source that cannot be read is never
          shown as 0.
        </p>
      ) : null}
      <div
        className={`mt-2.5 grid gap-2.5 ${
          wide ? "grid-cols-1 sm:grid-cols-2" : "grid-cols-2 lg:grid-cols-4"
        }`}
      >
        {group.tiles.map((t) => (
          <TileBox key={t.id} tile={t} state={group.state} />
        ))}
      </div>
    </section>
  );
}

function Skeleton() {
  return (
    <section className="mt-6" aria-label="Loading" aria-busy="true">
      <div className="h-5 w-40 rounded-md bg-ds-sunk" />
      <div className="mt-2.5 grid grid-cols-2 gap-2.5 lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div
            key={i}
            className="grid gap-2 rounded-2xl border border-ds-line bg-ds-card px-3.5 py-3"
          >
            <div className="h-3 w-4/5 rounded-md bg-ds-sunk" />
            <div className="h-7 w-3/5 rounded-md bg-ds-sunk" />
            <div className="h-3 w-1/2 rounded-md bg-ds-sunk" />
          </div>
        ))}
      </div>
    </section>
  );
}

/** The Numbers page: window picker, Refresh and "Updated", one section per source. Totals only, no personal data. */
export function NumbersView({
  data,
  windowDays,
  busy,
  error,
  onWindow,
  onRefresh,
}: {
  data: NumbersResponse | null;
  windowDays: WindowDays;
  busy: boolean;
  error: string | null;
  onWindow: (w: WindowDays) => void;
  onRefresh: () => void;
}) {
  return (
    <section>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-semibold text-ds-ink">Numbers</h1>
          <p className="ds-type-footnote mt-1 max-w-xl text-ds-ink-soft">
            Refreshed when you open this page. Totals only, no personal data. Each tile says where
            it comes from and for what time.
          </p>
        </div>
        <div className="text-right">
          <div className="text-xs font-semibold text-ds-ink-soft">
            {data ? updatedLabel(data.generatedAt) : "Loading"}
          </div>
          <button
            type="button"
            onClick={onRefresh}
            disabled={busy}
            className="mt-1 min-h-9 rounded-full border-2 border-ds-line bg-ds-card px-4 text-sm font-bold text-ds-ink hover:bg-ds-sunk disabled:opacity-50"
          >
            Refresh
          </button>
        </div>
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-2" role="group" aria-label="Time window">
        <span className="text-xs font-bold uppercase tracking-wide text-ds-ink-soft">Window</span>
        {WINDOW_CHOICES.map((w) => (
          <button
            key={w}
            type="button"
            aria-pressed={windowDays === w}
            onClick={() => onWindow(w)}
            disabled={busy}
            className={`inline-flex min-h-9 items-center rounded-full border px-3 py-1 text-sm font-bold ${
              windowDays === w
                ? "border-ds-ink bg-ds-ink text-ds-card"
                : "border-ds-line bg-ds-card text-ds-ink-soft hover:bg-ds-sunk"
            }`}
          >
            {w} days
          </button>
        ))}
      </div>
      {error ? (
        <p role="alert" className="mt-3 text-sm text-ember">
          {error}
        </p>
      ) : null}
      {data ? (
        data.groups.map((g) => <Group key={g.key} group={g} busy={busy} onRetry={onRefresh} />)
      ) : (
        <Skeleton />
      )}
    </section>
  );
}
