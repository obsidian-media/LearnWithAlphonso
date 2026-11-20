import { Link } from "@tanstack/react-router";
import { useEffect, useRef, useState, type ReactNode, type Ref } from "react";
import { DsIcon } from "@/components/ds/DsIcon";
import { LEVEL_BARS, useMicLevel } from "@/lib/avatar/use-mic-level";
import { COURSES, type Course } from "@/data/course-meta";
import type { HectorChip } from "@/lib/hector-chips";
import { hectorStatusLabel, type HectorStatus } from "@/lib/hector-status";
import { hectorPillText } from "./hector-style";

/**
 * The Hector screen's pieces in the approved "converged" design: a navy hero with his real cut-out, chips under his
 * greeting, bubbles, and the type-or-talk composer. Pure presentation: the route owns the conversation and the voice.
 */

const HECTOR_ART = "/hector/base.webp";

/** The two glyphs the design system has no icon for yet; drawn like its line icons. */
function Glyph({
  name,
  className,
}: {
  name: "coffee" | "chat" | "back" | "dots" | "send" | "stop";
  className?: string;
}) {
  const common = {
    viewBox: "0 0 24 24",
    className,
    "aria-hidden": true as const,
    focusable: false as const,
  };
  switch (name) {
    case "coffee":
      return (
        <svg
          {...common}
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M4 8h12v5a4 4 0 0 1-4 4H8a4 4 0 0 1-4-4V8zM16 9h2.5a2.5 2.5 0 0 1 0 5H16" />
        </svg>
      );
    case "chat":
      return (
        <svg {...common} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round">
          <path d="M4 5h16v11H9l-4 4V5z" />
        </svg>
      );
    case "back":
      return (
        <svg
          {...common}
          fill="none"
          stroke="currentColor"
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M15 5l-7 7 7 7" />
        </svg>
      );
    case "dots":
      return (
        <svg {...common} fill="currentColor">
          <circle cx="5" cy="12" r="1.8" />
          <circle cx="12" cy="12" r="1.8" />
          <circle cx="19" cy="12" r="1.8" />
        </svg>
      );
    case "send":
      return (
        <svg {...common} fill="currentColor">
          <path d="M4 12l15-7-5 7 5 7-15-7z" />
        </svg>
      );
    case "stop":
      return (
        <svg {...common} fill="currentColor">
          <rect x="7" y="7" width="10" height="10" rx="2.5" />
        </svg>
      );
  }
}

const courseName = (course: Course) => COURSES.find((c) => c.id === course)?.label ?? "language";

