import { Link } from "@tanstack/react-router";
import { useMemo, useState, type ReactNode } from "react";
import { AchievementBadge } from "@/components/AchievementBadge";
import { DsIcon } from "@/components/ds/DsIcon";
import { ProfileAvatar } from "@/components/ds/ProfileAvatar";
import { CountryFlag, CourseFlag } from "@/components/firstrun/FirstRunParts";
import { countryName } from "@/components/firstrun/FirstRunFlow";
import {
  ACHIEVEMENTS,
  LEAGUE_TIER_META,
  type Achievement,
  type LeagueTier,
} from "@/data/achievements";
import { COURSES, type Course } from "@/data/courses";
import type { DsIconName } from "@/design/icons.generated";
import {
  FRIENDS_WEEK_DAYS,
  HEAT_MAP_MONTHS,
  achievementStats,
  bigNumbers,
  friendsWeek,
  heatMap,
  hectorCard,
  joinTopics,
  leagueStatus,
  levelProgress,
  nextAchievement,
  personalRecords,
  rollingWeekXp,
  weakSpots,
  weekRings,
  type HeatCell,
  type ProfileOverview,
  type RingDay,
  type WeakItem,
} from "@/lib/profile-overview";
import {
  downloadBlob,
  drawShareCard,
  shareOrDownload,
  SHARE_CARD_SIZE,
  type ShareCardPalette,
} from "@/lib/share-card";

/*
 * Profile, visual round 6 (BACKLOG 0.0-bi; mock: Claude Design/06-profile-mockup). Every number here comes from
 * getProfileOverview through the pure rules in profile-overview.ts; none is typed in
 * (src/lib/profile-no-hardcoded-values.test.ts).
 */

const fmt = (n: number) => n.toLocaleString("en-US");
const plural = (n: number, one: string, many: string) => (n === 1 ? one : many);

const CARD = "rounded-[18px] border-2 border-ds-line bg-ds-card";

function SectionHead({ id, title, aside }: { id: string; title: string; aside?: ReactNode }) {
  return (
    <div className="mt-2 flex items-baseline justify-between gap-3">
      <h2 id={id} className="ds-type-headline font-extrabold text-ds-ink">
        {title}
      </h2>
      {aside && <span className="ds-type-caption text-ds-choice">{aside}</span>}
    </div>
  );
}

// ---------------------------------------------------------------- hero

