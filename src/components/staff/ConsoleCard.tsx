import type { ReactNode } from "react";

/** A console card: small uppercase heading, optional hint, content. Shared by the ticket view and the other pages. */
export function ConsoleCard({
  title,
  hint,
  tint,
  className = "",
  children,
}: {
  title?: string;
  hint?: string;
  tint?: boolean;
  className?: string;
  children: ReactNode;
}) {
  return (
    <section
      className={`grid gap-2.5 rounded-2xl border p-4 ${tint ? "border-ds-action bg-ds-action-tint" : "border-ds-line bg-ds-card"} ${className}`}
    >
      {title ? (
        <h2 className="text-xs font-extrabold uppercase tracking-wider text-ds-ink-soft">
          {title}
          {hint ? (
            <span className="ml-1 font-semibold normal-case tracking-normal"> {hint}</span>
          ) : null}
        </h2>
      ) : null}
      {children}
    </section>
  );
}
