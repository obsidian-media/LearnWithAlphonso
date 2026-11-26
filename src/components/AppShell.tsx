import { Link, useRouterState } from "@tanstack/react-router";
import { lazy, Suspense } from "react";
import type { ReactNode } from "react";
import { COURSES } from "../data/course-meta";
import { useProgress } from "../lib/progress";
import { hasPanel, useViewportTier, type ViewportTier } from "../lib/use-viewport-tier";
import { DsIcon } from "./ds/DsIcon";
import { PodcastPlayer } from "./PodcastPlayer";
import { LeagueTierBadge } from "./LeagueTierBadge";
import { StatPills, StatsAnnouncer } from "./shell/ShellStats";
import { useShellStats } from "./shell/use-shell-stats";
import { panelPlanFor } from "./shell/panel-config";

/*
 * The signed-in web shell. Four layouts, one component (the owner's pick, "Option A: sidebar app"):
 *
 *   under 768     the phone layout, exactly as it always was: a 430px column, stats on top, tab bar below.
 *   768 to 1023   an icon rail and one wide column, the stats as a strip at the top.
 *   1024 to 1279  an icon rail, the main column and a 280px panel.
 *   1280 and up   a labelled rail, a 720px main column and a 336px panel, centred, nothing wider than ~1400px.
 *
 * Lessons, calls and stories (LessonFrame) are a focused, centred ~640px view with no rails from 768 up.
 * The width a screen gets is decided here, once; pages do not carry breakpoints of their own.
 */

// The panel is only ever drawn on a desktop, so a phone never downloads it (nor the reads it makes).
const DesktopPanel = lazy(() => import("./shell/DesktopPanel"));

export function TopBar({ strip = false }: { strip?: boolean } = {}) {
  const stats = useShellStats();
  const { hydrated, leagueTier } = stats;

  return (
    <header className="sticky top-0 z-30 border-b border-ds-line bg-ds-card/90 backdrop-blur-md">
      <StatsAnnouncer text={stats.announcement} />
      <div
        className={
          strip
            ? "flex items-center justify-end px-6 py-2.5"
            : "mx-auto flex max-w-[430px] items-center justify-between px-4 py-2.5"
        }
      >
        {/* The brand: the app icon and the name, the same mark as the landing page. On the tablet strip the rail carries it. */}
        {strip ? null : (
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
        )}
        <div className="flex items-center gap-1.5">
          {/* The learner's league badge: theirs, not the brand, so it sits with their stats and opens the league. */}
          <Link to="/league" data-league-badge="">
            <LeagueTierBadge tier={hydrated ? leagueTier : "bronze"} size="sm" />
          </Link>
          <StatPills stats={stats} />
        </div>
      </div>
    </header>
  );
}

/** One of the five places the app is organised around: the same list drives the tab bar and the rail. */
type NavItem = {
  to: string;
  label: string;
  active: (pathname: string) => boolean;
  icon: (className: string) => ReactNode;
};

/**
 * Profile lights for its own pages and for League, which lives behind Profile (as on iOS and Android) and has no tab
 * of its own, so no other tab lights up there.
 */
function profileTabActive(pathname: string): boolean {
  return pathname.startsWith("/profile") || pathname.startsWith("/league");
}

const NAV_ITEMS: NavItem[] = [
  {
    to: "/learn",
    label: "Learn",
    active: (p) => p === "/learn",
    icon: (c) => (
      <svg viewBox="0 0 24 24" className={c} fill="none" aria-hidden="true">
        <path
          d="M4 11 12 4l8 7v8a1 1 0 0 1-1 1h-4v-6h-6v6H5a1 1 0 0 1-1-1v-8z"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinejoin="round"
        />
      </svg>
    ),
  },
  {
    to: "/listen",
    label: "Library",
    active: (p) => p.startsWith("/listen"),
    icon: (c) => (
      <svg viewBox="0 0 24 24" className={c} fill="none" aria-hidden="true">
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
    ),
  },
  {
    to: "/converse",
    label: "Practice",
    active: (p) => p.startsWith("/converse"),
    icon: (c) => <DsIcon name="mic" className={c} />,
  },
  {
    to: "/hector",
    label: "Hector",
    active: (p) => p.startsWith("/hector"),
    icon: (c) => (
      <svg viewBox="0 0 24 24" className={c} fill="none" aria-hidden="true">
        <path
          d="M12 3l1.8 4.7L18.5 9.5l-4.7 1.8L12 16l-1.8-4.7L5.5 9.5l4.7-1.8L12 3zM18 15l.9 2.1L21 18l-2.1.9L18 21l-.9-2.1L15 18l2.1-.9L18 15z"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinejoin="round"
        />
      </svg>
    ),
  },
  {
    to: "/profile",
    label: "Profile",
    active: profileTabActive,
    icon: (c) => (
      <svg viewBox="0 0 24 24" className={c} fill="none" aria-hidden="true">
        <circle cx="12" cy="9" r="3.5" stroke="currentColor" strokeWidth="1.6" />
        <path
          d="M5 20c1.5-3.5 4-5 7-5s5.5 1.5 7 5"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
        />
      </svg>
    ),
  },
];

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

