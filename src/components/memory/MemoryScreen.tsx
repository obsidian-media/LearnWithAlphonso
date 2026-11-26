import { Link } from "@tanstack/react-router";
import { useState, type ReactNode } from "react";
import { DsIcon } from "../ds/DsIcon";
import { DsButton, DsLinkButton } from "../ds/Blocks";
import type { MemoryData } from "@/lib/call-recap-api";
import {
  addableGoals,
  goalLines,
  memorySummary,
  mistakeNote,
  type GoalLine,
} from "@/lib/tutor-memory-view";

/**
 * What Alphonso remembers (approved mock: r15-recap, screens 2, 2b and 3). Every learner reads, fixes and deletes
 * every line (free since 2026-11-26). The locked view below is only for a server that still answers not-entitled (an
 * older deployment); the server decides what is deleted (src/routes/api/tutor-memory.ts).
 */
export type MemoryView =
  | { kind: "loading" }
  | { kind: "error" }
  | { kind: "locked"; weakSpots: string[]; goalsNote: string | null }
  | { kind: "ready"; data: MemoryData };

export type MemoryActions = {
  onRemoveLine: (id: string) => void;
  onRemoveGoal: (key: GoalLine["key"]) => void;
  onAddGoal: (patch: Record<string, unknown>) => void;
  onForgetAll: () => void;
  onSpeak: (text: string) => void;
  speaking: string | null;
  onRetry: () => void;
  busy: boolean;
};

const ROW =
  "flex min-h-14 items-center gap-2.5 rounded-[16px] border-2 border-ds-line bg-ds-card py-2 pl-2.5 pr-2";

function Mark({ tone, children }: { tone: "wrong" | "action" | "choice"; children: ReactNode }) {
  const cls =
    tone === "wrong"
      ? "bg-ds-wrong-tint text-ds-wrong-ink"
      : tone === "action"
        ? "bg-ds-action-tint text-ds-action-text"
        : "bg-ds-choice-tint text-ds-choice";
  return (
    <span
      aria-hidden="true"
      className={`grid size-[34px] shrink-0 place-items-center rounded-[10px] ${cls}`}
    >
      {children}
    </span>
  );
}

function SectionHead({ title, count }: { title: string; count: number }) {
  return (
    <div className="mt-2 flex items-baseline justify-between">
      <h2 className="ds-type-headline font-extrabold text-ds-ink">{title}</h2>
      <span className="ds-type-caption font-extrabold text-ds-choice">{count}</span>
    </div>
  );
}

function RemoveButton({
  label,
  onClick,
  disabled,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className="grid size-11 shrink-0 place-items-center rounded-[12px] text-ds-ink-soft disabled:opacity-45"
    >
      <DsIcon name="close" className="size-5" />
    </button>
  );
}

function Hero({ title, line }: { title: string; line: string }) {
  return (
    <header className="relative min-h-[150px] overflow-hidden rounded-[18px] bg-ds-hero py-3.5 pl-3.5 pr-[118px] text-ds-on-hero">
      <h1 className="ds-type-display mb-1.5">{title}</h1>
      <p className="ds-type-footnote text-ds-on-hero-soft">{line}</p>
      <img
        src="/alphonso/lesson/happy.webp"
        alt=""
        draggable={false}
        className="absolute -right-1.5 bottom-0 w-32 max-w-none select-none"
      />
    </header>
  );
}

function Sheet({
  label,
  onClose,
  children,
}: {
  label: string;
  onClose: () => void;
  children: ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center bg-ds-ink/45">
      <button
        type="button"
        aria-label="Close"
        tabIndex={-1}
        onClick={onClose}
        className="absolute inset-0 cursor-default"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={label}
        className="relative grid w-full max-w-[480px] gap-2.5 rounded-t-[28px] bg-ds-surface px-4 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-2.5"
      >
        <span
          aria-hidden="true"
          className="mx-auto mb-1 block h-[5px] w-10 rounded-full bg-ds-line"
        />
        {children}
      </div>
    </div>
  );
}

