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

/**
 * The learning goal on the Learn page. It renders what /api/learning-goal returns and
 * does no plan maths of its own (the server's planGoal is the single implementation;
 * iOS and Android render the same JSON). Setup is an inline panel rather than a
 * modal, which keeps it simple for keyboard and screen-reader users.
 */
const DATE_SHAPE = /^[0-9]{4}-[0-9]{2}-[0-9]{2}$/;

// A fixed English table, not the browser locale: the iOS card prints the same text from its own
// copy of this table (GoalCopy.formatDate), and CLDR spells September "Sept" in some locales.
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function formatDate(iso: string): string {
  const match = /^([0-9]{4})-([0-9]{2})-([0-9]{2})$/.exec(iso);
  if (!match) return iso;
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const date = new Date(Date.UTC(year, month - 1, day));
  if (month < 1 || month > 12 || date.getUTCDate() !== day) return iso;
  return `${day} ${MONTHS[month - 1]} ${year}`;
}

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

export function GoalCard({ course }: { course: GoalCourse }) {
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
    } catch (error) {
      if (startedAt !== loadId.current) return;
      // A failed remove is an action error, not "offline": the goal is still there and editable.
      setActionError(messageFor(error));
    }
  }

  // Keep keyboard focus on the card when the panel the focused button lived in goes away
  // (Save, Cancel, Remove): otherwise focus drops to the page body.
  useEffect(() => {
    if (firstView.current) {
      firstView.current = false;
      return;
    }
    if (view !== "loading") sectionRef.current?.focus();
  }, [view]);

  const offline = loadError !== null && view === "goal";

  return (
    <section
      ref={sectionRef}
      tabIndex={-1}
      aria-label="Learning goal"
      className="rounded-2xl border border-hairline bg-surface p-4"
    >
      {view === "loading" && <p className="text-sm text-ink-soft">Loading your goal…</p>}

      {view === "error" && (
        <div>
          <p role="alert" className="text-sm font-medium text-rose-600">
            {/* This view has no cached plan to show, so "showing your last saved plan" would be false
                (iOS: GoalCopy.loadFailureMessage). */}
            {loadError === "offline"
              ? "You're offline. Connect to load your goal."
              : goalErrorMessage(loadError ?? "unavailable")}
          </p>
          <button type="button" onClick={() => void load()} className={SECONDARY}>
            Try again
          </button>
        </div>
      )}

      {view === "empty" && (
        <div>
          <p className="text-sm text-ink-soft">
            Set a target level and date and we&apos;ll work out how many lessons a week it takes.
          </p>
          <button type="button" onClick={openSetup} className={PRIMARY}>
            Set a learning goal
          </button>
        </div>
      )}

      {view === "setup" && (
        <div>
          <h2 className="font-display text-base font-semibold text-ink">Set a learning goal</h2>
          <div className="mt-3 flex flex-col gap-3">
            <label className="text-sm text-ink">
              Finish level
              <select
                value={level}
                onChange={(e) => setLevel(e.target.value)}
                className="mt-1 block w-full rounded-xl border border-hairline bg-surface px-3 py-2"
              >
                {LEVEL_ORDER.map((l) => (
                  <option key={l} value={l}>
                    {l}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-sm text-ink">
              Target date
              <input
                type="date"
                min={tomorrowUtc()}
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="mt-1 block w-full rounded-xl border border-hairline bg-surface px-3 py-2"
              />
            </label>
            <div className="flex gap-2">
              {[3, 6, 12].map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setDate(monthsFromToday(m))}
                  className={SECONDARY}
                >
                  {m} months
                </button>
              ))}
            </div>
          </div>

          <div className="mt-3 min-h-[3rem] text-sm" aria-live="polite">
            {preview.kind === "loading" && <p className="text-ink-soft">Working it out…</p>}
            {preview.kind === "ok" && <PreviewLines plan={preview.plan} />}
            {preview.kind === "error" && (
              <p role="alert" className="font-medium text-rose-600">
                {preview.message}
              </p>
            )}
          </div>
          {saveError && (
            <p role="alert" className="mt-2 text-sm font-medium text-rose-600">
              {saveError}
            </p>
          )}
          <p className="mt-2 text-xs text-ink-soft/80">An estimate of lessons, not of fluency.</p>
          <div className="mt-3 flex gap-2">
            <button
              type="button"
              onClick={() => void save()}
              disabled={saving || preview.kind !== "ok"}
              className={PRIMARY}
            >
              Save goal
            </button>
            <button
              type="button"
              onClick={() => setView(state.goal ? "goal" : "empty")}
              className={SECONDARY}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {view === "goal" && state.goal && (
        <div>
          <h2 className="font-display text-base font-semibold text-ink">
            Finish {state.goal.targetLevel} by {formatDate(state.goal.targetDate)}
          </h2>
          {state.plan ? (
            <GoalBody plan={state.plan} />
          ) : (
            <p className="mt-2 text-sm text-ink">
              Your level has passed this target. Pick a new target.
            </p>
          )}
          {offline && (
            <p role="status" className="mt-2 text-xs text-ink-soft">
              {goalErrorMessage(loadError)}
              {state.plan ? ` As of ${formatDate(state.plan.asOf.slice(0, 10))}.` : ""}
            </p>
          )}
          {actionError && (
            <p role="alert" className="mt-2 text-sm font-medium text-rose-600">
              {actionError}
            </p>
          )}
          <p className="mt-2 text-xs text-ink-soft/80">An estimate of lessons, not of fluency.</p>
          <div className="mt-3 flex gap-2">
            <button type="button" onClick={openSetup} disabled={offline} className={SECONDARY}>
              Change goal
            </button>
            <button
              type="button"
              onClick={() => void remove()}
              disabled={offline}
              className={SECONDARY}
            >
              Remove goal
            </button>
          </div>
        </div>
      )}
    </section>
  );
}

function PreviewLines({ plan }: { plan: GoalPlan }) {
  return (
    <div>
      <p className="font-semibold text-ink">{plan.requiredPerWeek} lessons a week</p>
      <p className="text-ink-soft">
        {plan.lessonsRemaining} lessons left to finish {plan.targetLevel}.
      </p>
      <Suggestion plan={plan} />
      <Realism plan={plan} />
    </div>
  );
}

function Realism({ plan }: { plan: GoalPlan }) {
  if (plan.realism === "ok") return null;
  return (
    <p className="mt-1 font-medium text-amber-700">
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
    <p className="text-ink-soft">
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
    <div className="mt-2 text-sm text-ink">
      <p>
        {done} of {plan.lessonsInScope} lessons done
      </p>
      <p className="mt-1 font-semibold">{STATUS_LINE[plan.status]}</p>
      {plan.status !== "done" && plan.status !== "expired" && (
        <p className="text-ink-soft">
          {plan.requiredPerWeek} lessons a week to finish on time; {plan.lessonsDoneLast7Days} in
          the last 7 days.
        </p>
      )}
      <Suggestion plan={plan} />
      <Realism plan={plan} />
    </div>
  );
}

const PRIMARY =
  "mt-3 rounded-full bg-ink px-4 py-2 text-sm font-semibold text-surface transition hover:opacity-90 disabled:opacity-50";
const SECONDARY =
  "rounded-full border border-hairline px-3 py-1.5 text-xs font-medium text-ink transition hover:bg-parchment disabled:opacity-50";
