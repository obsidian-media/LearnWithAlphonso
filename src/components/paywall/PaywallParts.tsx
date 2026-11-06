import type { ReactNode } from "react";
import { DsIcon } from "../ds/DsIcon";
import { EXAMPLE_CALLS, PRO_PAYWALL_COPY, savingBadge } from "@/lib/paywall-copy";
import { perMonthLine, type PaywallPlan } from "@/lib/paywall-plans";
import type { Course } from "@/data/courses";

/**
 * The round-6 Alphonso Pro paywall's parts (BACKLOG 0.0-bk, the approved "Mix: A's story, B's card" mock): Hector in
 * his room with the small gold Pro card pinned in the corner, the labelled example call, three facts, then the card
 * leading the plans. Tokens only (--c-* / ds-type-*), so Meadow is a palette switch.
 */

export const HECTOR_TALK_SRC = "/paywall/hector-talk.webp";
export const HECTOR_HAPPY_SRC = "/paywall/hector-happy.webp";
export const PAYWALL_ROOM_SRC = "/avatar/scenes/library.webp";
export const WELCOME_ROOM_SRC = "/avatar/scenes/office.webp";

/** The navy card face: the hero gradient with a gold double rule inside the edge. */
const CARD_FACE =
  "bg-[radial-gradient(130%_90%_at_80%_0%,var(--c-hero-a)_0%,var(--c-brand)_45%,var(--c-hero-b)_100%)]";
const CARD_RULE =
  "shadow-[0_12px_22px_color-mix(in_srgb,var(--c-hero-b)_35%,transparent),inset_0_0_0_1.5px_color-mix(in_srgb,var(--c-on-hero-kick)_85%,transparent),inset_0_0_0_5px_var(--c-hero-b),inset_0_0_0_6.5px_color-mix(in_srgb,var(--c-on-hero-kick)_40%,transparent)]";
const CARD_SHEEN =
  "pointer-events-none absolute inset-0 bg-[linear-gradient(115deg,transparent_35%,color-mix(in_srgb,var(--c-on-hero)_18%,transparent)_48%,transparent_60%)]";
const CHIP =
  "bg-[linear-gradient(135deg,var(--c-on-hero-kick),var(--c-action-edge))] shadow-[inset_0_0_0_1px_color-mix(in_srgb,var(--c-hero-b)_25%,transparent)]";

/** A white tile with the warm edge, as the mock's chat, facts and "when" boxes. */
const TILE = "border-2 border-ds-line bg-ds-card";

// ---------------------------------------------------------------- the top

/**
 * Hector in his library, fading into the screen colour. The small Pro card is drawn at 1.5 times its size with type
 * tokens, then scaled down, so its tiny type stays on the type scale.
 */
export function PaywallRoomTop({ name, close }: { name: string | null; close?: ReactNode }) {
  return (
    // The mock's phone is 300 wide with a 300-high room and Hector 230 wide: kept in proportion on any phone.
    <div
      className="relative aspect-square max-h-[430px] w-full overflow-hidden"
      data-paywall-room=""
    >
      <img
        src={PAYWALL_ROOM_SRC}
        alt=""
        className="absolute inset-0 size-full object-cover object-[center_32%]"
      />
      <div
        aria-hidden="true"
        className="absolute inset-0 bg-[linear-gradient(180deg,color-mix(in_srgb,var(--c-hero-b)_18%,transparent),transparent_30%,transparent_62%,var(--c-surface)_97%)]"
      />
      <img
        src={HECTOR_TALK_SRC}
        alt={PRO_PAYWALL_COPY.roomAlt}
        className="absolute bottom-0 left-1/2 z-[1] w-[77%] -translate-x-1/2"
      />
      {/* Hector's waist melts into the screen, so the headline over it reads. */}
      <div
        aria-hidden="true"
        className="absolute inset-0 z-[2] bg-[linear-gradient(180deg,transparent_74%,color-mix(in_srgb,var(--c-surface)_85%,transparent)_92%,var(--c-surface)_100%)]"
      />
      <div className="absolute left-3.5 top-11 z-[3] h-[74px] w-[118px]" data-pro-tag="">
        <div className="origin-top-left -rotate-6 scale-[0.67]">
          <ProCardFace name={name} width="w-[176px]" height="h-[110px]" hectorWidth="w-[104px]" />
        </div>
      </div>
      {close}
    </div>
  );
}

