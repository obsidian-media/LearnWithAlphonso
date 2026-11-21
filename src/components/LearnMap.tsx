import { Link } from "@tanstack/react-router";
import { useEffect, useId, useState } from "react";
import { DsIcon } from "@/components/ds/DsIcon";
import { dsButtonClass } from "@/components/ds/buttons";
import { Modal } from "@/components/Modal";
import type { LearnMap as LearnMapModel, MapLessonNode, MapPoint } from "@/lib/learn-map";

/**
 * Learn's climbing map ("Path B", PARITY-SPEC-6): one unit as a climb up a night hill. The unit strip sits on top,
 * the lessons wind up the trail from the foot (done green, the next one gold and bobbing, the rest locked), the
 * unit's reward chest crowns the summit, and Alphonso waits at the trailhead. Once a unit is finished its earned
 * chest sits at the foot of the next climb. Tapping the next lesson lifts a start sheet.
 *
 * Every position comes from the shared model (src/lib/learn-map.ts), which iOS and Android draw from too. The nodes
 * are a real ordered list of buttons in climb order, each named "Lesson 3 of 6, About Me, done"; the unit list below
 * the map stays as the long-form way in.
 */

/** Room above the summit (for the chest) and below the foot (for the trailhead chest and the Start pill), in px. */
const TOP_ROOM = 44;
const FOOT_ROOM = 52;
/** Where a finished unit's chest sits at the foot of the next climb: left of the first lesson, at the very bottom. */
const TRAILHEAD: MapPoint = { x: 0.15, y: 1 };
/** How long the "finish X first" hint stays. */
const HINT_MS = 6000;

/** Tall enough per slot that nodes never touch, and never shorter than a phone's first screen of map. */
function climbHeight(slots: number): number {
  return Math.max(360, slots * 88 + TOP_ROOM + FOOT_ROOM);
}

const STATE_WORD: Record<MapLessonNode["state"], string> = {
  done: "done",
  next: "next",
  locked: "locked",
};

const NODE_CLASS: Record<MapLessonNode["state"], string> = {
  done: "size-14 bg-[radial-gradient(circle_at_36%_28%,color-mix(in_srgb,var(--c-right)_58%,var(--c-on-hero)),var(--c-right))] text-ds-on-right shadow-[0_6px_0_0_var(--c-right-edge)]",
  next: "size-20 bg-[radial-gradient(circle_at_36%_28%,var(--c-action-hi),var(--c-action))] text-ds-on-action shadow-[0_8px_0_0_var(--c-action-edge),0_0_0_9px_color-mix(in_srgb,var(--c-on-hero)_30%,transparent),0_0_36px_8px_color-mix(in_srgb,var(--c-action)_55%,transparent)]",
  locked:
    "size-[52px] bg-[radial-gradient(circle_at_36%_28%,var(--c-on-hero),color-mix(in_srgb,var(--c-on-hero)_68%,var(--c-hero-a)))] text-ds-ink-faint shadow-[0_5px_0_0_color-mix(in_srgb,var(--c-on-hero)_40%,transparent)]",
};

const NODE_ICON = { done: "check", next: "play", locked: "lock" } as const;

const FOCUS =
  "focus-visible:outline focus-visible:outline-4 focus-visible:outline-offset-2 focus-visible:outline-ds-on-hero-kick";

const at = (p: MapPoint) => ({ left: `${p.x * 100}%`, top: `${p.y * 100}%` });

