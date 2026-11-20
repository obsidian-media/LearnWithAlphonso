import { STREAK_PROTECTED_CAPTION } from "@/lib/streak-display";
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { fetchTutorMemory } from "@/lib/call-recap-api";
import { goalLines, memorySummary } from "@/lib/tutor-memory-view";
import { createContext, useContext, useId, useMemo, useState, type ReactNode } from "react";
import { AchievementBadge, Medallion } from "@/components/AchievementBadge";
import { AchievementDetail } from "@/components/AchievementDetail";
import { badgeStates } from "@/lib/badge-state";
import { DsIcon } from "@/components/ds/DsIcon";
import { drawnFlagCode } from "@/lib/drawn-flags";
import { ProfileAvatar } from "@/components/ds/ProfileAvatar";
import { CourseFlag } from "@/components/firstrun/FirstRunParts";
import { countryName } from "@/components/firstrun/FirstRunFlow";
import {
  ACHIEVEMENTS,
  LEAGUE_TIER_META,
  type Achievement,
  type LeagueTier,
} from "@/data/achievements";
import { COURSES, type Course } from "@/data/course-meta";
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
  heroLevel,
  weekStrip,
  type HeatCell,
  type ProfileOverview,
  type WeakItem,
} from "@/lib/profile-overview";
import { isValidTimeZone, skillScores } from "@/lib/profile-data";
import {
  SKILL_LABEL,
  MIN_SKILL_ANSWERS,
  skillsEmptyIntro,
  radarModel,
  radarPoint,
  radarPolygon,
} from "@/lib/skills-radar";
import {
  PROFILE_TABS,
  achievementsSummary,
  heatSummary,
  recordsSummary,
  stepTab,
  weakSummary,
  type ProfileTab,
} from "@/lib/profile-tabs";
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

const CARD = "rounded-[20px] bg-ds-card shadow-[var(--ds-shadow-resting)]";

/** Inside a Progress fold the card header is the fold button, so the section only keeps its aside link. */
const FoldedContext = createContext(false);

function SectionHead({ id, title, aside }: { id: string; title: string; aside?: ReactNode }) {
  const folded = useContext(FoldedContext);
  if (folded) {
    return aside ? (
      <div className="flex justify-end ds-type-caption text-ds-choice">{aside}</div>
    ) : null;
  }
  return (
    <div className="mt-2 flex items-baseline justify-between gap-3">
      <h2 id={id} className="ds-type-headline font-extrabold text-ds-ink">
        {title}
      </h2>
      {aside && <span className="ds-type-caption text-ds-choice">{aside}</span>}
    </div>
  );
}

// ---------------------------------------------------------------- identity hero

/** A country's flag, drawn (public/flags/<cc>.svg); a country with no drawing shows its code in a chip instead. */
export function DrawnFlag({ code }: { code: string }) {
  const drawn = drawnFlagCode(code);
  const name = countryName(code);
  return drawn ? (
    <img
      src={`/flags/${drawn.toLowerCase()}.svg`}
      alt={name}
      width={22}
      height={15}
      data-flag-drawn={drawn}
      className="h-[15px] w-[22px] shrink-0 rounded-[3px] object-cover shadow-[0_0_0_1px_color-mix(in_srgb,var(--c-on-hero)_40%,transparent)]"
    />
  ) : (
    <span
      role="img"
      aria-label={name}
      data-flag-chip={code.toUpperCase()}
      className="grid h-[15px] shrink-0 place-items-center rounded-[3px] border border-ds-line bg-ds-card px-1 ds-type-caption font-bold uppercase leading-none text-ds-ink"
    >
      {code.toUpperCase()}
    </span>
  );
}

const HERO_RING = "stroke-ds-on-hero/20";

/** Purely visual: the level is spoken through the picture button's description (children of a button are presentational). */
function LevelRing({ pct }: { pct: number }) {
  const gradient = useId();
  return (
    <svg
      viewBox="0 0 76 76"
      aria-hidden="true"
      data-level-ring={pct}
      className="absolute inset-0 size-full -rotate-90"
    >
      <defs>
        <linearGradient id={gradient} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="var(--c-action-hi)" />
          <stop offset="1" stopColor="var(--c-action)" />
        </linearGradient>
      </defs>
      <circle cx="38" cy="38" r="35" fill="none" strokeWidth="4" className={HERO_RING} />
      <circle
        cx="38"
        cy="38"
        r="35"
        fill="none"
        strokeWidth="4"
        strokeLinecap="round"
        pathLength={100}
        strokeDasharray={`${pct} 100`}
        stroke={`url(#${gradient})`}
      />
    </svg>
  );
}

