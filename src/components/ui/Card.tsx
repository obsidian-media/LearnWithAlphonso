import type { HTMLAttributes } from "react";

/** A rounded surface. `elevated` gives tappable cards a soft lift; plain cards stay flat. */
export function Card({
  elevated = false,
  className = "",
  ...props
}: HTMLAttributes<HTMLDivElement> & { elevated?: boolean }) {
  return (
    <div
      className={`rounded-3xl bg-card p-4 ${elevated ? "card-lift" : "border border-hairline"} ${className}`}
      {...props}
    />
  );
}
