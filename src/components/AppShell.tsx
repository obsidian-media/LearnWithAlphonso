import { useShownStreak } from "@/lib/use-shown-streak";
import { streakAriaLabel } from "@/lib/streak-display";
import { Link, useRouterState } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { useEffect, useRef, useState } from "react";
import { useCountdown } from "../hooks/use-countdown";
import { MAX_HEARTS } from "../lib/hearts";
import { useProgress } from "../lib/progress";
import { DsIcon } from "./ds/DsIcon";
import { Icon3D } from "./Icon3D";
import { PodcastPlayer } from "./PodcastPlayer";
import { LeagueTierBadge } from "./LeagueTierBadge";

function StatPill({
  icon,
  value,
  color,
  label,
  hint,
}: {
  icon: ReactNode;
  value: number | string;
  color: string;
  label: string;
  /** A small second line, e.g. the time until the next heart. */
  hint?: string | null;
}) {
  return (
    <div
      className="flex items-center gap-1 rounded-full bg-ds-sunk py-0.5 pl-1.5 pr-2.5"
      aria-label={label}
    >
      <span className={color}>{icon}</span>
      <span className="tnum ds-type-footnote font-extrabold text-ds-ink">{value}</span>
      {hint ? <span className="tnum ds-type-caption text-ds-ink-soft">{hint}</span> : null}
    </div>
  );
}

export function TopBar() {
  const { xp, hearts, heartsRefillAt, hydrated, leagueTier } = useProgress();
  // The streak as it reads today: 0 once the next lesson would restart it, marked while a freeze keeps it alive.
  const shown = useShownStreak();
  const streak = shown.streak;
  const refillHeartsLocal = useProgress((s) => s.refillHeartsLocal);

  // Below the cap a heart comes back every 30 minutes. Show the wait for the next one (the same clock the server
  // keeps) and add the heart on screen the moment it is due.
  const nextHeartIn = useCountdown(hydrated && hearts < MAX_HEARTS ? heartsRefillAt : null);
  useEffect(() => {
    if (!hydrated || heartsRefillAt === null || hearts >= MAX_HEARTS) return;
    const id = setTimeout(refillHeartsLocal, Math.max(0, heartsRefillAt - Date.now()) + 50);
    return () => clearTimeout(id);
  }, [hydrated, hearts, heartsRefillAt, refillHeartsLocal]);

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
    <header className="sticky top-0 z-30 border-b border-ds-line bg-ds-card/90 backdrop-blur-md">
      <span className="sr-only" role="status" aria-live="polite">
        {announcement}
      </span>
      <div className="mx-auto flex max-w-[430px] items-center justify-between px-4 py-2.5">
        {/* The brand: the app icon and the name, the same mark as the landing page. */}
        <Link
          to="/learn"
          className="flex items-center gap-2"
          aria-label="Learn with Alphonso, home"
        >
          <img
            src="/icon-192.png"
            alt=""
            width={28}
            height={28}
            data-brand-mark=""
            className="size-7 rounded-lg"
          />
          <span className="ds-type-headline hidden font-extrabold text-ds-brand min-[420px]:inline">
            Alphonso
          </span>
        </Link>
        <div className="flex items-center gap-1.5">
          {/* The learner's league badge: theirs, not the brand, so it sits with their stats and opens the league. */}
          <Link to="/league" data-league-badge="">
            <LeagueTierBadge tier={hydrated ? leagueTier : "bronze"} size="sm" />
          </Link>
          <StatPill
            icon={<Icon3D emoji="🔥" size={20} />}
            value={hydrated ? streak : 0}
            color="text-ds-flame"
            label={hydrated ? streakAriaLabel(shown) : "Streak"}
            hint={hydrated && shown.state === "protected" ? "❄️" : null}
          />
          <StatPill
            icon={<Icon3D emoji="⚡" size={20} />}
            value={hydrated ? xp : 0}
            color="text-ds-xp-text"
            label="XP"
          />
          <StatPill
            icon={<Icon3D emoji="❤️" size={20} />}
            value={hydrated ? hearts : 5}
            color="text-ds-heart"
            label="Hearts"
            hint={nextHeartIn ? `+1 in ${nextHeartIn}` : null}
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
      className="group flex min-h-12 flex-1 flex-col items-center justify-center gap-0.5 py-1"
      aria-label={label}
      // Link marks only an exact match; a tab stays lit across its area (/league under Profile), so say so too.
      aria-current={active ? "page" : undefined}
    >
      <span className={`transition-colors ${active ? "text-ds-choice" : "text-ds-ink-faint"}`}>
        {children}
      </span>
      <span
        className={`ds-type-caption transition-colors ${active ? "text-ds-brand" : "text-ds-ink-soft"}`}
      >
        {label}
      </span>
    </Link>
  );
}

