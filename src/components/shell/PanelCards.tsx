import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { LEAGUE_TIER_META } from "../../data/achievements";
import { useProgress } from "../../lib/progress";
import { formatDuration, usePodcastPlayer } from "../../lib/podcast-player";
import { dailyGoalProgress } from "../../lib/profile-data";
import { DsIcon } from "../ds/DsIcon";
import { DsBar, DsCard, DsLinkButton, RankBadge } from "../ds/Blocks";
import { Icon3D } from "../Icon3D";
import { LeagueTierBadge } from "../LeagueTierBadge";
import { StatPill, StatPills, StatsAnnouncer } from "./ShellStats";
import { useShellStats } from "./use-shell-stats";

/*
 * The cards of the desktop right panel. Each one reads the data the phone screens already read (the progress store,
 * the profile overview and the weekly board, under the same query keys), so a panel never shows a number a screen
 * would not. The server reads are imported on demand: the shell must not pull them (and their auth middleware) into
 * every page's graph, and a phone never fetches any of this.
 */

const FOCUS =
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ds-choice";

export function PanelHeading({ children, id }: { children: ReactNode; id?: string }) {
  return (
    <h2 id={id} className="ds-type-headline font-extrabold text-ds-ink">
      {children}
    </h2>
  );
}

/** Streak, XP, hearts, the league tier and the streak freezes: the phone's top bar, as a card. */
export function StatsCard() {
  const stats = useShellStats();
  const { hydrated, leagueTier, streakFreezes } = stats;
  const tier = hydrated ? leagueTier : "bronze";
  const freezes = hydrated ? streakFreezes : 0;
  return (
    <DsCard data-panel-card="stats" aria-label="Your stats" role="group">
      <StatsAnnouncer text={stats.announcement} />
      <PanelHeading>Your streak</PanelHeading>
      <div className="flex flex-wrap items-center gap-1.5">
        <StatPills stats={stats} />
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        <Link
          to="/league"
          data-league-badge=""
          className={`flex items-center gap-1.5 rounded-full bg-ds-sunk py-0.5 pl-1 pr-2.5 ${FOCUS}`}
        >
          <LeagueTierBadge tier={tier} size="sm" />
          <span className="ds-type-footnote font-extrabold text-ds-ink">
            {LEAGUE_TIER_META[tier].label}
          </span>
        </Link>
        <StatPill
          icon={<Icon3D emoji="🛡️" size={20} />}
          value={freezes}
          color="text-ds-choice"
          label={`Streak freezes: ${freezes}`}
        />
      </div>
    </DsCard>
  );
}

/** The learner's own daily minutes goal against today, from the profile overview. No goal chosen yet: a way to set it. */
export function DailyGoalCard() {
  const course = useProgress((s) => s.course);
  const overview = useQuery({
    queryKey: ["profile-overview", course],
    queryFn: async () =>
      (await import("../../lib/profile.functions")).getProfileOverview({ data: { course } }),
    staleTime: 60_000,
    retry: false,
  });
  const o = overview.data;
  const goal = o?.dailyGoalMinutes ?? null;
  const progress = o && goal ? dailyGoalProgress(o.learning, o.today, goal) : null;
  return (
    <DsCard data-panel-card="goal" aria-label="Daily goal" role="group">
      <div className="flex items-baseline justify-between gap-2">
        <PanelHeading>Daily goal</PanelHeading>
        <Link to="/profile" className={`ds-type-footnote font-bold text-ds-choice ${FOCUS}`}>
          Edit
        </Link>
      </div>
      {overview.isPending ? (
        <p className="ds-type-footnote text-ds-ink-soft">Loading your day...</p>
      ) : progress ? (
        <>
          <DsBar
            value={progress.minutes / progress.goalMinutes}
            label={`Daily goal: ${progress.minutes} of ${progress.goalMinutes} minutes`}
            tone="xp"
          />
          <p className="tnum ds-type-footnote font-bold text-ds-ink">
            {progress.minutes} of {progress.goalMinutes} min today
          </p>
          <p className="ds-type-footnote text-ds-ink-soft">
            {progress.reached
              ? "You reached today's goal."
              : "A lesson or a practice call moves it forward."}
          </p>
        </>
      ) : (
        <p className="ds-type-footnote text-ds-ink-soft">
          {overview.isError
            ? "Your goal could not load just now."
            : "Pick a daily time in your profile to see how today is going."}
        </p>
      )}
    </DsCard>
  );
}

