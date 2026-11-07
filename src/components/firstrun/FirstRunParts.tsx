import { AnimatePresence, motion } from "framer-motion";
import { useId, useMemo, useState, type ReactNode } from "react";
import { DsIcon } from "../ds/DsIcon";
import { Modal } from "../Modal";
import { edgeButtonClass, useViewportHeight } from "../lesson/LessonParts";
import { usePrefersReducedMotion } from "../../lib/use-prefers-reduced-motion";
import { FirstRunIcon, type FirstRunIconName } from "./FirstRunIcons";

/**
 * The first run's parts in the round-6 design system, drawn after the approved mock-up (03-first-run-mockup v2):
 * Alphonso in a room that changes with the answers, a HUD with the eight-step bar, his speech bubble, and the
 * pressable options, tiles, age cards and chips. Every colour and type size is a token.
 */

export function FirstRunScreen({ children }: { children: ReactNode }) {
  return (
    <div
      data-first-run=""
      className="ds-light min-h-dvh bg-ds-sunk font-[family-name:var(--ds-font-body)] text-ds-ink"
    >
      <main
        id="main-content"
        className="relative mx-auto flex min-h-dvh max-w-[430px] flex-col overflow-x-hidden bg-ds-surface"
      >
        {children}
      </main>
    </div>
  );
}

// ---------------------------------------------------------------- room

const ROOM_SCRIM =
  "linear-gradient(180deg, color-mix(in srgb, var(--c-hero-b) 32%, transparent) 0%, transparent 30%, transparent 70%, var(--c-surface) 100%)";

export type RoomSize = "normal" | "tall" | "hero";

/** Room height and figure width: the mock's 210 / 330 rooms on a 300-wide phone, at a 390-wide phone. */
export function useRoomSize(size: RoomSize): { height: number; figure: number } {
  const vh = useViewportHeight();
  const small = vh > 0 && vh < 700;
  if (size === "tall") return small ? { height: 300, figure: 290 } : { height: 410, figure: 380 };
  if (size === "hero") return small ? { height: 250, figure: 230 } : { height: 320, figure: 300 };
  return small ? { height: 200, figure: 200 } : { height: 262, figure: 262 };
}

/**
 * The room with a character standing at its foot. The picture crossfades when the room or the face changes (none
 * under Reduce Motion). `top` holds the HUD, the counter and the mode chip.
 */
export function FirstRunRoom({
  room,
  figure,
  figureAlt,
  size = "normal",
  top,
  chip,
}: {
  room: string;
  figure: string;
  figureAlt: string;
  size?: RoomSize;
  top?: ReactNode;
  chip?: string | null;
}) {
  const reduce = usePrefersReducedMotion();
  const { height, figure: width } = useRoomSize(size);
  const fade = { duration: reduce ? 0 : 0.35 };
  return (
    <div
      data-room={room}
      className="relative shrink-0 overflow-hidden bg-ds-sunk"
      style={{ height }}
    >
      <AnimatePresence initial={false}>
        <motion.div
          key={room}
          aria-hidden="true"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={fade}
          className="absolute inset-0 bg-cover"
          style={{ backgroundImage: `url(${room})`, backgroundPosition: "center 35%" }}
        />
      </AnimatePresence>
      <div
        aria-hidden="true"
        className="absolute inset-0 z-[1]"
        style={{ background: ROOM_SCRIM }}
      />
      <AnimatePresence initial={false}>
        <motion.img
          key={figure}
          src={figure}
          alt={figureAlt}
          decoding="async"
          draggable={false}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={fade}
          className="absolute bottom-0 left-1/2 z-[2] max-w-none -translate-x-1/2 select-none"
          style={{ width }}
        />
      </AnimatePresence>
      {top}
      {chip && (
        <span
          data-room-chip=""
          className="absolute bottom-14 right-4 z-[3] flex items-center gap-2 rounded-full bg-ds-card/95 py-1.5 pl-2 pr-3.5 ds-type-caption font-extrabold text-ds-brand shadow-[var(--ds-shadow-resting)]"
        >
          <span aria-hidden="true" className="size-2.5 rounded-full bg-ds-action" />
          {chip}
        </span>
      )}
    </div>
  );
}

