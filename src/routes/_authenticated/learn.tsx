import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { motion } from "framer-motion";
import { useEffect, useMemo, useRef, useState } from "react";
import { MobileFrame } from "../../components/AppShell";
import { GoalCard } from "../../components/GoalCard";
import { TeamMissionCard } from "../../components/TeamMissionCard";
import { WeeklyChallengesCard } from "../../components/WeeklyChallengesCard";
import { SegmentedControl } from "../../components/SegmentedControl";
import { HeartsModal } from "../../components/HeartsModal";
import { LEVELS, type Level } from "../../data/curriculum";
import { COURSES, getCourse } from "../../data/courses";
import { useProgress } from "../../lib/progress";
import { useServerFn } from "@tanstack/react-start";
import {
  setCefrLevel,
  fetchProgress,
  restoreHeartsRemote,
  buyHeartWithXpRemote,
} from "../../lib/sync.functions";
import { fetchDueReviews } from "../../lib/review.functions";
import { XP_HEART_COST } from "../../lib/hearts";
import {
  currentUnitOf,
  foldLearn,
  roomArtFor,
  roomName,
  runLabel,
  type FoldUnit,
} from "../../lib/learn-fold";

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

/** Pinned "you are here" card: the learner's current unit on its painted room, with one Continue. */
function YouAreHere({
  index,
  count,
  unitTitle,
  level,
  lessonId,
  lessonTitle,
  blocked,
  onBlockedClick,
}: {
  index: number;
  count: number;
  unitTitle: string;
  level: string;
  lessonId: string;
  lessonTitle: string;
  blocked: boolean;
  onBlockedClick: () => void;
}) {
  const art = roomArtFor(index - 1);
  const body = (
    <span className="relative block h-[196px] overflow-hidden rounded-3xl border-2 border-ink bg-ink text-left">
      <img
        src={`/avatar/scenes/${art}.webp`}
        alt=""
        className="absolute inset-0 size-full object-cover"
      />
      <span
        aria-hidden="true"
        className="absolute inset-0 bg-gradient-to-t from-ink/85 via-ink/20 to-transparent"
      />
      <img
        src="/alphonso/lesson/happy.webp"
        alt=""
        className="pointer-events-none absolute -bottom-1.5 -right-3.5 w-32"
      />
      <span className="absolute left-4 top-3.5 text-[11px] font-extrabold uppercase tracking-[0.08em] text-surface">
        You are here · Unit {index} of {count}
      </span>
      <span className="absolute bottom-3.5 left-4 right-28 grid gap-0.5 text-surface">
        <span className="text-[12.5px] font-semibold">
          {roomName(art)} · {level} · {unitTitle}
        </span>
        <span className="font-display text-[22px] font-bold leading-[1.05]">{lessonTitle}</span>
        <span className="mt-2 inline-flex min-h-11 items-center self-start rounded-full bg-ember px-4 font-display text-sm font-bold text-ink-on-ember">
          Continue →
        </span>
      </span>
    </span>
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
      aria-label={`Continue: ${lessonTitle}, unit ${index} of ${count}`}
      className="block"
    >
      {body}
    </Link>
  );
}

/** A slim folded row: name on the left, count and chevron on the right. Tap to open. */
function FoldRowButton({
  open,
  onToggle,
  label,
  count,
  done,
  controls,
}: {
  open: boolean;
  onToggle: () => void;
  label: string;
  count: string;
  done?: boolean;
  controls: string;
}) {
  return (
    <button
      type="button"
      aria-expanded={open}
      aria-controls={controls}
      onClick={onToggle}
      className="flex min-h-11 w-full items-center gap-2 px-3.5 py-2.5 text-left"
    >
      {done && (
        <span aria-hidden="true" className="text-moss">
          ✓
        </span>
      )}
      <span className="min-w-0 flex-1 break-words text-sm font-semibold text-ink">{label}</span>
      <span className="tnum shrink-0 text-xs text-ink-soft">{count}</span>
      <span aria-hidden="true" className="text-ink-soft">
        {open ? "▾" : "▸"}
      </span>
    </button>
  );
}

