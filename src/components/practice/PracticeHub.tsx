import { useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import { DsIcon } from "../ds/DsIcon";
import { HectorInvite } from "../HectorInvite";
import { PracticeStars, StarTally } from "./PracticeStars";
import { SayThePicture } from "./SayThePicture";
import { SayItRight } from "./SayItRight";
import { PreCallSheet, type CallMode, type PreCallTarget } from "./PreCallSheet";
import type { Course } from "@/data/courses";
import { CAMPAIGNS, localizeCampaign } from "@/data/campaigns";
import { SCENARIOS, localizeScenario, type ScenarioLevel } from "@/data/scenarios";
import {
  WEAK_SPOT_NAMES,
  campaignCover,
  personaOf,
  roomUrl,
  sceneKey,
  sceneRoom,
} from "@/lib/practice-catalog";
import {
  campaignProgress,
  continuePoint,
  nextSceneIndex,
  starLookup,
  starTally,
  todaysPicks,
  type PracticeHubData,
} from "@/lib/practice-hub";
import { usePrefersReducedMotion } from "@/lib/use-prefers-reduced-motion";

/**
 * The Practice hub ("Practice A", approved mock v6): a swipeable carousel of call cards (Alphonso ready to call, each
 * with a tailored reason and round Call / Chat buttons), the conversations in their painted rooms with level chips
 * and a Mastered badge, the campaigns as a rail, the two drills as featured cards, and Hector's quiet Pro nudge.
 * Every count and star comes from the catalog and the learner's rows. The pre-call sheet still carries the star rules.
 */
export type StartTarget =
  | { kind: "scenario"; scenarioId: string; mode: CallMode }
  | { kind: "scene"; campaignId: string; sceneIndex: number; mode: CallMode };

const GREETING: Record<Course, { line: string; gloss?: string }> = {
  en: { line: "Shall we practice a bit today?" },
  fr: { line: "On pratique un peu aujourd'hui ?", gloss: "Shall we practice a bit today?" },
  es: { line: "¿Practicamos un poco hoy?", gloss: "Shall we practice a bit today?" },
};

const LEVELS: readonly ScenarioLevel[] = ["Beginner", "Intermediate", "Advanced"];

const CARD_VIGNETTE =
  "linear-gradient(180deg, color-mix(in srgb, var(--c-hero-b) 62%, transparent) 0%, color-mix(in srgb, var(--c-hero-b) 12%, transparent) 22%, color-mix(in srgb, var(--c-hero-b) 10%, transparent) 44%, color-mix(in srgb, var(--c-hero-b) 82%, transparent) 78%, var(--c-hero-b) 100%)";
const TILE_SHADE =
  "linear-gradient(180deg, transparent 30%, color-mix(in srgb, var(--c-hero-b) 78%, transparent) 62%, color-mix(in srgb, var(--c-hero-b) 92%, transparent) 100%)";
const RAIL_SHADE =
  "linear-gradient(180deg, transparent 28%, color-mix(in srgb, var(--c-hero-b) 94%, transparent))";

type Sheet = { target: PreCallTarget; start: (mode: CallMode) => StartTarget; mode: CallMode };

/** One call card: a scenario picked for the learner, or the campaign scene they were in the middle of. */
type HeroCard = {
  key: string;
  kicker: string;
  title: string;
  subtitle: string;
  reason: string;
  room: string;
  stars: number;
  /** Set on the resume card, for "Continue". */
  continueKey?: string;
  /** Set on a scenario pick. */
  pickId?: string;
  open: (mode: CallMode) => void;
};

export function PracticeHub({
  course,
  data,
  initialMode,
  onStart,
}: {
  course: Course;
  /** The learner's rows, or null while they load (or when they could not be loaded). */
  data: PracticeHubData | null;
  initialMode: CallMode;
  onStart: (target: StartTarget) => void;
}) {
  const reduce = usePrefersReducedMotion();
  const rows = useMemo(() => data?.stars ?? [], [data]);
  const stars = useMemo(() => starLookup(rows), [rows]);
  const tally = useMemo(() => starTally(rows), [rows]);
  const picks = useMemo(() => (data ? todaysPicks(data) : []), [data]);
  const resume = useMemo(() => continuePoint(rows), [rows]);
  const scenarios = useMemo(() => SCENARIOS.map((s) => localizeScenario(s, course)), [course]);
  const campaigns = useMemo(() => CAMPAIGNS.map((c) => localizeCampaign(c, course)), [course]);
  const [level, setLevel] = useState<ScenarioLevel | "All">("All");
  const [sheet, setSheet] = useState<Sheet | null>(null);
  const [sayPicture, setSayPicture] = useState(false);
  const [sayItRight, setSayItRight] = useState(false);
  const [active, setActive] = useState(0);
  const track = useRef<HTMLDivElement>(null);
  const greeting = GREETING[course];

  const openScenario = (id: string, mode: CallMode = initialMode) => {
    const s = scenarios.find((x) => x.id === id)!;
    setSheet({
      target: {
        title: s.title,
        level: s.level,
        persona: personaOf("scenario", s.id, course) ?? "",
        opener: s.opener,
        lang: course,
      },
      start: (m) => ({ kind: "scenario", scenarioId: s.id, mode: m }),
      mode,
    });
  };
  const openScene = (campaignId: string, sceneIndex: number, mode: CallMode = initialMode) => {
    const c = campaigns.find((x) => x.id === campaignId)!;
    const scene = c.scenes[sceneIndex];
    setSheet({
      target: {
        title: scene.title,
        level: c.level,
        step: `${c.title}, scene ${sceneIndex + 1} of ${c.scenes.length}`,
        persona: personaOf("scene", sceneKey(c.id, scene.id), course) ?? "",
        opener: scene.opener,
        lang: course,
        // The campaign's detail: every scene with the stars it holds, the current one marked.
        scenes: c.scenes.map((s, i) => ({
          title: s.title,
          stars: stars("scene", sceneKey(c.id, s.id)),
          current: i === sceneIndex,
        })),
      },
      start: (m) => ({ kind: "scene", campaignId: c.id, sceneIndex, mode: m }),
      mode,
    });
  };

  const resumeCampaign = resume ? campaigns.find((c) => c.id === resume.campaignId) : undefined;
  // The cards: where the learner left off (if anywhere), then Today's picks, three in all.
  const cards: HeroCard[] = [];
  if (data) {
    if (resume && resumeCampaign) {
      const scene = resumeCampaign.scenes[resume.sceneIndex];
      cards.push({
        key: `continue:${resume.campaignId}:${resume.sceneIndex}`,
        kicker: "Continue",
        title: scene.title,
        subtitle: `${resumeCampaign.title} · Scene ${resume.sceneIndex + 1} of ${resumeCampaign.scenes.length}`,
        reason: "Pick up where you left off",
        room: sceneRoom(resumeCampaign.id, scene.id),
        stars: stars("scene", sceneKey(resumeCampaign.id, scene.id)),
        continueKey: `${resume.campaignId}:${resume.sceneIndex}`,
        open: (mode) => openScene(resume.campaignId, resume.sceneIndex, mode),
      });
    }
    for (const p of picks.slice(0, Math.max(0, 3 - cards.length))) {
      const s = scenarios.find((x) => x.id === p.scenarioId);
      if (!s) continue;
      const first = !cards.some((c) => c.pickId);
      cards.push({
        key: `pick:${p.scenarioId}`,
        kicker: first ? "Today's pick" : "Also for you",
        title: s.title,
        subtitle: p.level,
        reason: p.weakSpot
          ? `Makes you use ${WEAK_SPOT_NAMES[p.weakSpot] ?? p.weakSpot}${first ? ", your top weak spot" : ""}`
          : `${p.level} scene at your level`,
        room: s.id,
        stars: stars("scenario", s.id),
        pickId: p.scenarioId,
        open: (mode) => openScenario(p.scenarioId, mode),
      });
    }
  }

  const goTo = (i: number) => {
    setActive(i);
    const card = track.current?.children[i] as HTMLElement | undefined;
    card?.scrollIntoView?.({
      behavior: reduce ? "auto" : "smooth",
      inline: "center",
      block: "nearest",
    });
  };
  const onTrackScroll = () => {
    const el = track.current;
    const first = el?.children[0] as HTMLElement | undefined;
    if (!el || !first || !first.offsetWidth) return;
    const next = Math.round(el.scrollLeft / (first.offsetWidth + 10));
    setActive(Math.min(Math.max(next, 0), Math.max(cards.length - 1, 0)));
  };

  const enter = (i: number) =>
    reduce
      ? {}
      : {
          initial: { opacity: 0, y: 8 },
          animate: { opacity: 1, y: 0 },
          transition: {
            delay: Math.min(i, 8) * 0.04,
            duration: 0.35,
            ease: [0.16, 1, 0.3, 1] as const,
          },
        };

  const shownScenarios = level === "All" ? scenarios : scenarios.filter((s) => s.level === level);

  if (sayItRight) return <SayItRight course={course} onExit={() => setSayItRight(false)} />;
  if (sayPicture) return <SayThePicture course={course} onExit={() => setSayPicture(false)} />;

  return (
    <div
      data-practice-hub=""
      className="grid gap-3.5 bg-ds-surface px-4 pb-8 pt-4 font-[family-name:var(--ds-font-body)] text-ds-ink"
    >
      <header className="grid gap-1">
        <div className="flex items-center justify-between gap-2">
          <h1 className="ds-type-display text-ds-ink">Practice</h1>
          {data && <StarTally earned={tally.earned} total={tally.total} />}
        </div>
        <p className="ds-type-caption font-semibold text-ds-ink-soft">
          <span lang={course}>{greeting.line}</span>
          {greeting.gloss && (
            <>
              <span aria-hidden="true"> · </span>
              <span className="opacity-80">{greeting.gloss}</span>
            </>
          )}
        </p>
      </header>

      {/* The call cards: swipe, or use the dots. Never auto-advances. */}
      <section
        aria-roledescription="carousel"
        aria-label="Calls picked for you"
        className="grid gap-2"
      >
        {data ? (
          <>
            <div
              ref={track}
              onScroll={onTrackScroll}
              data-hero-track=""
              className="-mx-1 flex snap-x snap-mandatory gap-2.5 overflow-x-auto px-1 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
            >
              {cards.map((card, i) => (
                <div
                  key={card.key}
                  role="group"
                  aria-roledescription="slide"
                  aria-label={`${i + 1} of ${cards.length}: ${card.title}`}
                  data-hero-card={card.pickId ?? card.continueKey}
                  {...(card.pickId && card.kicker === "Today's pick"
                    ? { "data-todays-pick": card.pickId }
                    : {})}
                  {...(card.continueKey ? { "data-continue": card.continueKey } : {})}
                  className="relative grid min-h-[340px] shrink-0 basis-[86%] snap-center grid-rows-[auto_1fr_auto] overflow-hidden rounded-[26px] bg-ds-hero text-ds-on-hero shadow-[var(--ds-shadow-floating)]"
                >
                  <div
                    aria-hidden="true"
                    className="absolute inset-0 bg-cover bg-center"
                    style={{ backgroundImage: `url(${roomUrl(card.room)})` }}
                  />
                  <div
                    aria-hidden="true"
                    className="absolute inset-0 z-[2]"
                    style={{ background: CARD_VIGNETTE }}
                  />
                  <div className="relative z-[3] grid justify-items-center gap-1 px-3.5 pt-3 text-center">
                    <p className="ds-type-overline text-ds-on-hero-kick">
                      {card.kicker} · {i + 1} of {cards.length}
                    </p>
                    <p lang={course} className="ds-type-question-small">
                      {card.title}
                    </p>
                    <p className="flex items-center gap-1.5 ds-type-caption font-semibold text-ds-on-hero-soft">
                      <span lang={course}>{card.subtitle}</span>
                      <PracticeStars n={card.stars} size="xs" onDark />
                    </p>
                    <p className="mt-1 rounded-full border border-white/25 bg-white/15 px-2.5 py-0.5 ds-type-caption font-bold text-white">
                      {card.reason}
                    </p>
                  </div>
                  {/* In the grid flow (never absolute) so the title and reason pill can't sit under Alphonso. Hidden on
                      narrow viewports and, because the query is in rem, at large text sizes, like iOS/Android. */}
                  <div
                    data-hero-figure=""
                    className="relative z-[1] hidden items-end justify-center min-[30rem]:flex"
                  >
                    <img
                      src="/figures/alphonso-waving.webp"
                      alt=""
                      draggable={false}
                      className="h-[150px] w-auto max-w-none select-none drop-shadow-[0_9px_15px_rgba(0,0,0,.5)]"
                    />
                  </div>
                  <div className="relative z-[3] grid justify-items-center gap-2 pb-3.5">
                    <p className="ds-type-caption font-extrabold text-ds-call-mint">
                      <i
                        aria-hidden="true"
                        className="mr-1.5 inline-block size-1.5 rounded-full bg-ds-call-mint shadow-[0_0_0_3px_color-mix(in_srgb,var(--c-call-mint)_30%,transparent)]"
                      />
                      Alphonso is ready
                    </p>
                    <div className="flex items-start justify-center gap-8">
                      <button
                        type="button"
                        data-hero-call=""
                        onClick={() => card.open("call")}
                        aria-label={`Call Alphonso: ${card.title}`}
                        className="grid justify-items-center gap-1 text-ds-on-hero"
                      >
                        <span className="grid size-[58px] place-items-center rounded-full bg-ds-action text-ds-on-action shadow-[0_4px_0_var(--c-action-edge)]">
                          <DsIcon name="mic" className="size-6" />
                        </span>
                        <span aria-hidden="true" className="ds-type-caption font-extrabold">
                          Call
                        </span>
                      </button>
                      <button
                        type="button"
                        data-hero-chat=""
                        onClick={() => card.open("chat")}
                        aria-label={`Chat with Alphonso: ${card.title}`}
                        className="grid justify-items-center gap-1 text-ds-on-hero"
                      >
                        <span className="grid size-[52px] place-items-center rounded-full border-[1.5px] border-white/30 bg-white/20 backdrop-blur-[3px]">
                          <DsIcon name="words" className="size-5" />
                        </span>
                        <span aria-hidden="true" className="ds-type-caption font-extrabold">
                          Chat
                        </span>
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
            {cards.length > 1 && (
              <div role="group" aria-label="Choose a call" className="flex justify-center">
                {cards.map((card, i) => (
                  <button
                    key={card.key}
                    type="button"
                    data-hero-dot={i}
                    aria-label={`Show call ${i + 1} of ${cards.length}`}
                    aria-current={active === i ? "true" : undefined}
                    onClick={() => goTo(i)}
                    className="grid h-6 min-w-6 place-items-center"
                  >
                    <i
                      aria-hidden="true"
                      className={`block h-1.5 rounded-full ${active === i ? "w-[18px] bg-ds-choice" : "w-1.5 bg-ds-line"}`}
                    />
                  </button>
                ))}
              </div>
            )}
          </>
        ) : (
          <div
            data-hero-loading=""
            aria-busy="true"
            className="grid min-h-[340px] place-items-center rounded-[26px] bg-ds-hero ds-type-caption font-semibold text-ds-on-hero-soft"
          >
            Alphonso is picking your calls...
          </div>
        )}
      </section>

      {/* Conversations. */}
      <section aria-labelledby="conversations" className="grid gap-2.5">
        <h2 id="conversations" className="ds-type-headline font-extrabold text-ds-ink">
          Conversations
        </h2>
        <div role="group" aria-label="Level" className="flex flex-wrap gap-1.5">
          {(["All", ...LEVELS] as const).map((l) => (
            <button
              key={l}
              type="button"
              aria-pressed={level === l}
              onClick={() => setLevel(l)}
              className={`min-h-9 rounded-full border-2 px-3 ds-type-caption font-extrabold ${level === l ? "border-ds-brand bg-ds-brand text-ds-on-hero" : "border-ds-line bg-ds-card text-ds-ink-soft"}`}
            >
              {l}
            </button>
          ))}
        </div>
        <div className="grid grid-cols-2 gap-2.5">
          {shownScenarios.map((s, i) => {
            const n = stars("scenario", s.id);
            return (
              <motion.button
                {...enter(i)}
                key={s.id}
                type="button"
                data-scenario-tile={s.id}
                onClick={() => openScenario(s.id)}
                className="relative h-[140px] overflow-hidden rounded-[18px] bg-ds-hero bg-cover text-left shadow-[var(--ds-shadow-resting)]"
                style={{
                  backgroundImage: `url(${roomUrl(s.id)})`,
                  backgroundPosition: "center 30%",
                }}
              >
                <span
                  aria-hidden="true"
                  className="absolute inset-0"
                  style={{ background: TILE_SHADE }}
                />
                <span
                  aria-hidden="true"
                  className="absolute inset-0 z-[2] rounded-[inherit] shadow-[inset_0_0_0_1.5px_color-mix(in_srgb,var(--c-card)_55%,transparent)]"
                />
                <span
                  className={`absolute left-2 top-2 z-[1] rounded-[6px] px-1.5 ds-type-caption font-extrabold ${s.level === "Advanced" ? "bg-ds-brand text-ds-on-hero-kick" : "bg-ds-card/95 text-ds-brand"}`}
                >
                  {s.level}
                </span>
                {n >= 3 && (
                  <span
                    data-mastered=""
                    className="absolute right-2 top-2 z-[1] inline-flex items-center gap-0.5 rounded-full bg-ds-action py-0.5 pl-1.5 pr-2 ds-type-overline text-ds-on-action shadow-[0_2px_5px_-1px_rgba(176,122,18,.6)]"
                  >
                    <DsIcon name="check" className="size-3" />
                    Mastered
                  </span>
                )}
                <span className="absolute inset-x-2.5 bottom-2 z-[1] grid gap-0.5 text-ds-on-hero">
                  <span lang={course} className="ds-type-footnote font-extrabold leading-tight">
                    {s.title}
                  </span>
                  <PracticeStars n={n} onDark />
                </span>
              </motion.button>
            );
          })}
        </div>
      </section>

      {/* Campaigns: a rail, each with its own room, how far in, and a dot per scene. */}
      <section aria-labelledby="campaigns" className="grid gap-2.5">
        <div className="flex items-center justify-between">
          <h2 id="campaigns" className="ds-type-headline font-extrabold text-ds-ink">
            Campaigns
          </h2>
          <span className="ds-type-caption text-ds-choice">{campaigns.length} stories</span>
        </div>
        <div
          data-campaign-rail=""
          className="-mx-4 flex snap-x gap-2.5 overflow-x-auto px-4 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          {campaigns.map((c, i) => {
            const raw = CAMPAIGNS.find((x) => x.id === c.id)!;
            const progress = campaignProgress(c.id, rows);
            const label = !data
              ? ""
              : progress.done === 0
                ? "New"
                : `${progress.done}/${progress.total}`;
            return (
              <motion.button
                {...enter(i + 1)}
                key={c.id}
                type="button"
                data-campaign-card={c.id}
                aria-label={
                  data
                    ? `${c.title}, ${c.level}, ${progress.done} of ${progress.total} scenes done`
                    : undefined
                }
                onClick={() => openScene(c.id, nextSceneIndex(c.id, rows))}
                className="relative h-[132px] w-[160px] shrink-0 snap-start overflow-hidden rounded-[18px] bg-ds-hero bg-cover bg-center text-left text-ds-on-hero shadow-[var(--ds-shadow-resting)]"
                style={{ backgroundImage: `url(${campaignCover(raw)})` }}
              >
                <span
                  aria-hidden="true"
                  className="absolute inset-0"
                  style={{ background: RAIL_SHADE }}
                />
                <span className="absolute inset-x-2.5 bottom-2 z-[1] grid gap-0.5">
                  <span className="ds-type-overline text-ds-on-hero-kick">
                    {c.level} · {c.scenes.length} scenes
                  </span>
                  <span lang={course} className="ds-type-footnote font-extrabold leading-tight">
                    {c.title}
                  </span>
                  <span className="flex items-center gap-1.5" aria-hidden="true">
                    <span className="flex gap-[3px]">
                      {c.scenes.map((s, k) => (
                        <i
                          key={s.id}
                          data-scene-dot={progress.scenes[k] ? "done" : "todo"}
                          className={`block h-1 w-3 rounded-full ${progress.scenes[k] ? "bg-ds-action" : "bg-white/35"}`}
                        />
                      ))}
                    </span>
                    <span
                      data-campaign-progress=""
                      className="ds-type-overline text-ds-on-hero-soft"
                    >
                      {label}
                    </span>
                  </span>
                </span>
              </motion.button>
            );
          })}
        </div>
      </section>

      {/* Drills: two separate features, each with its own picture and a Start button. */}
      <section aria-labelledby="quick-practice" className="grid gap-2.5">
        <h2 id="quick-practice" className="ds-type-headline font-extrabold text-ds-ink">
          Quick practice
        </h2>
        <button
          type="button"
          data-say-the-picture-card=""
          onClick={() => setSayPicture(true)}
          className="flex items-stretch overflow-hidden rounded-[18px] border-2 border-b-4 border-ds-line bg-ds-card text-left"
        >
          <span
            aria-hidden="true"
            className="grid w-24 shrink-0 grid-cols-2 grid-rows-2 gap-1 bg-ds-choice-tint p-2"
          >
            {["hot_beverage", "airplane", "stethoscope", "spaghetti"].map((icon) => (
              <span key={icon} className="grid place-items-center rounded-lg bg-ds-card shadow-sm">
                <img src={`/icons3d/${icon}.png`} alt="" draggable={false} className="size-6" />
              </span>
            ))}
          </span>
          <span className="flex min-w-0 flex-1 flex-col justify-center gap-1 p-3">
            <span className="ds-type-headline font-extrabold text-ds-ink">Say the picture</span>
            <span className="ds-type-caption font-semibold text-ds-ink-soft">
              See a picture, say the word. 8 quick words.
            </span>
            <span className="mt-1 inline-flex items-center gap-1 self-start rounded-full bg-ds-choice px-3.5 py-1.5 ds-type-caption font-extrabold text-white shadow-[0_3px_0_var(--c-choice-edge)]">
              Start
              <DsIcon name="chevron" className="size-3" />
            </span>
          </span>
        </button>
        <button
          type="button"
          data-say-it-right-card=""
          onClick={() => setSayItRight(true)}
          className="flex items-stretch overflow-hidden rounded-[18px] border-2 border-b-4 border-ds-line bg-ds-card text-left"
        >
          <span
            aria-hidden="true"
            className="flex w-24 shrink-0 items-center justify-center gap-[3px] bg-ds-right-tint"
          >
            {[10, 22, 36, 18, 30, 12, 24].map((h, k) => (
              <i key={k} className="block w-1 rounded-full bg-ds-right" style={{ height: h }} />
            ))}
          </span>
          <span className="flex min-w-0 flex-1 flex-col justify-center gap-1 p-3">
            <span className="ds-type-headline font-extrabold text-ds-ink">Say it right</span>
            <span className="ds-type-caption font-semibold text-ds-ink-soft">
              Hear a word you learned, say it back. 8 quick words.
            </span>
            <span className="mt-1 inline-flex items-center gap-1 self-start rounded-full bg-ds-choice px-3.5 py-1.5 ds-type-caption font-extrabold text-white shadow-[0_3px_0_var(--c-choice-edge)]">
              Start
              <DsIcon name="chevron" className="size-3" />
            </span>
          </span>
        </button>
      </section>

      {/* Hector: Pro's one feature, quiet and last (hidden for Pro). */}
      <HectorInvite source="practice_hector_card" look="hub" />

      {sheet && (
        <PreCallSheet
          target={sheet.target}
          initialMode={sheet.mode}
          onClose={() => setSheet(null)}
          onStart={(mode) => {
            const target = sheet.start(mode);
            setSheet(null);
            onStart(target);
          }}
        />
      )}
    </div>
  );
}
