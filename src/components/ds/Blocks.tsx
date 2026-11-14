import { Link } from "@tanstack/react-router";
import type { ComponentProps, ReactNode } from "react";
import { medalFor } from "@/lib/social-presentation";

/**
 * The round-6 building blocks the redesigned social, settings and review screens share (mocks r10 and r12): a scene
 * under a glass title card, overlines over cards, chunky gold and edge buttons, chips, a switch, a segmented control,
 * pills, a progress bar and the navy hero. They read the design tokens only, so Royal and Meadow both work.
 */

const GLASS =
  "rounded-[22px] border border-ds-card/60 bg-ds-card/80 backdrop-blur-xl shadow-[var(--ds-shadow-floating)]";

/** The back control: a glass pill, with an optional trailing group (links to sibling screens) on the right. */
export function BackPill({
  to,
  label,
  children,
  trailing,
}: {
  to: string;
  label: string;
  children: ReactNode;
  trailing?: ReactNode;
}) {
  return (
    <div className="flex min-h-11 items-center justify-between gap-2">
      <Link
        to={to}
        aria-label={label}
        className={`${GLASS} inline-flex h-11 items-center gap-1 rounded-full pl-2.5 pr-3.5 ds-type-footnote font-extrabold text-ds-choice`}
      >
        <span aria-hidden="true">‹</span>
        {children}
      </Link>
      {trailing}
    </div>
  );
}

/** The title card: the screen's name and one quiet line, on glass over the scene. */
export function GlassTitle({
  title,
  sub,
  className = "",
}: {
  title: string;
  sub?: string | null;
  className?: string;
}) {
  return (
    <header className={`${GLASS} grid gap-0.5 px-4 py-3.5 ${className}`}>
      <h1 className="ds-type-display text-ds-ink">{title}</h1>
      {sub ? <p className="ds-type-footnote text-ds-ink-soft">{sub}</p> : null}
    </header>
  );
}

export function Glass({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`${GLASS} ${className}`}>{children}</div>;
}

/** The small gold section title over a card. */
export function Overline({ children, id }: { children: ReactNode; id?: string }) {
  return (
    <h2
      id={id}
      className="ds-type-overline mx-1 -mb-1 mt-1.5 w-fit rounded-full bg-ds-card/90 px-2.5 py-0.5 text-ds-xp-text backdrop-blur-sm"
    >
      {children}
    </h2>
  );
}

export function DsCard({
  children,
  className = "",
  flush = false,
  tone = "card",
  ...rest
}: {
  children: ReactNode;
  className?: string;
  /** Rows that bring their own padding (a list card). */
  flush?: boolean;
  tone?: "card" | "tint" | "right" | "wrong";
} & Omit<ComponentProps<"div">, "className" | "children">) {
  const fill =
    tone === "tint"
      ? "border-ds-line bg-ds-choice-tint"
      : tone === "right"
        ? "border-ds-right bg-ds-right-tint"
        : tone === "wrong"
          ? "border-ds-wrong bg-ds-wrong-tint"
          : "border-ds-line bg-ds-card";
  return (
    <div
      {...rest}
      className={`grid gap-3 rounded-[22px] border-2 ${fill} ${flush ? "px-3.5 py-1" : "p-3.5"} ${className}`}
    >
      {children}
    </div>
  );
}

/** A row inside a list card: a hairline above every row but the first. */
export function DsRow({
  children,
  className = "",
  first = false,
}: {
  children: ReactNode;
  className?: string;
  first?: boolean;
}) {
  return (
    <div
      className={`flex items-center gap-2.5 py-2.5 ${first ? "" : "border-t border-ds-line"} ${className}`}
    >
      {children}
    </div>
  );
}

import { dsButtonClass, type DsButtonVariant } from "./buttons";

export { dsButtonClass, type DsButtonVariant };

export function DsButton({
  variant = "primary",
  small = false,
  full = false,
  className = "",
  type = "button",
  ...rest
}: { variant?: DsButtonVariant; small?: boolean; full?: boolean } & ComponentProps<"button">) {
  return (
    <button
      type={type}
      {...rest}
      className={`${dsButtonClass(variant, { small, full })} ${className}`}
    />
  );
}

