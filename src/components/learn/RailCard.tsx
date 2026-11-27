import type { ReactNode } from "react";
import { Icon } from "@/components/ds/Blocks";

/** The look of one small card in Learn's "For you" rail. */
export const CARD =
  "relative flex min-h-11 w-[104px] shrink-0 flex-col gap-1 rounded-2xl border-2 border-ds-line bg-ds-card px-2.5 py-2.5 text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ds-choice";

export function CardBody({
  icon,
  label,
  value,
  badge,
}: {
  icon: string;
  label: string;
  value: string;
  badge?: ReactNode;
}) {
  return (
    <>
      <Icon name={icon} size={28} />
      <span className="ds-type-footnote block font-extrabold leading-tight text-ds-ink">
        {label}
      </span>
      <span className="ds-type-caption block leading-tight text-ds-ink-soft">{value}</span>
      {badge}
    </>
  );
}