export function BottomTabs() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  return (
    <nav
      aria-label="Main"
      className="sticky bottom-0 z-30 border-t border-ds-line bg-ds-card/95 backdrop-blur-md"
    >
      <div className="mx-auto flex max-w-[430px] items-stretch px-2 pb-[max(env(safe-area-inset-bottom),8px)] pt-1">
        {NAV_ITEMS.map((item) => (
          <TabItem key={item.to} to={item.to} label={item.label} active={item.active(pathname)}>
            {item.icon("size-5")}
          </TabItem>
        ))}
      </div>
    </nav>
  );
}

const RAIL_FOCUS =
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ds-choice";

function RailLink({
  to,
  label,
  active,
  labelled,
  icon,
}: {
  to: string;
  label: string;
  active: boolean;
  labelled: boolean;
  icon: ReactNode;
}) {
  return (
    <Link
      to={to}
      aria-label={label}
      title={labelled ? undefined : label}
      aria-current={active ? "page" : undefined}
      className={`ds-type-footnote flex min-h-[52px] items-center rounded-2xl border-2 font-extrabold uppercase tracking-wide transition-colors motion-reduce:transition-none ${RAIL_FOCUS} ${
        labelled ? "gap-3.5 px-3.5" : "w-[60px] justify-center"
      } ${
        active
          ? "border-ds-choice bg-ds-choice-tint text-ds-choice"
          : "border-transparent text-ds-ink-soft hover:bg-ds-sunk"
      }`}
    >
      <span className={active ? "text-ds-choice" : "text-ds-ink-faint"}>{icon}</span>
      {labelled ? <span>{label}</span> : null}
    </Link>
  );
}

/**
 * The left rail from 768 up: the five places, then Settings and who is learning. Labelled from 1280, icons only
 * below that. It is the one "Main" navigation landmark at these widths (the tab bar is not drawn), and the current
 * page is marked with aria-current exactly as the tab bar does.
 */
