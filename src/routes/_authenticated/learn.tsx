import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { motion } from "framer-motion";
import { useEffect, useMemo, useState } from "react";
import { MobileFrame } from "../../components/AppShell";
import { GoalCard } from "../../components/GoalCard";
import { TeamMissionCard } from "../../components/TeamMissionCard";
import { WeeklyChallengesCard } from "../../components/WeeklyChallengesCard";
import { StarIcon } from "../../components/icons";
import { Icon3D } from "../../components/Icon3D";
import { LearnMap, SpeechBubble } from "../../components/LearnMap";
import { SceneBackdrop } from "../../components/SceneBackdrop";
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
import { tileTone, type TileTone, TILE_TONE_CLASSES } from "../../lib/tile-tones";
import { pathNodeDelay, unitPathNodes } from "../../lib/unit-path";

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

/** The one loud card for the next lesson. The unit's path is drawn on the scene below it (LearnMap). */
function ContinueCard({
  unitTitle,
  lessonId,
  lessonTitle,
  blocked,
  onBlockedClick,
}: {
  unitTitle: string;
  lessonId: string;
  lessonTitle: string;
  blocked: boolean;
  onBlockedClick: () => void;
}) {
  const body = (
    <div className="card-lift flex flex-col gap-2.5 rounded-3xl bg-ember p-4 text-left text-ink-on-ember shadow-[0_5px_0_0_var(--color-edge-ember)] transition-transform active:translate-y-1">
      {/* Small text sits on surface chips: straight on ember it is below 4.5:1 in most themes. */}
      <p className="self-start rounded-full bg-surface px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-[0.16em] text-ink">
        Up next · {unitTitle}
      </p>
      <p className="font-display text-2xl font-bold leading-tight">{lessonTitle}</p>
      <span className="self-start rounded-full bg-surface px-4 py-1.5 font-display text-sm font-bold text-ink">
        Continue
      </span>
    </div>
  );
  if (blocked) {
    return (
      <button
        type="button"
        onClick={onBlockedClick}
        aria-label={`Continue: ${lessonTitle} (out of hearts)`}
        className="block w-full"
      >
        {body}
      </button>
    );
  }
  return (
    <Link
      to="/lesson/$id"
      params={{ id: lessonId }}
      aria-label={`Continue: ${lessonTitle}`}
      className="block"
    >
      {body}
    </Link>
  );
}

function LessonNode({
  state,
  index,
  placeInUnit,
  lessonId,
  title,
  blocked,
  onBlockedClick,
}: {
  state: "done" | "active" | "locked";
  index: number;
  /** The lesson's place in its own unit, which sets the entrance stagger. */
  placeInUnit: number;
  lessonId: string;
  title: string;
  blocked: boolean;
  onBlockedClick: () => void;
}) {
  const offset = index % 4;
  const translateX = offset === 0 ? "0" : offset === 1 ? "56px" : offset === 2 ? "0" : "-56px";
  const inner =
    state === "done" ? (
      <Icon3D emoji="📚" size={36} />
    ) : state === "locked" ? (
      <Icon3D emoji="🔒" size={30} className="opacity-60 grayscale" />
    ) : (
      <Icon3D emoji="🎯" size={40} />
    );
  const baseClasses =
    "relative grid size-[72px] place-items-center rounded-full transition-transform";
  const stateClasses =
    state === "done"
      ? `${TILE_TONE_CLASSES[tileTone(index)]} shadow-[0_4px_0_0_var(--color-hairline)]`
      : state === "active"
        ? "bg-ember text-ink-on-ember shadow-[0_5px_0_0_var(--color-edge-ember)]"
        : "bg-parchment text-ink-soft/40 ring-1 ring-hairline";
  const button = (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: pathNodeDelay(placeInUnit), duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
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
  const navigate = useNavigate();
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
  const streak = useProgress((s) => s.streak);
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
  const nextUnit = firstUndone
    ? units.find((u) => u.lessons.some((l) => l.id === firstUndone.id))
    : undefined;
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

  const greeting =
    hydrated && streak > 0
      ? `Nice ${streak}-day streak! Ready for today's lesson?`
      : "Ready for today's lesson?";

  return (
    <MobileFrame>
      <SceneBackdrop
        scene="learn"
        clip="learn"
        // Alphonso stands at 67% across and his head is at 54% down in the clip (scripts/import-clips.ts input).
        pin={{ x: 66, y: 53, node: <SpeechBubble text={greeting} /> }}
      />
      <div className="relative z-10 px-6 pb-10 pt-6">
        <h1 className="sr-only">Learn</h1>
        <div className="mb-5 flex gap-2">
          {COURSES.map((c) => (
            <button
              key={c.id}
              type="button"
              aria-pressed={c.id === course}
              onClick={() => void switchCourse(c.id)}
              className={`flex-1 rounded-2xl border px-3 py-2.5 text-sm font-semibold transition ${
                c.id === course
                  ? "border-ink bg-ink text-surface"
                  : "border-hairline bg-surface/90 text-ink-soft backdrop-blur-md hover:bg-parchment"
              }`}
            >
              {c.flag} {c.label}
            </button>
          ))}
        </div>

        {hydrated && firstUndone && nextUnit && (
          <div className="mb-2">
            <ContinueCard
              unitTitle={nextUnit.title}
              lessonId={firstUndone.id}
              lessonTitle={firstUndone.title}
              blocked={outOfHearts}
              onBlockedClick={() => setShowHeartsModal(true)}
            />
          </div>
        )}

        <LearnMap
          nodes={
            nextUnit
              ? unitPathNodes(
                  nextUnit.lessons.map((l) => l.id),
                  completedSet,
                )
              : []
          }
          greeting={greeting}
        />

        <div
          data-sheet
          className="-mx-6 mt-2 rounded-t-[2rem] bg-surface/95 px-6 pb-2 pt-7 shadow-[0_-12px_30px_rgba(0,0,0,0.12)] backdrop-blur-md"
        >
          <div className="mb-6">
            <TeamMissionCard />
          </div>

          <div className="mb-6">
            <WeeklyChallengesCard />
          </div>

          <div className="mb-6">
            <GoalCard course={course} />
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
                    className="tnum grid min-w-5 place-items-center rounded-full bg-ember px-1.5 py-0.5 text-[11px] font-semibold text-ink-on-ember"
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
                        placeInUnit={li}
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
        onPracticeInstead={() => {
          setShowHeartsModal(false);
          void navigate({ to: "/review" });
        }}
      />
    </MobileFrame>
  );
}