function AddGoalSheet({
  data,
  onAdd,
  onClose,
}: {
  data: MemoryData;
  onAdd: (patch: Record<string, unknown>) => void;
  onClose: () => void;
}) {
  const options = addableGoals(data.goals);
  const chip =
    "min-h-11 rounded-[12px] border-2 border-ds-line bg-ds-card px-3 ds-type-footnote font-extrabold text-ds-ink";
  const none =
    options.goals.length === 0 && options.minutes.length === 0 && options.interests.length === 0;
  return (
    <Sheet label="Add a goal" onClose={onClose}>
      <h3 className="ds-type-title font-extrabold text-ds-ink">Add a goal</h3>
      {none ? (
        <p className="ds-type-footnote text-ds-ink-soft">
          Everything you can pick is already here.
        </p>
      ) : (
        <>
          {options.goals.length > 0 && (
            <div className="grid gap-1.5">
              <p className="ds-type-caption text-ds-ink-soft">Why you are learning</p>
              <div className="flex flex-wrap gap-1.5">
                {options.goals.map((g) => (
                  <button
                    key={g.id}
                    type="button"
                    className={chip}
                    onClick={() => onAdd({ goal: g.id })}
                  >
                    {g.label}
                  </button>
                ))}
              </div>
            </div>
          )}
          {options.minutes.length > 0 && (
            <div className="grid gap-1.5">
              <p className="ds-type-caption text-ds-ink-soft">Time each day</p>
              <div className="flex flex-wrap gap-1.5">
                {options.minutes.map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    className={chip}
                    onClick={() => onAdd({ dailyMinutes: m.id })}
                  >
                    {m.label}
                  </button>
                ))}
              </div>
            </div>
          )}
          {options.interests.length > 0 && (
            <div className="grid gap-1.5">
              <p className="ds-type-caption text-ds-ink-soft">Topics you like</p>
              <div className="flex flex-wrap gap-1.5">
                {options.interests.map((i) => (
                  <button
                    key={i.id}
                    type="button"
                    className={chip}
                    onClick={() => onAdd({ interests: [...data.goals.interests, i.id] })}
                  >
                    {i.label}
                  </button>
                ))}
              </div>
            </div>
          )}
        </>
      )}
      <DsButton variant="secondary" full onClick={onClose}>
        Close
      </DsButton>
    </Sheet>
  );
}