function HeroStat({
  name,
  icon,
  solid,
  tone,
  value,
  label,
  spoken,
}: {
  name: string;
  icon: DsIconName;
  solid?: boolean;
  tone: string;
  value: string;
  label: string;
  spoken: string;
}) {
  return (
    <div
      role="group"
      aria-label={spoken}
      data-big-stat={name}
      className="flex items-center gap-2.5"
    >
      <span
        aria-hidden="true"
        className={`grid size-[30px] shrink-0 place-items-center rounded-[10px] border border-ds-on-hero/10 bg-ds-on-hero/10 ${tone}`}
      >
        {solid ? (
          <DsIcon name={icon as "flame"} solid className="size-[18px]" />
        ) : (
          <DsIcon name={icon as "check"} className="size-[18px]" />
        )}
      </span>
      <span aria-hidden="true" className="min-w-0">
        <b className="block ds-type-question-small tabular-nums" data-value="">
          {value}
        </b>
        <span className="block ds-type-overline text-ds-on-hero-soft">{label}</span>
      </span>
    </div>
  );
}

/**
 * The identity hero (BACKLOG profile, converged mock): the learner's picture in a level ring, their name and drawn
 * flag, a league chip, the level bar and the four numbers. It stays on every tab; Progress and Social show it without
 * the level bar and numbers. Every value comes from the overview through the pure rules in profile-overview.ts.
 */
