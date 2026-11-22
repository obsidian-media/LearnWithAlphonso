import { useEffect, useRef, type ClipboardEvent, type KeyboardEvent } from "react";

export const CODE_LENGTH = 6;
const SLOTS = Array.from({ length: CODE_LENGTH }, (_, i) => i);
const digitsOf = (s: string) => s.replace(/\D/g, "");

/**
 * Six one-digit boxes for the authenticator code. Typing a digit moves on; Backspace on an empty box steps back and
 * clears the one before; pasting (or an OS one-time-code autofill, which drops the whole code into one box) spreads
 * the digits across the boxes. Every box is `inputmode=numeric` with `autocomplete=one-time-code` so iOS and Android
 * offer the code, and each has its own accessible label.
 */
export function CodeBoxes({
  value,
  onChange,
  disabled = false,
  focusOnMount = false,
  focusKey = 0,
  labelledBy,
}: {
  value: string;
  onChange: (next: string) => void;
  disabled?: boolean;
  focusOnMount?: boolean;
  /** Changing this refocuses box 1 (after a failed code). */
  focusKey?: number;
  /** id of the visible label for the group. */
  labelledBy?: string;
}) {
  const refs = useRef<(HTMLInputElement | null)[]>([]);
  const focus = (i: number) => refs.current[Math.max(0, Math.min(CODE_LENGTH - 1, i))]?.focus();
  // The person just reached this step by pressing a button, so the first box takes focus (as in the mock).
  useEffect(() => {
    if (focusOnMount) refs.current[0]?.focus();
  }, [focusOnMount, focusKey]);
  const cells = () => value.padEnd(CODE_LENGTH, " ").split("");
  const emit = (chars: string[]) => onChange(chars.join("").replace(/ +$/, ""));

  /** Put `digits` into the boxes starting at `from`, then focus the box after the last one filled. */
  function place(from: number, digits: string) {
    const chars = cells();
    for (let k = 0; k < digits.length && from + k < CODE_LENGTH; k += 1) {
      chars[from + k] = digits[k]!;
    }
    emit(chars);
    focus(from + digits.length);
  }

  function onInput(i: number, raw: string) {
    const digits = digitsOf(raw);
    if (!digits) {
      // The box was emptied (selected, then deleted).
      const chars = cells();
      chars[i] = " ";
      emit(chars);
      return;
    }
    // A whole code (an OS autofill into any box) is the whole code, wherever it landed, as with paste.
    place(digits.length >= CODE_LENGTH ? 0 : i, digits);
  }

  function onKeyDown(i: number, e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Backspace" && !value[i]?.trim()) {
      e.preventDefault();
      if (i > 0) {
        const chars = cells();
        chars[i - 1] = " ";
        emit(chars);
        focus(i - 1);
      }
    } else if (e.key === "ArrowLeft") focus(i - 1);
    else if (e.key === "ArrowRight") focus(i + 1);
  }

  function onPaste(i: number, e: ClipboardEvent<HTMLInputElement>) {
    const digits = digitsOf(e.clipboardData.getData("text"));
    if (!digits) return;
    e.preventDefault();
    // A pasted full code is the whole code, wherever the cursor was.
    place(digits.length >= CODE_LENGTH ? 0 : i, digits);
  }

  return (
    <div
      role="group"
      aria-labelledby={labelledBy}
      aria-label={labelledBy ? undefined : "6-digit code"}
      className="flex justify-center gap-2"
    >
      {SLOTS.map((i) => (
        <input
          key={i}
          ref={(el) => {
            refs.current[i] = el;
          }}
          type="text"
          inputMode="numeric"
          autoComplete="one-time-code"
          pattern="[0-9]*"
          aria-label={`Digit ${i + 1}`}
          value={value[i]?.trim() ?? ""}
          disabled={disabled}
          onChange={(e) => onInput(i, e.target.value)}
          onKeyDown={(e) => onKeyDown(i, e)}
          onPaste={(e) => onPaste(i, e)}
          onFocus={(e) => e.currentTarget.select()}
          className="h-14 min-h-11 min-w-0 max-w-12 flex-1 rounded-xl border border-ds-line bg-ds-surface p-0 text-center font-display text-2xl font-bold text-ds-ink focus:outline-2 focus:outline-offset-1 focus:outline-ds-choice"
        />
      ))}
    </div>
  );
}