export function DesktopRail({ labelled }: { labelled: boolean }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const course = useProgress((s) => s.course);
  const level = useProgress((s) => s.cefrLevel);
  const courseMeta = COURSES.find((c) => c.id === course);
  return (
    <div
      data-shell-rail=""
      className={`sticky top-0 flex h-dvh shrink-0 flex-col border-r border-ds-line bg-ds-card/90 py-5 ${
        labelled ? "w-[248px] px-3.5" : "w-[84px] items-center px-2.5"
      }`}
    >
      <Link
        to="/learn"
        aria-label="Learn with Alphonso, home"
        className={`mb-4 flex items-center gap-2.5 rounded-xl ${RAIL_FOCUS} ${labelled ? "px-2.5" : ""}`}
      >
        <img
          src="/icon-192.png"
          alt=""
          width={36}
          height={36}
          data-brand-mark=""
          className="size-9 rounded-[10px]"
        />
        {labelled ? (
          <span className="ds-type-title font-extrabold text-ds-brand">Alphonso</span>
        ) : null}
      </Link>
      <nav aria-label="Main" className="flex flex-col gap-1.5">
        {NAV_ITEMS.map((item) => (
          <RailLink
            key={item.to}
            to={item.to}
            label={item.label}
            active={item.active(pathname)}
            labelled={labelled}
            icon={item.icon("size-6")}
          />
        ))}
      </nav>
      <div className={`mt-auto flex flex-col gap-1.5 ${labelled ? "" : "items-center"}`}>
        <Link
          to="/profile"
          aria-label="Settings"
          title={labelled ? undefined : "Settings"}
          className={`ds-type-footnote flex min-h-[44px] items-center rounded-2xl font-bold text-ds-ink-soft transition-colors hover:bg-ds-sunk motion-reduce:transition-none ${RAIL_FOCUS} ${
            labelled ? "gap-3.5 px-3.5" : "w-[60px] justify-center"
          }`}
        >
          <svg
            viewBox="0 0 24 24"
            className="size-6 text-ds-ink-faint"
            fill="none"
            aria-hidden="true"
          >
            <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="1.6" />
            <path
              d="M12 3v2.5M12 18.5V21M3 12h2.5M18.5 12H21M5.6 5.6l1.8 1.8M16.6 16.6l1.8 1.8M5.6 18.4l1.8-1.8M16.6 7.4l1.8-1.8"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
            />
          </svg>
          {labelled ? <span>Settings</span> : null}
        </Link>
        {labelled ? (
          <div
            data-rail-me=""
            className="flex items-center gap-2.5 rounded-2xl border border-ds-line bg-ds-sunk p-2.5"
          >
            <span aria-hidden="true" className="text-2xl leading-none">
              {courseMeta?.flag}
            </span>
            <div className="min-w-0">
              <p className="ds-type-footnote truncate font-extrabold text-ds-ink">
                {courseMeta?.label ?? "Learner"}
              </p>
              <p className="ds-type-caption text-ds-ink-soft">Level {level}</p>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}

/** The widths the main column takes in each tier (the panel, when there is one, takes the rest). */
function mainColumnClass(tier: ViewportTier, withPanel: boolean): string {
  if (!hasPanel(tier)) return "w-full max-w-[760px]";
  if (!withPanel) return "w-full max-w-[880px]";
  // Shrinkable in both tiers: 720 is a CAP in the wide tier, not a width. A fixed 720 beside the 336 panel and the 248
  // rail needs 1392px and overflowed a 1280 window (src/components/shell/desktop-layout.ts).
  return tier === "wide" ? "min-w-0 flex-1 max-w-[720px]" : "min-w-0 flex-1";
}

function DesktopFrame({
  children,
  aboveTabs,
  panel,
  tier,
}: {
  children: ReactNode;
  aboveTabs?: ReactNode;
  panel?: ReactNode | null;
  tier: ViewportTier;
}) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const plan = panel === undefined ? panelPlanFor(pathname) : null;
  const withPanel = hasPanel(tier) && (panel !== undefined ? panel !== null : plan !== null);
  return (
    <div className="grain min-h-dvh bg-ds-surface text-ds-ink">
      <div className="mx-auto flex min-h-dvh max-w-[1400px]">
        <DesktopRail labelled={tier === "wide"} />
        <div className="flex min-w-0 flex-1 justify-center gap-6 px-4 xl:px-8">
          <div
            data-shell-main=""
            className={`flex min-h-dvh flex-col bg-ds-surface/60 ${mainColumnClass(tier, withPanel)}`}
          >
            {/* Under 1024 there is no panel, so the stats ride as a strip at the top of the page. */}
            {tier === "tablet" ? <TopBar strip /> : null}
            <main id="main-content" className="flex-1">
              {children}
            </main>
            {/* The mini player (and the Hector composer) dock to the bottom of the main column. Outside <main>: the
                audio element lives in the shell, so walking between pages never unmounts the player. */}
            <div data-testid="bottom-dock" className="sticky bottom-0 z-30">
              {aboveTabs}
              <PodcastPlayer />
            </div>
          </div>
          {withPanel ? (
            <aside
              aria-label="Your progress"
              data-shell-panel=""
              className="sticky top-0 max-h-dvh w-[280px] shrink-0 self-start overflow-y-auto py-6 xl:w-[336px]"
            >
              {panel !== undefined ? (
                panel
              ) : plan ? (
                <Suspense fallback={null}>
                  <DesktopPanel plan={plan} />
                </Suspense>
              ) : null}
            </aside>
          ) : null}
        </div>
      </div>
    </div>
  );
}

export function MobileFrame({
  children,
  aboveTabs,
  panel,
}: {
  children: ReactNode;
  /** Rides in the sticky dock above the player and tabs (the Hector composer). */
  aboveTabs?: ReactNode;
  /**
   * The desktop right panel (1024 and up) for this page. Leave it out for the route's standard panel (panel-config.ts),
   * pass `null` for none, or pass the page's own (Hector's scenario and memory). Phones never draw it.
   */
  panel?: ReactNode | null;
}) {
  const tier = useViewportTier();
  // Known and accepted: the phone and desktop frames are different trees, so crossing 768 (rotating a tablet,
  // resizing a window) remounts the page content and the mini player. Playback itself survives: the <audio> element
  // lives beside the router's Outlet, not in either frame.
  if (tier !== "phone") {
    return (
      <DesktopFrame tier={tier} aboveTabs={aboveTabs} panel={panel}>
        {children}
      </DesktopFrame>
    );
  }
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

/**
 * Focus mode: a lesson, a call, a story, the campaign. A phone gets the 430px column it always had; from 768 up it is
 * a centred ~640px view with no rail and no panel, so nothing competes with the exercise.
 */
export function LessonFrame({ children }: { children: ReactNode }) {
  return (
    <div className="grain min-h-dvh bg-ds-surface text-ds-ink">
      <main
        id="main-content"
        data-focus-mode=""
        className="mx-auto flex min-h-dvh max-w-[430px] flex-col bg-ds-surface/60 md:max-w-[640px] md:border-x md:border-ds-line"
      >
        {children}
      </main>
    </div>
  );
}
