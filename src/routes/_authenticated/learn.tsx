import { createFileRoute, Link } from "@tanstack/react-router";
import { motion } from "framer-motion";
import { useEffect, useMemo, useState } from "react";
import { MobileFrame } from "../../components/AppShell";
import { WeeklyChallengesCard } from "../../components/WeeklyChallengesCard";
import { CheckIcon, LockIcon, StarIcon } from "../../components/icons";
import { SegmentedControl } from "../../components/SegmentedControl";
import { HeartsModal } from "../../components/HeartsModal";
import { LEVELS, type Level } from "../../data/curriculum";
import { COURSES, getCourse } from "../../data/courses";
import { useProgress } from "../../lib/progress";
import { useTheme } from "../../lib/theme";
import { useServerFn } from "@tanstack/react-start";
import {
  setCefrLevel,
  fetchProgress,
  restoreHeartsRemote,
  buyHeartWithXpRemote,
} from "../../lib/sync.functions";
import { fetchDueReviews } from "../../lib/review.functions";
import { XP_HEART_COST } from "../../lib/hearts";

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
  blocked,
  onBlockedClick,
}: {
  state: "done" | "active" | "locked";
  index: number;
  lessonId: string;
  title: string;
  blocked: boolean;
  onBlockedClick: () => void;
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
  if (state === "locked")
    return (
      <div role="note" aria-label={`${title} (locked)`}>
        {button}
      </div>
    );
  if (blocked) {
    return (
      <button type="button" onClick={onBlockedClick} aria-label={`Start ${title} (out of hearts)`}>
        {button}
      </button>
    );
  }
  return (
    <Link to="/lesson/$id" params={{ id: lessonId }} aria-label={`Start ${title}`}>
      {button}
    </Link>
  );
}