export function HectorHeader({
  course,
  status,
  menu,
  backTo,
}: {
  course: Course;
  status: HectorStatus | null;
  /** What the old header bar held (subscription, settings): reachable from the overflow button. */
  menu: ReactNode;
  /** Only where Hector is presented as a subpage or sheet: on the tab (a tab root) there is nothing to go back to. */
  backTo?: string;
}) {
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);
  const items = () =>
    Array.from(listRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? []);
  useEffect(() => {
    if (!open) return;
    // Opening moves focus into the menu, as a menu button does.
    (items()[0] ?? listRef.current)?.focus();
    const close = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      setOpen(false);
      buttonRef.current?.focus();
    };
    const outside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("keydown", close);
    document.addEventListener("mousedown", outside);
    return () => {
      document.removeEventListener("keydown", close);
      document.removeEventListener("mousedown", outside);
    };
  }, [open]);
  const listening = status === "listening";
  return (
    <header
      data-testid="hector-header"
      className="relative z-20 flex min-h-[148px] items-end gap-3 bg-gradient-to-br from-ds-hero-a to-ds-hero-b px-4 text-ds-on-hero shadow-[0_10px_24px_-14px_rgba(14,20,48,0.7)]"
    >
      <div className="absolute inset-x-0 top-0 z-30 flex items-center justify-between px-3.5 pt-3">
        {backTo ? (
          <Link
            to={backTo}
            aria-label="Back to Learn"
            data-hector-exit=""
            className="grid size-11 place-items-center rounded-full bg-ds-on-hero/15 text-ds-on-hero focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ds-on-hero"
          >
            <Glyph name="back" className="size-5" />
          </Link>
        ) : (
          <span />
        )}
        <div ref={menuRef} className="relative">
          <button
            ref={buttonRef}
            type="button"
            aria-label="More about Hector"
            aria-haspopup="menu"
            aria-expanded={open}
            onClick={() => setOpen((o) => !o)}
            className="grid size-11 place-items-center rounded-full bg-ds-on-hero/15 text-ds-on-hero focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ds-on-hero"
          >
            <Glyph name="dots" className="size-5" />
          </button>
          {open && (
            <div
              ref={listRef}
              role="menu"
              tabIndex={-1}
              aria-label="Hector options"
              onKeyDown={(e) => {
                const all = items();
                const at = all.indexOf(document.activeElement as HTMLElement);
                const go = (i: number) => {
                  e.preventDefault();
                  all[(i + all.length) % all.length]?.focus();
                };
                if (e.key === "ArrowDown") go(at + 1);
                else if (e.key === "ArrowUp") go(at - 1);
                else if (e.key === "Home") go(0);
                else if (e.key === "End") go(all.length - 1);
              }}
              className="absolute right-0 top-12 grid min-w-52 gap-1 rounded-2xl bg-ds-card p-2 text-ds-ink shadow-[var(--ds-shadow-floating)]"
            >
              {menu}
            </div>
          )}
        </div>
      </div>
      <img
        src={HECTOR_ART}
        alt=""
        width={116}
        height={128}
        decoding="async"
        draggable={false}
        data-testid="hector-figure"
        className="mascot-breathe relative z-10 mt-10 h-[128px] w-[116px] shrink-0 object-contain object-bottom drop-shadow-[0_7px_13px_rgba(0,0,0,0.5)]"
      />
      <div className="relative z-10 min-w-0 flex-1 pb-4">
        <h1 className="font-display ds-type-title !font-extrabold leading-none">Hector</h1>
        <p className="mt-1.5 ds-type-footnote text-ds-on-hero-soft">
          Your {courseName(course)} tutor
        </p>
        <p
          role="status"
          aria-label={`Hector is ${status ? hectorStatusLabel(status).toLowerCase() : "ready"}`}
          data-testid="hector-status"
          className="mt-2 inline-flex items-center gap-1.5 rounded-full border border-ds-call-record/35 bg-ds-call-record/15 px-2.5 py-1 ds-type-caption font-bold text-ds-on-hero-kick"
        >
          <span
            aria-hidden="true"
            className={`size-1.5 rounded-full bg-ds-call-record shadow-[0_0_6px] shadow-ds-call-record ${
              listening ? "animate-pulse motion-reduce:animate-none" : ""
            }`}
          />
          {hectorPillText(status)}
        </p>
      </div>
    </header>
  );
}

/** Hector's mini round avatar beside his bubbles. */
export function HectorAvatar() {
  return (
    <span
      aria-hidden="true"
      className="mt-auto grid size-[30px] shrink-0 place-items-center overflow-hidden rounded-full bg-ds-hero-a shadow-[var(--ds-shadow-resting)]"
    >
      <img
        src={HECTOR_ART}
        alt=""
        width={30}
        height={35}
        decoding="async"
        draggable={false}
        className="h-[118%] w-full object-cover object-[50%_12%]"
      />
    </span>
  );
}

function ChipIcon({ icon }: { icon: HectorChip["icon"] }) {
  const cls = "size-[15px] shrink-0 text-ds-choice";
  if (icon === "coffee" || icon === "chat") return <Glyph name={icon} className={cls} />;
  return <DsIcon name={icon} className={cls} />;
}

/** Suggestion chips: frosted-solid like the Stories choices; tapping one sends it as the learner's message. */
export function HectorChips({
  chips,
  disabled,
  onPick,
}: {
  chips: readonly HectorChip[];
  disabled: boolean;
  onPick: (chip: HectorChip) => void;
}) {
  return (
    <div
      role="group"
      aria-label="Things to say to Hector"
      className="flex flex-wrap gap-2 pl-[39px]"
    >
      {chips.map((chip) => (
        <button
          key={chip.id}
          type="button"
          disabled={disabled}
          onClick={() => onPick(chip)}
          className="inline-flex min-h-11 items-center gap-1.5 rounded-full border-[1.5px] border-ds-line bg-ds-card px-3.5 py-2 text-left ds-type-footnote font-bold text-ds-ink shadow-[var(--ds-shadow-resting)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ds-choice disabled:opacity-60"
        >
          <ChipIcon icon={chip.icon} />
          {chip.label}
        </button>
      ))}
    </div>
  );
}