/** Back, the step bar (filled up to `step`), and an optional Skip, over the room; the counter under them. */
export function FirstRunHud({
  step,
  total,
  onBack,
  backLabel = "Back",
  onSkip,
  skipLabel = "Skip",
  showCounter = true,
}: {
  step: number;
  total: number;
  onBack?: () => void;
  backLabel?: string;
  onSkip?: () => void;
  skipLabel?: string;
  showCounter?: boolean;
}) {
  return (
    <>
      <div className="absolute inset-x-4 top-4 z-[3] flex items-center gap-3">
        {onBack ? (
          <button
            type="button"
            onClick={onBack}
            aria-label={backLabel}
            className="grid size-11 shrink-0 place-items-center rounded-full bg-ds-card/95 text-ds-brand shadow-[var(--ds-shadow-resting)]"
          >
            <FirstRunIcon name="back" className="size-5" />
          </button>
        ) : (
          <span className="size-11 shrink-0" aria-hidden="true" />
        )}
        {total > 0 ? (
          <div
            role="progressbar"
            aria-label="Your answers"
            aria-valuemin={0}
            aria-valuemax={total}
            aria-valuenow={step}
            aria-valuetext={`Question ${step} of ${total}`}
            className="flex flex-1 gap-1.5"
          >
            {Array.from({ length: total }, (_, i) => (
              <i
                key={i}
                data-step-on={i < step ? "" : undefined}
                className={`h-2 flex-1 rounded-full ${i < step ? "bg-ds-action" : "bg-ds-card/60"}`}
              />
            ))}
          </div>
        ) : (
          <div className="flex-1" />
        )}
        {onSkip ? (
          <button
            type="button"
            onClick={onSkip}
            className="min-h-11 rounded-full px-2 ds-type-headline font-extrabold text-ds-card [text-shadow:0_1px_6px_color-mix(in_srgb,var(--c-hero-b)_70%,transparent)]"
          >
            {skipLabel}
          </button>
        ) : (
          <span className="w-11 shrink-0" aria-hidden="true" />
        )}
      </div>
      {showCounter && total > 0 && (
        <p aria-hidden="true" className="absolute inset-x-0 top-[70px] z-[3] flex justify-center">
          <span className="rounded-full bg-ds-card px-2.5 py-1 ds-type-overline text-ds-brand shadow-sm">
            Question {step} of {total}
          </span>
        </p>
      )}
    </>
  );
}

// ---------------------------------------------------------------- bubble