export function ProfileIdentityHero({
  o,
  compact,
  onPicture,
}: {
  o: ProfileOverview;
  compact: boolean;
  onPicture: () => void;
}) {
  const name = o.profile.displayName || "Learner";
  const n = bigNumbers(o);
  const lvl = heroLevel(o);
  const c = o.courses.find((x) => x.course === o.course);
  const lg = leagueStatus(c?.leagueTier ?? "bronze", c?.xp ?? 0);
  const course = COURSES.find((x) => x.id === o.course)!;
  const streakSpoken =
    n.streakState === "protected"
      ? `${fmt(n.streak)} day streak, ${STREAK_PROTECTED_CAPTION}`
      : `${fmt(n.streak)} day streak`;
  const levelLine =
    lvl.lessonsLeft > 0
      ? `${fmt(lvl.lessonsLeft)} ${plural(lvl.lessonsLeft, "lesson", "lessons")} left in ${lvl.level}`
      : lvl.next
        ? `${lvl.level} done. Ready for ${lvl.next}`
        : `The top level in ${course.label}`;
  const levelDescId = useId();
  return (
    <section
      aria-label="Your profile"
      data-profile-hero=""
      className="relative overflow-hidden rounded-[28px] bg-[linear-gradient(155deg,var(--c-hero-a),var(--c-hero-b))] p-4 text-ds-on-hero shadow-[var(--ds-shadow-floating)]"
    >
      <span
        aria-hidden="true"
        className="pointer-events-none absolute -right-8 -top-10 size-[180px] rounded-full bg-[radial-gradient(circle,color-mix(in_srgb,var(--c-on-hero-kick)_35%,transparent),transparent_62%)]"
      />
      <div className="relative flex items-center gap-3.5">
        <button
          type="button"
          onClick={onPicture}
          aria-label="Change picture"
          aria-describedby={levelDescId}
          className="relative size-[76px] shrink-0 rounded-full"
        >
          <LevelRing pct={lvl.pct} />
          <span id={levelDescId} hidden>
            {`Level ${lvl.level}, ${levelLine}`}
          </span>
          <span className="absolute inset-1.5 overflow-hidden rounded-full bg-ds-sunk">
            <ProfileAvatar
              seed={o.profile.avatarSeed}
              name={name}
              className="size-full"
              textClass="ds-type-title"
            />
          </span>
          <span
            aria-hidden="true"
            data-level-badge={lvl.level}
            className="absolute -bottom-0.5 -right-0.5 rounded-full border-2 border-ds-hero-b bg-[linear-gradient(180deg,var(--c-action-hi),var(--c-action))] px-1.5 ds-type-overline text-ds-on-action"
          >
            {lvl.level}
          </span>
        </button>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2">
            <h1 className="ds-type-display-x-l break-words">{name}</h1>
            {o.profile.country && (
              <span data-profile-flag={o.profile.country} className="inline-flex">
                <DrawnFlag code={o.profile.country} />
              </span>
            )}
          </div>
          <span
            data-league-chip={lg.tier}
            className="mt-1.5 inline-flex items-center gap-1.5 rounded-full border border-ds-on-hero-kick/50 bg-ds-on-hero-kick/25 px-2.5 py-0.5 ds-type-caption font-extrabold text-ds-on-hero-kick"
          >
            <DsIcon name="trophy" className="size-3.5" />
            {LEAGUE_TIER_META[lg.tier].label} league
            {o.league ? ` · Rank ${fmt(o.league.rank)}` : ""}
          </span>
        </div>
      </div>
      {!compact && (
        <>
          <div className="relative mt-3.5">
            <div className="mb-1 flex items-baseline justify-between gap-2 ds-type-caption text-ds-on-hero-soft">
              <b className="ds-type-footnote text-ds-on-hero">Level {lvl.level}</b>
              <span data-level-line="">{levelLine}</span>
            </div>
            <div
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={lvl.pct}
              aria-label={`${lvl.level} progress: ${levelLine}`}
              className="h-2 overflow-hidden rounded-full bg-ds-hero-b/40"
            >
              <i
                className="block h-full rounded-full bg-[linear-gradient(90deg,var(--c-action-hi),var(--c-action))]"
                style={{ width: `${lvl.pct}%` }}
              />
            </div>
          </div>
          <div className="relative mt-3.5 grid grid-cols-1 gap-3 rounded-[18px] border border-ds-on-hero/10 bg-ds-hero-b/30 p-3 min-[380px]:grid-cols-2">
            <HeroStat
              name="streak"
              icon="flame"
              solid
              tone="text-ds-on-hero-kick"
              value={fmt(n.streak)}
              label="day streak"
              spoken={streakSpoken}
            />
            <HeroStat
              name="xp"
              icon="bolt"
              solid
              tone="text-ds-on-hero-kick"
              value={fmt(n.courseXp)}
              label={`XP in ${course.label}`}
              spoken={`${fmt(n.courseXp)} XP in ${course.label}`}
            />
            <HeroStat
              name="words"
              icon="words"
              tone="text-ds-on-hero-soft"
              value={fmt(n.wordsLearned)}
              label={plural(n.wordsLearned, "word learned", "words learned")}
              spoken={`${fmt(n.wordsLearned)} ${plural(n.wordsLearned, "word", "words")} learned`}
            />
            <HeroStat
              name="accuracy"
              icon="target"
              tone="text-ds-on-hero-soft"
              value={n.accuracyPct === null ? "–" : `${n.accuracyPct}%`}
              label="accuracy"
              spoken={
                n.accuracyPct === null ? "No accuracy yet" : `${n.accuracyPct} percent accuracy`
              }
            />
          </div>
        </>
      )}
    </section>
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
    <div role="group" aria-label="Your courses" className="flex gap-1.5" data-course-switcher="">
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

// ---------------------------------------------------------------- this week

const WEEKDAY = (day: string, style: "narrow" | "long") =>
  new Date(`${day}T00:00:00Z`).toLocaleDateString("en-US", { weekday: style, timeZone: "UTC" });

/** This week as a strip: done days stamped gold with a check, today ringed in the choice colour, the rest plain. */
export function ThisWeek({ o }: { o: ProfileOverview }) {
  const week = weekStrip(o);
  const n = bigNumbers(o);
  return (
    <section aria-labelledby="week-heading" className={`${CARD} grid gap-2.5 p-3.5`}>
      <div className="flex items-center justify-between gap-2">
        <h2 id="week-heading" className="ds-type-headline font-extrabold text-ds-ink">
          This week
        </h2>
        <span
          data-streak-chip=""
          className="inline-flex items-center gap-1 rounded-full bg-ds-flame-tint px-2.5 py-0.5 ds-type-caption font-extrabold text-ds-flame"
        >
          <DsIcon name="flame" solid className="size-3.5" />
          {n.streakState === "protected" ? STREAK_PROTECTED_CAPTION : `${fmt(n.streak)}-day streak`}
        </span>
      </div>
      <div data-ring-measure={week.measure}>
        <ol className="grid grid-cols-7 gap-1.5 text-center">
          {week.days.map((d) => (
            <li
              key={d.day}
              aria-label={`${WEEKDAY(d.day, "long")}: ${d.spoken}`}
              className="grid justify-items-center gap-1"
            >
              <span
                aria-hidden="true"
                data-ring={d.state}
                className={`grid h-[30px] w-full place-items-center rounded-[9px] ${
                  d.state === "done"
                    ? "bg-[linear-gradient(180deg,var(--c-action-hi),var(--c-action))] text-ds-on-action shadow-[inset_0_-2px_0_var(--c-action-edge)]"
                    : d.state === "today"
                      ? "bg-ds-choice-tint shadow-[inset_0_0_0_2px_var(--c-choice)]"
                      : "bg-ds-sunk"
                }`}
              >
                {d.state === "done" && <DsIcon name="check" className="size-3.5" />}
              </span>
              <span
                aria-hidden="true"
                className={`ds-type-overline ${d.state === "done" ? "text-ds-action-text" : "text-ds-ink-faint"}`}
              >
                {WEEKDAY(d.day, "narrow")}
              </span>
            </li>
          ))}
        </ol>
        <p className="mt-2 text-center ds-type-caption text-ds-ink-faint" data-goal-note="">
          {week.measure === "minutes"
            ? `Goal: ${fmt(o.dailyGoalMinutes as number)} learning minutes a day`
            : "Pick a daily time in Edit your answers to measure your days in minutes."}
        </p>
      </div>
      {week.minutesSpoken > 0 && (
        <p className="ds-type-caption text-ds-ink-soft" data-minutes-spoken={week.minutesSpoken}>
          {fmt(week.minutesSpoken)} {plural(week.minutesSpoken, "minute", "minutes")} spoken this
          week
        </p>
      )}
    </section>
  );
}

/** A tappable row card with a drawn icon in a tinted tile (Edit your answers, Settings, League, Friends, Invite). */
function RowCard({
  icon,
  tint,
  title,
  sub,
  ...action
}: {
  icon: "target" | "settings" | "league" | "friends" | "gift";
  tint: string;
  title: string;
  sub: string;
} & (
  | {
      to: "/league" | "/profile/friends" | "/profile/invite" | "/complete-profile";
      search?: { edit: true };
    }
  | { onClick: () => void }
)) {
  const body = (
    <>
      <span
        aria-hidden="true"
        className={`grid size-[38px] shrink-0 place-items-center rounded-[12px] ${tint}`}
      >
        <DsIcon name={icon} className="size-5" />
      </span>
      <span className="min-w-0 flex-1">
        <b className="block ds-type-footnote font-extrabold text-ds-ink">{title}</b>{" "}
        <span className="block ds-type-caption font-normal text-ds-ink-soft">{sub}</span>
      </span>
      <DsIcon name="chevron" className="size-[17px] shrink-0 text-ds-ink-faint" />
    </>
  );
  const cls = `${CARD} flex min-h-11 w-full items-center gap-3 p-3 text-left`;
  return "onClick" in action ? (
    <button type="button" onClick={action.onClick} className={cls}>
      {body}
    </button>
  ) : (
    <Link to={action.to} search={action.search} className={cls}>
      {body}
    </Link>
  );
}

export function OverviewRows({ onSettings }: { onSettings: () => void }) {
  return (
    <>
      <RowCard
        to="/complete-profile"
        search={{ edit: true }}
        icon="target"
        tint="bg-ds-choice-tint text-ds-choice"
        title="Edit your answers"
        sub="Goal, level, daily time, interests"
      />
      <RowCard
        onClick={onSettings}
        icon="settings"
        tint="bg-ds-right-tint text-ds-right"
        title="Settings"
        sub="Theme and account"
      />
    </>
  );
}

/** The achievements preview: the latest medallions overlapping on navy, how many are unlocked, a chevron to the wall. */
export function AchievementsPreview({ o, onOpen }: { o: ProfileOverview; onOpen: () => void }) {
  const unlocked = o.achievements.filter((a) => ACHIEVEMENTS.some((x) => x.id === a.id));
  const shown = [...unlocked]
    .sort((a, b) => (b.unlockedAt ?? "").localeCompare(a.unlockedAt ?? ""))
    .slice(0, 3)
    .map((a) => ACHIEVEMENTS.find((x) => x.id === a.id)!);
  const next = nextAchievement(
    achievementStats(o),
    unlocked.map((a) => a.id),
  );
  const more = unlocked.length - shown.length;
  const count = `${fmt(unlocked.length)} of ${fmt(ACHIEVEMENTS.length)} unlocked`;
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={`Achievements, ${count}`}
      data-achievements-preview=""
      className="flex w-full items-center gap-3 rounded-[18px] bg-[linear-gradient(155deg,var(--c-hero-a),var(--c-hero-b))] px-3.5 py-3 text-left text-ds-on-hero shadow-[var(--ds-shadow-floating)]"
    >
      <span aria-hidden="true" className="flex items-center pl-1">
        {shown.map((a, i) => (
          <span key={a.id} className={i ? "-ml-4" : ""}>
            <Medallion achievement={a} state="earned" size={50} />
          </span>
        ))}
        {shown.length === 0 && next && (
          <Medallion achievement={next.achievement} state="locked" size={50} />
        )}
        {more > 0 && (
          <span className="-ml-4 grid size-[38px] place-items-center rounded-full bg-ds-on-hero/15 ds-type-caption font-extrabold">
            +{fmt(more)}
          </span>
        )}
      </span>
      <span aria-hidden="true" className="min-w-0 flex-1">
        <b className="block ds-type-footnote font-extrabold">Achievements</b>
        <span className="block ds-type-caption text-ds-on-hero-soft">{count}</span>
      </span>
      <DsIcon name="chevron" className="size-[17px] shrink-0 text-ds-on-hero-soft" />
    </button>
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

/**
 * "What Alphonso remembers" on Profile. Pro: the counts of what he keeps, one tap to see and edit. Free: a teaser made
 * only from the learner's own weak spots (the same rule as "Hector can help"), linking to the locked page.
 */
export function MemoryCard({ o, pro }: { o: ProfileOverview; pro: boolean }) {
  const memory = useQuery({
    queryKey: ["tutor-memory"],
    queryFn: fetchTutorMemory,
    enabled: pro,
    retry: false,
    staleTime: 60_000,
  });
  const ready = memory.data?.status === "ok" ? memory.data.data : null;
  const topics = weakSpots(o.weakItems, 2).top.map((w) => w.display);
  if (pro && !ready) return null;
  return (
    <Link
      to="/profile/memory"
      data-memory-card={pro ? "pro" : "teaser"}
      className="flex items-center gap-2.5 rounded-[18px] bg-ds-brand px-3 py-2.5 text-ds-on-hero"
    >
      <img
        src="/alphonso/lesson/happy.webp"
        alt=""
        className="size-[46px] shrink-0 rounded-full bg-ds-sunk object-cover object-[center_12%] shadow-[0_0_0_2px_var(--c-action)]"
      />
      <div className="min-w-0 flex-1">
        <b className="block ds-type-footnote font-extrabold">
          {pro ? "What Alphonso remembers" : "What Alphonso can remember"}
          <span className="ml-1 rounded-[5px] bg-ds-action px-1 align-[2px] ds-type-overline text-ds-on-action">
            Pro
          </span>
        </b>
        <small className="block ds-type-caption text-ds-on-hero-soft">
          {ready
            ? `${memorySummary({ mistakes: ready.mistakes.length, phrases: ready.phrases.length, goals: goalLines(ready.goals).length })} See and edit.`
            : topics.length > 0
              ? `He could remember ${joinTopics(topics)}. See what Pro keeps.`
              : "With Pro, Alphonso keeps notes between calls. See what he could keep."}
        </small>
      </div>
      <DsIcon name="chevron" className="size-[22px] shrink-0 text-ds-on-hero-soft" />
    </Link>
  );
}

// ---------------------------------------------------------------- achievements, league, friends

function Medal({ a, locked }: { a: Achievement | null; locked?: boolean }) {
  return (
    <li className="grid flex-1 justify-items-center gap-1 text-center ds-type-caption text-ds-ink-soft">
      {a ? (
        <Medallion achievement={a} state={locked ? "locked" : "earned"} size={54} />
      ) : (
        <span
          aria-hidden="true"
          className="grid size-[54px] place-items-center rounded-full bg-ds-line text-ds-ink-faint"
        >
          <DsIcon name="lock" className="size-[26px]" />
        </span>
      )}
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
  const [open, setOpen] = useState<Achievement | null>(null);
  const have = new Set(unlocked.map((a) => a.id));
  const stats = achievementStats(o);
  const states = badgeStates(ACHIEVEMENTS, have, stats);
  const unlockedAt = new Map(unlocked.map((a) => [a.id, a.unlockedAt] as const));
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
            {next && <Medal a={next.achievement} locked />}
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
                  <AchievementBadge
                    achievement={a}
                    entry={states[a.id]}
                    onOpen={() => setOpen(a)}
                  />
                </li>
              ))}
          </ul>
        )}
      </div>
      {open && (
        <AchievementDetail
          achievement={open}
          unlocked={unlockedAt}
          states={states}
          onClose={() => setOpen(null)}
        />
      )}
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

