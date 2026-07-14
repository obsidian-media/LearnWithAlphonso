import { Link, useRouterState } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { useProgress } from "../lib/progress";
import { FlameIcon, BoltIcon, HeartIcon } from "./icons";

function StatPill({
  icon,
  value,
  color,
  label,
}: {
  icon: ReactNode;
  value: number | string;
  color: string;
  label: string;
}) {
  return (
    <div className="flex items-center gap-1.5" aria-label={label}>
      <span className={color}>{icon}</span>
      <span className="tnum text-sm font-semibold text-ink">{value}</span>
    </div>
  );
}

export function TopBar() {
  const { xp, streak, hearts, hydrated } = useProgress();
  return (
    <header className="sticky top-0 z-30 border-b border-hairline bg-surface/85 backdrop-blur-md">
      <div className="mx-auto flex max-w-[430px] items-center justify-between px-5 py-3.5">
        <Link to="/" className="flex items-center gap-2">
          <div className="grid size-7 place-items-center rounded-md bg-moss text-surface">
            <span className="font-display text-[13px] font-semibold leading-none">L</span>
          </div>
          <span className="font-display text-[15px] font-semibold tracking-tight text-ink">
            Lingua
          </span>
        </Link>
        <div className="flex items-center gap-4">
          <StatPill icon={<FlameIcon className="size-4" />} value={hydrated ? streak : 0} color="text-ember" label="Streak" />
          <StatPill icon={<BoltIcon className="size-4" />} value={hydrated ? xp : 0} color="text-moss" label="XP" />
          <StatPill icon={<HeartIcon className="size-4" />} value={hydrated ? hearts : 5} color="text-rose-500" label="Hearts" />
        </div>
      </div>
    </header>
  );
}

function TabItem({
  to,
  label,
  active,
  children,
}: {
  to: string;
  label: string;
  active: boolean;
  children: ReactNode;
}) {
  return (
    <Link
      to={to}
      className="group flex flex-1 flex-col items-center gap-1 py-1.5"
      aria-label={label}
    >
      <span
        className={`transition-colors ${active ? "text-moss" : "text-ink-soft/60"}`}
      >
        {children}
      </span>
      <span
        className={`text-[10px] font-medium uppercase tracking-[0.14em] transition-colors ${
          active ? "text-moss" : "text-ink-soft/50"
        }`}
      >
        {label}
      </span>
      <span
        className={`h-0.5 w-6 rounded-full transition-colors ${
          active ? "bg-moss" : "bg-transparent"
        }`}
      />
    </Link>
  );
}

export function BottomTabs() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  return (
    <nav className="sticky bottom-0 z-30 border-t border-hairline bg-surface/95 backdrop-blur-md">
      <div className="mx-auto flex max-w-[430px] items-stretch px-4 pb-[max(env(safe-area-inset-bottom),8px)] pt-1">
        <TabItem to="/" label="Learn" active={pathname === "/"}>
          <svg viewBox="0 0 24 24" className="size-5" fill="none">
            <path d="M4 11 12 4l8 7v8a1 1 0 0 1-1 1h-4v-6h-6v6H5a1 1 0 0 1-1-1v-8z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
          </svg>
        </TabItem>
        <TabItem to="/league" label="League" active={pathname.startsWith("/league")}>
          <svg viewBox="0 0 24 24" className="size-5" fill="none">
            <path d="M8 4h8v3a4 4 0 0 1-8 0V4z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
            <path d="M5 5H3v2a3 3 0 0 0 3 3M19 5h2v2a3 3 0 0 1-3 3M10 15h4M9 20h6M12 15v5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
          </svg>
        </TabItem>
        <TabItem to="/profile" label="Profile" active={pathname.startsWith("/profile")}>
          <svg viewBox="0 0 24 24" className="size-5" fill="none">
            <circle cx="12" cy="9" r="3.5" stroke="currentColor" strokeWidth="1.6" />
            <path d="M5 20c1.5-3.5 4-5 7-5s5.5 1.5 7 5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
          </svg>
        </TabItem>
      </div>
    </nav>
  );
}

export function MobileFrame({ children }: { children: ReactNode }) {
  return (
    <div className="grain min-h-dvh bg-surface text-ink">
      <div className="mx-auto flex min-h-dvh max-w-[430px] flex-col bg-surface/60">
        <TopBar />
        <main className="flex-1">{children}</main>
        <BottomTabs />
      </div>
    </div>
  );
}

export function LessonFrame({ children }: { children: ReactNode }) {
  return (
    <div className="grain min-h-dvh bg-surface text-ink">
      <div className="mx-auto flex min-h-dvh max-w-[430px] flex-col bg-surface/60">
        {children}
      </div>
    </div>
  );
}