/** Alphonso's line. The question is the screen's heading; the speaker reads it aloud with the browser's voice. */
export function FirstRunBubble({
  title,
  sub,
  onPlay,
  playLabel = "Hear Alphonso",
}: {
  title: ReactNode;
  sub?: ReactNode;
  onPlay?: () => void;
  playLabel?: string;
}) {
  return (
    <div
      data-bubble=""
      className="relative z-[4] mx-4 -mt-11 grid grid-cols-[40px_minmax(0,1fr)] items-center gap-3 rounded-[var(--ds-radius-bubble)] bg-ds-card py-3 pl-3 pr-4 shadow-[var(--ds-shadow-floating)]"
    >
      <span
        aria-hidden="true"
        className="absolute -top-[7px] left-1/2 size-[18px] -translate-x-1/2 rotate-45 rounded-[4px] bg-ds-card"
      />
      {onPlay ? (
        <button
          type="button"
          onClick={onPlay}
          aria-label={playLabel}
          className="relative z-[1] grid size-10 place-items-center rounded-full bg-ds-choice-tint text-ds-action-text active:bg-ds-choice active:text-ds-card"
        >
          <DsIcon name="speaker" className="size-5" />
        </button>
      ) : (
        <span
          aria-hidden="true"
          className="relative z-[1] grid size-10 place-items-center rounded-full bg-ds-choice-tint text-ds-action-text"
        >
          <DsIcon name="speaker" className="size-5" />
        </span>
      )}
      <div className="relative min-w-0 break-words">
        <h1 className="ds-type-question-small text-pretty text-ds-brand">{title}</h1>
        {sub && <p className="mt-0.5 ds-type-footnote text-ds-ink-soft">{sub}</p>}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- choices

const FACE_IDLE =
  "border-ds-line bg-ds-card text-ds-brand shadow-[0_4px_0_var(--c-line)] active:translate-y-[3px] active:shadow-[0_1px_0_var(--c-line)]";
const FACE_ON = "border-ds-brand bg-ds-choice-tint text-ds-brand shadow-[0_4px_0_var(--c-brand)]";
const PRESS =
  "transition-[transform,box-shadow,background-color,border-color] duration-[var(--ds-duration-select)] ease-[var(--ds-ease-out)] motion-reduce:transition-none";

export function IconBadge({ name, on }: { name: FirstRunIconName; on: boolean }) {
  return (
    <span
      aria-hidden="true"
      className={`grid size-10 shrink-0 place-items-center rounded-[11px] ${on ? "bg-ds-brand text-ds-card" : "bg-ds-choice-tint text-ds-brand"}`}
    >
      <FirstRunIcon name={name} className="size-[22px]" />
    </span>
  );
}

/** A full-width choice: a lead (icon or flag), a label with an optional line under it, and a tick. */
export function ChoiceRow({
  lead,
  label,
  sub,
  selected,
  onClick,
}: {
  lead: ReactNode;
  label: string;
  sub?: string;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onClick}
      className={`flex min-h-[60px] w-full items-center gap-3.5 rounded-[var(--ds-radius-control)] border-2 px-3.5 py-2.5 text-left ${PRESS} ${selected ? FACE_ON : FACE_IDLE}`}
    >
      {lead}
      <span className="min-w-0 flex-1">
        <span className="block ds-type-headline">{label}</span>
        {sub && <span className="block ds-type-footnote text-ds-ink-soft">{sub}</span>}
      </span>
      <span
        aria-hidden="true"
        className={`grid size-6 shrink-0 place-items-center rounded-full border-2 ${selected ? "border-ds-brand bg-ds-brand text-ds-card" : "border-ds-line"}`}
      >
        {selected && <DsIcon name="check" className="size-3.5 [stroke-width:3.5]" />}
      </span>
    </button>
  );
}

/** A square tile with an icon over its label (goal, how you heard about us). */
export function ChoiceTile({
  icon,
  label,
  selected,
  onClick,
}: {
  icon: FirstRunIconName;
  label: string;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onClick}
      className={`grid min-h-[84px] justify-items-center content-center gap-1.5 rounded-[var(--ds-radius-control)] border-2 px-2 pb-2.5 pt-3 text-center ds-type-footnote font-bold ${PRESS} ${selected ? FACE_ON : FACE_IDLE}`}
    >
      <FirstRunIcon name={icon} className="size-8" />
      {label}
    </button>
  );
}

/** An age card: the range big, a word under it. Every card looks the same; none is picked to start with. */
export function AgeCard({
  big,
  small,
  selected,
  onClick,
}: {
  big: string;
  small: string;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      aria-label={small === big || big.startsWith("<") ? small : `${big}, ${small}`}
      onClick={onClick}
      className={`grid min-h-[78px] content-center gap-0.5 rounded-[var(--ds-radius-control)] border-2 px-1 pb-2.5 pt-3 text-center ${PRESS} ${selected ? FACE_ON : FACE_IDLE}`}
    >
      <span className="ds-type-numeral tabular-nums text-ds-brand">{big}</span>
      <span className="ds-type-caption text-ds-ink-soft">{small}</span>
    </button>
  );
}

