import { Icon3D } from "../Icon3D";

/** A stat chip (streak, hearts, XP) with a 3D icon. `label` is what screen readers hear. */
export function StatPill({
  emoji,
  value,
  label,
  className = "",
}: {
  emoji: string;
  value: string;
  label: string;
  className?: string;
}) {
  return (
    <span
      aria-label={label}
      className={`inline-flex items-center gap-1 rounded-full bg-ds-card py-1 pl-1 pr-3 ds-type-footnote font-extrabold tabular-nums text-ds-ink shadow-[var(--ds-shadow-resting)] ${className}`}
    >
      <Icon3D emoji={emoji} size={22} />
      <span aria-hidden="true">{value}</span>
    </span>
  );
}