export function MemoryScreen({ view, actions }: { view: MemoryView; actions: MemoryActions }) {
  const [confirming, setConfirming] = useState(false);
  const [adding, setAdding] = useState(false);

  return (
    <div className="grid gap-2.5 px-4 pb-10 pt-1.5">
      <Link
        to="/profile"
        className="inline-flex min-h-11 items-center gap-0.5 ds-type-subhead font-bold text-ds-choice"
      >
        <DsIcon name="chevron" className="size-5 -scale-x-100" />
        Profile
      </Link>

      {view.kind === "loading" && (
        <p role="status" className="py-10 text-center ds-type-footnote text-ds-ink-soft">
          Loading what Alphonso remembers...
        </p>
      )}

      {view.kind === "error" && (
        <div role="alert" className="grid gap-3 py-10 text-center">
          <p className="ds-type-headline text-ds-ink">This did not load.</p>
          <DsButton onClick={actions.onRetry} className="mx-auto">
            Try again
          </DsButton>
        </div>
      )}

      {view.kind === "locked" && (
        <>
          <Hero
            title="What Alphonso remembers"
            line="Alphonso keeps notes between calls and you can read, fix and delete every line."
          />
          <h2 className="mt-2 ds-type-headline font-extrabold text-ds-ink">He could remember</h2>
          <ul className="grid gap-[7px]" data-memory-locked="">
            {view.weakSpots.map((w) => (
              <li key={w} className={`${ROW} bg-ds-sunk`}>
                <Mark tone="wrong">
                  <DsIcon name="cross" className="size-5" />
                </Mark>
                <div className="min-w-0 flex-1">
                  <b className="block ds-type-footnote font-bold text-ds-ink">{w}</b>
                  <small className="ds-type-caption text-ds-ink-soft">From your weak spots</small>
                </div>
                <DsIcon name="lock" className="mr-1.5 size-[22px] text-ds-ink-faint" />
              </li>
            ))}
            <li className={`${ROW} bg-ds-sunk`}>
              <Mark tone="action">
                <DsIcon name="words" className="size-5" />
              </Mark>
              <div className="min-w-0 flex-1">
                <b className="block ds-type-footnote font-bold text-ds-ink">
                  Phrases from your calls
                </b>
                <small className="ds-type-caption text-ds-ink-soft">Tap one to hear it again</small>
              </div>
              <DsIcon name="lock" className="mr-1.5 size-[22px] text-ds-ink-faint" />
            </li>
            {view.goalsNote && (
              <li className={`${ROW} bg-ds-sunk`}>
                <Mark tone="choice">
                  <DsIcon name="target" className="size-5" />
                </Mark>
                <div className="min-w-0 flex-1">
                  <b className="block ds-type-footnote font-bold text-ds-ink">Goals you told him</b>
                  <small className="ds-type-caption text-ds-ink-soft">{view.goalsNote}</small>
                </div>
                <DsIcon name="lock" className="mr-1.5 size-[22px] text-ds-ink-faint" />
              </li>
            )}
          </ul>
          <div className="mt-2 grid gap-1">
            <DsLinkButton to="/hector" variant="primary" small={false} full>
              Try Alphonso Pro
            </DsLinkButton>
            <DsLinkButton
              to="/profile"
              variant="secondary"
              small={false}
              full
              className="!border-0 !bg-transparent !shadow-none text-ds-choice"
            >
              Not now
            </DsLinkButton>
          </div>
          <p className="text-center ds-type-caption font-bold text-ds-ink-soft">
            Your call recap stays free. You can download or delete your data any time in Settings.
          </p>
        </>
      )}

      {view.kind === "ready" && (
        <ReadyBody
          data={view.data}
          actions={actions}
          onForget={() => setConfirming(true)}
          onAdd={() => setAdding(true)}
        />
      )}

      {confirming && view.kind === "ready" && (
        <Sheet label="Forget everything?" onClose={() => setConfirming(false)}>
          <h3 className="ds-type-title font-extrabold text-ds-ink">Forget everything?</h3>
          <p className="ds-type-footnote text-ds-ink-soft">
            Alphonso will forget the {view.data.mistakes.length} mistakes,{" "}
            {view.data.phrases.length} phrases and {goalLines(view.data.goals).length} goals on this
            page. Phrases also leave your review. This cannot be undone.
          </p>
          <DsButton
            full
            disabled={actions.busy}
            className="!bg-ds-wrong !text-ds-on-wrong !shadow-[0_4px_0_var(--c-wrong-edge)]"
            onClick={() => {
              setConfirming(false);
              actions.onForgetAll();
            }}
          >
            Forget everything
          </DsButton>
          <DsButton variant="secondary" full onClick={() => setConfirming(false)}>
            Keep them
          </DsButton>
        </Sheet>
      )}
      {adding && view.kind === "ready" && (
        <AddGoalSheet
          data={view.data}
          onClose={() => setAdding(false)}
          onAdd={(patch) => {
            setAdding(false);
            actions.onAddGoal(patch);
          }}
        />
      )}
    </div>
  );
}

