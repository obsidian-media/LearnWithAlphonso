import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import { DsIcon } from "../ds/DsIcon";
import { edgeButtonClass } from "../lesson/LessonParts";
import { HectorInvite } from "../HectorInvite";
import { PracticeStars, StarTally } from "./PracticeStars";
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
  continuePoint,
  nextSceneIndex,
  starLookup,
  starTally,
  todaysPick,
  type PracticeHubData,
} from "@/lib/practice-hub";
import { usePrefersReducedMotion } from "@/lib/use-prefers-reduced-motion";

/**
 * The Practice hub (visual round 6, part 5), drawn after the approved mock-up 09-practice-hub-mockup v3: Alphonso in
 * his café with a greeting, "Today's pick", "Continue", the campaigns as picture stories, Hector, and the scenarios
 * in their painted rooms with level chips. Every count and star comes from the catalog and the learner's rows.
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

const HEAD_SCRIM =
  "linear-gradient(180deg, color-mix(in srgb, var(--c-hero-b) 42%, transparent) 0%, transparent 32%, transparent 55%, var(--c-surface) 98%)";
// The rooms are light paintings: the text sits on a shade that reaches near-solid navy behind it (mock: 86% at the
// foot), starting high enough that the gold overline stays readable.
const CARD_SHADE =
  "linear-gradient(180deg, transparent 8%, color-mix(in srgb, var(--c-hero-b) 72%, transparent) 48%, color-mix(in srgb, var(--c-hero-b) 92%, transparent) 100%)";
const TILE_SHADE =
  "linear-gradient(180deg, transparent 30%, color-mix(in srgb, var(--c-hero-b) 78%, transparent) 62%, color-mix(in srgb, var(--c-hero-b) 92%, transparent) 100%)";

type Sheet = { target: PreCallTarget; start: (mode: CallMode) => StartTarget };

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
  const pick = useMemo(() => (data ? todaysPick(data) : null), [data]);
  const resume = useMemo(() => continuePoint(rows), [rows]);
  const scenarios = useMemo(() => SCENARIOS.map((s) => localizeScenario(s, course)), [course]);
  const campaigns = useMemo(() => CAMPAIGNS.map((c) => localizeCampaign(c, course)), [course]);
  const [level, setLevel] = useState<ScenarioLevel | "All">("All");
  const [sheet, setSheet] = useState<Sheet | null>(null);
  const greeting = GREETING[course];

  const openScenario = (id: string) => {
    const s = scenarios.find((x) => x.id === id)!;
    setSheet({
      target: {
        title: s.title,
        level: s.level,
        persona: personaOf("scenario", s.id, course) ?? "",
        opener: s.opener,
        lang: course,
      },
      start: (mode) => ({ kind: "scenario", scenarioId: s.id, mode }),
    });
  };
  const openScene = (campaignId: string, sceneIndex: number) => {
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
      },
      start: (mode) => ({ kind: "scene", campaignId: c.id, sceneIndex, mode }),
    });
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

  const pickScenario = pick ? scenarios.find((s) => s.id === pick.scenarioId) : undefined;
  const resumeCampaign = resume ? campaigns.find((c) => c.id === resume.campaignId) : undefined;
  const shownScenarios = level === "All" ? scenarios : scenarios.filter((s) => s.level === level);

  return (
    <div
      data-practice-hub=""
      className="ds-light bg-ds-surface pb-8 font-[family-name:var(--ds-font-body)] text-ds-ink"
    >
      {/* Alphonso in his café. */}
      <div className="relative h-[300px] overflow-hidden">
        <div
          aria-hidden="true"
          className="absolute inset-0 bg-cover"
          style={{ backgroundImage: `url(${roomUrl("coffee")})`, backgroundPosition: "center 30%" }}
        />
        <div aria-hidden="true" className="absolute inset-0" style={{ background: HEAD_SCRIM }} />
        <img
          src="/alphonso/lesson/talk.webp"
          alt=""
          draggable={false}
          className="absolute bottom-2 left-1/2 z-[1] w-[250px] max-w-none -translate-x-1/2 select-none drop-shadow-[0_10px_14px_color-mix(in_srgb,var(--c-ink)_18%,transparent)]"
        />
        <h1 className="absolute left-4 top-5 z-[2] ds-type-display text-ds-on-hero drop-shadow-[0_2px_8px_color-mix(in_srgb,var(--c-hero-b)_45%,transparent)]">
          Practice
        </h1>
        {data && (
          <StarTally
            earned={tally.earned}
            total={tally.total}
            className="absolute right-3.5 top-6 z-[2] border-transparent bg-ds-card/95"
          />
        )}
        <p className="absolute right-3 top-[76px] z-[2] max-w-[150px] rounded-[16px_16px_4px_16px] bg-ds-card px-3 py-2 shadow-[var(--ds-shadow-floating)]">
          <span lang={course} className="block ds-type-caption text-ds-ink">
            {greeting.line}
          </span>
          {greeting.gloss && (
            <span className="mt-0.5 block ds-type-caption font-semibold text-ds-ink-soft">
              {greeting.gloss}
            </span>
          )}
        </p>
      </div>

      <div className="relative z-[3] -mt-8 grid gap-3.5 px-4">
        {/* Today's pick. */}
        {pick && pickScenario && (
          <motion.section
            {...enter(0)}
            data-todays-pick={pick.scenarioId}
            aria-labelledby="todays-pick"
            className="grid gap-2 rounded-[22px] p-3.5 text-ds-on-hero shadow-[var(--ds-shadow-floating),inset_0_0_0_1px_color-mix(in_srgb,var(--c-action)_35%,transparent)]"
            style={{
              background:
                "radial-gradient(120% 90% at 100% 0%, var(--c-hero-a) 0%, var(--c-hero) 55%)",
            }}
          >
            <div className="flex items-center justify-between">
              <h2 id="todays-pick" className="ds-type-overline text-ds-on-hero-kick">
                Today's pick
              </h2>
              <PracticeStars n={stars("scenario", pick.scenarioId)} onDark />
            </div>
            <p lang={course} className="ds-type-question-small">
              {pickScenario.title}
            </p>
            <p className="ds-type-caption font-semibold text-ds-on-hero-soft">
              {pick.weakSpot ? (
                <>
                  A {pick.level.toLowerCase()} scene that makes you use{" "}
                  <em className="border-b-2 border-ds-action font-extrabold not-italic text-ds-on-hero">
                    {WEAK_SPOT_NAMES[pick.weakSpot] ?? pick.weakSpot}
                  </em>
                  , your top weak spot.
                </>
              ) : (
                <>
                  A {pick.level.toLowerCase()} scene at your level. Your weak spots will steer this
                  pick as you practice.
                </>
              )}
            </p>
            <button
              type="button"
              onClick={() => openScenario(pick.scenarioId)}
              className={edgeButtonClass("primary")}
            >
              <DsIcon name="mic" className="size-5" />
              Call Alphonso
            </button>
          </motion.section>
        )}

        {/* Continue. */}
        {resume && resumeCampaign && (
          <section aria-labelledby="continue" className="grid gap-2">
            <h2 id="continue" className="ds-type-headline font-extrabold text-ds-ink">
              Continue
            </h2>
            <button
              type="button"
              data-continue={`${resume.campaignId}:${resume.sceneIndex}`}
              onClick={() => openScene(resume.campaignId, resume.sceneIndex)}
              className="flex items-center gap-2.5 rounded-[18px] border-2 border-b-4 border-ds-line bg-ds-card p-2.5 text-left"
            >
              <span
                aria-hidden="true"
                className="size-14 shrink-0 rounded-[14px] bg-cover bg-center shadow-[inset_0_0_0_2px_color-mix(in_srgb,var(--c-card)_60%,transparent)]"
                style={{
                  backgroundImage: `url(${sceneRoom(resumeCampaign.id, resumeCampaign.scenes[resume.sceneIndex].id)})`,
                }}
              />
              <span className="min-w-0 flex-1">
                <span lang={course} className="block ds-type-headline font-extrabold text-ds-ink">
                  {resumeCampaign.title}
                </span>
                <span className="block ds-type-caption font-semibold text-ds-ink-soft">
                  Scene {resume.sceneIndex + 1} of {resumeCampaign.scenes.length} ·{" "}
                  <span lang={course}>{resumeCampaign.scenes[resume.sceneIndex].title}</span>
                </span>
                <span className="mt-1.5 flex items-center gap-1" aria-hidden="true">
                  {resumeCampaign.scenes.map((s, i) => {
                    const n = stars("scene", sceneKey(resumeCampaign.id, s.id));
                    if (n > 0) return <PracticeStars key={s.id} n={n} size="xs" />;
                    return (
                      <i
                        key={s.id}
                        className={
                          i === resume.sceneIndex
                            ? "mx-1 size-1.5 rounded-full bg-ds-action shadow-[0_0_0_3px_var(--c-action-tint)]"
                            : "ml-1 size-1.5 rounded-full bg-ds-line"
                        }
                      />
                    );
                  })}
                </span>
              </span>
              <span className="grid size-9 shrink-0 place-items-center rounded-full bg-ds-action text-ds-on-action shadow-[0_3px_0_var(--c-action-edge)]">
                <DsIcon name="play" className="size-4" />
              </span>
            </button>
          </section>
        )}

        {/* Campaigns. */}
        <section aria-labelledby="campaigns" className="mt-1 grid gap-3">
          <div className="flex items-center justify-between">
            <h2 id="campaigns" className="ds-type-headline font-extrabold text-ds-ink">
              Campaigns
            </h2>
            <span className="ds-type-caption text-ds-choice">{campaigns.length} stories</span>
          </div>
          {campaigns.map((c, i) => {
            const raw = CAMPAIGNS.find((x) => x.id === c.id)!;
            return (
              <motion.button
                {...enter(i + 1)}
                key={c.id}
                type="button"
                data-campaign-card={c.id}
                onClick={() => openScene(c.id, nextSceneIndex(c.id, rows))}
                className="relative h-[156px] overflow-hidden rounded-[22px] bg-ds-hero bg-cover bg-center text-left text-ds-on-hero shadow-[var(--ds-shadow-floating)]"
                style={{ backgroundImage: `url(${campaignCover(raw)})` }}
              >
                <span
                  aria-hidden="true"
                  className="absolute inset-0"
                  style={{ background: CARD_SHADE }}
                />
                <span
                  aria-hidden="true"
                  className="absolute inset-0 z-[2] rounded-[inherit] shadow-[inset_0_0_0_1px_color-mix(in_srgb,var(--c-on-hero-kick)_50%,transparent)]"
                />
                <span className="absolute right-2.5 top-2.5 z-[1] rounded-[8px] bg-ds-card/95 px-2 py-0.5 ds-type-caption font-extrabold text-ds-brand">
                  {c.level}
                </span>
                <span className="absolute inset-x-3 bottom-2.5 z-[1] grid gap-1">
                  <span className="ds-type-overline text-ds-on-hero-kick">
                    Campaign · {c.scenes.length} scenes
                  </span>
                  <span lang={course} className="ds-type-question-small">
                    {c.title}
                  </span>
                  <span className="flex items-end gap-2">
                    {c.scenes.map((s) => (
                      <span key={s.id} className="grid justify-items-center gap-0.5">
                        <i
                          aria-hidden="true"
                          className="block size-[30px] rounded-[9px] bg-cover bg-center shadow-[0_0_0_1.5px_var(--c-on-hero)]"
                          style={{ backgroundImage: `url(${sceneRoom(c.id, s.id)})` }}
                        />
                        <PracticeStars n={stars("scene", sceneKey(c.id, s.id))} size="xs" onDark />
                      </span>
                    ))}
                  </span>
                </span>
              </motion.button>
            );
          })}
        </section>

        {/* Hector: Pro's one feature, offered where the learner already practices speaking (hidden for Pro). */}
        <HectorInvite source="practice_hector_card" look="hub" />

        {/* Scenarios. */}
        <section aria-labelledby="scenarios" className="mt-1 grid gap-3">
          <div className="flex items-center justify-between">
            <h2 id="scenarios" className="ds-type-headline font-extrabold text-ds-ink">
              Scenarios
            </h2>
            {data && <StarTally earned={tally.earned} total={tally.total} />}
          </div>
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
            {shownScenarios.map((s, i) => (
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
                <span className="absolute inset-x-2.5 bottom-2 z-[1] grid gap-0.5 text-ds-on-hero">
                  <span lang={course} className="ds-type-footnote font-extrabold leading-tight">
                    {s.title}
                  </span>
                  <PracticeStars n={stars("scenario", s.id)} onDark />
                </span>
              </motion.button>
            ))}
          </div>
        </section>
      </div>

      {sheet && (
        <PreCallSheet
          target={sheet.target}
          initialMode={initialMode}
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