/** A link that looks like a DsButton. */
export function DsLinkButton({
  variant = "secondary",
  small = true,
  full = false,
  className = "",
  ...rest
}: {
  variant?: DsButtonVariant;
  small?: boolean;
  full?: boolean;
} & ComponentProps<typeof Link>) {
  return <Link {...rest} className={`${dsButtonClass(variant, { small, full })} ${className}`} />;
}

/** A chip you choose: on is the choice blue. Radio semantics when `radio` is set, toggle otherwise. */
export function DsChip({
  on,
  children,
  className = "",
  radio = false,
  ...rest
}: { on: boolean; radio?: boolean } & ComponentProps<"button">) {
  return (
    <button
      type="button"
      {...(radio ? { role: "radio", "aria-checked": on } : { "aria-pressed": on })}
      {...rest}
      className={`inline-flex min-h-11 items-center gap-1.5 whitespace-nowrap rounded-[14px] border-2 border-b-4 px-3 py-1.5 ds-type-footnote font-extrabold transition-transform duration-[var(--ds-duration-press)] active:translate-y-px disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ds-choice ${
        on
          ? "border-ds-choice bg-ds-choice-tint text-ds-choice"
          : "border-ds-line bg-ds-card text-ds-brand"
      } ${className}`}
    >
      {children}
    </button>
  );
}

export function DsSwitch({
  on,
  onChange,
  label,
  disabled,
}: {
  on: boolean;
  onChange: (next: boolean) => void;
  label: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!on)}
      className={`relative h-[30px] w-[50px] shrink-0 rounded-full border-2 before:absolute before:-inset-x-1 before:-inset-y-3 before:content-[''] transition-colors duration-[var(--ds-duration-select)] disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ds-choice ${
        on ? "border-ds-choice bg-ds-choice" : "border-ds-line bg-ds-sunk"
      }`}
    >
      <span
        aria-hidden="true"
        className={`absolute top-0.5 size-[22px] rounded-full bg-ds-card shadow-[var(--ds-shadow-resting)] transition-[left] duration-[var(--ds-duration-select)] motion-reduce:transition-none ${
          on ? "left-[22px]" : "left-0.5"
        }`}
      />
    </button>
  );
}

