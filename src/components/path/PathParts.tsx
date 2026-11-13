import { Link } from "@tanstack/react-router";
import { DsIcon } from "@/components/ds/DsIcon";
import type { DsIconName } from "@/design/icons.generated";
import {
  PATH_TYPE_INFO,
  type ItemRef,
  type MixEntry,
  type PathType,
  type PlannedItem,
} from "@/lib/path-plan";

/**
 * Shared pieces of the learning path screens (mock: mocks-r8 Feature 2). One colour and one icon per activity type,
 * everywhere. Every word and number is from the server's plan (src/lib/path-plan.ts); nothing here is typed in.
 */
const TYPE_ICON: Record<PathType, DsIconName> = {
  lesson: "book",
  podcast: "speaker",
  talk: "mic",
  campaign: "star",
};
/** Token classes per type: the badge fill, the text on it, the legend swatch and the label colour. */
export const TYPE_STYLE: Record<
  PathType,
  { fill: string; on: string; swatch: string; text: string }
> = {
  lesson: {
    fill: "bg-ds-choice",
    on: "text-ds-card",
    swatch: "bg-ds-choice",
    text: "text-ds-choice",
  },
  podcast: {
    fill: "bg-ds-brand",
    on: "text-ds-card",
    swatch: "bg-ds-brand",
    text: "text-ds-brand",
  },
  talk: { fill: "bg-ds-xp", on: "text-ds-ink", swatch: "bg-ds-xp", text: "text-ds-xp-text" },
  campaign: {
    fill: "bg-ds-right",
    on: "text-ds-on-right",
    swatch: "bg-ds-right",
    text: "text-ds-right-ink",
  },
};

export function TypeBadge({ type, small = false }: { type: PathType; small?: boolean }) {
  const s = TYPE_STYLE[type];
  return (
    <span
      data-path-type={type}
      aria-hidden="true"
      className={`grid shrink-0 place-items-center rounded-[13px] ${s.fill} ${s.on} ${small ? "size-7" : "size-10"}`}
    >
      {type === "campaign" ? (
        <DsIcon name="star" solid className={small ? "size-4" : "size-5"} />
      ) : (
        <DsIcon
          name={TYPE_ICON[type] as "book" | "speaker" | "mic"}
          className={small ? "size-4" : "size-5"}
        />
      )}
    </span>
  );
}

/** Where an item opens. A podcast opens the Listen library: the path does not know the folder route. */
export function ItemLink({
  item,
  children,
  className,
}: {
  item: { ref: ItemRef | null; type: PathType };
  children: React.ReactNode;
  className?: string;
}) {
  const ref = item.ref;
  if (!ref) return <div className={className}>{children}</div>;
  if (ref.kind === "lesson")
    return (
      <Link to="/lesson/$id" params={{ id: ref.id }} className={className}>
        {children}
      </Link>
    );
  if (ref.kind === "talk")
    return (
      <Link to="/converse/$scenarioId" params={{ scenarioId: ref.id }} className={className}>
        {children}
      </Link>
    );
  if (ref.kind === "campaign")
    return (
      <Link
        to="/campaign/$campaignId"
        params={{ campaignId: ref.id }}
        search={{ scene: ref.sceneIndex ?? 0 }}
        className={className}
      >
        {children}
      </Link>
    );
  return (
    <Link to="/listen" className={className}>
      {children}
    </Link>
  );
}

export function ItemRow({ item }: { item: PlannedItem }) {
  const done = item.state === "done";
  const tone = done
    ? "border-ds-right-edge bg-ds-right-tint"
    : item.state === "next"
      ? "border-ds-brand bg-ds-choice-tint"
      : "border-ds-line bg-ds-card";
  return (
    <ItemLink
      item={item}
      className={`flex min-h-14 items-center gap-3 rounded-2xl border-2 px-3 py-2 ${tone}`}
    >
      <TypeBadge type={item.type} />
      <span className="min-w-0 flex-1">
        <b className="block truncate text-sm font-extrabold text-ds-ink">
          <span className="sr-only">{PATH_TYPE_INFO[item.type].noun}: </span>
          {item.title}
        </b>
        <small className="block truncate text-xs text-ds-ink-soft">{item.subtitle}</small>
      </span>
      <span
        className={`shrink-0 text-xs font-extrabold ${done ? "text-ds-right-ink" : "text-ds-ink-soft"}`}
      >
        {done ? <span className="sr-only">Done, </span> : null}
        {done ? "✓ " : ""}
        {item.minutes} min
      </span>
    </ItemLink>
  );
}

/** The week's mix as one bar with a legend. Types with no minutes are left out. */
export function MixBar({ mix, label }: { mix: MixEntry[]; label: string }) {
  const shown = mix.filter((m) => m.minutes > 0);
  const total = shown.reduce((s, m) => s + m.minutes, 0) || 1;
  return (
    <div>
      <div
        role="img"
        aria-label={`${label}: ${shown.map((m) => `${PATH_TYPE_INFO[m.type].label} ${m.minutes} minutes`).join(", ")}`}
        className="flex h-3.5 gap-0.5 overflow-hidden rounded-lg"
      >
        {shown.map((m) => (
          <i
            key={m.type}
            className={`block h-full ${TYPE_STYLE[m.type].swatch}`}
            style={{ width: `${(m.minutes / total) * 100}%` }}
          />
        ))}
      </div>
      <ul className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs font-bold text-ds-ink-soft">
        {shown.map((m) => (
          <li key={m.type} className="flex items-center gap-1.5">
            <span className={`inline-block size-2.5 rounded-sm ${TYPE_STYLE[m.type].swatch}`} />
            {PATH_TYPE_INFO[m.type].label} {m.minutes} min
          </li>
        ))}
      </ul>
    </div>
  );
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
/** "1 Mar" from an ISO date. A fixed English table (the iOS and Android screens use the same one). */
export function shortDate(iso: string): string {
  const m = /^[0-9]{4}-([0-9]{2})-([0-9]{2})$/.exec(iso);
  return m ? `${Number(m[2])} ${MONTHS[Number(m[1]) - 1]}` : iso;
}

export function BackLink({ to, label }: { to: "/learn" | "/path"; label: string }) {
  return (
    <Link
      to={to}
      aria-label={label}
      className="grid size-11 place-items-center rounded-full text-2xl text-ds-ink"
    >
      <span aria-hidden="true">‹</span>
    </Link>
  );
}