export function LearnMap({
  map,
  greeting,
  continueLessonId,
  blocked,
  onBlocked,
}: {
  map: LearnMapModel;
  greeting: string;
  /**
   * The course-wide Continue lesson (the learner's first lesson not done in the whole course), or null. The map is
   * one level's climb: when its next lesson is not that one, the sheet says "Start lesson", never "Continue".
   */
  continueLessonId: string | null;
  /** Out of hearts: starting a lesson opens the hearts modal instead. */
  blocked: boolean;
  onBlocked: () => void;
}) {
  const [sheetOpen, setSheetOpen] = useState(false);
  const [hint, setHint] = useState<string | null>(null);
  // The "finish X first" hint is about this moment: it clears after a few seconds, and at once when the next lesson
  // changes, so the live region never holds a stale instruction.
  const nextId = map.next?.lessonId ?? null;
  useEffect(() => setHint(null), [nextId]);
  useEffect(() => {
    if (!hint) return;
    const t = setTimeout(() => setHint(null), HINT_MS);
    return () => clearTimeout(t);
  }, [hint]);
  const stripId = useId();
  const total = map.nodes.length;
  const nextNode = map.nodes.find((n) => n.state === "next") ?? null;
  // The trail: from the trailhead chest (when there is one) through every lesson to the summit chest.
  const trail = [...(map.trailhead.kind === "chest" ? [TRAILHEAD] : []), ...map.nodes, map.chest];

  return (
    <section aria-labelledby={stripId} data-learn-map="">
      <div className="relative overflow-hidden rounded-3xl bg-[linear-gradient(176deg,var(--c-hero-a),var(--c-hero-b))]">
        {/* The scene: a gold glow over the summit, layered hills and a few stars. Decoration only. */}
        <div aria-hidden="true" className="pointer-events-none absolute inset-0">
          <span className="absolute inset-x-0 -top-10 h-48 bg-[radial-gradient(60%_100%_at_50%_100%,color-mix(in_srgb,var(--c-on-hero-kick)_40%,transparent),transparent_70%)]" />
          <span className="absolute -bottom-24 -left-[10%] h-48 w-[120%] rounded-[50%] bg-ds-hero-b/70" />
          <span className="absolute -left-[30%] bottom-10 h-36 w-full rounded-[50%] bg-ds-hero-b/50" />
          <span className="absolute -right-[30%] bottom-5 h-36 w-[90%] rounded-[50%] bg-ds-hero-b/45" />
          {[
            [18, 8],
            [72, 5],
            [54, 12],
            [33, 4],
            [86, 14],
          ].map(([x, y]) => (
            <span
              key={`${x}-${y}`}
              className="absolute size-[3px] rounded-full bg-ds-on-hero/70"
              style={{ left: `${x}%`, top: `${y}%` }}
            />
          ))}
        </div>

        <div
          className="relative mx-3 mt-3 rounded-2xl border border-ds-on-hero/15 bg-ds-on-hero/10 px-3.5 py-2.5 text-ds-on-hero"
          data-learn-strip=""
        >
          <div className="flex items-baseline justify-between gap-3">
            <h2 id={stripId} className="min-w-0 break-words font-display text-base font-extrabold">
              Unit {map.strip.number} of {map.strip.count} · {map.strip.name}
            </h2>
            <span className="tnum shrink-0 text-xs font-bold text-ds-on-hero-soft">
              {map.strip.done} / {map.strip.total}
            </span>
          </div>
          <div
            role="progressbar"
            aria-label="Unit progress"
            aria-valuemin={0}
            aria-valuemax={map.strip.total}
            aria-valuenow={map.strip.done}
            className="mt-2 h-1.5 overflow-hidden rounded-full bg-ds-hero-b/60"
          >
            <span
              className="block h-full rounded-full bg-[linear-gradient(90deg,var(--c-on-hero-kick),var(--c-action))]"
              style={{ width: `${map.strip.progress * 100}%` }}
            />
          </div>
        </div>

        <div className="relative" style={{ height: climbHeight(total + 1) }} data-learn-climb="">
          <div className="absolute inset-x-0" style={{ top: TOP_ROOM, bottom: FOOT_ROOM }}>
            <svg
              aria-hidden="true"
              viewBox="0 0 100 100"
              preserveAspectRatio="none"
              className="absolute inset-0 size-full overflow-visible"
            >
              <polyline
                points={trail.map((p) => `${p.x * 100},${p.y * 100}`).join(" ")}
                fill="none"
                strokeLinecap="round"
                strokeLinejoin="round"
                vectorEffect="non-scaling-stroke"
                className="stroke-ds-on-hero/15 [stroke-width:18px]"
              />
              <polyline
                points={trail.map((p) => `${p.x * 100},${p.y * 100}`).join(" ")}
                fill="none"
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeDasharray="1 12"
                vectorEffect="non-scaling-stroke"
                className="stroke-ds-on-hero-kick/60 [stroke-width:3px]"
              />
            </svg>

            {/* Fills the climb box: its items are all absolute, so without a size the list would be 0 by 0 (hidden). */}
            <ol
              aria-label={`Unit ${map.strip.number} climb, from the foot to the summit`}
              className="absolute inset-0"
            >
              {map.trailhead.kind === "chest" && (
                <li
                  className="absolute -translate-x-1/2 -translate-y-1/2"
                  style={at(TRAILHEAD)}
                  data-chest="trailhead"
                >
                  <span
                    role="img"
                    aria-label={`Unit ${map.strip.number - 1} reward, earned`}
                    className="relative grid size-12 place-items-center rounded-full bg-[radial-gradient(circle_at_36%_28%,var(--c-action-hi),var(--c-action))] text-ds-on-action shadow-[0_5px_0_0_var(--c-action-edge)]"
                  >
                    <DsIcon name="chest" className="size-6" />
                    <span className="absolute -right-1 -top-1 grid size-5 place-items-center rounded-full bg-ds-right text-ds-on-right">
                      <DsIcon name="check" className="size-3" />
                    </span>
                  </span>
                </li>
              )}

              {map.nodes.map((n, i) => {
                const label = `Lesson ${i + 1} of ${total}, ${n.title}, ${STATE_WORD[n.state]}`;
                const face = (
                  <span
                    className={`relative grid place-items-center rounded-full ${NODE_CLASS[n.state]}`}
                  >
                    <DsIcon
                      name={NODE_ICON[n.state]}
                      className={n.state === "next" ? "size-9" : "size-6"}
                    />
                  </span>
                );
                const node =
                  n.state === "next" ? (
                    <button
                      type="button"
                      aria-label={label}
                      aria-haspopup="dialog"
                      onClick={() => {
                        setHint(null);
                        setSheetOpen(true);
                      }}
                      className={`relative block rounded-full ${FOCUS}`}
                    >
                      {/* The face bobs inside a still button: the tap target never moves under a finger. */}
                      <span data-bob="" className="relative block map-node-bounce">
                        <span
                          aria-hidden="true"
                          className="absolute bottom-full left-1/2 mb-2 max-w-[11rem] -translate-x-1/2 truncate rounded-lg bg-ds-surface px-2.5 py-1 font-display text-xs font-extrabold text-ds-ink shadow-[var(--ds-shadow-floating)]"
                        >
                          {n.title}
                        </span>
                        {face}
                        <span
                          aria-hidden="true"
                          className="absolute left-1/2 top-full mt-2 -translate-x-1/2 whitespace-nowrap rounded-full bg-ds-surface px-3 py-0.5 font-display text-xs font-extrabold uppercase tracking-widest text-ds-action-text shadow-[var(--ds-shadow-floating)]"
                        >
                          Start
                        </span>
                      </span>
                    </button>
                  ) : n.state === "done" && !blocked ? (
                    // A done lesson can be played again, as from the unit list.
                    <Link
                      to="/lesson/$id"
                      params={{ id: n.id }}
                      aria-label={label}
                      className={`block rounded-full ${FOCUS}`}
                    >
                      {face}
                    </Link>
                  ) : (
                    <button
                      type="button"
                      aria-label={label}
                      onClick={() => {
                        if (n.state === "done") onBlocked();
                        else
                          setHint(
                            nextNode
                              ? `Finish ${nextNode.title} first, then this one opens.`
                              : "Finish the lessons before it first.",
                          );
                      }}
                      className={`block rounded-full ${FOCUS}`}
                    >
                      {face}
                    </button>
                  );
                return (
                  <li
                    key={n.id}
                    data-node={n.state}
                    className="absolute -translate-x-1/2 -translate-y-1/2"
                    style={at(n)}
                  >
                    {node}
                  </li>
                );
              })}

              <li
                className="absolute -translate-x-1/2 -translate-y-1/2"
                style={at(map.chest)}
                data-chest={map.chest.earned ? "earned" : "locked"}
              >
                {(() => {
                  const face = (
                    <span
                      aria-hidden="true"
                      className={`relative grid size-14 place-items-center rounded-full ${
                        map.chest.earned
                          ? "bg-[radial-gradient(circle_at_36%_28%,var(--c-action-hi),var(--c-action))] text-ds-on-action shadow-[0_6px_0_0_var(--c-action-edge),0_0_0_7px_color-mix(in_srgb,var(--c-on-hero-kick)_25%,transparent)]"
                          : "bg-[radial-gradient(circle_at_36%_28%,color-mix(in_srgb,var(--c-on-hero)_55%,var(--c-hero-a)),color-mix(in_srgb,var(--c-on-hero)_25%,var(--c-hero-a)))] text-ds-on-hero-soft shadow-[0_6px_0_0_var(--c-hero-b)]"
                      }`}
                    >
                      <DsIcon name="chest" className="size-7" />
                      <span
                        className={`absolute -right-1 -top-1 grid size-5 place-items-center rounded-full ${
                          map.chest.earned
                            ? "bg-ds-right text-ds-on-right"
                            : "bg-ds-hero-b text-ds-on-hero-soft"
                        }`}
                      >
                        <DsIcon name={map.chest.earned ? "check" : "lock"} className="size-3" />
                      </span>
                    </span>
                  );
                  // An earned chest is a picture with a name; a locked one explains itself on a tap, like a locked
                  // lesson, through the same status line.
                  return map.chest.earned ? (
                    <span role="img" aria-label={`Unit ${map.strip.number} reward, earned`}>
                      {face}
                    </span>
                  ) : (
                    <button
                      type="button"
                      aria-label={`Unit ${map.strip.number} reward, locked until you finish the unit`}
                      onClick={() => setHint("Finish this unit to open the chest.")}
                      className={`block rounded-full ${FOCUS}`}
                    >
                      {face}
                    </button>
                  );
                })()}
                <span
                  aria-hidden="true"
                  className="absolute bottom-full left-1/2 mb-1.5 -translate-x-1/2 whitespace-nowrap ds-type-overline text-ds-on-hero-kick"
                >
                  Unit reward
                </span>
              </li>
            </ol>
          </div>

          {/* Alphonso at the trailhead, bottom right, with his greeting. */}
          <div className="pointer-events-none absolute bottom-0 right-0 flex w-[34%] max-w-36 flex-col items-end">
            <p className="mb-1 mr-2 max-w-full rounded-xl bg-ds-surface px-2.5 py-1.5 font-display text-xs font-bold leading-snug text-ds-ink shadow-[var(--ds-shadow-floating)]">
              {greeting}
            </p>
            <img
              src="/avatar/base.webp"
              alt=""
              className="aspect-square w-full object-contain object-bottom"
            />
          </div>
        </div>
      </div>

      <p role="status" aria-live="polite" className="mt-2 min-h-5 text-sm text-ds-ink-soft">
        {hint}
      </p>

      {sheetOpen && map.next && (
        <StartSheet
          map={map}
          lessonNumber={map.nodes.findIndex((n) => n.id === map.next!.lessonId) + 1}
          ctaLabel={map.next.lessonId === continueLessonId ? "Continue lesson" : "Start lesson"}
          blocked={blocked}
          onBlocked={() => {
            setSheetOpen(false);
            onBlocked();
          }}
          onClose={() => setSheetOpen(false)}
        />
      )}
    </section>
  );
}

