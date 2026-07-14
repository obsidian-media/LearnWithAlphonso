import { createFileRoute } from "@tanstack/react-router";
import { Link } from "@tanstack/react-router";
import { motion } from "framer-motion";
import { MobileFrame } from "../components/AppShell";
import { CheckIcon, LockIcon, StarIcon } from "../components/icons";
import { curriculum } from "../data/curriculum";
import { useProgress } from "../lib/progress";

export const Route = createFileRoute("/")({
  component: LearnPage,
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
  const translateX =
    offset === 0 ? "0" : offset === 1 ? "56px" : offset === 2 ? "0" : "-56px";

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

  return (
    <MobileFrame>
      <div className="px-6 pb-10 pt-6">
        {curriculum.map((unit, ui) => {
          const allDone =
            hydrated && unit.lessons.every((l) => completed.includes(l.id));
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
                  {hydrated
                    ? unit.lessons.filter((l) => completed.includes(l.id)).length
                    : 0}
                  /{unit.lessons.length}
                </div>
              </header>

              <div className="relative flex flex-col items-center gap-7">
                {unit.lessons.map((lesson, li) => {
                  const isDone = hydrated && completed.includes(lesson.id);
                  // The first not-done lesson in the very first not-done unit is "active".
                  const globalIndex = ui * 100 + li;
                  const firstUndoneUnit = curriculum.find((u) =>
                    u.lessons.some((l) => !completed.includes(l.id)),
                  );
                  const firstUndoneLesson =
                    firstUndoneUnit?.lessons.find((l) => !completed.includes(l.id));
                  const isActive =
                    hydrated && !isDone && firstUndoneLesson?.id === lesson.id;
                  const isLocked = hydrated && !isDone && !isActive;
                  const state = isDone
                    ? "done"
                    : isActive
                      ? "active"
                      : isLocked
                        ? "locked"
                        : "active";

                  return (
                    <LessonNode
                      key={lesson.id}
                      state={state}
                      index={globalIndex}
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
                    <p className="text-xs text-ink-soft">You mastered {unit.title.toLowerCase()}.</p>
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
