import { Link } from "@tanstack/react-router";
import type { Course } from "@/data/courses";
import { usePath } from "@/lib/learning-path-client";
import { PATH_TYPE_INFO } from "@/lib/path-plan";
import { TypeBadge } from "./PathParts";

/**
 * Profile: the "My path" card and one tile per activity type with its streak (days in a row you did that type) and
 * this week's minutes (mock: mocks-r8 P1). Same data as the Learn card, from /api/learning-path. With no goal the card
 * is a link to Build my path; while loading or failing it shows nothing, so the Profile never blocks on it.
 */
export function PathProfileCard({ course }: { course: Course }) {
  const { state } = usePath(course);
  if (state.kind === "loading" || state.kind === "error") return null;
  if (state.kind === "none") {
    return (
      <section
        aria-label="My path"
        className="rounded-[18px] border-2 border-ds-line bg-ds-card p-3.5"
      >
        <h2 className="ds-type-headline font-extrabold text-ds-ink">My path</h2>
        <p className="mt-1 ds-type-footnote text-ds-ink-soft">
          Build a daily plan from your goal: lessons, podcasts, talks and story campaigns.
        </p>
        <Link
          to="/path/build"
          className="mt-2 inline-flex min-h-11 items-center rounded-full bg-ds-ink px-5 text-sm font-semibold text-ds-card"
        >
          Build my path
        </Link>
      </section>
    );
  }
  const p = state.path;
  const pct = p.weekMinutes
    ? Math.min(100, Math.round((100 * p.weekDoneMinutes) / p.weekMinutes))
    : 0;
  return (
    <section aria-label="My path" className="grid gap-2.5">
      <div className="rounded-[18px] bg-ds-hero p-3.5 text-ds-on-hero">
        <div className="flex items-center gap-3">
          <div className="min-w-0 flex-1">
            <small className="ds-type-overline text-ds-on-hero-kick">My path</small>
            <p className="font-display text-lg font-extrabold">Finish {p.goalLabel}</p>
          </div>
          <Link
            to="/path"
            className="inline-flex min-h-11 items-center rounded-full bg-ds-xp px-4 text-sm font-extrabold text-ds-ink"
          >
            {p.statusLine}
          </Link>
        </div>
        <div
          role="progressbar"
          aria-label="Minutes this week"
          aria-valuemin={0}
          aria-valuemax={p.weekMinutes}
          aria-valuenow={Math.min(p.weekDoneMinutes, p.weekMinutes)}
          className="my-2.5 h-2.5 overflow-hidden rounded-full bg-ds-on-hero/20"
        >
          <i className="block h-full rounded-full bg-ds-xp" style={{ width: `${pct}%` }} />
        </div>
        <small className="text-ds-on-hero-soft">
          This week: {p.weekDoneMinutes} of {p.weekMinutes} min
        </small>
      </div>
      <ul aria-label="Streak and minutes per activity" className="grid grid-cols-4 gap-1.5">
        {p.streaks.map((s) => (
          <li key={s.type}>
            <Link
              to="/path/week"
              aria-label={`${PATH_TYPE_INFO[s.type].label}: ${s.days} ${s.days === 1 ? "day" : "days"} in a row, ${s.weekMinutes} minutes this week`}
              className="flex min-h-24 flex-col items-center rounded-[14px] border-2 border-ds-line bg-ds-card px-1 py-2 text-center"
            >
              <TypeBadge type={s.type} small />
              <b className="mt-1 font-display text-base font-extrabold text-ds-ink">{s.days}d</b>
              <small className="ds-type-caption font-bold text-ds-ink-soft">
                {s.weekMinutes} min
              </small>
              <small className="ds-type-caption font-bold text-ds-ink-soft">
                {PATH_TYPE_INFO[s.type].label}
              </small>
            </Link>
          </li>
        ))}
      </ul>
      <p className="ds-type-caption text-ds-ink-soft">
        Days in a row and minutes this week, per activity.
      </p>
    </section>
  );
}
