import type { ButtonHTMLAttributes } from "react";
import { Button } from "../ui/Button";

/** Text fields in the console look (the same classes the support inbox and the learner page use). */
export const FIELD = "min-h-11 w-full rounded-xl border border-ds-line bg-ds-sunk px-3 py-2";

/** A small secondary button, as in the inbox. */
export function SmallButton({
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "secondary" | "ember" }) {
  return (
    <Button
      variant={props.variant ?? "secondary"}
      className={`!min-h-9 !px-3 !py-1 text-sm ${className}`}
      {...props}
    />
  );
}

/** The red outline button for the actions that cannot be easily undone (Delete, Disband). */
export function DangerButton({
  className = "",
  type = "button",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type={type}
      className={`inline-flex min-h-9 items-center justify-center rounded-xl border-2 border-ds-wrong bg-ds-card px-3 py-1 text-sm font-bold text-ds-wrong-ink disabled:opacity-50 ${className}`}
      {...props}
    />
  );
}

/** The one red line under a heading. */
export function ErrorLine({ children }: { children: React.ReactNode }) {
  return (
    <p role="alert" className="mt-3 text-sm font-semibold text-ds-wrong-ink">
      {children}
    </p>
  );
}

/** Kind pill on a report. */
export function KindPill({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-block whitespace-nowrap rounded-lg bg-ds-choice-tint px-2 py-0.5 text-xs font-extrabold text-ds-choice">
      {children}
    </span>
  );
}

/** An empty list: heading and an optional second line, centred in a card. */
export function EmptyCard({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="mt-4 rounded-2xl border border-ds-line bg-ds-card px-4 py-8 text-center">
      <p className="font-display text-lg font-extrabold text-ds-ink">{title}</p>
      {hint ? <p className="ds-type-footnote text-ds-ink-soft">{hint}</p> : null}
    </div>
  );
}
