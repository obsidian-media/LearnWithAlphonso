import { Link } from "@tanstack/react-router";
import { useState, type ReactNode } from "react";
import { Icon } from "@/components/ds/Blocks";
import type { Course } from "@/data/courses";
import { usePath } from "@/lib/learning-path-client";
import { pathGoalCard } from "@/lib/path-goal-card";
import { useTeamMission } from "@/lib/use-team-mission";
import { useWeeklyChallenges } from "@/lib/use-weekly-challenges";
import { TeamMissionCard } from "../TeamMissionCard";
import { WeeklyChallengesCard } from "../WeeklyChallengesCard";

const CARD =
  "relative flex min-h-11 w-[104px] shrink-0 flex-col gap-1 rounded-2xl border-2 border-ds-line bg-ds-card px-2.5 py-2.5 text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ds-choice";

function CardBody({
  icon,
  label,
  value,
  badge,
}: {
  icon: string;
  label: string;
  value: string;
  badge?: ReactNode;
}) {
  return (
    <>
      <Icon name={icon} size={28} />
      <span className="ds-type-footnote block font-extrabold leading-tight text-ds-ink">
        {label}
      </span>
      <span className="ds-type-caption block leading-tight text-ds-ink-soft">{value}</span>
      {badge}
    </>
  );
}

/**
 * Learn's "For you" rail: Review, the goal path, the team mission and this week's challenges as one row of small
 * cards. Review and the path open their screens; the team mission and challenges open their full card in place below
 * the rail (they have no screen of their own). Each card says what it holds in its accessible name.
 */
export function ForYouRail({ course, dueCount }: { course: Course; dueCount: number }) {
  const { state, reload } = usePath(course);
  const team = useTeamMission();
  const challenges = useWeeklyChallenges();
  const [open, setOpen] = useState<"team" | "weekly" | null>(null);

  const goal = state.kind === "ready" ? pathGoalCard(state.path) : pathGoalCard(null);
  const pathHref = state.kind === "ready" ? "/path" : "/path/build";
  const pathLabel = state.kind === "ready" ? "My path" : "Build my path";
  const pathValue = state.kind === "ready" ? goal.headline : "Set a goal";
  // Until the path is known there is no goal to show and no planner to offer.
  const pathKnown = state.kind === "ready" || state.kind === "none";

  const showTeam = team.showError || Boolean(team.mission);
  const teamValue = team.showError
    ? "Couldn't load"
    : team.mission?.status === "needs_members"
      ? "Invite a friend"
      : team.mission?.status === "complete"
        ? "Complete"
        : `${team.mission?.percent ?? 0}% done`;

  const list = challenges.challenges ?? [];
  const showWeekly = challenges.failed || list.length > 0;
  const doneCount = list.filter((c) => c.completed).length;
  const weeklyValue = challenges.failed ? "Couldn't load" : `${doneCount} of ${list.length} done`;
  // A challenge whose bar is full but not yet completed is a reward waiting to be claimed.
  const claimReady = list.some((c) => !c.completed && c.progress >= c.threshold);

  return (
    <section aria-label="For you" className="grid gap-2">
      <h2 className="font-display text-lg font-extrabold text-ds-ink">For you</h2>
      <div className="-mx-6 flex gap-2 overflow-x-auto px-6 pb-1 [scrollbar-width:none]">
        <Link
          to="/review"
          aria-label={
            dueCount > 0
              ? `Review missed items, ${dueCount} item${dueCount === 1 ? "" : "s"} due`
              : "Review missed items"
          }
          className={CARD}
        >
          <CardBody
            icon="books"
            label="Review"
            value={dueCount > 0 ? `${dueCount} due` : "All caught up"}
            badge={
              dueCount > 0 ? (
                <span
                  aria-hidden="true"
                  className="absolute right-2.5 top-2.5 size-2 rounded-full bg-ds-heart"
                />
              ) : null
            }
          />
        </Link>
        {pathKnown ? (
          <Link
            to={pathHref}
            aria-label={`${pathLabel}: ${goal.headline}. ${goal.detail}`}
            className={CARD}
          >
            <CardBody icon="compass" label={pathLabel} value={pathValue} />
          </Link>
        ) : state.kind === "loading" ? (
          <div aria-busy="true" aria-label="My path: loading" role="group" className={CARD}>
            <CardBody icon="compass" label="My path" value="Loading" />
          </div>
        ) : (
          <button
            type="button"
            aria-label="My path: couldn't load. Try again"
            onClick={() => void reload()}
            className={CARD}
          >
            <CardBody icon="compass" label="My path" value="Couldn't load" />
          </button>
        )}
        {showTeam && (
          <button
            type="button"
            aria-expanded={open === "team"}
            aria-controls="for-you-detail"
            aria-label={`Team mission: ${teamValue}`}
            onClick={() => setOpen(open === "team" ? null : "team")}
            className={CARD}
          >
            <CardBody icon="handshake" label="Team mission" value={teamValue} />
          </button>
        )}
        {showWeekly && (
          <button
            type="button"
            aria-expanded={open === "weekly"}
            aria-controls="for-you-detail"
            aria-label={`Weekly challenges: ${weeklyValue}${claimReady ? ", reward ready to claim" : ""}`}
            onClick={() => setOpen(open === "weekly" ? null : "weekly")}
            className={CARD}
          >
            <CardBody
              icon="star"
              label="Weekly"
              value={weeklyValue}
              badge={
                claimReady ? (
                  <span
                    aria-hidden="true"
                    className="absolute right-2.5 top-2.5 size-2 rounded-full bg-ds-heart"
                  />
                ) : null
              }
            />
          </button>
        )}
      </div>
      <div id="for-you-detail" data-sheet>
        {open === "team" && showTeam ? <TeamMissionCard nested /> : null}
        {open === "weekly" && showWeekly ? <WeeklyChallengesCard nested /> : null}
      </div>
    </section>
  );
}