function LessonRow({
  state,
  number,
  lessonId,
  title,
  blocked,
  onBlockedClick,
}: {
  state: "done" | "active" | "locked";
  number: number;
  lessonId: string;
  title: string;
  blocked: boolean;
  onBlockedClick: () => void;
}) {
  const badge =
    state === "done" ? (
      <span
        aria-hidden="true"
        className="grid size-8 shrink-0 place-items-center rounded-full bg-moss text-surface"
      >
        ✓
      </span>
    ) : state === "locked" ? (
      <span
        aria-hidden="true"
        className="grid size-8 shrink-0 place-items-center rounded-full bg-parchment text-ink-soft"
      >
        🔒
      </span>
    ) : (
      <span
        aria-hidden="true"
        className="grid size-8 shrink-0 place-items-center rounded-full bg-ember text-sm font-bold text-ink-on-ember"
      >
        {number}
      </span>
    );
  const inner = (
    <>
      {badge}
      <span className="min-w-0 flex-1 break-words text-sm font-semibold text-ink">{title}</span>
      {state === "active" && (
        <span className="shrink-0 rounded-full bg-ink px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.1em] text-surface">
          Now
        </span>
      )}
    </>
  );
  const cls = "flex min-h-11 items-center gap-3 py-1";
  if (state === "locked")
    return (
      <div role="note" aria-label={`${title} (locked)`} className={`${cls} opacity-70`}>
        {inner}
      </div>
    );
  if (blocked)
    return (
      <button
        type="button"
        onClick={onBlockedClick}
        aria-label={`Start ${title} (out of hearts)`}
        className={`${cls} w-full text-left`}
      >
        {inner}
      </button>
    );
  return (
    <Link to="/lesson/$id" params={{ id: lessonId }} aria-label={`Start ${title}`} className={cls}>
      {inner}
    </Link>
  );
}