function ProCardFace({
  name,
  width,
  height,
  hectorWidth,
}: {
  name: string | null;
  width: string;
  height: string;
  hectorWidth: string;
}) {
  return (
    <div
      className={`relative ${width} ${height} overflow-hidden rounded-[18px] ${CARD_FACE} ${CARD_RULE}`}
    >
      <span className="ds-type-overline absolute left-3.5 top-3 z-[2] tracking-[0.18em] text-ds-on-hero-kick">
        {PRO_PAYWALL_COPY.kicker}
      </span>
      <span aria-hidden="true" className={`absolute right-3 top-3 z-[2] h-5 w-7 rounded ${CHIP}`} />
      <img
        src={HECTOR_HAPPY_SRC}
        alt=""
        className={`absolute -bottom-5 -right-3 z-[1] ${hectorWidth}`}
      />
      {name && (
        <b className="ds-type-title absolute bottom-3 left-3.5 z-[2] font-extrabold text-ds-on-hero">
          {name}
        </b>
      )}
      <span aria-hidden="true" className={CARD_SHEEN} />
    </div>
  );
}

/** The card leading the plans: wide, tilted a little, the learner's name on it. */
export function ProCardBanner({ name }: { name: string | null }) {
  return (
    <div
      className={`relative mx-2.5 mb-1.5 mt-1 h-[92px] -rotate-2 overflow-hidden rounded-[var(--ds-radius-control)] ${CARD_FACE} shadow-[0_12px_24px_color-mix(in_srgb,var(--c-hero-b)_25%,transparent),inset_0_0_0_1.5px_color-mix(in_srgb,var(--c-on-hero-kick)_80%,transparent)]`}
      data-pro-card=""
    >
      <span className="ds-type-overline absolute left-3.5 top-3 tracking-[0.18em] text-ds-on-hero-kick">
        {PRO_PAYWALL_COPY.kicker}
      </span>
      <img src={HECTOR_HAPPY_SRC} alt="" className="absolute -bottom-[18px] -right-1.5 w-[120px]" />
      {name && (
        <b className="ds-type-title absolute bottom-2.5 left-3.5 font-extrabold text-ds-on-hero">
          {name}
        </b>
      )}
      <span aria-hidden="true" className={CARD_SHEEN} />
    </div>
  );
}

export function PaywallHeadline() {
  return (
    <h1 className="ds-type-question m-0 text-ds-ink">
      {PRO_PAYWALL_COPY.headlineLead}
      <span className="bg-[linear-gradient(transparent_62%,color-mix(in_srgb,var(--c-action)_42%,var(--c-card))_62%)]">
        {PRO_PAYWALL_COPY.headlineMark}
      </span>
      {PRO_PAYWALL_COPY.headlineEnd}
    </h1>
  );
}

function HectorDot() {
  return (
    <span
      aria-hidden="true"
      className="size-[22px] shrink-0 rounded-full bg-ds-sunk bg-[length:175%] bg-[position:center_16%] bg-no-repeat"
      style={{ backgroundImage: `url(${HECTOR_HAPPY_SRC})` }}
    />
  );
}