function ReadyBody({
  data,
  actions,
  onForget,
  onAdd,
}: {
  data: MemoryData;
  actions: MemoryActions;
  onForget: () => void;
  onAdd: () => void;
}) {
  const goals = goalLines(data.goals);
  const empty = data.mistakes.length === 0 && data.phrases.length === 0 && goals.length === 0;
  const addable = addableGoals(data.goals);
  const canAdd = addable.goals.length + addable.minutes.length + addable.interests.length > 0;
  return (
    <>
      <Hero
        title="What Alphonso remembers"
        line={
          empty
            ? "Alphonso keeps short notes from your calls here."
            : `${memorySummary({ mistakes: data.mistakes.length, phrases: data.phrases.length, goals: goals.length })} Alphonso uses these notes to plan your next calls. Remove a line and it is gone.`
        }
      />
      {data.mistakes.length > 0 && (
        <>
          <SectionHead title="Mistakes he keeps seeing" count={data.mistakes.length} />
          <ul className="grid gap-[7px]">
            {data.mistakes.map((m) => (
              <li key={m.id} data-memory-mistake={m.topic} className={ROW}>
                <Mark tone="wrong">
                  <DsIcon name="cross" className="size-5" />
                </Mark>
                <div className="min-w-0 flex-1">
                  <b className="block ds-type-footnote font-bold text-ds-ink">{m.label}</b>
                  <small className="ds-type-caption text-ds-ink-soft">{mistakeNote(m)}</small>
                </div>
                <RemoveButton
                  label={`Remove ${m.label}`}
                  disabled={actions.busy}
                  onClick={() => actions.onRemoveLine(m.id)}
                />
              </li>
            ))}
          </ul>
        </>
      )}
      {data.phrases.length > 0 && (
        <>
          <SectionHead title="Phrases you are learning" count={data.phrases.length} />
          <ul className="grid gap-[7px]">
            {data.phrases.map((p) => (
              <li key={p.id} data-memory-phrase="" className={ROW}>
                <Mark tone="action">
                  <DsIcon name="words" className="size-5" />
                </Mark>
                <div className="min-w-0 flex-1">
                  <b lang={p.course} className="block ds-type-footnote font-bold text-ds-ink">
                    {p.text}
                  </b>
                  <small className="ds-type-caption text-ds-ink-soft">{p.meaning}</small>
                </div>
                <button
                  type="button"
                  aria-label={`Hear: ${p.text}`}
                  aria-pressed={actions.speaking === p.text}
                  onClick={() => actions.onSpeak(p.text)}
                  className={`grid size-11 shrink-0 place-items-center rounded-[14px] shadow-[inset_0_0_0_2px_color-mix(in_srgb,var(--c-choice)_22%,transparent)] ${actions.speaking === p.text ? "bg-ds-choice text-ds-on-choice" : "bg-ds-choice-tint text-ds-choice"}`}
                >
                  <DsIcon name="speaker" className="size-[22px]" />
                </button>
                <RemoveButton
                  label={`Remove ${p.text}`}
                  disabled={actions.busy}
                  onClick={() => actions.onRemoveLine(p.id)}
                />
              </li>
            ))}
          </ul>
        </>
      )}
      {goals.length > 0 && (
        <>
          <SectionHead title="Goals you told him" count={goals.length} />
          <ul className="grid gap-[7px]">
            {goals.map((g) => (
              <li key={g.key} data-memory-goal={g.key} className={ROW}>
                <Mark tone="choice">
                  <DsIcon name="target" className="size-5" />
                </Mark>
                <div className="min-w-0 flex-1">
                  <b className="block ds-type-footnote font-bold text-ds-ink">{g.title}</b>
                  <small className="ds-type-caption text-ds-ink-soft">{g.note}</small>
                </div>
                <RemoveButton
                  label={`Remove ${g.title}`}
                  disabled={actions.busy}
                  onClick={() => actions.onRemoveGoal(g.key)}
                />
              </li>
            ))}
          </ul>
        </>
      )}
      {empty && (
        <div className="mt-1.5 grid gap-1.5 rounded-[18px] border-2 border-dashed border-ds-line bg-ds-card px-4 py-[18px]">
          <b className="ds-type-headline font-extrabold text-ds-ink">Nothing here yet.</b>
          <p className="ds-type-footnote text-ds-ink-soft">
            After a few calls, Alphonso will list the mistakes he keeps seeing and the phrases you
            are learning. Your goals from when you started show here too.
          </p>
        </div>
      )}
      {canAdd && (
        <button
          type="button"
          onClick={onAdd}
          className="inline-flex min-h-11 w-fit items-center gap-1.5 px-1.5 ds-type-subhead font-extrabold text-ds-choice"
        >
          <span aria-hidden="true" className="ds-type-title leading-none">
            +
          </span>
          Add a goal
        </button>
      )}
      {!empty && (
        <div className="mt-2.5 grid gap-2">
          <DsButton variant="danger" full disabled={actions.busy} onClick={onForget}>
            Forget everything
          </DsButton>
          <p className="text-center ds-type-caption font-bold text-ds-ink-soft">
            Removes everything on this page from your account. Your lessons, stars, streak and XP
            stay.
          </p>
        </div>
      )}
    </>
  );
}