const STATIC_BARS = [7, 14, 20, 11, 16];

const BAR = "w-[3px] rounded-sm bg-ds-choice opacity-85";
const WAVE = "flex h-6 items-center gap-[3px] overflow-hidden";

function LiveBars({ getStream }: { getStream: () => MediaStream | null }) {
  const bars = useRef<(HTMLSpanElement | null)[]>([]);
  useMicLevel(true, getStream, () => bars.current);
  return (
    <span aria-hidden="true" data-testid="hector-wave" className={WAVE}>
      {Array.from({ length: LEVEL_BARS }, (_, i) => (
        <span
          key={i}
          ref={(el) => {
            bars.current[i] = el;
          }}
          className={BAR}
          style={{ height: 6 }}
        />
      ))}
    </span>
  );
}

/** The "Listening" waveform: the real input level where the browser gives one; static bars under Reduce Motion. */
function Waveform({
  getStream,
  reducedMotion,
}: {
  getStream: () => MediaStream | null;
  reducedMotion: boolean;
}) {
  if (!reducedMotion) return <LiveBars getStream={getStream} />;
  return (
    <span aria-hidden="true" data-testid="hector-wave" className={WAVE}>
      {STATIC_BARS.map((h, i) => (
        <span key={i} className={BAR} style={{ height: h }} />
      ))}
    </span>
  );
}

export function HectorComposer({
  value,
  onChange,
  onSend,
  onMic,
  recording,
  busy,
  disabled,
  reducedMotion,
  getStream,
  inputRef,
}: {
  value: string;
  onChange: (v: string) => void;
  onSend: () => void;
  /** Starts a turn by voice, or stops and sends the one in progress. */
  onMic: () => void;
  recording: boolean;
  /** Hector is working (transcribing, thinking, greeting): no new turn. */
  busy: boolean;
  /** The text field is locked (a turn is in flight). */
  disabled: boolean;
  reducedMotion: boolean;
  getStream: () => MediaStream | null;
  /** The text field, so "Try again" can put the cursor there when there is no microphone. */
  inputRef?: Ref<HTMLTextAreaElement>;
}) {
  const typed = value.trim().length > 0;
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSend();
      }}
      className="flex items-end gap-2"
    >
      {recording ? (
        <div
          data-testid="hector-listening"
          className="flex min-h-11 flex-1 items-center gap-3 rounded-[22px] border-[1.5px] border-ds-choice/25 bg-ds-choice-tint px-4 ds-type-footnote font-extrabold text-ds-choice"
        >
          Listening
          <Waveform getStream={getStream} reducedMotion={reducedMotion} />
        </div>
      ) : (
        <div className="flex min-h-11 flex-1 items-end rounded-[22px] border-[1.5px] border-ds-line bg-ds-surface px-4 py-2.5">
          <textarea
            ref={inputRef}
            aria-label="Message Hector"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                onSend();
              }
            }}
            rows={1}
            placeholder="Type or tap the mic…"
            disabled={disabled}
            className="max-h-32 w-full resize-none bg-transparent ds-type-footnote text-ds-ink outline-none placeholder:text-ds-ink-faint"
          />
        </div>
      )}
      {typed && !recording && (
        <button
          type="submit"
          aria-label="Send"
          disabled={disabled}
          className="grid size-11 shrink-0 place-items-center rounded-full bg-ds-choice text-ds-on-choice shadow-[inset_0_-2px_0_var(--c-choice-edge)] disabled:opacity-50"
        >
          <Glyph name="send" className="size-5" />
        </button>
      )}
      {recording ? (
        <button
          type="button"
          onClick={onMic}
          aria-label="Stop recording and send"
          aria-pressed
          className="grid size-11 shrink-0 place-items-center rounded-full bg-ds-wrong text-ds-on-wrong shadow-[inset_0_-2px_0_var(--c-wrong-edge)]"
        >
          <Glyph name="stop" className="size-5" />
        </button>
      ) : (
        <button
          type="button"
          onClick={onMic}
          aria-label="Record a voice message"
          aria-pressed={false}
          disabled={busy}
          className="grid size-11 shrink-0 place-items-center rounded-full bg-gradient-to-b from-ds-action-hi to-ds-action text-ds-on-action shadow-[inset_0_-2px_0_var(--c-action-edge)] disabled:opacity-50"
        >
          <DsIcon name="mic" className="size-[21px]" />
        </button>
      )}
    </form>
  );
}
