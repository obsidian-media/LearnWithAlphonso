import { useCallback, useEffect, useRef, useState } from "react";
import {
  GoalError,
  fetchGoal,
  goalErrorMessage,
  previewGoal,
  readCachedGoal,
  removeGoal,
  saveGoal,
  type GoalErrorKind,
  type GoalState,
} from "../lib/learning-goal-client";
import { LEVEL_ORDER, type GoalCourse, type GoalPlan } from "../lib/learning-goal";
import {
  PATH_GOAL_CHIPS_NOTE,
  formatGoalDate as formatDate,
  pathGoalChips,
} from "../lib/path-goal-card";
import {
  DsBar,
  DsButton,
  DsCard,
  DsChip,
  DsField,
  DsHero,
  HeroKicker,
  Overline,
} from "./ds/Blocks";
import { Modal } from "./Modal";

/**
 * The learning goal on the Build my path screen. It renders what /api/learning-goal returns and
 * does no plan maths of its own (the server's planGoal is the single implementation;
 * iOS and Android render the same JSON). The goal is the navy hero; setting or changing it is a sheet
 * (a modal that traps focus, so keyboard and screen-reader users stay inside it until they save or cancel).
 */
const DATE_SHAPE = /^[0-9]{4}-[0-9]{2}-[0-9]{2}$/;

/** `months` ahead, clamped to the end of a shorter month (31 Aug + 6 months = 28 Feb, not 3 Mar). */
function monthsFromToday(months: number): string {
  const now = new Date();
  const lastDay = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + months + 1, 0),
  ).getUTCDate();
  return new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + months, Math.min(now.getUTCDate(), lastDay)),
  )
    .toISOString()
    .slice(0, 10);
}

function tomorrowUtc(): string {
  return new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);
}

type Preview =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "ok"; plan: GoalPlan }
  | { kind: "error"; message: string };

type View = "loading" | "error" | "empty" | "goal" | "setup";