/**
 * When the league week closes, in the learner's own zone. Display only: the week itself (and every streak day) stays
 * on the UTC calendar; this formats the instant that week ends, the last moment of its Sunday UTC.
 */
export function leagueWeekEnds(weekEnd: string, timeZone: string | null): string {
  const end = new Date(`${weekEnd}T23:59:59Z`);
  const zone = timeZone && isValidTimeZone(timeZone) ? timeZone : "UTC";
  const when = end.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    timeZone: zone,
  });
  return `ends ${when}`;
}

/**
 * The rows that open the social screens, in iOS's order and wording (ProfileHubView, Social tab): League, Friends, then
 * Invite friends. League has no tab of its own; this is the way to it besides the badge in the top bar.
 */
export function SocialLinks() {
  return (
    <nav aria-label="Social" className="grid gap-2.5">
      <RowCard
        to="/league"
        icon="league"
        tint="bg-ds-xp-tint text-ds-xp-text"
        title="League"
        sub="Leaderboards, teams, and the season ladder"
      />
      <RowCard
        to="/profile/friends"
        icon="friends"
        tint="bg-ds-choice-tint text-ds-choice"
        title="Friends"
        sub="Your friends, their activity, and duels"
      />
      <RowCard
        to="/profile/invite"
        icon="gift"
        tint="bg-ds-right-tint text-ds-right"
        title="Invite friends"
        sub="You both get a reward when they finish a first lesson"
      />
    </nav>
  );
}