/** One real-looking moment: Hector remembering last week's mistake. Labelled as an example, honestly. */
export function ExampleCall({ course }: { course: Course }) {
  const call = EXAMPLE_CALLS[course];
  const bubble = "ds-type-caption max-w-[86%] rounded-[14px] px-2.5 py-[7px]";
  return (
    <figure
      aria-label={PRO_PAYWALL_COPY.exampleLabel}
      className={`relative m-0 grid gap-[7px] rounded-[20px] p-2.5 ${TILE}`}
    >
      <figcaption className="ds-type-overline absolute -top-2 left-3 bg-ds-surface px-1.5 tracking-[0.08em] text-ds-ink-soft">
        {PRO_PAYWALL_COPY.exampleLabel}
      </figcaption>
      <p className={`${bubble} m-0 flex gap-[7px] rounded-bl-[4px] bg-ds-choice-tint text-ds-ink`}>
        <HectorDot />
        <span>
          {call.before}
          <mark className="rounded-[3px] bg-ds-action-tint px-0.5 text-inherit">
            {call.recalled}
          </mark>
          {call.after}
        </span>
      </p>
      <p
        className={`${bubble} m-0 justify-self-end rounded-br-[4px] bg-ds-brand text-ds-on-hero`}
        lang={course}
      >
        {call.reply}
      </p>
      <p className={`${bubble} m-0 flex gap-[7px] rounded-bl-[4px] bg-ds-choice-tint text-ds-ink`}>
        <HectorDot />
        <span>{call.praise}</span>
      </p>
    </figure>
  );
}

/** Line icons for the three facts (talk, memory, every day), drawn like the design system's icons. */
const FACT_ICONS: readonly ReactNode[] = [
  <path key="c" d="M4 5h16v11H9l-5 4V5z" />,
  <g key="b">
    <path d="M12 5a3 3 0 0 0-5.6 1.5A3 3 0 0 0 4.5 11a3 3 0 0 0 1.8 5A3 3 0 0 0 12 18z" />
    <path d="M12 5a3 3 0 0 1 5.6 1.5 3 3 0 0 1 1.9 4.5 3 3 0 0 1-1.8 5A3 3 0 0 1 12 18" />
  </g>,
  <g key="s">
    <circle cx="12" cy="12" r="4" />
    <path d="M12 2.5v2.5M12 19v2.5M2.5 12H5M19 12h2.5M5.2 5.2l1.8 1.8M17 17l1.8 1.8M5.2 18.8 7 17M17 7l1.8-1.8" />
  </g>,
];

export function PaywallFacts() {
  return (
    <ul
      aria-label={PRO_PAYWALL_COPY.factsLabel}
      className="m-0 grid list-none grid-cols-3 gap-1.5 p-0"
    >
      {PRO_PAYWALL_COPY.facts.map((f, i) => (
        <li
          key={f.title}
          className={`ds-type-caption grid justify-items-center gap-1 rounded-[14px] px-1.5 py-2 text-center text-ds-ink-soft ${TILE}`}
        >
          <svg
            viewBox="0 0 24 24"
            width="20"
            height="20"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
            className="size-5 text-ds-choice"
          >
            {FACT_ICONS[i]}
          </svg>
          <b className="font-extrabold text-ds-ink">{f.title}</b>
          {f.detail}
        </li>
      ))}
    </ul>
  );
}

// ---------------------------------------------------------------- the plans

export function FreeRow() {
  return (
    <div className="grid gap-1.5">
      <ul
        aria-label={PRO_PAYWALL_COPY.freeLabel}
        className="m-0 flex list-none flex-wrap justify-center gap-[5px] p-0"
      >
        {PRO_PAYWALL_COPY.freeItems.map((item) => (
          <li
            key={item}
            className="ds-type-caption inline-flex items-center gap-1 rounded-full bg-ds-right-tint px-2.5 py-[3px] text-ds-right-ink"
          >
            <DsIcon name="check" className="size-3" />
            {item}
          </li>
        ))}
      </ul>
      <p className="ds-type-caption m-0 text-center text-ds-ink-soft">
        {PRO_PAYWALL_COPY.freeNote}
      </p>
    </div>
  );
}

const PLAN_LABEL = { year: "Yearly", month: "Monthly" } as const;