export function GoalCard({
  course,
  onChanged,
  purposeId = null,
}: {
  course: GoalCourse;
  /** What the learner said they are learning for in first run ("travel"); shown as the first chip when known. */
  purposeId?: string | null;
  /** Called after the goal was saved or removed, so a screen built on it can reload. */
  onChanged?: () => void;
}) {
  const [view, setView] = useState<View>("loading");
  const [state, setState] = useState<GoalState>({ goal: null, plan: null });
  const [loadError, setLoadError] = useState<GoalErrorKind | null>(null);
  const [level, setLevel] = useState("B1");
  const [date, setDate] = useState("");
  const [preview, setPreview] = useState<Preview>({ kind: "idle" });
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const sectionRef = useRef<HTMLElement>(null);
  const firstView = useRef(true);
  const previewId = useRef(0);
  const loadId = useRef(0);

  const load = useCallback(async () => {
    // A slow answer for a course the learner has since left must not overwrite the card.
    const id = ++loadId.current;
    setView("loading");
    setLoadError(null);
    try {
      const next = await fetchGoal(course);
      if (id !== loadId.current) return;
      setState(next);
      setView(next.goal ? "goal" : "empty");
    } catch (error) {
      if (id !== loadId.current) return;
      const kind = error instanceof GoalError ? error.kind : "unavailable";
      setLoadError(kind);
      // The cached plan is only for being OFFLINE. A 401 or a server error must not show a
      // stale plan (which might even be left over from someone else's session).
      const cached = kind === "offline" ? await readCachedGoal(course) : null;
      if (id !== loadId.current) return;
      if (cached) {
        setState(cached);
        setView("goal");
      } else {
        setView("error");
      }
    }
  }, [course]);

  useEffect(() => {
    void load();
  }, [load]);

  // Live preview of the weekly number as the learner picks a level and date. Each
  // request has an id so a slow, older answer can never overwrite a newer one.
  useEffect(() => {
    if (view !== "setup") return;
    if (!DATE_SHAPE.test(date)) {
      setPreview({ kind: "idle" });
      return;
    }
    const id = ++previewId.current;
    setPreview({ kind: "loading" });
    previewGoal(course, level, date).then(
      (plan) => {
        if (id === previewId.current) setPreview({ kind: "ok", plan });
      },
      (error) => {
        if (id === previewId.current) {
          setPreview({ kind: "error", message: messageFor(error) });
        }
      },
    );
  }, [view, course, level, date]);

  function openSetup() {
    setLevel(state.goal?.targetLevel ?? "B1");
    setDate(state.goal?.targetDate ?? "");
    setPreview({ kind: "idle" });
    setSaveError(null);
    setActionError(null);
    setView("setup");
  }

  async function save() {
    if (saving || preview.kind !== "ok") return;
    setSaving(true);
    setSaveError(null);
    // `loadId` changes whenever the course (and so the card) is reloaded; a save that finishes after
    // that belongs to a course the learner has left and must not overwrite the new card.
    const startedAt = loadId.current;
    try {
      const next = await saveGoal(course, level, date);
      if (startedAt !== loadId.current) return;
      setState(next);
      setLoadError(null);
      setView("goal");
      onChanged?.();
    } catch (error) {
      if (startedAt !== loadId.current) return;
      setSaveError(messageFor(error));
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    const startedAt = loadId.current;
    try {
      await removeGoal(course);
      if (startedAt !== loadId.current) return;
      setState({ goal: null, plan: null });
      setView("empty");
      onChanged?.();
    } catch (error) {
      if (startedAt !== loadId.current) return;
      // A failed remove is an action error, not "offline": the goal is still there and editable.
      setActionError(messageFor(error));
    }
  }

  // Keep keyboard focus on the card when the panel the focused button lived in goes away
  // (Save, Cancel, Remove): otherwise focus drops to the page body. The setup sheet moves focus into itself.
  useEffect(() => {
    if (firstView.current) {
      firstView.current = false;
      return;
    }
    if (view !== "loading" && view !== "setup") sectionRef.current?.focus();
  }, [view]);

  const offline = loadError !== null && view === "goal";
  // While the setup sheet is open the card draws nothing of its own: the sheet is the one place the goal is edited.
  const base: View | null = view === "setup" ? null : view;
  const closeSetup = () => setView(state.goal ? "goal" : "empty");

  return (
    <section ref={sectionRef} tabIndex={-1} aria-label="Learning goal" className="outline-none">
      {base === "loading" && (
        <DsCard>
          <p className="ds-type-footnote text-ds-ink-soft">Loading your goal…</p>
        </DsCard>
      )}

      {base === "error" && (
        <DsCard>
          <p role="alert" className="ds-type-footnote font-bold text-ds-wrong-ink">
            {/* This view has no cached plan to show, so "showing your last saved plan" would be false
                (iOS: GoalCopy.loadFailureMessage). */}
            {loadError === "offline"
              ? "You're offline. Connect to load your goal."
              : goalErrorMessage(loadError ?? "unavailable")}
          </p>
          <div>
            <DsButton small variant="secondary" onClick={() => void load()}>
              Try again
            </DsButton>
          </div>
        </DsCard>
      )}

      {base === "empty" && (
        <DsCard>
          <p className="ds-type-footnote text-ds-ink-soft">
            Set a target level and date and we&apos;ll work out how many lessons a week it takes.
          </p>
          <DsButton full onClick={openSetup}>
            Set a learning goal
          </DsButton>
        </DsCard>
      )}

      {base === "goal" && state.goal && (
        <div className="grid gap-3.5">
          <DsCard className="gap-2 p-3">
            <div className="flex flex-wrap gap-1.5">
              {pathGoalChips(purposeId, state.goal.targetLevel, state.goal.targetDate).map(
                (label) => (
                  <DsChip key={label} on disabled={offline} onClick={openSetup}>
                    {label}
                  </DsChip>
                ),
              )}
            </div>
            <p className="ds-type-caption text-ds-ink-soft">{PATH_GOAL_CHIPS_NOTE}</p>
          </DsCard>
          <DsHero>
            <HeroKicker>
              Finish {state.goal.targetLevel} by {formatDate(state.goal.targetDate)}
            </HeroKicker>
            {state.plan ? (
              <GoalBody plan={state.plan} />
            ) : (
              <p className="ds-type-headline">
                Your level has passed this target. Pick a new target.
              </p>
            )}
            {offline && (
              <p role="status" className="ds-type-caption text-ds-on-hero-soft">
                {goalErrorMessage(loadError)}
                {state.plan ? ` As of ${formatDate(state.plan.asOf.slice(0, 10))}.` : ""}
              </p>
            )}
            {actionError && (
              <p role="alert" className="ds-type-footnote font-bold text-ds-on-hero-kick">
                {actionError}
              </p>
            )}
            <p className="ds-type-caption text-ds-on-hero-soft">
              An estimate of lessons, not of fluency.
            </p>
            <div className="mt-1 flex gap-2">
              <DsButton
                small
                variant="secondary"
                className="flex-1"
                onClick={openSetup}
                disabled={offline}
              >
                Change goal
              </DsButton>
              <DsButton
                small
                variant="secondary"
                className="flex-1"
                onClick={() => void remove()}
                disabled={offline}
              >
                Remove goal
              </DsButton>
            </div>
          </DsHero>
        </div>
      )}

      {view === "setup" && (
        <Modal
          labelledBy="goal-setup-title"
          onEscape={closeSetup}
          className="relative grid max-h-[92dvh] w-full max-w-[430px] gap-3 overflow-y-auto rounded-t-[28px] bg-ds-surface px-4 pb-6 pt-3 shadow-[var(--ds-shadow-sheet)] outline-none sm:rounded-[28px]"
        >
          <span aria-hidden="true" className="mx-auto h-1.5 w-10 rounded-full bg-ds-line" />
          <div className="flex min-h-11 items-center justify-between gap-2">
            <DsButton small variant="secondary" onClick={closeSetup}>
              Cancel
            </DsButton>
            <h2 id="goal-setup-title" className="ds-type-headline text-ds-ink">
              Set a learning goal
            </h2>
            <span className="w-16" aria-hidden="true" />
          </div>
          <Overline id="goal-level-label">Finish level</Overline>
          <div
            role="radiogroup"
            aria-labelledby="goal-level-label"
            className="flex flex-wrap gap-2"
          >
            {LEVEL_ORDER.map((l) => (
              <DsChip
                key={l}
                radio
                on={level === l}
                onClick={() => setLevel(l)}
                className="min-w-14 justify-center"
              >
                {l}
              </DsChip>
            ))}
          </div>
          <Overline>Target date</Overline>
          <DsCard>
            <DsField
              type="date"
              min={tomorrowUtc()}
              value={date}
              onChange={(e) => setDate(e.target.value)}
              aria-label="Target date"
            />
            <div className="flex flex-wrap gap-2">
              {[3, 6, 12].map((m) => (
                <DsChip
                  key={m}
                  on={date !== "" && date === monthsFromToday(m)}
                  onClick={() => setDate(monthsFromToday(m))}
                >
                  {m} months
                </DsChip>
              ))}
            </div>
          </DsCard>

          <div className="min-h-[3rem]" aria-live="polite">
            {preview.kind === "loading" && (
              <p className="ds-type-footnote text-ds-ink-soft">Working it out…</p>
            )}
            {preview.kind === "ok" && <PreviewLines plan={preview.plan} />}
            {preview.kind === "error" && (
              <p role="alert" className="ds-type-footnote font-bold text-ds-wrong-ink">
                {preview.message}
              </p>
            )}
          </div>
          {saveError && (
            <p role="alert" className="ds-type-footnote font-bold text-ds-wrong-ink">
              {saveError}
            </p>
          )}
          <p className="ds-type-caption text-ds-ink-soft">
            An estimate of lessons, not of fluency.
          </p>
          <div className="flex gap-2.5">
            <DsButton variant="secondary" className="flex-1" onClick={closeSetup}>
              Cancel
            </DsButton>
            <DsButton
              className="flex-[2]"
              onClick={() => void save()}
              disabled={saving || preview.kind !== "ok"}
            >
              Save goal
            </DsButton>
          </div>
        </Modal>
      )}
    </section>
  );
}

function PreviewLines({ plan }: { plan: GoalPlan }) {
  return (
    <DsHero>
      <p className="ds-type-title">{plan.requiredPerWeek} lessons a week</p>
      <p className="ds-type-footnote text-ds-on-hero-soft">
        {plan.lessonsRemaining} lessons left to finish {plan.targetLevel}.
      </p>
      <Suggestion plan={plan} />
      <Realism plan={plan} />
    </DsHero>
  );
}

function Realism({ plan }: { plan: GoalPlan }) {
  if (plan.realism === "ok") return null;
  return (
    <p className="ds-type-footnote font-extrabold text-ds-on-hero-kick">
      {plan.realism === "unrealistic"
        ? "Unrealistic for most learners at this date."
        : "Ambitious: about two lessons a day or more."}
    </p>
  );
}

/** Whenever the server sent a suggested date (iOS: GoalCopy.suggestionLine). Shown once. */
function Suggestion({ plan }: { plan: GoalPlan }) {
  if (!plan.suggestedDate) return null;
  return (
    <p className="ds-type-footnote text-ds-on-hero-soft">
      At your recent pace, {formatDate(plan.suggestedDate)} is realistic.
    </p>
  );
}

/**
 * For an ACTION that failed (preview, save, remove). Offline gets its own wording: the load
 * wording ("showing your last saved plan") describes a screen refresh, not an action that did not
 * happen. iOS: GoalCopy.actionFailureMessage.
 */
function messageFor(error: unknown): string {
  if (!(error instanceof GoalError)) return goalErrorMessage("unavailable");
  if (error.kind === "offline") return "You're offline. Try again when you're connected.";
  return goalErrorMessage(error.kind, error.detail);
}

const STATUS_LINE: Record<GoalPlan["status"], string> = {
  done: "Goal reached.",
  expired: "The date has passed. Pick a new date to keep going.",
  just_started: "Just started. Check back next week.",
  ahead: "Ahead of plan.",
  on_track: "On track.",
  behind: "Behind plan.",
};

function GoalBody({ plan }: { plan: GoalPlan }) {
  const done = plan.lessonsInScope - plan.lessonsRemaining;
  return (
    <>
      <DsBar
        onHero
        label="Lessons done toward the goal"
        value={plan.lessonsInScope > 0 ? done / plan.lessonsInScope : 0}
      />
      <p className="ds-type-footnote text-ds-on-hero-soft">
        {done} of {plan.lessonsInScope} lessons done
      </p>
      <p className="ds-type-headline">{STATUS_LINE[plan.status]}</p>
      {plan.status !== "done" && plan.status !== "expired" && (
        <p className="ds-type-footnote text-ds-on-hero-soft">
          {plan.requiredPerWeek} lessons a week to finish on time; {plan.lessonsDoneLast7Days} in
          the last 7 days.
        </p>
      )}
      <Suggestion plan={plan} />
      <Realism plan={plan} />
    </>
  );
}