/** An interest chip; navy when picked. */
export function InterestChip({
  icon,
  label,
  selected,
  onClick,
}: {
  icon: FirstRunIconName;
  label: string;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onClick}
      className={`inline-flex min-h-11 items-center gap-2 rounded-full border-2 py-1.5 pl-3 pr-4 ds-type-footnote font-bold ${PRESS} ${
        selected
          ? "border-ds-brand bg-ds-brand text-ds-card shadow-[0_3px_0_var(--c-hero-b)]"
          : "border-ds-line bg-ds-card text-ds-brand shadow-[0_3px_0_var(--c-line)]"
      }`}
    >
      <FirstRunIcon name={icon} className="size-5" />
      {label}
    </button>
  );
}

// ---------------------------------------------------------------- bottom

/** The screen's primary button, pinned under the content; `secondary` is a text button under it. */
export function FirstRunFooter({
  label,
  onClick,
  disabled = false,
  secondary,
  note,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  secondary?: { label: string; onClick: () => void };
  note?: ReactNode;
}) {
  return (
    <div className="mt-auto grid gap-1 px-4 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-5">
      {note}
      <button
        type="button"
        onClick={onClick}
        disabled={disabled}
        className={edgeButtonClass("primary")}
      >
        {label}
      </button>
      {secondary && (
        <button type="button" onClick={secondary.onClick} className={edgeButtonClass("tertiary")}>
          {secondary.label}
        </button>
      )}
    </div>
  );
}

export function Hint({ children }: { children: ReactNode }) {
  return <p className="px-5 pt-2.5 ds-type-footnote text-ds-ink-soft">{children}</p>;
}

/** An on/off switch row (the leaderboard flag). */
export function SwitchRow({
  label,
  sub,
  checked,
  onChange,
}: {
  label: string;
  sub?: string;
  checked: boolean;
  onChange: (next: boolean) => void;
}) {
  const subId = useId();
  return (
    <div className="flex items-center gap-3 rounded-[var(--ds-radius-control)] border-2 border-ds-line bg-ds-card px-3.5 py-2.5">
      <span className="min-w-0 flex-1">
        <span className="block ds-type-footnote font-bold text-ds-brand">{label}</span>
        {sub && (
          <span id={subId} className="block ds-type-caption font-semibold text-ds-ink-soft">
            {sub}
          </span>
        )}
      </span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        aria-describedby={sub ? subId : undefined}
        onClick={() => onChange(!checked)}
        className={`relative h-8 w-[52px] shrink-0 rounded-full transition-colors duration-[var(--ds-duration-select)] motion-reduce:transition-none ${checked ? "bg-ds-brand" : "bg-ds-line"}`}
      >
        <span
          className={`absolute top-1 size-6 rounded-full bg-ds-card shadow-[var(--ds-shadow-resting)] transition-[left] duration-[var(--ds-duration-select)] motion-reduce:transition-none ${checked ? "left-[24px]" : "left-1"}`}
        />
      </button>
    </div>
  );
}

// ---------------------------------------------------------------- picker

/** A labelled picker row ("I speak · English") that opens a searchable list. */
export function PickerRow({
  overline,
  value,
  lead,
  onOpen,
}: {
  overline: string;
  value: string;
  lead: ReactNode;
  onOpen: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={`${overline}: ${value}. Change`}
      className={`flex min-h-[64px] w-full items-center gap-3.5 rounded-[var(--ds-radius-control)] border-2 px-3.5 py-2 text-left ${FACE_IDLE} ${PRESS}`}
    >
      {lead}
      <span className="min-w-0 flex-1">
        <span className="block ds-type-overline text-ds-action-text">{overline}</span>
        <span className="block truncate ds-type-headline text-ds-brand">{value}</span>
      </span>
      <DsIcon name="chevron" className="size-5 shrink-0 text-ds-ink-soft" />
    </button>
  );
}