function LearnPage() {
  const navigate = useNavigate();
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

  // The learner's place in the whole course (not just the level on screen).
  const foldUnits = useMemo<FoldUnit[]>(
    () =>
      curriculum.map((u) => ({
        id: u.id,
        eyebrow: u.eyebrow,
        title: u.title,
        lessonIds: u.lessons.map((l) => l.id),
      })),
    [curriculum],
  );
  const here = useMemo(
    () => (hydrated ? currentUnitOf(foldUnits, completedSet) : null),
    [hydrated, foldUnits, completedSet],
  );
  const hereUnit = here ? curriculum.find((u) => u.id === here.unitId) : undefined;
  const hereLesson = hereUnit?.lessons.find((l) => l.id === here?.lessonId);
  const levelFoldUnits = useMemo(
    () => foldUnits.filter((fu) => curriculum.find((u) => u.id === fu.id)?.level === level),
    [foldUnits, curriculum, level],
  );
  const rows = useMemo(
    () =>
      foldLearn(
        hydrated ? levelFoldUnits : levelFoldUnits.map((u) => ({ ...u, lessonIds: [] })),
        completedSet,
      ),
    [hydrated, levelFoldUnits, completedSet],
  );
  const [opened, setOpened] = useState<ReadonlySet<string>>(new Set());
  const [hereVisible, setHereVisible] = useState(true);
  const hereRef = useRef<HTMLElement | null>(null);
  const pendingJump = useRef(false);
  const toggle = (key: string) =>
    setOpened((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  function scrollToHere() {
    hereRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
  }
  function jumpToCurrent() {
    if (hereUnit && hereUnit.level !== level) {
      pendingJump.current = true;
      pick(hereUnit.level);
    } else {
      scrollToHere();
    }
  }
  useEffect(() => {
    if (pendingJump.current && hereRef.current) {
      pendingJump.current = false;
      scrollToHere();
    }
  });
  const currentKey = rows.find((r) => r.kind === "unit" && r.state === "current")?.key;
  useEffect(() => {
    const el = hereRef.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(([e]) => setHereVisible(e.isIntersecting));
    io.observe(el);
    return () => io.disconnect();
  }, [currentKey, level]);

  return (
    <MobileFrame>
      <div className="relative z-10 px-6 pb-24 pt-6">
        <div className="mb-4 flex items-center justify-between gap-3">
          <h1 className="font-display text-3xl font-extrabold text-ink">Learn</h1>
          {hydrated && (
            <div className="flex gap-1.5 text-sm font-bold">
              <span
                className="rounded-full border border-hairline bg-surface px-2.5 py-1 text-ember"
                aria-label={`${streak}-day streak`}
              >
                🔥 {streak}
              </span>
              <span
                className="tnum rounded-full border border-hairline bg-surface px-2.5 py-1 text-ink"
                aria-label={`${xp} XP`}
              >
                ★ {xp.toLocaleString("en-US")}
              </span>
            </div>
          )}
        </div>
        <div className="mb-4 flex gap-2">
          {COURSES.map((c) => (
            <button
              key={c.id}
              type="button"
              aria-pressed={c.id === course}
              onClick={() => void switchCourse(c.id)}
              className={`min-h-11 flex-1 rounded-2xl border px-3 py-2.5 text-sm font-semibold transition ${
                c.id === course
                  ? "border-ink bg-ink text-surface"
                  : "border-hairline bg-surface/90 text-ink-soft hover:bg-parchment"
              }`}
            >
              {c.flag} {c.label}
            </button>
          ))}
        </div>

        {here && hereUnit && hereLesson ? (
          <YouAreHere
            index={here.index}
            count={here.count}
            unitTitle={hereUnit.title}
            level={hereUnit.level}
            lessonId={hereLesson.id}
            lessonTitle={hereLesson.title}
            blocked={outOfHearts}
            onBlockedClick={() => setShowHeartsModal(true)}
          />
        ) : hydrated ? (
          <div
            className="rounded-3xl border-2 border-ink bg-parchment p-5 text-center"
            data-learn-finished=""
          >
            <p className="font-display text-xl font-bold text-ink">Course complete</p>
            <p className="mt-1 text-sm text-ink-soft">
              You have finished every unit. Review keeps it fresh.
            </p>
          </div>
        ) : null}

        <div className="-mx-6 my-4 overflow-x-auto px-6 pb-1 [scrollbar-width:none]">
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

        <div className="mb-4 rounded-2xl border border-hairline bg-parchment p-4">
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

        {!placed && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-4 rounded-2xl border border-ember/30 bg-ember/10 p-4"
          >
            <p className="font-display text-base font-semibold text-ink">
              Not sure where to start?
            </p>
            <p className="mt-1 text-xs text-ink-soft/80">
              Take a quick placement test and we&apos;ll set your CEFR level for you.
            </p>
            <Link
              to="/placement"
              className="mt-3 inline-flex min-h-11 items-center rounded-full bg-ink px-4 text-[12px] font-semibold text-surface"
            >
              Take the placement test
            </Link>
          </motion.div>
        )}

        <div className="grid gap-2" data-learn-list="">
          {rows.map((row) => {
            if (row.kind === "done-run") {
              const id = `fold-${row.key}`;
              const open = opened.has(row.key);
              const first = curriculum.find((u) => u.id === row.unitIds[0])!;
              return (
                <div key={row.key} className="rounded-2xl border border-hairline bg-surface">
                  <FoldRowButton
                    done
                    open={open}
                    controls={id}
                    onToggle={() => toggle(row.key)}
                    label={`${runLabel(row)} · ${first.level} done`}
                    count={`${row.done} / ${row.total}`}
                  />
                  {open && (
                    <div id={id} className="grid gap-1 px-3.5 pb-3">
                      {row.unitIds.map((uid) => {
                        const u = curriculum.find((x) => x.id === uid)!;
                        return (
                          <div key={uid}>
                            <p className="pt-2 text-[11px] font-bold uppercase tracking-[0.1em] text-ink-soft">
                              {u.eyebrow} · {u.title}
                            </p>
                            {u.lessons.map((l, li) => (
                              <LessonRow
                                key={l.id}
                                state="done"
                                number={li + 1}
                                lessonId={l.id}
                                title={l.title}
                                blocked={outOfHearts}
                                onBlockedClick={() => setShowHeartsModal(true)}
                              />
                            ))}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            }
            const unit = curriculum.find((u) => u.id === row.unitId)!;
            const isCurrent = row.state === "current";
            const open = isCurrent ? !opened.has(`closed-${row.key}`) : opened.has(row.key);
            const id = `fold-${row.key}`;
            return (
              <section
                key={row.key}
                ref={isCurrent ? hereRef : undefined}
                aria-label={`${unit.eyebrow}: ${unit.title}`}
                className={`rounded-2xl border bg-surface ${isCurrent ? "border-ink" : "border-hairline"}`}
              >
                <FoldRowButton
                  open={open}
                  controls={id}
                  onToggle={() => toggle(isCurrent ? `closed-${row.key}` : row.key)}
                  label={`${unit.eyebrow} · ${unit.title}`}
                  count={`${hydrated ? row.done : 0} / ${row.total}`}
                />
                {open && (
                  <div id={id} className="grid px-3.5 pb-3">
                    <p className="pb-1 text-xs text-ink-soft/80">{unit.description}</p>
                    {unit.lessons.map((lesson, li) => {
                      const isDone = hydrated && completedSet.has(lesson.id);
                      const isActive = hydrated && !isDone && here?.lessonId === lesson.id;
                      const state = isDone
                        ? "done"
                        : isActive
                          ? "active"
                          : hydrated
                            ? "locked"
                            : "active";
                      return (
                        <LessonRow
                          key={lesson.id}
                          state={state}
                          number={li + 1}
                          lessonId={lesson.id}
                          title={lesson.title}
                          blocked={outOfHearts}
                          onBlockedClick={() => setShowHeartsModal(true)}
                        />
                      );
                    })}
                  </div>
                )}
              </section>
            );
          })}
        </div>

        <Link
          to="/review"
          className="mt-6 flex items-center justify-between rounded-2xl border border-hairline bg-surface px-4 py-3.5 transition hover:border-ink/30"
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

        <div data-sheet className="mt-6 grid gap-6">
          <TeamMissionCard />
          <WeeklyChallengesCard />
          <GoalCard course={course} />
        </div>
      </div>
      {here && !hereVisible && (
        <button
          type="button"
          onClick={jumpToCurrent}
          aria-label={`Jump to where I am, unit ${here.index}`}
          className="fixed bottom-24 left-1/2 z-20 min-h-11 -translate-x-1/2 rounded-full bg-ink px-5 text-sm font-bold text-surface shadow-lg"
        >
          Jump to current ↓
        </button>
      )}
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