/** The segmented control of the mocks: a sunk track, the chosen segment raised. */
export function DsSegmented<T extends string>({
  options,
  value,
  onChange,
  ariaLabel,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
  ariaLabel: string;
}) {
  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      className="grid auto-cols-fr grid-flow-col gap-0.5 rounded-[16px] bg-ds-sunk p-1"
    >
      {options.map((o) => {
        const on = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => onChange(o.value)}
            className={`min-h-11 rounded-[12px] px-1 ds-type-footnote font-extrabold focus-visible:outline-2 focus-visible:outline-ds-choice ${
              on ? "bg-ds-card text-ds-brand shadow-[var(--ds-shadow-resting)]" : "text-ds-ink-soft"
            }`}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

export type PillTone = "choice" | "right" | "wrong" | "neutral" | "xp";

export function DsPill({ tone = "choice", children }: { tone?: PillTone; children: ReactNode }) {
  const look =
    tone === "right"
      ? "bg-ds-right-tint text-ds-right-ink"
      : tone === "wrong"
        ? "bg-ds-wrong-tint text-ds-wrong-ink"
        : tone === "neutral"
          ? "bg-ds-sunk text-ds-ink-soft"
          : tone === "xp"
            ? "bg-ds-xp-tint text-ds-xp-text"
            : "bg-ds-choice-tint text-ds-choice";
  return (
    <span
      className={`ds-type-caption inline-flex items-center whitespace-nowrap rounded-lg px-2 py-0.5 ${look}`}
    >
      {children}
    </span>
  );
}

export function DsBar({
  value,
  label,
  tone = "xp",
  tall = false,
  onHero = false,
}: {
  /** 0 to 1. */
  value: number;
  label: string;
  tone?: "xp" | "choice";
  tall?: boolean;
  onHero?: boolean;
}) {
  const pct = Math.round(Math.max(0, Math.min(1, value)) * 100);
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={pct}
      className={`overflow-hidden rounded-full ${onHero ? "bg-ds-on-hero/25" : "bg-ds-sunk"} ${tall ? "h-2.5" : "h-2"}`}
    >
      <div
        className={`h-full rounded-full ${tone === "choice" ? "bg-ds-choice" : "bg-ds-xp"}`}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

/** The navy card with a gradient: the learner's own standing. */
export function DsHero({
  children,
  className = "",
  ...rest
}: { children: ReactNode; className?: string } & Omit<
  ComponentProps<"section">,
  "className" | "children"
>) {
  return (
    <section
      {...rest}
      className={`grid gap-2 rounded-[22px] bg-gradient-to-br from-ds-hero-a to-ds-hero-b p-4 text-ds-on-hero shadow-[var(--ds-shadow-floating)] ${className}`}
    >
      {children}
    </section>
  );
}

export function HeroKicker({ children }: { children: ReactNode }) {
  return <p className="ds-type-overline text-ds-on-hero-kick">{children}</p>;
}

/** A 3D icon from public/icons3d at a set size (decorative). */
export function Icon({ name, size = 38 }: { name: string; size?: number }) {
  return (
    <img
      src={`/icons3d/${name}.png`}
      alt=""
      width={size}
      height={size}
      loading="lazy"
      decoding="async"
      draggable={false}
      className="shrink-0"
    />
  );
}

/** The state card: a pose of Alphonso, a line, a quiet line, and an optional action. */
export function PoseCard({
  src,
  title,
  body,
  children,
}: {
  src: string;
  title: string;
  body?: string;
  children?: ReactNode;
}) {
  return (
    <DsCard className="justify-items-center text-center">
      <img
        src={src}
        alt=""
        height={96}
        loading="lazy"
        decoding="async"
        draggable={false}
        className="h-24 w-auto"
      />
      <p className="ds-type-headline text-ds-ink">{title}</p>
      {body ? <p className="ds-type-footnote text-ds-ink-soft">{body}</p> : null}
      {children}
    </DsCard>
  );
}

/** A text field: sunk until it holds something, then a card with a blue edge on focus. */
export function DsField({ className = "", ...rest }: ComponentProps<"input">) {
  return (
    <input
      {...rest}
      className={`min-h-12 w-full rounded-[14px] border-2 border-ds-line bg-ds-sunk px-3.5 py-2.5 ds-type-body text-ds-ink outline-none placeholder:text-ds-ink-faint focus:border-ds-choice focus:bg-ds-card ${className}`}
    />
  );
}

/** A rank in a board: a numbered circle, with medal colours from the tokens for the top three. */
export function RankBadge({ rank }: { rank: number }) {
  const medal = medalFor(rank);
  const look =
    medal === "gold"
      ? "bg-ds-xp text-ds-on-action"
      : medal === "silver"
        ? "bg-ds-line text-ds-ink"
        : medal === "bronze"
          ? "bg-ds-flame text-ds-on-wrong"
          : "bg-ds-sunk text-ds-ink-soft";
  return (
    <span
      aria-label={`Rank ${rank}`}
      className={`tnum ds-type-caption grid size-[30px] shrink-0 place-items-center rounded-full ${look}`}
    >
      {rank}
    </span>
  );
}

/** One setting that is on or off: a title, what it does, and the switch. */
export function SettingSwitchCard({
  id,
  title,
  body,
  on,
  onChange,
  disabled,
  icon,
  children,
}: {
  id: string;
  title: string;
  body?: ReactNode;
  on: boolean;
  onChange: (next: boolean) => void;
  disabled?: boolean;
  icon?: string;
  children?: ReactNode;
}) {
  return (
    <section aria-labelledby={id}>
      <DsCard>
        <div className="flex items-center gap-2.5">
          {icon ? <Icon name={icon} /> : null}
          <h2 id={id} className="ds-type-headline min-w-0 flex-1 text-ds-ink">
            {title}
          </h2>
          <span className="ds-type-caption text-ds-ink-soft" aria-hidden="true">
            {on ? "On" : "Off"}
          </span>
          <DsSwitch on={on} onChange={onChange} label={title} disabled={disabled} />
        </div>
        {body ? <p className="ds-type-footnote text-ds-ink-soft">{body}</p> : null}
        {children}
      </DsCard>
    </section>
  );
}