/**
 * Profile lights for its own pages and for League, which lives behind Profile (as on iOS and Android) and has no tab
 * of its own, so no other tab lights up there.
 */
function profileTabActive(pathname: string): boolean {
  return pathname.startsWith("/profile") || pathname.startsWith("/league");
}

export function BottomTabs() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  return (
    <nav className="sticky bottom-0 z-30 border-t border-ds-line bg-ds-card/95 backdrop-blur-md">
      <div className="mx-auto flex max-w-[430px] items-stretch px-2 pb-[max(env(safe-area-inset-bottom),8px)] pt-1">
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
        <TabItem to="/listen" label="Library" active={pathname.startsWith("/listen")}>
          <svg viewBox="0 0 24 24" className="size-5" fill="none" aria-hidden="true">
            <path
              d="M4 14v-2a8 8 0 0 1 16 0v2"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
            />
            <path
              d="M4 14h3v5H5.5A1.5 1.5 0 0 1 4 17.5V14zM20 14h-3v5h1.5a1.5 1.5 0 0 0 1.5-1.5V14z"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinejoin="round"
            />
          </svg>
        </TabItem>
        <TabItem to="/converse" label="Practice" active={pathname.startsWith("/converse")}>
          <DsIcon name="mic" className="size-5" />
        </TabItem>
        <TabItem to="/hector" label="Hector" active={pathname.startsWith("/hector")}>
          <svg viewBox="0 0 24 24" className="size-5" fill="none" aria-hidden="true">
            <path
              d="M12 3l1.8 4.7L18.5 9.5l-4.7 1.8L12 16l-1.8-4.7L5.5 9.5l4.7-1.8L12 3zM18 15l.9 2.1L21 18l-2.1.9L18 21l-.9-2.1L15 18l2.1-.9L18 15z"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinejoin="round"
            />
          </svg>
        </TabItem>
        <TabItem to="/profile" label="Profile" active={profileTabActive(pathname)}>
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

export function MobileFrame({
  children,
  aboveTabs,
}: {
  children: ReactNode;
  /** Rides in the sticky dock above the player and tabs (the Hector composer). */
  aboveTabs?: ReactNode;
}) {
  return (
    <div className="grain min-h-dvh bg-ds-surface text-ds-ink">
      <div className="mx-auto flex min-h-dvh max-w-[430px] flex-col bg-ds-surface/60">
        <TopBar />
        <main id="main-content" className="flex-1">
          {children}
        </main>
        {/* Above BottomTabs and outside <main>: the audio element lives
            here, in the shell, so walking from a folder into a subfolder
            re-renders the page without unmounting the player and killing
            playback. */}
        {/* One sticky dock for both bars. Two siblings each pinned to the bottom edge pin to the SAME place on a
            scrolled page, and the later one (the tabs) covers the player and its quiz offer. */}
        <div data-testid="bottom-dock" className="sticky bottom-0 z-30">
          {aboveTabs}
          <PodcastPlayer />
          <BottomTabs />
        </div>
      </div>
    </div>
  );
}

export function LessonFrame({ children }: { children: ReactNode }) {
  return (
    <div className="grain min-h-dvh bg-ds-surface text-ds-ink">
      <main
        id="main-content"
        className="mx-auto flex min-h-dvh max-w-[430px] flex-col bg-ds-surface/60"
      >
        {children}
      </main>
    </div>
  );
}