/** Three rows of this week's board around the learner (or the top three), from the same board as the League tab. */
export function LeagueSnippet() {
  const tier = useProgress((s) => s.leagueTier);
  const board = useQuery({
    queryKey: ["leaderboard", "global", "weekly"],
    queryFn: async () =>
      (await import("../../lib/leaderboard.functions")).getLeaderboard({
        data: { scope: "global", period: "weekly" },
      }),
    staleTime: 60_000,
    retry: false,
  });
  const rows = board.data ?? [];
  const mine = rows.findIndex((r) => r.isYou);
  const start = mine < 0 ? 0 : Math.max(0, Math.min(mine - 1, rows.length - 3));
  const shown = rows.slice(start, start + 3).map((r, i) => ({ ...r, rank: start + i + 1 }));
  return (
    <DsCard data-panel-card="league" aria-label="League" role="group">
      <div className="flex items-baseline justify-between gap-2">
        <PanelHeading>{LEAGUE_TIER_META[tier].label} league</PanelHeading>
        <Link to="/league" className={`ds-type-footnote font-bold text-ds-choice ${FOCUS}`}>
          View
        </Link>
      </div>
      {board.isPending ? (
        <p className="ds-type-footnote text-ds-ink-soft">Loading the board...</p>
      ) : shown.length === 0 ? (
        <p className="ds-type-footnote text-ds-ink-soft">
          {board.isError
            ? "The board could not load just now."
            : "Nobody is on this week's board yet. A lesson puts you on it."}
        </p>
      ) : (
        <ol className="grid gap-1.5">
          {shown.map((r) => (
            <li
              key={r.user_id}
              aria-current={r.isYou ? "true" : undefined}
              className={`flex items-center gap-2.5 rounded-2xl px-2 py-1.5 ${r.isYou ? "bg-ds-choice-tint" : ""}`}
            >
              <RankBadge rank={r.rank} />
              <span className="ds-type-footnote min-w-0 flex-1 truncate font-bold text-ds-ink">
                {r.isYou ? "You" : r.display_name}
              </span>
              <span className="tnum ds-type-footnote font-extrabold text-ds-ink-soft">
                {r.xp} XP
              </span>
            </li>
          ))}
        </ol>
      )}
    </DsCard>
  );
}

/** The way into Hector from anywhere. */
export function HectorCta() {
  return (
    <DsCard data-panel-card="hector" aria-label="Talk to Hector" role="group" tone="tint">
      <PanelHeading>Talk to Hector</PanelHeading>
      <p className="ds-type-footnote text-ds-ink-soft">
        Chat or call with your AI conversation partner.
      </p>
      <DsLinkButton to="/hector" variant="primary" full>
        <DsIcon name="mic" className="size-4" />
        Start talking
      </DsLinkButton>
    </DsCard>
  );
}

/** The episode that is loaded, with play and pause. Nothing when none is. */
export function NowPlayingCard() {
  const episode = usePodcastPlayer((s) => s.episode);
  const isPlaying = usePodcastPlayer((s) => s.isPlaying);
  const elapsed = usePodcastPlayer((s) => s.elapsedSeconds);
  const duration = usePodcastPlayer((s) => s.mediaDuration);
  const toggle = usePodcastPlayer((s) => s.toggle);
  if (!episode) return null;
  const length = duration ?? episode.durationSeconds;
  return (
    <DsCard data-panel-card="now-playing" aria-label="Now playing" role="group">
      <PanelHeading>Now playing</PanelHeading>
      <div className="flex items-center gap-3">
        <div className="min-w-0 flex-1">
          <p className="ds-type-footnote truncate font-bold text-ds-ink">{episode.title}</p>
          {length ? (
            <p className="tnum ds-type-caption text-ds-ink-soft">
              {formatDuration(Math.round(elapsed))} of {formatDuration(length)}
            </p>
          ) : null}
        </div>
        <button
          type="button"
          onClick={toggle}
          aria-label={isPlaying ? `Pause ${episode.title}` : `Play ${episode.title}`}
          className={`grid size-10 shrink-0 place-items-center rounded-full bg-ds-action text-ds-on-action ${FOCUS}`}
        >
          <span aria-hidden="true">{isPlaying ? "❚❚" : "▶"}</span>
        </button>
      </div>
    </DsCard>
  );
}
