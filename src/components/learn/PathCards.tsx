import { Link } from "@tanstack/react-router";
import { useState } from "react";
import type { Course } from "@/data/courses";
import { saveGoal } from "@/lib/learning-goal-client";
import { usePath } from "@/lib/learning-path-client";
import type { LearningPath } from "@/lib/path-plan";
import { ItemLink, ItemRow } from "../path/PathParts";

const CARD = "rounded-[18px] border-2 border-ds-line bg-ds-card p-3";

/** "Your path is ready": the suggested goal, what it was built from, and the two ways to answer it. */
export function PathReadyCard({
  course,
  path,
  onSaved,
}: {
  course: Course;
  path: LearningPath;
  onSaved: () => void;
}) {
  const [saving, setSaving] = useState(false);
  const [failed, setFailed] = useState(false);
  async function accept() {
    setSaving(true);
    setFailed(false);
    try {
      await saveGoal(course, path.progress.targetLevel, path.progress.targetDate);
      onSaved();
    } catch {
      setFailed(true);
    } finally {
      setSaving(false);
    }
  }
  return (
    <section aria-label="Your path is ready" className={CARD}>
      <span className="ds-type-overline block text-ds-right-ink">Your path is ready</span>
      <b className="font-display block text-xl font-extrabold text-ds-ink">{path.goalLabel}</b>
      <p className="text-sm text-ds-ink-soft">{path.goal.built}</p>
      <div className="mt-2.5 flex gap-2">
        <button
          type="button"
          disabled={saving}
          onClick={() => void accept()}
          className="min-h-11 flex-1 rounded-full bg-ds-ink px-4 text-sm font-bold text-ds-card"
        >
          Looks good
        </button>
        <Link
          to="/path/build"
          className="inline-flex min-h-11 flex-1 items-center justify-center rounded-full border-2 border-ds-line px-4 text-sm font-bold text-ds-ink"
        >
          Change target
        </Link>
      </div>
      {failed ? (
        <p role="alert" className="mt-2 text-xs font-medium text-ds-wrong-ink">
          Couldn&apos;t save that. Try again.
        </p>
      ) : null}
    </section>
  );
}

/** "Today": the normal plan. The weak-spot items are not here; they have their own card below. */
export function TodayCard({ path }: { path: LearningPath }) {
  const items = path.today.items;
  if (items.length === 0) return null;
  const done = items.filter((i) => i.state === "done").length;
  return (
    <section aria-label="Today" className={`${CARD} grid gap-2`}>
      <div className="flex items-baseline justify-between">
        <h2 className="font-display text-lg font-extrabold text-ds-ink">Today</h2>
        <span className="text-xs text-ds-ink-soft">
          {done} of {items.length} · {items.reduce((sum, i) => sum + i.minutes, 0)} min
        </span>
      </div>
      <ul className="grid gap-2">
        {items.map((item) => (
          <li key={`${item.type}-${item.id}`}>
            <ItemRow item={item} />
          </li>
        ))}
      </ul>
    </section>
  );
}

/** "Fix before it sticks": the weak-spot items together, one button to start the first. Hidden with nothing to fix. */
export function FixCard({ path }: { path: LearningPath }) {
  const fix = path.fix;
  if (!fix || fix.items.length === 0) return null;
  const first = fix.items[0];
  return (
    <section aria-label="Fix before it sticks" className={`${CARD} grid gap-2`}>
      <div className="flex items-start gap-2.5">
        <img
          src="/avatar/base.webp"
          alt=""
          width={48}
          height={48}
          className="size-12 shrink-0 rounded-full bg-ds-sunk object-cover object-top"
        />
        <div>
          <span className="ds-type-overline block text-ds-heart-text">{fix.overline}</span>
          <b className="ds-type-headline block text-ds-ink">{fix.title}</b>
        </div>
      </div>
      <ul className="grid gap-2">
        {fix.items.map((item) => (
          <li key={item.id}>
            <ItemRow item={item} />
          </li>
        ))}
      </ul>
      <ItemLink
        item={first}
        className="inline-flex min-h-11 items-center justify-center rounded-full bg-ds-ink px-4 text-sm font-bold text-ds-card"
      >
        Fix them now
      </ItemLink>
    </section>
  );
}

/** Learn's three path cards, between the map and the For you rail. Renders nothing until the path is known. */
export function PathCards({ course }: { course: Course }) {
  const { state, reload } = usePath(course);
  if (state.kind !== "ready") return null;
  const path = state.path;
  return (
    <div className="my-4 grid gap-3">
      {path.goal.suggested ? (
        <PathReadyCard course={course} path={path} onSaved={() => void reload()} />
      ) : null}
      <TodayCard path={path} />
      <FixCard path={path} />
    </div>
  );
}
