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
    <div className="grain min-h-dvh bg-surface text-ink">
      <div className="mx-auto flex min-h-dvh max-w-[430px] flex-col px-6 pb-16 pt-8">
        <Link to="/" className="mb-8 inline-flex items-center gap-2 text-ink-soft/70">
          <span className="text-lg">←</span>
          <span className="text-sm">Back</span>
        </Link>
        <h1 className="font-display text-[30px] font-semibold leading-tight text-ink">{title}</h1>
        <p className="mt-1.5 text-xs text-ink-soft/70">Last updated {updated}</p>
        <div className="mt-7 space-y-6">{children}</div>
      </div>
    </div>
  );
}

export function Section({ heading, children }: { heading: string; children: ReactNode }) {
  return (
    <section>
      <h2 className="font-display text-[17px] font-semibold text-ink">{heading}</h2>
      <div className="mt-2 space-y-2 text-[14px] leading-relaxed text-ink-soft">{children}</div>
    </section>
  );
}

export function Bullets({ items }: { items: string[] }) {
  return (
    <ul className="mt-1 space-y-1.5">
      {items.map((t) => (
        <li key={t} className="flex gap-2">
          <span className="mt-[7px] size-1.5 shrink-0 rounded-full bg-moss" />
          <span>{t}</span>
        </li>
      ))}
    </ul>
  );
}
