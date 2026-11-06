import { createElement } from "react";
import { DS_ICONS, type DsIconName, type DS_SOLID_ICONS } from "@/design/icons.generated";

type SolidIconName = (typeof DS_SOLID_ICONS)[number];

type Props = { className?: string; label?: string } & (
  | { name: SolidIconName; solid?: boolean }
  | { name: Exclude<DsIconName, SolidIconName>; solid?: never }
);

/**
 * One of the design system's 22 drawn icons (design/icons/), coloured by the current text colour, so a token class
 * on it or its parent sets the colour. Decorative unless given a label. Size it with a class; it is 24 by default.
 */
export function DsIcon({ name, solid = false, className, label }: Props) {
  const a11y = label ? { role: "img", "aria-label": label } : { "aria-hidden": true };
  return (
    <svg
      viewBox="0 0 24 24"
      width="24"
      height="24"
      fill={solid ? "currentColor" : "none"}
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      focusable="false"
      {...a11y}
    >
      {DS_ICONS[name]
        .filter((e) => !(solid && e.role === "highlight"))
        .map((e, i) =>
          createElement(e.tag, {
            key: i,
            ...e.attrs,
            ...(e.role === "dot" ? { fill: "currentColor", stroke: "none" } : {}),
          }),
        )}
    </svg>
  );
}