function StartSheet({
  map,
  lessonNumber,
  ctaLabel,
  blocked,
  onBlocked,
  onClose,
}: {
  map: LearnMapModel;
  lessonNumber: number;
  ctaLabel: "Continue lesson" | "Start lesson";
  blocked: boolean;
  onBlocked: () => void;
  onClose: () => void;
}) {
  const next = map.next!;
  const titleId = useId();
  const coverageId = useId();
  const chips = [
    { icon: "clock", value: `${next.minutes} min`, label: "Time" },
    { icon: "bolt", value: `+${next.xp}`, label: "XP" },
    { icon: "words", value: String(next.words), label: "Words" },
  ] as const;
  return (
    <Modal
      labelledBy={titleId}
      describedBy={next.coverage ? coverageId : undefined}
      onEscape={onClose}
      className="relative z-10 max-h-[90dvh] w-full max-w-md overflow-y-auto rounded-t-3xl bg-ds-surface shadow-[var(--ds-shadow-sheet)] px-5 pb-[calc(1.25rem+env(safe-area-inset-bottom,0px))] pt-3 text-ds-ink sm:rounded-3xl"
    >
      <span aria-hidden="true" className="mx-auto mb-3 block h-1.5 w-10 rounded-full bg-ds-line" />
      <p className="text-xs font-extrabold uppercase tracking-widest text-ds-action-text">
        Unit {map.strip.number} · Lesson {lessonNumber}
      </p>
      <h2 id={titleId} className="mt-1 break-words font-display text-2xl font-extrabold">
        {next.title}
      </h2>
      {next.coverage && (
        <p id={coverageId} className="mt-1 text-sm text-ds-ink-soft">
          {next.coverage}
        </p>
      )}
      <dl className="mt-4 flex flex-wrap gap-2" data-start-chips="">
        {chips.map((c) => (
          <div
            key={c.label}
            className="flex min-w-[5.5rem] flex-1 flex-col-reverse items-center rounded-2xl bg-ds-card p-2.5 text-center shadow-[var(--ds-shadow-resting)]"
          >
            <dt className="text-xs text-ds-ink-faint">{c.label}</dt>
            <dd className="flex items-center gap-1 font-display text-base font-extrabold">
              <DsIcon name={c.icon} className="size-4 text-ds-action-text" />
              {c.value}
            </dd>
          </div>
        ))}
      </dl>
      <div className="mt-5 grid gap-2">
        {blocked ? (
          <button
            type="button"
            onClick={onBlocked}
            className={dsButtonClass("primary", { full: true })}
          >
            {ctaLabel} (out of hearts)
          </button>
        ) : (
          <Link
            to="/lesson/$id"
            params={{ id: next.lessonId }}
            className={dsButtonClass("primary", { full: true })}
          >
            <DsIcon name="play" className="size-5" />
            {ctaLabel}
          </Link>
        )}
        <button
          type="button"
          onClick={onClose}
          className={dsButtonClass("secondary", { full: true })}
        >
          Not now
        </button>
      </div>
    </Modal>
  );
}