/** Yearly and monthly side by side; a radio group, yearly selected first. */
export function PlanPicker({
  plans,
  selected,
  onSelect,
  saving,
}: {
  plans: readonly PaywallPlan[];
  selected: number;
  onSelect: (index: number) => void;
  saving: number | null;
}) {
  return (
    <div
      role="radiogroup"
      aria-label={PRO_PAYWALL_COPY.plansLabel}
      className={`grid gap-2 ${plans.length > 1 ? "grid-cols-2" : "grid-cols-1"}`}
    >
      {plans.map((plan, i) => {
        const on = i === selected;
        const badge = plan.period === "year" && saving !== null ? savingBadge(saving) : null;
        return (
          <button
            key={plan.period}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => onSelect(i)}
            onKeyDown={(e) => {
              const step =
                e.key === "ArrowRight" || e.key === "ArrowDown"
                  ? 1
                  : e.key === "ArrowLeft" || e.key === "ArrowUp"
                    ? -1
                    : 0;
              if (!step) return;
              e.preventDefault();
              const next = (i + step + plans.length) % plans.length;
              onSelect(next);
              (e.currentTarget.parentElement?.children[next] as HTMLElement | undefined)?.focus();
            }}
            tabIndex={on ? 0 : -1}
            className={`relative grid min-h-[84px] gap-px rounded-[18px] border-2 border-b-4 px-2.5 pb-2.5 pt-3.5 text-center transition-[background-color,border-color,box-shadow] duration-[var(--ds-duration-select)] ease-[var(--ds-ease-out)] motion-reduce:transition-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ds-choice ${
              on
                ? "border-ds-brand bg-ds-choice-tint shadow-[0_8px_18px_color-mix(in_srgb,var(--c-brand)_14%,transparent)]"
                : "border-ds-line bg-ds-card"
            }`}
          >
            {badge && (
              <span className="ds-type-caption absolute -top-2.5 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-[7px] bg-ds-action px-2 py-px font-extrabold text-ds-on-action">
                {badge}
              </span>
            )}
            {on && (
              <span
                aria-hidden="true"
                className="absolute right-2 top-2 grid size-[18px] place-items-center rounded-full bg-ds-brand text-ds-on-hero"
              >
                <DsIcon name="check" className="size-[11px]" />
              </span>
            )}
            <small className="ds-type-caption text-ds-ink-soft">{PLAN_LABEL[plan.period]}</small>
            {plan.price !== null && (
              <b className="ds-type-title font-extrabold tabular-nums text-ds-ink">{plan.price}</b>
            )}
            <em className="ds-type-caption not-italic text-ds-ink-soft">{perMonthLine(plan)}</em>
          </button>
        );
      })}
    </div>
  );
}

/** The dashed "when do I pay" row with a calendar. */
export function WhenRow({ lead, rest }: { lead: string; rest: string }) {
  return (
    <div
      className="ds-type-caption flex items-center gap-2 rounded-[14px] border-2 border-dashed border-ds-line bg-ds-card px-2.5 py-2 text-ds-ink-soft"
      data-when=""
    >
      <svg
        viewBox="0 0 24 24"
        width="18"
        height="18"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinejoin="round"
        aria-hidden="true"
        className="size-[18px] shrink-0 text-ds-action-text"
      >
        <rect x="3.5" y="5" width="17" height="15" rx="2.5" />
        <path d="M3.5 10h17M8 3v4M16 3v4" />
      </svg>
      <p className="m-0">
        <b className="text-ds-ink">{lead}</b> <span>{rest}</span>
      </p>
    </div>
  );
}

/** The round close button over the room. */
export function CloseButton({ onClose }: { onClose: () => void }) {
  return (
    <button
      type="button"
      onClick={onClose}
      aria-label={PRO_PAYWALL_COPY.close}
      data-paywall-close=""
      className="absolute right-3.5 top-3.5 z-[8] grid size-11 place-items-center rounded-full bg-ds-card/90 text-ds-brand shadow-[var(--ds-shadow-resting)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ds-choice"
    >
      <DsIcon name="close" className="size-4" />
    </button>
  );
}
