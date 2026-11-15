import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";

export function LegalPage({
  title,
  updated,
  children,
}: {
  title: string;
  updated: string;
  children: ReactNode;
}) {
  return (
    <div className="grain min-h-dvh bg-ds-surface text-ds-ink">
      <div className="mx-auto flex min-h-dvh max-w-[430px] flex-col px-6 pb-16 pt-8">
        <Link
          to="/"
          className="mb-6 inline-flex min-h-11 w-fit items-center gap-1 rounded-full border border-ds-card/60 bg-ds-card/80 pl-2.5 pr-3.5 ds-type-footnote font-extrabold text-ds-choice shadow-[var(--ds-shadow-floating)]"
        >
          <span aria-hidden="true">‹</span>
          Back
        </Link>
        <h1 className="ds-type-display text-ds-ink">{title}</h1>
        <p className="mt-1 ds-type-caption text-ds-ink-soft">Last updated {updated}</p>
        <div className="mt-6 space-y-5 rounded-[22px] border-2 border-ds-line bg-ds-card p-4">
          {children}
        </div>
      </div>
    </div>
  );
}

export function Section({ heading, children }: { heading: string; children: ReactNode }) {
  return (
    <section>
      <h2 className="ds-type-headline text-ds-ink">{heading}</h2>
      <div className="mt-2 space-y-2 ds-type-footnote font-medium leading-relaxed text-ds-ink-soft">
        {children}
      </div>
    </section>
  );
}

export function Bullets({ items }: { items: string[] }) {
  return (
    <ul className="mt-1 space-y-1.5">
      {items.map((t) => (
        <li key={t} className="flex gap-2">
          <span className="mt-[7px] size-1.5 shrink-0 rounded-full bg-ds-choice" />
          <span>{t}</span>
        </li>
      ))}
    </ul>
  );
}
