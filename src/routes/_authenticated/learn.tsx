import { createFileRoute, Link } from "@tanstack/react-router";
import { motion } from "framer-motion";
import { MobileFrame } from "../../components/AppShell";
import { CheckIcon, LockIcon, StarIcon } from "../../components/icons";
import { SegmentedControl } from "../../components/SegmentedControl";
import { LEVELS, type Level } from "../../data/curriculum";
import { COURSES, getCourse } from "../../data/courses";
import { useProgress } from "../../lib/progress";
import { useServerFn } from "@tanstack/react-start";
import { setCefrLevel, fetchProgress } from "../../lib/sync.functions";

export const Route = createFileRoute("/_authenticated/learn")({
  component: LearnPage,
  head: () => ({
    meta: [
      { title: "Learn — Alphonso" },
      { name: "description", content: "Your English learning path with bite-size lessons." },
      { property: "og:title", content: "Learn — Alphonso" },
      { property: "og:description", content: "Bite-size English lessons that stick." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

function LessonNode({
  state,
  index,
  lessonId,
  title,
}: {
  state: "done" | "active" | "locked";
  index: number;
  lessonId: string;
  title: string;
}) {
  const offset = index % 4;
  const translateX = offset === 0 ? "0" : offset === 1 ? "56px" : offset === 2 ? "0" : "-56px";
  const inner =
    state === "done" ? (
      <CheckIcon className="size-7" />
    ) : state === "locked" ? (
      <LockIcon className="size-6" />
    ) : (
      <StarIcon className="size-7" />
    );
  const baseClasses =
    "relative grid size-[72px] place-items-center rounded-full transition-transform";
  const stateClasses =
    state === "done"
      ? "bg-moss text-surface hard-shadow"
      : state === "active"
        ? "bg-ember text-surface hard-shadow-ember"
        : "bg-parchment text-ink-soft/40 ring-1 ring-hairline";
  const button = (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.05, duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
      style={{ transform: `translateX(${translateX})` }}
      className="relative flex flex-col items-center"
    >
      {state === "active" && (
        <span className="absolute -inset-2 -z-10 animate-ping rounded-full bg-ember/25" />
      )}
      <div className={`${baseClasses} ${stateClasses}`}>{inner}</div>
      {state === "active" && (
        <span className="mt-3 rounded-full bg-ink px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-surface">
          Start
        </span>
      )}
      {state !== "active" && (
        <span className="mt-2 max-w-[110px] text-center text-[11px] font-medium text-ink-soft/70">
          {title}
        </span>
      )}
    </motion.div>
  );
  if (state === "locked") return <div>{button}</div>;
  return (
    <Link to="/lesson/$id" params={{ id: lessonId }} aria-label={`Start ${title}`}>
      {button}
    </Link>
  );
}

function LearnPage() {
  const completed = useProgress((s) => s.completedLessons);
  const hydrated = useProgress((s) => s.hydrated);
  const level = useProgress((s) => s.cefrLevel) as Level;
  const placementTakenAt = useProgress((s) => s.placementTakenAt);
  const setCefrLevelLocal = useProgress((s) => s.setCefrLevelLocal);
  const course = useProgress((s) => s.course);
  const setCourse = useProgress((s) => s.setCourse);
  const hydrate = useProgress((s) => s.hydrate);
  const setLoading = useProgress((s) => s.setLoading);
  const saveLevel = useServerFn(setCefrLevel);
  const loadProgress = useServerFn(fetchProgress);
  const placed = !hydrated || Boolean(placementTakenAt);
  const curriculum = getCourse(course).curriculum;

  function pick(next: Level) {
    setCefrLevelLocal(next);
    void saveLevel({ data: { level: next, course } }).catch(() => {});
  }

  async function switchCourse(next: typeof course) {
    if (next === course) return;
    setCourse(next);
    setLoading(true);
    try {
      const snap = await loadProgress({ data: { course: next } });
      hydrate(snap);
    } finally {
      setLoading(false);
    }
  }

  const units = curriculum.filter((u) => u.level === level);
  const levelLessons = units.flatMap((u) => u.lessons);
  const levelDone = hydrated ? levelLessons.filter((l) => completed.includes(l.id)).length : 0;
  const pct = levelLessons.length ? Math.round((levelDone / levelLessons.length) * 100) : 0;
  const meta = LEVELS.find((l) => l.id === level)!;
  const firstUndone = levelLessons.find((l) => !completed.includes(l.id));

  return (
    <MobileFrame>
      <div className="px-6 pb-10 pt-6">
        <div className="mb-6 flex gap-2">
          {COURSES.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => void switchCourse(c.id)}
              className={`flex-1 rounded-2xl border px-3 py-2.5 text-sm font-semibold transition ${
                c.id === course
                  ? "border-ink bg-ink text-surface"
                  : "border-hairline bg-surface text-ink-soft hover:bg-parchment"
              }`}
            >
              {c.flag} {c.label}
            </button>
          ))}
        </div>

        {!placed && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-6 rounded-2xl border border-ember/30 bg-ember/10 p-4"
          >
            <p className="font-display text-base font-semibold text-ink">
              Not sure where to start?
            </p>
            <p className="mt-1 text-xs text-ink-soft/80">
              Take a 15-question placement test and we&apos;ll set your CEFR level for you.
            </p>
            <Link
              to="/placement"
              className="mt-3 inline-block rounded-full bg-ink px-4 py-2 text-[12px] font-semibold text-surface"
            >
              Take the placement test
            </Link>
          </motion.div>
        )}

        <Link
          to="/review"
          className="mb-6 flex items-center justify-between rounded-2xl border border-hairline bg-surface px-4 py-3.5 transition hover:border-ink/30"
        >
          <span>
            <span className="block font-display text-base font-semibold text-ink">
              Review missed items
            </span>
            <span className="block text-xs text-ink-soft/80">
              Spaced repetition brings back what you got wrong.
            </span>
          </span>
          <span className="text-ink-soft">→</span>
        </Link>

        <div className="-mx-6 mb-6 overflow-x-auto px-6 pb-1 [scrollbar-width:none]">
          <SegmentedControl
            ariaLabel="Select CEFR level"
            value={level}
            onChange={pick}
            options={LEVELS.map((l) => {
              const done = hydrated
                ? curriculum
                    .filter((u) => u.level === l.id)
                    .flatMap((u) => u.lessons)
                    .every((ls) => completed.includes(ls.id))
                : false;
              return { value: l.id, label: done && l.id !== level ? `${l.id} ✓` : l.id };
            })}
          />
        </div>

        <div className="mb-8 rounded-2xl border border-hairline bg-parchment p-4">
          <div className="flex items-baseline justify-between">
            <p className="font-display text-lg font-semibold text-ink">
              {meta.id} · {meta.name}
            </p>
            <span className="tnum text-[11px] font-medium text-ink-soft">{pct}%</span>
          </div>
          <p className="mt-1 text-xs text-ink-soft/80">{meta.blurb}</p>
          <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-hairline">
            <motion.div
              className="h-full rounded-full bg-moss"
              initial={{ width: 0 }}
              animate={{ width: `${pct}%` }}
              transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
            />
          </div>
        </div>

        {units.map((unit, ui) => {
          const allDone = hydrated && unit.lessons.every((l) => completed.includes(l.id));
          return (
            <section key={unit.id} className="mb-14 last:mb-4">
              <header className="mb-8 flex items-end justify-between">
                <div>
                  <p className="mb-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-ember">
                    {unit.eyebrow}
                  </p>
                  <h1 className="text-balance font-display text-[28px] font-semibold leading-[1.05] text-ink">
                    {unit.title}
                  </h1>
                  <p className="mt-1.5 max-w-[260px] text-sm text-ink-soft/80">
                    {unit.description}
                  </p>
                </div>
                <div className="tnum shrink-0 rounded-full border border-hairline bg-surface px-2.5 py-1 text-[11px] font-medium text-ink-soft">
                  {hydrated ? unit.lessons.filter((l) => completed.includes(l.id)).length : 0}/
                  {unit.lessons.length}
                </div>
              </header>
              <div className="relative flex flex-col items-center gap-7">
                {unit.lessons.map((lesson, li) => {
                  const isDone = hydrated && completed.includes(lesson.id);
                  const isActive = hydrated && !isDone && firstUndone?.id === lesson.id;
                  const state = isDone
                    ? "done"
                    : isActive
                      ? "active"
                      : hydrated
                        ? "locked"
                        : "active";
                  return (
                    <LessonNode
                      key={lesson.id}
                      state={state}
                      index={ui * 100 + li}
                      lessonId={lesson.id}
                      title={lesson.title}
                    />
                  );
                })}
                {allDone && (
                  <div className="mt-4 w-full rounded-2xl border border-hairline bg-parchment p-5 text-center">
                    <div className="mx-auto mb-2 grid size-10 place-items-center rounded-full bg-moss text-surface">
                      <StarIcon className="size-5" />
                    </div>
                    <p className="font-display text-base font-semibold">Unit complete</p>
                    <p className="text-xs text-ink-soft">
                      You mastered {unit.title.toLowerCase()}.
                    </p>
                  </div>
                )}
              </div>
            </section>
          );
        })}
      </div>
    </MobileFrame>
  );
}
