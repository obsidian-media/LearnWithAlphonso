import { useId, useState } from "react";
import { Modal } from "../Modal";
import { DsIcon } from "../ds/DsIcon";
import { edgeButtonClass } from "../lesson/LessonParts";
import { PracticeStars } from "./PracticeStars";
import { starRuleLines } from "@/lib/practice-stars";

export type CallMode = "call" | "chat";

export type PreCallTarget = {
  /** The scenario's or scene's title, in the course language. */
  title: string;
  /** "Beginner", "Intermediate" or "Advanced". */
  level: string;
  /** "Valeria, barista en Café La Ceiba". */
  persona: string;
  /** The real first line the call opens with. */
  opener: string;
  /** For a campaign scene: "Scene 2 of 3". */
  step?: string;
  /** The course language, for the title and the opener ("es"). */
  lang: string;
};

/**
 * Before a call (mock-up screen 4): who the learner will talk to, their real first line, exactly what each star
 * takes, and whether to speak (the call with Alphonso) or type (the chat). Nothing starts until "Start".
 */
export function PreCallSheet({
  target,
  initialMode,
  onClose,
  onStart,
}: {
  target: PreCallTarget;
  initialMode: CallMode;
  onClose: () => void;
  onStart: (mode: CallMode) => void;
}) {
  const titleId = useId();
  const [mode, setMode] = useState<CallMode>(initialMode);
  const name = target.persona.split(",")[0].trim();
  return (
    <Modal
      labelledBy={titleId}
      onEscape={onClose}
      className="ds-light relative flex max-h-[92dvh] w-full max-w-[430px] flex-col gap-3 overflow-y-auto rounded-t-[var(--ds-radius-sheet)] bg-ds-surface px-4 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-2.5 text-ds-ink shadow-[var(--ds-shadow-sheet)] sm:rounded-[var(--ds-radius-sheet)]"
    >
      <div data-pre-call="" className="contents">
        <span aria-hidden="true" className="h-1.5 w-10 self-center rounded-full bg-ds-line" />
        <div className="flex items-center gap-3">
          <span
            aria-hidden="true"
            className="size-14 shrink-0 rounded-full bg-ds-sunk bg-no-repeat shadow-[0_0_0_2px_var(--c-action)]"
            style={{
              backgroundImage: "url(/alphonso/lesson/talk.webp)",
              backgroundSize: "165%",
              backgroundPosition: "center 18%",
            }}
          />
          <div className="min-w-0 flex-1">
            <h2 id={titleId} lang={target.lang} className="ds-type-question-small text-ds-ink">
              {target.title}
            </h2>
            <p className="ds-type-caption text-ds-ink-soft">
              {[target.level, target.step, target.persona].filter(Boolean).join(" · ")}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="grid size-11 shrink-0 place-items-center rounded-full bg-ds-card text-ds-brand shadow-[var(--ds-shadow-resting)]"
          >
            <DsIcon name="close" className="size-5" />
          </button>
        </div>

        <div className="rounded-[16px_16px_16px_4px] border-2 border-ds-line bg-ds-card px-3 py-2.5">
          <p className="ds-type-caption text-ds-ink-soft">
            {name} starts the {mode === "call" ? "call" : "chat"}:
          </p>
          <p lang={target.lang} className="ds-type-footnote text-ds-ink" data-opener="">
            {target.opener}
          </p>
        </div>

        <div className="grid gap-1.5 rounded-[14px] bg-ds-choice-tint px-3 py-2.5">
          <h3 className="ds-type-overline text-ds-brand">How to earn stars</h3>
          <ul className="grid gap-1.5">
            {starRuleLines(mode).map(([n, text]) => (
              <li key={n} className="flex items-center gap-2.5 ds-type-caption text-ds-ink">
                <PracticeStars n={n} className="w-12 shrink-0" />
                <span>{text}</span>
              </li>
            ))}
          </ul>
        </div>

        <div role="radiogroup" aria-label="How to practice" className="grid grid-cols-2 gap-2">
          {(
            [
              ["call", "Call (speak)"],
              ["chat", "Chat (type)"],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={mode === value}
              onClick={() => setMode(value)}
              className={`min-h-11 rounded-[12px] border-2 px-2 ds-type-footnote font-bold ${mode === value ? "border-ds-brand bg-ds-choice-tint text-ds-brand" : "border-ds-line bg-ds-card text-ds-ink"}`}
            >
              {label}
            </button>
          ))}
        </div>

        <button type="button" onClick={() => onStart(mode)} className={edgeButtonClass("primary")}>
          <DsIcon name={mode === "call" ? "mic" : "words"} className="size-5" />
          {mode === "call" ? "Start the call" : "Start the chat"}
        </button>
      </div>
    </Modal>
  );
}
