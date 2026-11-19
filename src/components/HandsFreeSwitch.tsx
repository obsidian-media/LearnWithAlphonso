import { useId, useState } from "react";
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
 * The "Hands-free" switch of a voice call, with its once-per-device safety note. It lives in the call's conversation
 * sheet, as on iOS. Turning it on is free in Practice (the same turn as a held press, so the server's daily caps
 * already apply) and stays Pro in Hector (the call itself is Pro). The learner's last choice is remembered per device
 * (`hands-free-preference.ts`) and applied when the next call starts.
 */
export function HandsFreeSwitch({ call }: { call: HandsFreeCall }) {
  const [showNote, setShowNote] = useState(false);
  const titleId = useId();
  const bodyId = useId();

  return (
    <div className="flex items-center justify-between gap-3 pb-2">
      <span className="ds-type-footnote font-semibold text-ds-ink">{HANDS_FREE_TOGGLE}</span>
      <DsSwitch
        on={call.on}
        label={HANDS_FREE_TOGGLE}
        onChange={(next) => {
          if (next && !noteSeen()) setShowNote(true);
          else call.onChange(next);
        }}
      />
      {showNote && (
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
      )}
    </div>
  );
}
