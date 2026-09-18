import { Link, useRouterState } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { useEffect, useRef, useState } from "react";
import { useProgress } from "../lib/progress";
import { FlameIcon, BoltIcon, HeartIcon } from "./icons";
import { LeagueTierBadge } from "./LeagueTierBadge";

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
  const { xp, streak, hearts, hydrated, leagueTier } = useProgress();

  // Announce meaningful stat changes to screen readers -- but never on
  // first hydration (every page load), only on genuine later changes.
  const [announcement, setAnnouncement] = useState("");
  const prevStats = useRef<{ xp: number; streak: number; hearts: number } | null>(null);
  useEffect(() => {
    if (!hydrated) return;
    const prev = prevStats.current;
    if (prev === null) {
      prevStats.current = { xp, streak, hearts };
      return;
    }
    const changes: string[] = [];
    if (hearts !== prev.hearts) {
      const diff = hearts - prev.hearts;
      changes.push(diff > 0 ? `+${diff} heart${diff === 1 ? "" : "s"}` : `Hearts: ${hearts}`);
    }
    if (xp > prev.xp) changes.push(`+${xp - prev.xp} XP`);
    if (streak !== prev.streak) changes.push(`Streak: ${streak}`);
    if (changes.length) setAnnouncement(changes.join(", "));
    prevStats.current = { xp, streak, hearts };
  }, [hydrated, xp, streak, hearts]);

  return (
    <header className="sticky top-0 z-30 border-b border-hairline bg-surface/85 backdrop-blur-md">
      <span className="sr-only" role="status" aria-live="polite">
        {announcement}
      </span>
      <div className="mx-auto flex max-w-[430px] items-center justify-between px-5 py-3.5">
        <Link to="/learn" className="flex items-center gap-2">
          <LeagueTierBadge tier={hydrated ? leagueTier : "bronze"} size="sm" />
          <span className="font-display text-[15px] font-semibold tracking-tight text-ink">
            Alphonso
          </span>
        </Link>
        <div className="flex items-center gap-4">
          <StatPill
            icon={<FlameIcon className="size-4" />}
            value={hydrated ? streak : 0}
            color="text-ember"
            label="Streak"
          />
          <StatPill
            icon={<BoltIcon className="size-4" />}
            value={hydrated ? xp : 0}
            color="text-moss"
            label="XP"
          />
          <StatPill
            icon={<HeartIcon className="size-4" />}
            value={hydrated ? hearts : 5}
            color="text-rose-500"
            label="Hearts"
          />
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
      <span className={`transition-colors ${active ? "text-moss" : "text-ink-soft/60"}`}>
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
        <TabItem to="/learn" label="Learn" active={pathname === "/learn"}>
          <svg viewBox="0 0 24 24" className="size-5" fill="none" aria-hidden="true">
            <path
              d="M4 11 12 4l8 7v8a1 1 0 0 1-1 1h-4v-6h-6v6H5a1 1 0 0 1-1-1v-8z"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinejoin="round"
            />
          </svg>
        </TabItem>
        <TabItem to="/converse" label="Chat" active={pathname.startsWith("/converse")}>
          <svg viewBox="0 0 24 24" className="size-5" fill="none" aria-hidden="true">
            <path
              d="M4 6a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-5l-4 4v-4H6a2 2 0 0 1-2-2V6z"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinejoin="round"
            />
            <path d="M8 9h8M8 12h5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
          </svg>
        </TabItem>
        <TabItem to="/league" label="League" active={pathname.startsWith("/league")}>
          <svg viewBox="0 0 24 24" className="size-5" fill="none" aria-hidden="true">
            <path
              d="M8 4h8v3a4 4 0 0 1-8 0V4z"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinejoin="round"
            />
            <path
              d="M5 5H3v2a3 3 0 0 0 3 3M19 5h2v2a3 3 0 0 1-3 3M10 15h4M9 20h6M12 15v5"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
            />
          </svg>
        </TabItem>
        <TabItem to="/profile" label="Profile" active={pathname.startsWith("/profile")}>
          <svg viewBox="0 0 24 24" className="size-5" fill="none" aria-hidden="true">
            <circle cx="12" cy="9" r="3.5" stroke="currentColor" strokeWidth="1.6" />
            <path
              d="M5 20c1.5-3.5 4-5 7-5s5.5 1.5 7 5"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
            />
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
        <main id="main-content" className="flex-1">
          {children}
        </main>
        <BottomTabs />
      </div>
    </div>
  );
}

export function LessonFrame({ children }: { children: ReactNode }) {
  return (
    <div className="grain min-h-dvh bg-surface text-ink">
      <main
        id="main-content"
        className="mx-auto flex min-h-dvh max-w-[430px] flex-col bg-surface/60"
      >
        {children}
      </main>
    </div>
  );
}