/** The league tier's shield, in its own tier colour (the same emblem the league screens use). */
function LeagueShield({ tier, className }: { tier: LeagueTier; className?: string }) {
  return (
    <svg viewBox="0 0 52 58" aria-hidden="true" className={className}>
      <path
        d="M26 2l22 8v18c0 14-10 23-22 28C14 51 4 42 4 28V10z"
        className={`${LEAGUE_FILL[tier]} stroke-ds-ink/20`}
        strokeWidth="2"
      />
      <path
        d="M26 10l14 5v13c0 9-6 15-14 18-8-3-14-9-14-18V15z"
        className="fill-ds-card opacity-80"
      />
      <path
        d="M26 18l3 6 6 .7-4.5 4 1.2 6-5.7-3.2-5.7 3.2 1.2-6-4.5-4 6-.7z"
        className={LEAGUE_FILL[tier]}
      />
    </svg>
  );
}

/** Your league, on navy: the tier, how far to the next, and where you stand this week. */
export function LeagueCard({ o }: { o: ProfileOverview }) {
  const c = o.courses.find((x) => x.course === o.course);
  const s = leagueStatus(c?.leagueTier ?? "bronze", c?.xp ?? 0);
  const meta = LEAGUE_TIER_META[s.tier];
  const toNext = s.next
    ? `${fmt(s.xpToNext)} XP to ${LEAGUE_TIER_META[s.next].label}`
    : "The top league. Well done.";
  return (
    <section
      aria-labelledby="league-heading"
      data-league={s.tier}
      className="relative overflow-hidden rounded-[22px] bg-[linear-gradient(155deg,var(--c-hero-a),var(--c-hero-b))] p-4 text-ds-on-hero shadow-[var(--ds-shadow-floating)]"
    >
      <span
        aria-hidden="true"
        className="pointer-events-none absolute -right-6 -top-9 size-[170px] rounded-full bg-[radial-gradient(circle,color-mix(in_srgb,var(--c-on-hero-kick)_28%,transparent),transparent_62%)]"
      />
      <h2
        id="league-heading"
        className="relative ds-type-overline uppercase tracking-[0.14em] text-ds-on-hero-soft"
      >
        Your league
      </h2>
      <div className="relative mt-1 flex items-center gap-3">
        <LeagueShield tier={s.tier} className="h-[58px] w-[52px] shrink-0" />
        <b className="ds-type-display-x-l text-ds-on-hero-kick">{meta.label}</b>
      </div>
      <div
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={s.pct}
        aria-label={toNext}
        className="relative mt-2.5 h-2 overflow-hidden rounded-full bg-ds-hero-b/40"
      >
        <i
          className="block h-full rounded-full bg-[linear-gradient(90deg,var(--c-action-hi),var(--c-action))]"
          style={{ width: `${s.pct}%` }}
        />
      </div>
      <p className="relative mt-1.5 ds-type-footnote font-extrabold text-ds-on-hero-kick">
        {toNext}
      </p>
      {o.league && (
        <p className="relative ds-type-caption text-ds-on-hero-soft" data-league-standing="">
          {`Rank ${fmt(o.league.rank)} of ${fmt(o.league.size)} · ${leagueWeekEnds(o.league.weekEnd, o.timeZone)}`}
        </p>
      )}
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
      <SectionHead id="friends-heading" title="Friends this week" />
      <div className={`${CARD} grid gap-[7px] p-3`}>
        {o.friends.length === 0 ? (
          <div className="flex items-center gap-3">
            <DsIcon name="friends" className="size-8 shrink-0 text-ds-choice" />
            <p className="ds-type-footnote text-ds-ink-soft">
              Learning sticks better with a friend. Invite one from the rows above.
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
    <div aria-busy="true" aria-label="Loading your profile" className="grid gap-3 px-3.5 pt-4">
      <div className="h-[330px] animate-pulse rounded-[28px] bg-ds-sunk motion-reduce:animate-none" />
      <div className="h-24 animate-pulse rounded-[18px] bg-ds-sunk motion-reduce:animate-none" />
    </div>
  );
}

// ---------------------------------------------------------------- tabs (round 6.1)

export function ProfileTabBar({
  tab,
  onChange,
}: {
  tab: ProfileTab;
  onChange: (t: ProfileTab) => void;
}) {
  return (
    <div
      role="tablist"
      aria-label="Profile sections"
      className="sticky top-0 z-10 grid grid-cols-3 gap-[3px] rounded-[14px] border-2 border-ds-line bg-ds-card p-[3px] shadow-[var(--ds-shadow-resting)]"
    >
      {PROFILE_TABS.map((t) => (
        <button
          key={t.id}
          type="button"
          role="tab"
          id={`profile-tab-${t.id}`}
          aria-selected={t.id === tab}
          aria-controls="profile-tabpanel"
          tabIndex={t.id === tab ? 0 : -1}
          onClick={() => onChange(t.id)}
          onKeyDown={(e) => {
            if (e.key === "ArrowRight") onChange(stepTab(tab, 1));
            if (e.key === "ArrowLeft") onChange(stepTab(tab, -1));
          }}
          className={`min-h-11 rounded-[11px] px-2 ds-type-footnote font-extrabold ${
            t.id === tab ? "bg-ds-choice text-ds-on-choice" : "text-ds-ink-soft"
          }`}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}

/** A Progress card that shows a one-line summary and opens in place. Closed by default. */
export function ProgressFold({
  headingId,
  title,
  summary,
  defaultOpen = false,
  children,
}: {
  headingId: string;
  title: string;
  summary: string;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const bodyId = useId();
  return (
    <section aria-labelledby={headingId} className={`${CARD} overflow-hidden`}>
      <h2 id={headingId} className="m-0">
        <button
          type="button"
          aria-expanded={open}
          aria-controls={bodyId}
          onClick={() => setOpen((v) => !v)}
          className="flex min-h-11 w-full items-center justify-between gap-3 px-3.5 py-2.5 text-left"
        >
          <span className="ds-type-headline font-extrabold text-ds-ink">{title}</span>
          <span className="flex items-center gap-2 ds-type-caption text-ds-ink-soft">
            {summary}
            <span aria-hidden="true">{open ? "▾" : "▸"}</span>
          </span>
        </button>
      </h2>
      {open && (
        <div id={bodyId} className="px-3 pb-3">
          <FoldedContext.Provider value={true}>{children}</FoldedContext.Provider>
        </div>
      )}
    </section>
  );
}

const RADAR_SIZE = 340;
const RADAR_RADIUS = RADAR_SIZE / 2 - 46;
const RADAR_RINGS = [0.25, 0.5, 0.75, 1];

/**
 * The Skills radar (mock option 1): the right share of the learner's recent answers per skill, from skill_days. A skill
 * with too few answers has no vertex and says how many more it needs; with too little data overall the card shows the
 * designed empty state. No value is ever filled in.
 */
export function SkillsChart({ o }: { o: ProfileOverview }) {
  const model = radarModel(skillScores(o.skills, o.today));
  const n = model.skills.length;
  const c = RADAR_SIZE / 2;
  return (
    <section
      aria-labelledby="skills-heading"
      className={`${CARD} grid gap-2 p-3.5`}
      data-skills-chart={model.ready ? "radar" : "empty"}
    >
      <h2 id="skills-heading" className="ds-type-headline font-extrabold text-ds-ink">
        Skills
      </h2>
      {model.ready ? (
        <>
          <svg
            viewBox={`0 0 ${RADAR_SIZE} ${RADAR_SIZE}`}
            role="img"
            aria-label={`Skills: ${model.skills
              .map((s) => `${s.label} ${s.pct === null ? "not scored yet" : s.pct}`)
              .join(", ")}`}
            className="w-full"
          >
            {RADAR_RINGS.map((k) => (
              <polygon
                key={k}
                points={model.skills
                  .map((_, i) => radarPoint(i, n, RADAR_RADIUS * k, c).join(","))
                  .join(" ")}
                className="fill-none stroke-ds-line"
                strokeWidth="1.5"
              />
            ))}
            {model.skills.map((s, i) => {
              const [x, y] = radarPoint(i, n, RADAR_RADIUS, c);
              return <line key={s.skill} x1={c} y1={c} x2={x} y2={y} className="stroke-ds-line" />;
            })}
            <polygon
              data-radar-shape=""
              points={radarPolygon(model.skills, RADAR_RADIUS, c)}
              className="fill-ds-choice/25 stroke-ds-choice"
              strokeWidth="3"
              strokeLinejoin="round"
            />
            {model.skills.map((s, i) => {
              const [lx, ly] = radarPoint(i, n, RADAR_RADIUS + 26, c);
              const dot = s.pct === null ? null : radarPoint(i, n, (RADAR_RADIUS * s.pct) / 100, c);
              return (
                <g key={s.skill} data-skill={s.skill} data-score={s.pct ?? ""}>
                  {dot && (
                    <circle
                      cx={dot[0]}
                      cy={dot[1]}
                      r="5"
                      className="fill-ds-xp stroke-ds-card"
                      strokeWidth="2"
                    />
                  )}
                  <text
                    x={lx}
                    y={ly}
                    textAnchor="middle"
                    dominantBaseline="middle"
                    className="fill-ds-ink ds-type-caption font-extrabold"
                  >
                    {s.label}
                  </text>
                  <text
                    x={lx}
                    y={ly + 14}
                    textAnchor="middle"
                    className="fill-ds-ink-soft ds-type-caption font-extrabold"
                  >
                    {s.pct === null ? "not yet" : s.pct}
                  </text>
                </g>
              );
            })}
          </svg>
          <p
            className="rounded-[14px] bg-ds-xp-tint px-3 py-2 ds-type-footnote font-bold text-ds-ink"
            data-skills-lowest={model.lowest.skill}
          >
            {`Lowest: ${model.lowest.label} · ${model.lowest.pct}. Practise it to lift your shape.`}
          </p>
        </>
      ) : (
        <>
          <p className="ds-type-footnote text-ds-ink-soft" data-skills-intro="">
            {skillsEmptyIntro(model.skills)}
          </p>
          <ul className="grid gap-1 ds-type-caption text-ds-ink-soft" data-skills-needed="">
            {model.skills.map((s) => (
              <li key={s.skill}>
                {s.pct === null
                  ? `${SKILL_LABEL[s.skill]}: ${fmt(s.needed)} more ${plural(s.needed, "answer", "answers")} to score (${fmt(s.answered)} of ${fmt(MIN_SKILL_ANSWERS)} so far)`
                  : `${SKILL_LABEL[s.skill]}: ${s.pct}`}
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}

export function progressFoldSummaries(o: ProfileOverview) {
  const heat = heatMap(o.today, o.activity);
  const recs = personalRecords(o);
  const cefr = o.courses.find((c) => c.course === o.course)?.cefrLevel ?? "A1";
  const done = o.completions.filter((c) => c.language === o.course).map((c) => c.lessonId);
  const lvl = levelProgress(o.course, cefr, done);
  const weak = weakSpots(o.weakItems);
  const unlocked = o.achievements.filter((a) => ACHIEVEMENTS.some((x) => x.id === a.id)).length;
  return {
    heat: heatSummary(heat.activeDays),
    records: recordsSummary(recs.bestStreak),
    level: `${lvl.level} · ${lvl.pct}%`,
    weak: weakSummary(weak.total),
    achievements: achievementsSummary(unlocked, ACHIEVEMENTS.length),
  };
}