export type PickerItem = { id: string; label: string; lead?: ReactNode };

export function PickerSheet({
  title,
  items,
  selected,
  onPick,
  onClose,
  searchLabel,
}: {
  title: string;
  items: PickerItem[];
  selected: string | undefined;
  onPick: (id: string) => void;
  onClose: () => void;
  searchLabel: string;
}) {
  const titleId = useId();
  const [q, setQ] = useState("");
  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return needle ? items.filter((i) => i.label.toLowerCase().includes(needle)) : items;
  }, [items, q]);
  return (
    <Modal
      labelledBy={titleId}
      onEscape={onClose}
      className="ds-light relative flex max-h-[85dvh] w-full max-w-[430px] flex-col rounded-t-[var(--ds-radius-sheet)] bg-ds-surface pb-[max(1rem,env(safe-area-inset-bottom))] shadow-[var(--ds-shadow-sheet)] sm:rounded-[var(--ds-radius-sheet)]"
    >
      <div className="flex items-center gap-3 px-4 pt-4">
        <h2 id={titleId} className="flex-1 ds-type-title text-ds-brand">
          {title}
        </h2>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="grid size-11 place-items-center rounded-full bg-ds-card text-ds-brand shadow-[var(--ds-shadow-resting)]"
        >
          <DsIcon name="close" className="size-5" />
        </button>
      </div>
      <label className="mx-4 mt-3 flex items-center gap-2 rounded-[14px] border-2 border-ds-line bg-ds-card px-3 py-2 text-ds-ink-soft focus-within:border-ds-brand">
        <FirstRunIcon name="search" className="size-5" />
        <span className="sr-only">{searchLabel}</span>
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search"
          className="min-w-0 flex-1 bg-transparent ds-type-body text-ds-ink outline-none"
        />
      </label>
      <ul className="mt-2 min-h-0 flex-1 overflow-y-auto px-4 pb-2">
        {shown.map((item) => (
          <li key={item.id}>
            <button
              type="button"
              aria-pressed={item.id === selected}
              onClick={() => onPick(item.id)}
              className={`mt-1.5 flex min-h-12 w-full items-center gap-3 rounded-[14px] px-3 text-left ds-type-headline ${item.id === selected ? "bg-ds-choice-tint text-ds-brand" : "text-ds-ink"}`}
            >
              {item.lead}
              <span className="flex-1">{item.label}</span>
              {item.id === selected && <DsIcon name="check" className="size-5 text-ds-brand" />}
            </button>
          </li>
        ))}
        {shown.length === 0 && (
          <li className="px-3 py-4 ds-type-footnote text-ds-ink-soft">No match.</li>
        )}
      </ul>
    </Modal>
  );
}

/**
 * A country as its two-letter code in a small chip, hidden from screen readers (the name is always next to it).
 * Deliberately not the flag emoji: Windows draws those as two loose letters, so every system gets the same chip,
 * which also matches the code leaderboards show.
 */
export function CountryFlag({ code }: { code: string }) {
  return (
    <span
      aria-hidden="true"
      data-country-chip=""
      className="grid h-7 w-10 shrink-0 place-items-center rounded-[6px] bg-ds-sunk ds-type-caption font-bold tracking-wider text-ds-ink-soft"
    >
      {code.toUpperCase()}
    </span>
  );
}

/** A course flag, drawn as in the mock-up (public/flags). */
export function CourseFlag({ course }: { course: "en" | "fr" | "es" }) {
  const file = course === "en" ? "gb" : course;
  return (
    <img
      src={`/flags/${file}.svg`}
      alt=""
      width={40}
      height={28}
      className="h-7 w-10 shrink-0 rounded-[6px] object-cover shadow-[0_0_0_1px_var(--c-line)]"
    />
  );
}
