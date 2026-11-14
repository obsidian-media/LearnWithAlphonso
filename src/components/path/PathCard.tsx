import { Link } from "@tanstack/react-router";
import type { Course } from "@/data/courses";
import { usePath } from "@/lib/learning-path-client";
import { pathGoalCard } from "@/lib/path-goal-card";
import type { LearningPath } from "@/lib/path-plan";
import { ItemRow, shortDate } from "./PathParts";

/**
 * The goal at the top of MY PATH: the target level and date, the lessons a week it takes and whether the learner is on
 * track, or an invitation to set one. It opens the goal planner (Build my path). All text comes from `pathGoalCard`.
 */
function GoalLink({ path }: { path: LearningPath | null }) {
  const card = pathGoalCard(path);
  return (
    <Link
      to="/path/build"
      data-testid="path-goal-card"
      aria-label={`${card.kicker}: ${card.headline}. ${card.detail}. ${card.hasGoal ? "Change your goal" : "Open the planner"}`}
      className="flex min-h-11 items-center gap-3 rounded-3xl border border-ds-line bg-ds-card p-4 text-left"
    >
      <span className="min-w-0 flex-1">
        <span className="ds-type-overline block text-ds-action-text">{card.kicker}</span>
        <span className="block font-display text-lg font-extrabold text-ds-ink">
          {card.headline}
        </span>
        <span className="block text-sm text-ds-ink-soft">{card.detail}</span>
      </span>
      <span aria-hidden="true" className="text-xl text-ds-ink-soft">
        ›
      </span>
    </Link>
  );
}

/**
 * The path card on Learn (mock A1): the goal in words, how far along, and today's list. It renders what
 * /api/learning-path returns; no plan maths here. With no goal yet it offers Build my path.
 */
export function PathCard({ course }: { course: Course }) {
  const { state, reload } = usePath(course);

  if (state.kind === "loading") {
    return (
      <section aria-label="My path" aria-busy="true" className="rounded-3xl bg-ds-sunk p-4">
        <p className="text-sm text-ds-ink-soft">Loading your path…</p>
      </section>
    );
  }
  if (state.kind === "error") {
    return (
      <section aria-label="My path" className="rounded-3xl bg-ds-sunk p-4">
        <p role="alert" className="text-sm font-medium text-ds-wrong-ink">
          {state.offline
            ? "You are offline. Connect to load your path."
            : "Couldn't load your path."}
        </p>
        <button
          type="button"
          onClick={() => void reload()}
          className="mt-2 min-h-11 rounded-full border border-ds-line px-4 text-xs font-medium text-ds-ink"
        >
          Try again
        </button>
      </section>
    );
  }
  if (state.kind === "none") {
    return (
      <section aria-label="My path" className="grid gap-3">
        <GoalLink path={null} />
        <p className="text-sm text-ds-ink-soft">
          With a goal we build a daily plan of lessons, podcasts, talks and story campaigns.
        </p>
      </section>
    );
  }
  const p = state.path;
  const pct = p.progress.lessonsInScope
    ? Math.round((100 * p.progress.lessonsDone) / p.progress.lessonsInScope)
    : 0;
  return (
    <section aria-label="My path" className="grid gap-3">
      <GoalLink path={p} />
      <div className="rounded-3xl bg-ds-hero p-4 text-ds-on-hero">
        <div className="flex items-center gap-3">
          <div className="min-w-0 flex-1">
            <small className="ds-type-overline text-ds-on-hero-kick">
              My path · Finish {p.goalLabel}
            </small>
            <p className="font-display text-xl font-extrabold">{p.statusLine}</p>
          </div>
          <Link
            to="/path"
            className="inline-flex min-h-11 items-center rounded-full bg-ds-xp px-4 text-sm font-extrabold text-ds-ink"
          >
            Open ›
          </Link>
        </div>
        <div
          role="progressbar"
          aria-label="Lessons toward your goal"
          aria-valuemin={0}
          aria-valuemax={p.progress.lessonsInScope}
          aria-valuenow={p.progress.lessonsDone}
          className="my-3 h-2.5 overflow-hidden rounded-full bg-ds-on-hero/20"
        >
          <i className="block h-full rounded-full bg-ds-xp" style={{ width: `${pct}%` }} />
        </div>
        <small className="text-ds-on-hero-soft">
          {p.progress.lessonsDone} of {p.progress.lessonsInScope} lessons
          {p.progress.suggestedDate && p.status === "behind"
            ? ` · ${shortDate(p.progress.suggestedDate)} fits your pace`
            : ""}
        </small>
      </div>

      <div className="flex items-baseline justify-between">
        <h2 className="font-display text-lg font-extrabold text-ds-ink">
          Today · {p.today.targetMinutes} min
        </h2>
        <span className="rounded-full border border-ds-line bg-ds-card px-3 py-1 text-xs font-bold text-ds-ink-soft">
          {p.today.minutesLeft > 0 ? `${p.today.minutesLeft} min left` : "Done for today"}
        </span>
      </div>
      {p.today.items.length > 0 ? (
        <ul className="grid gap-2">
          {p.today.items.map((item) => (
            <li key={`${item.type}:${item.id}`}>
              <ItemRow item={item} />
            </li>
          ))}
        </ul>
      ) : (
        <p className="rounded-2xl border border-ds-line bg-ds-card p-3 text-sm text-ds-ink-soft">
          Nothing planned today. Enjoy the rest.
        </p>
      )}
      <p className="text-xs text-ds-ink-soft">
        Minutes are estimates from lesson length, episode length and typical call length. Items are
        chosen when you open the app, so they match where you are.
      </p>
    </section>
  );
}