export function ProfileHero({ o, onSettings }: { o: ProfileOverview; onSettings: () => void }) {
  const name = o.profile.displayName || "Learner";
  const since = o.profile.createdAt
    ? new Date(o.profile.createdAt).toLocaleDateString("en-US", {
        month: "long",
        year: "numeric",
        timeZone: "UTC",
      })
    : null;
  return (
    <div className="relative h-[236px] shrink-0 overflow-hidden" data-profile-hero="">
      <img
        src="/avatar/scenes/room-light.webp"
        alt=""
        className="absolute inset-0 size-full object-cover object-[center_32%]"
      />
      <div
        aria-hidden="true"
        className="absolute inset-0"
        style={{
          background:
            "linear-gradient(180deg, color-mix(in srgb, var(--c-hero-b) 30%, transparent), transparent 35%, transparent 62%, var(--c-surface))",
        }}
      />
      <img
        src="/alphonso/lesson/happy.webp"
        alt=""
        className="pointer-events-none absolute -right-5 bottom-0 z-[1] w-[200px]"
      />
      <button
        type="button"
        onClick={onSettings}
        aria-label="Settings"
        className="absolute right-3.5 top-4 z-[2] grid size-11 place-items-center rounded-full bg-ds-card/90 text-ds-brand shadow-[var(--ds-shadow-resting)]"
      >
        <DsIcon name="settings" className="size-5" />
      </button>
      <div className="absolute bottom-7 left-4 z-[2] grid max-w-[190px] gap-1.5">
        <ProfileAvatar
          seed={o.profile.avatarSeed}
          name={name}
          className="size-[58px] shadow-[0_0_0_3px_var(--c-card),var(--ds-shadow-floating)]"
          textClass="ds-type-title"
        />
        <h1 className="ds-type-display-x-l break-words text-ds-ink">{name}</h1>
        <p className="flex flex-wrap items-center gap-1.5 ds-type-caption text-ds-ink-soft">
          {o.profile.country && (
            <span data-profile-flag={o.profile.country} className="flex items-center gap-1.5">
              <span className="scale-75 origin-left -mr-2">
                <CountryFlag code={o.profile.country} />
              </span>
              {countryName(o.profile.country)}
              {since && <span aria-hidden="true">·</span>}
            </span>
          )}
          {since && <span>since {since}</span>}
        </p>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- course switcher

export function CourseSwitcher({
  o,
  busy,
  onSwitch,
}: {
  o: ProfileOverview;
  busy: boolean;
  onSwitch: (c: Course) => void;
}) {
  return (
    <div
      role="group"
      aria-label="Your courses"
      className="relative z-[3] -mt-3.5 flex gap-1.5"
      data-course-switcher=""
    >
      {COURSES.map((c) => {
        const on = c.id === o.course;
        const level = o.courses.find((x) => x.course === c.id)?.cefrLevel;
        return (
          <button
            key={c.id}
            type="button"
            aria-pressed={on}
            disabled={busy}
            onClick={() => onSwitch(c.id)}
            className={`flex min-h-11 flex-1 items-center justify-center gap-1.5 rounded-[14px] border-2 border-b-4 px-1 ds-type-caption font-extrabold text-ds-brand transition-transform duration-[var(--ds-duration-press)] active:translate-y-px disabled:opacity-70 ${
              on ? "border-ds-brand bg-ds-choice-tint" : "border-ds-line bg-ds-card"
            }`}
          >
            <span className="scale-[0.55] -mx-2">
              <CourseFlag course={c.id} />
            </span>
            {c.label}
            <em
              className={`rounded-md px-1.5 not-italic ds-type-caption ${
                on ? "bg-ds-brand text-ds-card" : "bg-ds-line text-ds-ink-soft"
              }`}
            >
              {level ?? "New"}
            </em>
          </button>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------- the four big numbers

function Stat({
  icon,
  iconClass,
  value,
  label,
  note,
  noteTone = "right",
  className = "",
  name,
}: {
  icon: DsIconName;
  iconClass: string;
  value: number;
  label: string;
  note: string;
  noteTone?: "right" | "soft";
  className?: string;
  name: string;
}) {
  const solid = icon === "flame" || icon === "bolt";
  return (
    <div
      data-big-stat={name}
      className={`relative grid overflow-hidden rounded-[18px] border-2 px-3 py-2.5 ${className}`}
    >
      {solid ? (
        <DsIcon
          name={icon as "flame"}
          solid
          className={`absolute right-2.5 top-2.5 size-[26px] ${iconClass}`}
        />
      ) : (
        <DsIcon
          name={icon as "check"}
          className={`absolute right-2.5 top-2.5 size-[26px] ${iconClass}`}
        />
      )}
      <b className="ds-type-display-x-l text-ds-ink tabular-nums" data-value="">
        {fmt(value)}
      </b>
      <span className="ds-type-caption text-ds-ink-soft">{label}</span>
      <small
        className={`ds-type-caption ${noteTone === "right" ? "text-ds-right" : "text-ds-ink-faint"}`}
      >
        {note}
      </small>
    </div>
  );
}

export function BigNumbers({ o }: { o: ProfileOverview }) {
  const n = bigNumbers(o);
  return (
    <section aria-label="Your numbers" className="grid grid-cols-2 gap-2">
      <Stat
        name="streak"
        icon="flame"
        iconClass="text-ds-flame"
        value={n.streak}
        label="day streak"
        note={
          n.longestStreak > 0 ? `Longest: ${fmt(n.longestStreak)}` : "Finish a lesson to start one"
        }
        noteTone={n.longestStreak > 0 ? "right" : "soft"}
        className="border-ds-flame-tint bg-[linear-gradient(160deg,var(--c-flame-tint),var(--c-card))]"
      />
      <Stat
        name="xp"
        icon="bolt"
        iconClass="text-ds-xp"
        value={n.totalXp}
        label="total XP"
        note={n.xpThisWeek > 0 ? `+${fmt(n.xpThisWeek)} this week` : "None yet this week"}
        noteTone={n.xpThisWeek > 0 ? "right" : "soft"}
        className="border-ds-line bg-ds-card"
      />
      <Stat
        name="words"
        icon="words"
        iconClass="text-ds-choice"
        value={n.wordsLearned}
        label={plural(n.wordsLearned, "word learned", "words learned")}
        note={n.savedWords > 0 ? `${fmt(n.savedWords)} saved to review` : "Tap a word to save it"}
        noteTone={n.savedWords > 0 ? "right" : "soft"}
        className="border-ds-line bg-ds-card"
      />
      <Stat
        name="lessons"
        icon="check"
        iconClass="text-ds-right"
        value={n.lessonsDone}
        label={plural(n.lessonsDone, "lesson done", "lessons done")}
        note={n.accuracyPct === null ? "Your first one is waiting" : `${n.accuracyPct}% accuracy`}
        noteTone={n.accuracyPct === null ? "soft" : "right"}
        className="border-ds-line bg-ds-card"
      />
    </section>
  );
}

// ---------------------------------------------------------------- this week

const WEEKDAY = (day: string, style: "narrow" | "long") =>
  new Date(`${day}T00:00:00Z`).toLocaleDateString("en-US", { weekday: style, timeZone: "UTC" });

function Ring({ d, today }: { d: RingDay; today: string }) {
  const done = d.state === "done";
  const label = `${WEEKDAY(d.day, "long")}: ${
    d.state === "future"
      ? "still to come"
      : done
        ? `${fmt(d.xp)} XP`
        : d.state === "today"
          ? "not yet today"
          : "no lesson"
  }`;
  return (
    <li
      className="grid justify-items-center gap-1 ds-type-caption text-ds-ink-soft"
      aria-label={label}
    >
      <span aria-hidden="true">{WEEKDAY(d.day, "narrow")}</span>
      <span
        aria-hidden="true"
        data-ring={d.state}
        className={`grid size-[30px] place-items-center rounded-full ${done ? "bg-ds-action" : "bg-ds-line"} ${
          d.day === today ? "shadow-[0_0_0_2px_var(--c-choice)]" : ""
        } ${d.state === "future" ? "opacity-50" : ""}`}
      >
        <span
          className={`grid size-[22px] place-items-center rounded-full ${done ? "bg-ds-action text-ds-on-action" : "bg-ds-card"}`}
        >
          {done && <DsIcon name="check" className="size-3.5" />}
        </span>
      </span>
    </li>
  );
}

function Sparkline({ days }: { days: RingDay[] }) {
  const pts = days.filter((d) => d.state !== "future");
  const max = Math.max(1, ...pts.map((d) => d.seconds));
  const x = (i: number) => 2 + (i * 116) / 6;
  const y = (s: number) => 34 - (s / max) * 28;
  const line = pts
    .map((d, i) => `${i ? "L" : "M"}${x(i).toFixed(1)} ${y(d.seconds).toFixed(1)}`)
    .join(" ");
  const last = pts.at(-1);
  return (
    <svg
      viewBox="0 0 120 38"
      preserveAspectRatio="none"
      aria-hidden="true"
      className="h-[38px] flex-1"
    >
      {pts.length > 1 && (
        <>
          <path
            d={`${line} L${x(pts.length - 1).toFixed(1)} 38 L2 38z`}
            className="fill-ds-choice opacity-10"
          />
          <path
            d={line}
            fill="none"
            className="stroke-ds-choice"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </>
      )}
      {last && (
        <circle
          cx={x(pts.length - 1)}
          cy={y(last.seconds)}
          r="3.5"
          className="fill-ds-action stroke-ds-card"
          strokeWidth="1.5"
        />
      )}
    </svg>
  );
}

export function ThisWeek({ o }: { o: ProfileOverview }) {
  const w = weekRings(o.today, o.activity, o.speech);
  return (
    <section aria-labelledby="week-heading" className="grid gap-2.5">
      <SectionHead
        id="week-heading"
        title="This week"
        aside={`${w.activeDays} of ${w.days.length} days`}
      />
      <div className={`${CARD} p-3`}>
        <ol className="grid grid-cols-7 gap-1 text-center">
          {w.days.map((d) => (
            <Ring key={d.day} d={d} today={o.today} />
          ))}
        </ol>
      </div>
      <div className={`${CARD} flex items-center gap-3 p-3`} data-minutes-spoken={w.minutesSpoken}>
        <div className="shrink-0">
          <b className="ds-type-numeral text-ds-ink">{fmt(w.minutesSpoken)}</b>
          <small className="block ds-type-caption text-ds-ink-soft">
            {plural(w.minutesSpoken, "minute", "minutes")} spoken this week
          </small>
        </div>
        {w.minutesSpoken > 0 ? (
          <Sparkline days={w.days} />
        ) : (
          <p className="flex-1 ds-type-caption text-ds-ink-faint">
            Talk in Practice or with Hector and your minutes show here.
          </p>
        )}
      </div>
    </section>
  );
}

// ---------------------------------------------------------------- heat map + records

const HEAT: Record<HeatCell["level"], string> = {
  0: "bg-ds-line",
  1: "bg-ds-xp-tint",
  2: "bg-ds-action-hi",
  3: "bg-ds-action-edge",
  4: "bg-ds-brand",
};

export function HeatMap({ o }: { o: ProfileOverview }) {
  const map = useMemo(() => heatMap(o.today, o.activity), [o.today, o.activity]);
  return (
    <section aria-labelledby="heat-heading" className="grid gap-2.5">
      <SectionHead
        id="heat-heading"
        title={`Last ${HEAT_MAP_MONTHS} months`}
        aside={`${fmt(map.activeDays)} ${plural(map.activeDays, "day", "days")} active`}
      />
      <div className={`${CARD} p-3`}>
        <div
          className="grid grid-flow-col grid-rows-7 gap-[3px]"
          style={{ gridTemplateColumns: `repeat(${map.weeks.length}, 1fr)` }}
          role="img"
          aria-label={`Practice over the last ${HEAT_MAP_MONTHS} months: ${map.activeDays} active ${plural(map.activeDays, "day", "days")}`}
          data-heat-start={map.start}
          data-heat-end={map.end}
        >
          {map.weeks.flat().map((c) => (
            <i
              key={c.day}
              title={c.inRange ? `${c.day}: ${fmt(c.xp)} XP` : undefined}
              data-day={c.inRange ? c.day : undefined}
              className={`aspect-square rounded-[3px] ${c.inRange ? HEAT[c.level] : "invisible"}`}
            />
          ))}
        </div>
        <div
          aria-hidden="true"
          className="mt-1.5 flex items-center justify-end gap-1 ds-type-caption text-ds-ink-soft"
        >
          {map.activeDays === 0 ? (
            <span className="mr-auto text-ds-ink-faint">Your first lesson lights up a square.</span>
          ) : null}
          Less
          {([0, 1, 2, 3, 4] as const).map((l) => (
            <i key={l} className={`size-2.5 rounded-[2px] ${HEAT[l]}`} />
          ))}
          More
        </div>
      </div>
    </section>
  );
}

export function Records({ o }: { o: ProfileOverview }) {
  const r = personalRecords(o);
  const items: [number, string][] = [
    [r.bestDayXp, "XP best day"],
    [r.bestStreak, plural(r.bestStreak, "day best streak", "day best streak")],
    [r.perfectLessons, plural(r.perfectLessons, "perfect lesson", "perfect lessons")],
  ];
  return (
    <section aria-labelledby="records-heading" className="grid gap-2.5">
      <SectionHead id="records-heading" title="Personal records" />
      <ul className="grid grid-cols-3 gap-1.5">
        {items.map(([n, label]) => (
          <li
            key={label}
            className="rounded-[14px] border-2 border-ds-line bg-ds-card px-1.5 py-2 text-center"
          >
            <b className="block ds-type-question-small text-ds-ink tabular-nums">{fmt(n)}</b>
            <span className="ds-type-caption text-ds-ink-soft">{label}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

// ---------------------------------------------------------------- level, weak spots, Hector

export function LevelCard({ o }: { o: ProfileOverview }) {
  const course = COURSES.find((c) => c.id === o.course)!;
  const cefr = o.courses.find((c) => c.course === o.course)?.cefrLevel ?? "A1";
  const done = o.completions.filter((c) => c.language === o.course).map((c) => c.lessonId);
  const p = levelProgress(o.course, cefr, done);
  return (
    <section aria-labelledby="level-heading" className="grid gap-2.5">
      <SectionHead id="level-heading" title={`Your ${course.label} level`} />
      <div className={`${CARD} grid gap-2 p-3`}>
        <div className="flex items-center gap-2.5">
          <span className="grid size-[46px] shrink-0 place-items-center rounded-[14px] bg-ds-brand ds-type-question-small text-ds-card shadow-[inset_0_-4px_0_color-mix(in_srgb,var(--c-ink)_25%,transparent)]">
            {p.level}
          </span>
          <div
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={p.pct}
            aria-label={`${p.level} progress`}
            className="h-3.5 flex-1 overflow-hidden rounded-full bg-ds-line"
          >
            <i
              className="block h-full rounded-full bg-ds-xp shadow-[inset_0_-4px_0_color-mix(in_srgb,var(--c-ink)_12%,transparent)]"
              style={{ width: `${p.pct}%` }}
            />
          </div>
          {p.next && (
            <span className="grid size-[46px] shrink-0 place-items-center rounded-[14px] bg-ds-line ds-type-question-small text-ds-ink-soft">
              {p.next}
            </span>
          )}
        </div>
        <p className="ds-type-caption text-ds-ink-soft">
          {p.done} of {p.total} {p.level} lessons done
          {p.next
            ? ` · ${p.unitsLeft} ${plural(p.unitsLeft, "unit", "units")} to go before ${p.next}`
            : ` · the top level in ${course.label}`}
        </p>
      </div>
    </section>
  );
}

function weakMark(label: string): string {
  return (label.split(/[-_\s]/)[0] ?? label).slice(0, 4);
}

function weakNote(w: WeakItem): string {
  if (w.lapses > 0) return `Missed ${w.lapses} ${plural(w.lapses, "time", "times")} in review`;
  if (w.repetitions > 0) return `Right ${w.repetitions} in a row so far`;
  return "Not practiced yet";
}

export function WeakSpots({ o }: { o: ProfileOverview }) {
  const w = weakSpots(o.weakItems);
  return (
    <section aria-labelledby="weak-heading" className="grid gap-2.5">
      <SectionHead
        id="weak-heading"
        title="Weak spots"
        aside={w.total > w.top.length ? <Link to="/review">All {w.total}</Link> : undefined}
      />
      {w.top.length === 0 ? (
        <p className={`${CARD} p-3 ds-type-footnote text-ds-ink-soft`}>
          No weak spots yet. When you miss something in a lesson, it shows up here to practice.
        </p>
      ) : (
        <ul className="grid gap-[7px]">
          {w.top.map((x) => (
            <li
              key={x.label}
              data-weak-spot={x.label}
              className="flex items-center gap-2.5 rounded-[16px] border-2 border-ds-line bg-ds-card px-2.5 py-2"
            >
              <span
                aria-hidden="true"
                className="grid size-[34px] shrink-0 place-items-center rounded-[10px] bg-ds-wrong-tint ds-type-caption font-extrabold text-ds-wrong-ink"
              >
                {weakMark(x.label)}
              </span>
              <div className="min-w-0">
                <b className="block ds-type-footnote font-bold text-ds-ink">{x.display}</b>
                <small className="ds-type-caption text-ds-ink-soft">{weakNote(x)}</small>
              </div>
              <Link
                to="/review"
                aria-label={`Practice ${x.display}`}
                className="ml-auto inline-flex min-h-9 items-center rounded-[10px] bg-ds-action px-2.5 ds-type-caption font-extrabold text-ds-on-action shadow-[0_3px_0_var(--c-action-edge)] active:translate-y-0.5 active:shadow-[0_1px_0_var(--c-action-edge)]"
              >
                Practice
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/**
 * "Hector noticed": Pro learners see what Hector is primed with; free learners see a teaser made only from their
 * own weak spots (hectorCard in profile-overview.ts). Its link goes to the Hector tab, the paywall's existing entry
 * point (source "hector_tab").
 */
export function HectorNoticed({ o, pro }: { o: ProfileOverview; pro: boolean }) {
  const card = hectorCard({ pro, weakItems: o.weakItems, weaknessEvents: o.weaknessEvents });
  if (!card) return null;
  return (
    <section
      aria-label={card.kind === "pro" ? "Hector noticed" : "Hector can help"}
      data-hector-card={card.kind}
      className="flex items-center gap-2.5 rounded-[18px] bg-ds-brand px-3 py-2.5 text-ds-on-hero"
    >
      <img
        src="/firstrun/hector-happy.webp"
        alt=""
        className="size-[46px] shrink-0 rounded-full bg-ds-sunk object-cover object-[center_16%] shadow-[0_0_0_2px_var(--c-action)]"
      />
      <div className="min-w-0">
        <b className="block ds-type-footnote font-extrabold">
          {card.kind === "pro" ? "Hector noticed" : "Hector can help"}
          <span className="ml-1 rounded-[5px] bg-ds-action px-1 align-[2px] ds-type-overline text-ds-on-action">
            Pro
          </span>
        </b>
        {card.kind === "pro" ? (
          <small className="block ds-type-caption text-ds-on-hero-soft">
            You're still working on {joinTopics(card.topics)}. Ask him to practice{" "}
            {plural(card.topics.length, "it", "them")} in your next call.{" "}
            <Link to="/hector" className="text-ds-on-hero-kick underline underline-offset-2">
              Talk to Hector
            </Link>
          </small>
        ) : (
          <small className="block ds-type-caption text-ds-on-hero-soft">
            Hector can help you with {joinTopics(card.topics)}.{" "}
            <Link to="/hector" className="text-ds-on-hero-kick underline underline-offset-2">
              Try Alphonso Pro
            </Link>
          </small>
        )}
      </div>
    </section>
  );
}

// ---------------------------------------------------------------- achievements, league, friends

const MEDAL_ICON: Record<string, DsIconName> = {
  bolt: "bolt",
  check: "check",
  flame: "flame",
  star: "star",
  shield: "league",
  snow: "clock",
};

function Medal({ a, locked }: { a: Achievement | null; locked?: boolean }) {
  return (
    <li className="grid flex-1 justify-items-center gap-1 text-center ds-type-caption text-ds-ink-soft">
      <span
        aria-hidden="true"
        className={`grid size-[54px] place-items-center rounded-full shadow-[inset_0_-4px_0_color-mix(in_srgb,var(--c-ink)_18%,transparent),0_0_0_3px_var(--c-card),0_0_0_5px_var(--c-line)] ${
          locked
            ? "bg-ds-line text-ds-ink-faint"
            : "bg-[radial-gradient(circle_at_35%_30%,var(--c-xp-tint),var(--c-xp)_60%,var(--c-xp-edge))] text-ds-ink"
        }`}
      >
        <DsIcon
          name={locked || !a ? "lock" : (MEDAL_ICON[a.icon] ?? "star")}
          className="size-[26px]"
        />
      </span>
      {locked ? "Next" : a?.title}
    </li>
  );
}

export function Achievements({ o }: { o: ProfileOverview }) {
  const unlocked = o.achievements.filter((a) => ACHIEVEMENTS.some((x) => x.id === a.id));
  const recent = [...unlocked]
    .sort((a, b) => (b.unlockedAt ?? "").localeCompare(a.unlockedAt ?? ""))
    .slice(0, 3)
    .map((a) => ACHIEVEMENTS.find((x) => x.id === a.id)!);
  const next = nextAchievement(
    achievementStats(o),
    unlocked.map((a) => a.id),
  );
  const pct = next ? Math.round((100 * next.value) / next.achievement.threshold) : 0;
  const [all, setAll] = useState(false);
  const have = new Set(unlocked.map((a) => a.id));
  return (
    <section aria-labelledby="ach-heading" className="grid gap-2.5">
      <SectionHead
        id="ach-heading"
        title="Achievements"
        aside={
          <button
            type="button"
            aria-expanded={all}
            aria-controls="all-badges"
            onClick={() => setAll((v) => !v)}
            className="min-h-6"
          >
            {unlocked.length} of {ACHIEVEMENTS.length}
          </button>
        }
      />
      <div className={`${CARD} p-3`}>
        {recent.length > 0 ? (
          <ul className="flex gap-2">
            {recent.map((a) => (
              <Medal key={a.id} a={a} />
            ))}
            {next && <Medal a={null} locked />}
          </ul>
        ) : (
          <p className="ds-type-footnote text-ds-ink-soft">
            Your first badge is close. Finish lessons and keep your streak to earn them.
          </p>
        )}
        {next && (
          <div
            className="mt-2 flex items-center gap-2.5 ds-type-caption text-ds-ink"
            data-next-achievement={next.achievement.id}
          >
            <span className="shrink-0 font-bold">{next.achievement.title}</span>
            <div
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={next.achievement.threshold}
              aria-valuenow={next.value}
              aria-label={`${next.achievement.title}: ${next.achievement.description}`}
              className="h-3.5 flex-1 overflow-hidden rounded-full bg-ds-line"
            >
              <i className="block h-full rounded-full bg-ds-choice" style={{ width: `${pct}%` }} />
            </div>
            <span className="shrink-0 tabular-nums">
              {fmt(next.value)}/{fmt(next.achievement.threshold)}
            </span>
          </div>
        )}
        {all && (
          <ul id="all-badges" className="mt-3 grid grid-cols-3 gap-2">
            {[...ACHIEVEMENTS]
              .sort((a, b) => Number(have.has(b.id)) - Number(have.has(a.id)))
              .map((a) => (
                <li key={a.id} data-achievement={a.id}>
                  <AchievementBadge achievement={a} unlocked={have.has(a.id)} />
                </li>
              ))}
          </ul>
        )}
      </div>
    </section>
  );
}

const LEAGUE_FILL: Record<LeagueTier, string> = {
  bronze: "fill-[var(--c-league-sprout)]",
  silver: "fill-[var(--c-league-sapling)]",
  sapphire: "fill-[var(--c-league-grove)]",
  ruby: "fill-[var(--c-league-treetop)]",
  diamond: "fill-[var(--c-league-summit)]",
};

export function LeagueCard({ o }: { o: ProfileOverview }) {
  const c = o.courses.find((x) => x.course === o.course);
  const s = leagueStatus(c?.leagueTier ?? "bronze", c?.xp ?? 0);
  const meta = LEAGUE_TIER_META[s.tier];
  return (
    <section aria-labelledby="league-heading" className="grid gap-2.5">
      <SectionHead
        id="league-heading"
        title="League"
        aside={<Link to="/league">Leaderboard</Link>}
      />
      <div className={`${CARD} flex items-center gap-3 p-3`} data-league={s.tier}>
        <svg viewBox="0 0 52 58" aria-hidden="true" className="h-[58px] w-[52px] shrink-0">
          <path
            d="M26 2l22 8v18c0 14-10 23-22 28C14 51 4 42 4 28V10z"
            className={`${LEAGUE_FILL[s.tier]} stroke-ds-ink/20`}
            strokeWidth="2"
          />
          <path
            d="M26 10l14 5v13c0 9-6 15-14 18-8-3-14-9-14-18V15z"
            className="fill-ds-card opacity-80"
          />
          <path
            d="M26 18l3 6 6 .7-4.5 4 1.2 6-5.7-3.2-5.7 3.2 1.2-6-4.5-4 6-.7z"
            className={LEAGUE_FILL[s.tier]}
          />
        </svg>
        <div className="min-w-0">
          <b className="block ds-type-headline font-extrabold text-ds-ink">{meta.label} league</b>
          <small className="block ds-type-caption text-ds-ink-soft">
            {s.next
              ? `${fmt(s.xpToNext)} XP to ${LEAGUE_TIER_META[s.next].label}`
              : "The top league. Well done."}
          </small>
        </div>
        <div className="ml-auto text-right">
          <b className="block ds-type-question-small text-ds-ink tabular-nums">{fmt(c?.xp ?? 0)}</b>
          <small className="ds-type-caption text-ds-ink-soft">XP</small>
        </div>
      </div>
    </section>
  );
}

export function FriendsWeek({ o }: { o: ProfileOverview }) {
  const rows = friendsWeek(o.friends, {
    displayName: o.profile.displayName || "You",
    avatarSeed: o.profile.avatarSeed ?? "",
    weekXp: rollingWeekXp(o.today, o.activity),
  });
  return (
    <section aria-labelledby="friends-heading" className="grid gap-2.5">
      <SectionHead
        id="friends-heading"
        title="Friends this week"
        aside={<Link to="/profile/friends">{o.friends.length ? "See all" : "Invite"}</Link>}
      />
      <div className={`${CARD} grid gap-[7px] p-3`}>
        {o.friends.length === 0 ? (
          <div className="flex items-center gap-3">
            <DsIcon name="friends" className="size-8 shrink-0 text-ds-choice" />
            <p className="ds-type-footnote text-ds-ink-soft">
              Learning sticks better with a friend.{" "}
              <Link
                to="/profile/friends"
                className="font-bold text-ds-choice underline underline-offset-2"
              >
                Invite one
              </Link>
            </p>
          </div>
        ) : (
          <ol className="grid gap-[7px]">
            {rows.map((r) => (
              <li
                key={r.key}
                data-friend-row={r.isYou ? "you" : r.key}
                className={`flex items-center gap-2.5 ds-type-footnote font-bold text-ds-ink ${
                  r.isYou ? "-mx-1.5 rounded-[10px] bg-ds-choice-tint px-1.5 py-1" : ""
                }`}
              >
                <ProfileAvatar seed={r.avatarSeed} name={r.displayName} className="size-8" />
                {r.isYou ? "You" : r.displayName}
                <span className="ml-auto ds-type-footnote font-extrabold tabular-nums">
                  {fmt(r.weekXp)}
                  <small className="ml-0.5 ds-type-caption text-ds-ink-soft">XP</small>
                </span>
              </li>
            ))}
          </ol>
        )}
        <p className="ds-type-caption text-ds-ink-faint">
          XP over the last {FRIENDS_WEEK_DAYS} days
        </p>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------- share

function readPalette(): ShareCardPalette {
  const css = getComputedStyle(document.documentElement);
  const v = (name: string) => css.getPropertyValue(name).trim();
  return {
    heroA: v("--c-hero-a"),
    heroB: v("--c-hero-b"),
    onHero: v("--c-on-hero"),
    onHeroSoft: v("--c-on-hero-soft"),
    kick: v("--c-on-hero-kick"),
    action: v("--c-action"),
    displayFont: v("--ds-font-display"),
    bodyFont: v("--ds-font-body"),
  };
}

function loadImage(src: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

/** Draws the learner's week on a canvas in the browser and returns it as a PNG. Nothing is uploaded. */
async function renderShareCard(o: ProfileOverview): Promise<Blob | null> {
  const n = bigNumbers(o);
  const w = weekRings(o.today, o.activity, o.speech);
  const course = COURSES.find((c) => c.id === o.course)!;
  const canvas = document.createElement("canvas");
  canvas.width = SHARE_CARD_SIZE.width;
  canvas.height = SHARE_CARD_SIZE.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  await document.fonts?.ready;
  const mascot = await loadImage("/alphonso/lesson/happy.webp");
  drawShareCard(
    ctx,
    {
      name: o.profile.displayName || "My",
      courseLabel: course.label,
      level: o.courses.find((c) => c.course === o.course)?.cefrLevel ?? "A1",
      streak: n.streak,
      minutesSpoken: w.minutesSpoken,
      xpThisWeek: n.xpThisWeek,
      weekDone: w.days.map((d) => d.state === "done"),
    },
    readPalette(),
    mascot,
  );
  return new Promise((resolve) => canvas.toBlob((b) => resolve(b), "image/png"));
}

export function ShareWeek({ o }: { o: ProfileOverview }) {
  const n = bigNumbers(o);
  const w = weekRings(o.today, o.activity, o.speech);
  const [state, setState] = useState<"idle" | "busy" | "done" | "failed">("idle");
  async function share() {
    setState("busy");
    try {
      const blob = await renderShareCard(o);
      if (!blob) throw new Error("no canvas");
      const out = await shareOrDownload(blob, "my-alphonso-week.png", navigator, downloadBlob);
      setState(out === "cancelled" ? "idle" : "done");
    } catch {
      setState("failed");
    }
  }
  return (
    <section
      aria-labelledby="share-heading"
      className="flex items-center gap-2.5 rounded-[18px] bg-[linear-gradient(135deg,var(--c-brand),var(--c-choice))] p-3 text-ds-on-hero"
    >
      <div className="min-w-0">
        <b id="share-heading" className="block ds-type-footnote font-extrabold">
          Share your week
        </b>
        <small className="ds-type-caption text-ds-on-hero-soft" aria-live="polite">
          {state === "failed"
            ? "Couldn't make the picture. Try again."
            : `${fmt(n.streak)}-day streak · ${fmt(w.minutesSpoken)} min spoken`}
        </small>
      </div>
      <button
        type="button"
        onClick={() => void share()}
        disabled={state === "busy"}
        className="ml-auto inline-flex min-h-11 shrink-0 items-center rounded-[12px] bg-ds-action px-3 ds-type-footnote font-extrabold text-ds-on-action shadow-[0_3px_0_var(--c-action-edge)] active:translate-y-0.5 disabled:opacity-70"
      >
        {state === "busy" ? "Making…" : "Share"}
      </button>
    </section>
  );
}

/** While the overview loads: the page's shape, so nothing jumps. */
export function ProfileSkeleton() {
  return (
    <div aria-busy="true" aria-label="Loading your profile" className="grid gap-3 px-3.5">
      <div className="-mx-3.5 h-[236px] animate-pulse bg-ds-sunk motion-reduce:animate-none" />
      <div className="grid grid-cols-2 gap-2">
        {COURSES.concat(COURSES[0]!).map((c, i) => (
          <div
            key={`${c.id}${i}`}
            className="h-[88px] animate-pulse rounded-[18px] bg-ds-sunk motion-reduce:animate-none"
          />
        ))}
      </div>
      <div className="h-24 animate-pulse rounded-[18px] bg-ds-sunk motion-reduce:animate-none" />
    </div>
  );
}