function LearnPage() {
  const isStudioInk = useTheme((s) => s.theme === "studio-ink");
  const completed = useProgress((s) => s.completedLessons);
  const hydrated = useProgress((s) => s.hydrated);
  const level = useProgress((s) => s.cefrLevel) as Level;
  const placementTakenAt = useProgress((s) => s.placementTakenAt);
  const setCefrLevelLocal = useProgress((s) => s.setCefrLevelLocal);
  const course = useProgress((s) => s.course);
  const setCourse = useProgress((s) => s.setCourse);
  const hydrate = useProgress((s) => s.hydrate);
  const setLoading = useProgress((s) => s.setLoading);
  const hearts = useProgress((s) => s.hearts);
  const heartsRefillAt = useProgress((s) => s.heartsRefillAt);
  const xp = useProgress((s) => s.xp);
  const restoreHeartsLocal = useProgress((s) => s.restoreHeartsLocal);
  const spendXpForHeartLocal = useProgress((s) => s.spendXpForHeartLocal);
  const saveLevel = useServerFn(setCefrLevel);
  const loadProgress = useServerFn(fetchProgress);
  const loadDueReviews = useServerFn(fetchDueReviews);
  const restoreHearts = useServerFn(restoreHeartsRemote);
  const buyHeartWithXp = useServerFn(buyHeartWithXpRemote);
  const placed = !hydrated || Boolean(placementTakenAt);
  const curriculum = getCourse(course).curriculum;
  const outOfHearts = hydrated && hearts <= 0;
  const [showHeartsModal, setShowHeartsModal] = useState(false);
  const [dueCount, setDueCount] = useState(0);
  const [buyHeartError, setBuyHeartError] = useState<string | null>(null);

  useEffect(() => {
    if (!hydrated) return;
    let alive = true;
    void loadDueReviews({ data: { course } })
      .then((res) => {
        if (alive) setDueCount(res.due.length);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [hydrated, course, loadDueReviews]);

  function pick(next: Level) {
    setCefrLevelLocal(next);
    void saveLevel({ data: { level: next, course } }).catch(() => {});
  }

  function handleRefillDue() {
    restoreHeartsLocal();
    void restoreHearts().catch(() => {});
  }

  function handleBuyWithXp() {
    // Applied only after the server confirms the purchase (not
    // optimistically) so a failed purchase -- hearts already full, not
    // enough XP -- shows a real reason instead of a silent flicker-then-
    // revert.
    setBuyHeartError(null);
    void buyHeartWithXp({ data: { course } })
      .then((res) => {
        if (res.ok) {
          spendXpForHeartLocal(res.cost);
        } else {
          setBuyHeartError(
            res.reason === "hearts-full" ? "Hearts already full." : "Not enough XP for a heart.",
          );
        }
      })
      .catch(() => {
        setBuyHeartError("Something went wrong — try again.");
      });
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

  const completedSet = useMemo(() => new Set(completed), [completed]);
  const units = useMemo(() => curriculum.filter((u) => u.level === level), [curriculum, level]);
  const levelLessons = useMemo(() => units.flatMap((u) => u.lessons), [units]);
  const levelDone = hydrated ? levelLessons.filter((l) => completedSet.has(l.id)).length : 0;
  const pct = levelLessons.length ? Math.round((levelDone / levelLessons.length) * 100) : 0;
  const meta = LEVELS.find((l) => l.id === level)!;
  const firstUndone = levelLessons.find((l) => !completedSet.has(l.id));
  const levelCompletion = useMemo(() => {
    const map = new Map<Level, boolean>();
    for (const l of LEVELS) {
      map.set(
        l.id,
        curriculum
          .filter((u) => u.level === l.id)
          .flatMap((u) => u.lessons)
          .every((ls) => completedSet.has(ls.id)),
      );
    }
    return map;
  }, [curriculum, completedSet]);

  return (
    <MobileFrame>
      <div className="px-6 pb-10 pt-6">
        <h1 className="sr-only">Learn</h1>
        <div className="mb-6 flex gap-2">
          {COURSES.map((c) => (
            <button
              key={c.id}
              type="button"
              aria-pressed={c.id === course}
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

        <div className="mb-6">
          <WeeklyChallengesCard />
        </div>

        {!placed &&
          (isStudioInk ? (
            <motion.div
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              className="mb-6 border-b border-hairline pb-5"
            >
              <p className="font-display text-base font-semibold text-ink">
                Not sure where to start?
              </p>
              <p className="mt-1 text-xs text-ink-soft/80">
                Take a quick placement test and we&apos;ll set your CEFR level for you.
              </p>
              <Link
                to="/placement"
                className="mt-3 inline-block text-[12px] font-semibold text-moss underline underline-offset-4"
              >
                Take the placement test →
              </Link>
            </motion.div>
          ) : (
            <motion.div
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              className="mb-6 rounded-2xl border border-ember/30 bg-ember/10 p-4"
            >
              <p className="font-display text-base font-semibold text-ink">
                Not sure where to start?
              </p>
              <p className="mt-1 text-xs text-ink-soft/80">
                Take a quick placement test and we&apos;ll set your CEFR level for you.
              </p>
              <Link
                to="/placement"
                className="mt-3 inline-block rounded-full bg-ink px-4 py-2 text-[12px] font-semibold text-surface"
              >
                Take the placement test
              </Link>
            </motion.div>
          ))}

        <Link
          to="/review"
          className={
            isStudioInk
              ? "mb-6 flex items-center justify-between border-b border-hairline pb-4 transition hover:opacity-80"
              : "mb-6 flex items-center justify-between rounded-2xl border border-hairline bg-surface px-4 py-3.5 transition hover:border-ink/30"
          }
        >
          <span>
            <span className="flex items-center gap-2">
              <span className="block font-display text-base font-semibold text-ink">
                Review missed items
              </span>
              {dueCount > 0 && (
                <span
                  className="tnum grid min-w-5 place-items-center rounded-full bg-ember px-1.5 py-0.5 text-[11px] font-semibold text-surface"
                  aria-label={`${dueCount} item${dueCount === 1 ? "" : "s"} due`}
                >
                  {dueCount}
                </span>
              )}
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
              const done = hydrated ? (levelCompletion.get(l.id) ?? false) : false;
              return { value: l.id, label: done && l.id !== level ? `${l.id} ✓` : l.id };
            })}
          />
        </div>

        <div
          className={
            isStudioInk
              ? "mb-8 border-b border-hairline pb-4"
              : "mb-8 rounded-2xl border border-hairline bg-parchment p-4"
          }
        >
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
          const allDone = hydrated && unit.lessons.every((l) => completedSet.has(l.id));
          return (
            <section key={unit.id} className="mb-14 last:mb-4">
              <header className="mb-8 flex items-end justify-between">
                <div className="relative">
                  {isStudioInk && (
                    <span
                      aria-hidden
                      className="pointer-events-none absolute -left-1 -top-3 font-display text-[64px] font-semibold leading-none text-ink/5"
                    >
                      {String(ui + 1).padStart(2, "0")}
                    </span>
                  )}
                  <p className="relative mb-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-ember">
                    {unit.eyebrow}
                  </p>
                  <h2 className="relative text-balance font-display text-[28px] font-semibold leading-[1.05] text-ink">
                    {unit.title}
                  </h2>
                  <p className="relative mt-1.5 max-w-[260px] text-sm text-ink-soft/80">
                    {unit.description}
                  </p>
                </div>
                <div className="tnum shrink-0 rounded-full border border-hairline bg-surface px-2.5 py-1 text-[11px] font-medium text-ink-soft">
                  {hydrated ? unit.lessons.filter((l) => completedSet.has(l.id)).length : 0}/
                  {unit.lessons.length}
                </div>
              </header>
              <div className="relative flex flex-col items-center gap-7">
                {unit.lessons.map((lesson, li) => {
                  const isDone = hydrated && completedSet.has(lesson.id);
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
                      blocked={outOfHearts}
                      onBlockedClick={() => setShowHeartsModal(true)}
                    />
                  );
                })}
                {allDone &&
                  (isStudioInk ? (
                    <div className="mt-4 w-full border-t border-hairline pt-5 text-center">
                      <div className="mx-auto mb-2 grid size-10 place-items-center rounded-full bg-moss text-surface">
                        <StarIcon className="size-5" />
                      </div>
                      <p className="font-display text-base font-semibold">Unit complete</p>
                      <p className="text-xs text-ink-soft">
                        You mastered {unit.title.toLowerCase()}.
                      </p>
                    </div>
                  ) : (
                    <div className="mt-4 w-full rounded-2xl border border-hairline bg-parchment p-5 text-center">
                      <div className="mx-auto mb-2 grid size-10 place-items-center rounded-full bg-moss text-surface">
                        <StarIcon className="size-5" />
                      </div>
                      <p className="font-display text-base font-semibold">Unit complete</p>
                      <p className="text-xs text-ink-soft">
                        You mastered {unit.title.toLowerCase()}.
                      </p>
                    </div>
                  ))}
              </div>
            </section>
          );
        })}
      </div>
      <HeartsModal
        open={showHeartsModal}
        refillAt={heartsRefillAt}
        xp={xp}
        buyError={buyHeartError}
        onClose={() => {
          setShowHeartsModal(false);
          setBuyHeartError(null);
        }}
        onRefillDue={handleRefillDue}
        onBuyWithXp={handleBuyWithXp}
      />
    </MobileFrame>
  );
}
