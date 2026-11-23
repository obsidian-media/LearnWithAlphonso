import { useId, useState, type CSSProperties } from "react";
import { DsButton, DsSwitch } from "./ds/Blocks";
import { Modal } from "./Modal";
import {
  HANDS_FREE_FIRST_USE_CANCEL,
  HANDS_FREE_FIRST_USE_CONFIRM,
  HANDS_FREE_FIRST_USE_TITLE,
  HANDS_FREE_NOTE_SEEN_KEY,
  HANDS_FREE_TOGGLE,
  handsFreeFirstUseBody,
} from "@/lib/hands-free-copy";
import type { HandsFreeStatus } from "@/lib/hands-free-loop";

/** What a call hands to `PracticeCall` for hands-free. */
export type HandsFreeCall = {
  /** The learner's switch. It starts as they last left it on this device (off the first time). */
  on: boolean;
  onChange: (on: boolean) => void;
  status: HandsFreeStatus;
  /** The Pause / Resume button. */
  onTogglePause: () => void;
  /** Who is on the call; the note names them. */
  partner: string;
};

function noteSeen(): boolean {
  try {
    return window.localStorage.getItem(HANDS_FREE_NOTE_SEEN_KEY) === "1";
  } catch {
    return false;
  }
}

function rememberNote(): void {
  try {
    window.localStorage.setItem(HANDS_FREE_NOTE_SEEN_KEY, "1");
  } catch {
    /* the note shows again next time; nothing else depends on it */
  }
}

/**
 * Turning hands-free on asks for the once-per-device safety note first; this hook is the one place that rule lives,
 * for the switch in the conversation sheet and for the chip on the call itself. `request(next)` applies a change (or
 * shows the note first), and `note` is the dialog to render.
 */
function useHandsFreeNote(call: HandsFreeCall) {
  const [showNote, setShowNote] = useState(false);
  const titleId = useId();
  const bodyId = useId();
  const request = (next: boolean) => {
    if (next && !noteSeen()) setShowNote(true);
    else call.onChange(next);
  };
  const note = showNote && (
    <Modal
      labelledBy={titleId}
      describedBy={bodyId}
      onEscape={() => setShowNote(false)}
      className="relative z-10 m-4 w-full max-w-sm space-y-3 rounded-3xl bg-ds-card p-5 text-ds-ink shadow-[var(--ds-shadow-resting)]"
    >
      <h2 id={titleId} className="font-display ds-type-headline font-semibold">
        {HANDS_FREE_FIRST_USE_TITLE}
      </h2>
      <p id={bodyId} className="ds-type-footnote text-ds-ink-soft">
        {handsFreeFirstUseBody(call.partner)}
      </p>
      <div className="flex flex-col gap-2">
        <DsButton
          full
          onClick={() => {
            rememberNote();
            setShowNote(false);
            call.onChange(true);
          }}
        >
          {HANDS_FREE_FIRST_USE_CONFIRM}
        </DsButton>
        <DsButton variant="secondary" full onClick={() => setShowNote(false)}>
          {HANDS_FREE_FIRST_USE_CANCEL}
        </DsButton>
      </div>
    </Modal>
  );
  return { request, note };
}

/**
 * The "Hands-free" switch of a voice call, with its once-per-device safety note. It lives in the call's conversation
 * sheet, as on iOS. Turning it on is free in Practice (the same turn as a held press, so the server's daily caps
 * already apply) and stays Pro in Hector (the call itself is Pro). The learner's last choice is remembered per device
 * (`hands-free-preference.ts`) and applied when the next call starts.
 */
export function HandsFreeSwitch({ call }: { call: HandsFreeCall }) {
  const { request, note } = useHandsFreeNote(call);
  return (
    <div className="flex items-center justify-between gap-3 pb-2">
      <span className="ds-type-footnote font-semibold text-ds-ink">{HANDS_FREE_TOGGLE}</span>
      <DsSwitch on={call.on} label={HANDS_FREE_TOGGLE} onChange={request} />
      {note}
    </div>
  );
}

/**
 * The same switch as a chip on the call screen itself (mirrors the native call screen's chip), so hands-free is
 * visible without opening the conversation sheet. The press runs inside the learner's tap, which is also what lets the
 * browser start the microphone and the audio session.
 */
export function HandsFreeChip({
  call,
  style,
  className = "",
}: {
  call: HandsFreeCall;
  style?: CSSProperties;
  className?: string;
}) {
  const { request, note } = useHandsFreeNote(call);
  return (
    <>
      <button
        type="button"
        aria-pressed={call.on}
        aria-label={HANDS_FREE_TOGGLE}
        data-testid="hands-free-chip"
        data-on={call.on}
        onClick={() => request(!call.on)}
        className={`flex min-h-9 items-center gap-1.5 rounded-full px-3 text-xs font-bold ${className}`}
        style={style}
      >
        <svg viewBox="0 0 24 24" className="size-4" fill="none" aria-hidden="true">
          <rect x="9" y="3" width="6" height="11" rx="3" stroke="currentColor" strokeWidth="2" />
          <path
            d="M5 11a7 7 0 0 0 14 0M12 18v3"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
          />
        </svg>
        <span>
          {HANDS_FREE_TOGGLE}: {call.on ? "On" : "Off"}
        </span>
      </button>
      {note}
    </>
  );
}
