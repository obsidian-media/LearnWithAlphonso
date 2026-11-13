import { useEffect, useMemo, useState } from "react";
import { track } from "../../lib/analytics";
import { LessonAnswer, VerdictSheet, edgeButtonClass } from "../lesson/LessonParts";
import { canSpeak, speak } from "../../lib/speech";
import { expressionSrc, type LessonExpression } from "../../lib/lesson-stage";
import {
  AGE_CHOICES,
  COURSE_NAMES,
  MINI_LESSONS,
  chooseAge,
  greetingFor,
  listInWords,
  questionStepsFor,
  roomForAnswers,
  roomSrc,
  type AgeChoice,
  type FirstRunDraft,
  type FirstRunMode,
  type FirstRunStore,
  type QuestionStep,
} from "../../lib/first-run";
import { planFor, type FirstRunPlan } from "../../lib/first-run-plan";
import {
  COUNTRIES,
  NATIVE_LANGUAGES,
  type DailyMinutes,
  type Goal,
  type Interest,
  type ProfileCourse,
  type SelfLevel,
} from "../../lib/learner-profile";
import {
  AgeCard,
  ChoiceRow,
  ChoiceTile,
  CountryFlag,
  CourseFlag,
  FirstRunBubble,
  FirstRunFooter,
  FirstRunHud,
  FirstRunRoom,
  FirstRunScreen,
  Hint,
  IconBadge,
  InterestChip,
  PickerRow,
  PickerSheet,
  SwitchRow,
} from "./FirstRunParts";
import { FirstRunIcon, type FirstRunIconName } from "./FirstRunIcons";
import { Under13Stop } from "./Under13Stop";

export const GOAL_CHOICES: { id: Goal; label: string; icon: FirstRunIconName; mode: string }[] = [
  { id: "travel", label: "Travel", icon: "plane", mode: "Travel mode" },
  { id: "work", label: "Work", icon: "brief", mode: "Work mode" },
  { id: "school", label: "School", icon: "cap", mode: "School mode" },
  { id: "family", label: "Family", icon: "home", mode: "Family mode" },
  { id: "exam", label: "An exam", icon: "medal", mode: "Exam mode" },
  { id: "fun", label: "Just for fun", icon: "smile", mode: "Fun mode" },
];
const LEVEL_CHOICES: { id: SelfLevel; label: string; sub: string; icon: FirstRunIconName }[] = [
  { id: "new", label: "I'm brand new", sub: "Start from the very beginning", icon: "seed" },
  { id: "some", label: "I know some", sub: "Words and simple sentences", icon: "sprout" },
  {
    id: "confident",
    label: "I'm fairly confident",
    sub: "I can hold a conversation",
    icon: "tree",
  },
];
const TIME_CHOICES: { id: DailyMinutes; sub: string }[] = [
  { id: 5, sub: "Casual" },
  { id: 10, sub: "Regular" },
  { id: 15, sub: "Serious" },
  { id: 20, sub: "Intense" },
];
export const INTEREST_CHOICES: { id: Interest; label: string; icon: FirstRunIconName }[] = [
  { id: "food", label: "Food", icon: "food" },
  { id: "travel", label: "Travel", icon: "plane" },
  { id: "sport", label: "Sport", icon: "ball" },
  { id: "music", label: "Music", icon: "music" },
  { id: "movies", label: "Movies & TV", icon: "film" },
  { id: "business", label: "Business", icon: "brief" },
  { id: "tech", label: "Tech", icon: "chip" },
  { id: "nature", label: "Nature", icon: "leaf" },
  { id: "art", label: "Art", icon: "brush" },
  { id: "family", label: "Family", icon: "people" },
];
const COURSE_ORDER: ProfileCourse[] = ["en", "fr", "es"];

function displayNames(type: "language" | "region") {
  try {
    return new Intl.DisplayNames(["en"], { type });
  } catch {
    return null;
  }
}
export function languageName(code: string): string {
  return displayNames("language")?.of(code) ?? code;
}
export function countryName(code: string): string {
  return displayNames("region")?.of(code) ?? code;
}

/** The phone's own language and region, as a suggestion only (nothing is looked up over the network). */
function suggestFromBrowser(): { nativeLanguage?: string; country?: string } {
  if (typeof navigator === "undefined") return {};
  const tag = navigator.language || "";
  const [lang, region] = tag.split("-");
  return {
    nativeLanguage: (NATIVE_LANGUAGES as readonly string[]).includes(lang) ? lang : undefined,
    country:
      region && (COUNTRIES as readonly string[]).includes(region.toUpperCase())
        ? region.toUpperCase()
        : undefined,
  };
}

function say(text: string) {
  speak(text.replace(/[“”]/g, ""), "en-US");
}

const figure = (e: LessonExpression) => expressionSrc(e);

type Stage = QuestionStep | "taste" | "plan" | "signin";

export type FirstRunFlowProps = {
  mode: FirstRunMode;
  store: FirstRunStore;
  /** Complete your profile: the answers already on the account, and the course being studied. */
  prefill?: FirstRunDraft;
  course?: ProfileCourse;
  /** Leaving from the first screen (new: back to the landing page; complete: Not now). */
  onExit: () => void;
  onUnder13Ok: () => void;
  /** New learners: the sign-in screen's buttons. */
  onGoogle?: () => void;
  onEmail?: () => void;
  onHaveAccount?: () => void;
  /** Complete your profile: "Save my plan". */
  onSave?: (answers: FirstRunDraft) => Promise<void> | void;
};

export function FirstRunFlow(props: FirstRunFlowProps) {
  const { mode, store } = props;
  const [blocked, setBlocked] = useState(() => store.isBlocked());
  const [draft, setDraft] = useState<FirstRunDraft>(() => ({
    ...(props.prefill ?? {}),
    ...(props.course ? { course: props.course } : {}),
    ...store.readDraft(),
  }));
  const questions = questionStepsFor(mode);
  const stages: Stage[] = [
    ...questions,
    "taste",
    "plan",
    ...(mode === "new" ? ["signin" as const] : []),
  ];
  const [index, setIndex] = useState(0);
  const stage = stages[index];
  // Only the step name leaves the device, never an answer.
  useEffect(() => {
    void track("onboarding_step", { step: stage });
  }, [stage]);

  function update(patch: FirstRunDraft) {
    setDraft((d) => {
      const next = { ...d, ...patch };
      store.writeDraft(next);
      return next;
    });
  }
  const next = () => setIndex((i) => Math.min(i + 1, stages.length - 1));
  const back = () => (index === 0 ? props.onExit() : setIndex((i) => i - 1));

  // Another tab may have hit the block: check again on every step.
  useEffect(() => {
    if (store.isBlocked()) setBlocked(true);
  }, [index, store]);

  if (blocked) return <Under13Stop onOk={props.onUnder13Ok} />;

  const course: ProfileCourse = draft.course ?? props.course ?? "en";
  const courseName = COURSE_NAMES[course];
  const name = draft.name?.trim() || "";
  const questionNumber = questions.indexOf(stage as QuestionStep) + 1;
  const room = roomSrc(roomForAnswers({ course: draft.course, goal: draft.goal }));
  const hud = (opts: { skip?: () => void } = {}) => (
    <FirstRunHud
      step={questionNumber}
      total={questions.length}
      onBack={back}
      backLabel={index === 0 && mode === "complete" ? "Not now" : "Back"}
      onSkip={opts.skip}
    />
  );
  const playable = canSpeak();
  const bubble = (title: string, sub?: string) => (
    <FirstRunBubble title={title} sub={sub} onPlay={playable ? () => say(title) : undefined} />
  );

  switch (stage) {
    case "name":
      return (
        <FirstRunScreen>
          <FirstRunRoom
            room={roomSrc("room-light")}
            figure={figure("talk")}
            figureAlt="Alphonso, waving hello"
            size="tall"
            top={hud({
              skip: () => {
                update({ name: undefined });
                next();
              },
            })}
          />
          {bubble("Hi, I'm Alphonso! What should I call you?", "Just your first name.")}
          <label className="mx-4 mt-4 flex items-center rounded-[var(--ds-radius-control)] border-2 border-ds-brand bg-ds-card px-4 py-3 focus-within:shadow-[0_0_0_3px_var(--c-choice-tint)]">
            <span className="sr-only">Your first name</span>
            <input
              value={draft.name ?? ""}
              onChange={(e) => update({ name: e.target.value.slice(0, 40) })}
              autoComplete="given-name"
              maxLength={40}
              placeholder="Your first name"
              className="min-w-0 flex-1 bg-transparent ds-type-title text-ds-brand caret-[var(--c-action)] outline-none placeholder:text-ds-ink-faint"
            />
          </label>
          <FirstRunFooter label="Nice to meet you" onClick={next} disabled={!name} />
        </FirstRunScreen>
      );

    case "course": {
      const picked = draft.course;
      const title = picked
        ? `${greetingFor(picked, name)} ${COURSE_NAMES[picked]} it is.`
        : "What do you want to learn?";
      return (
        <FirstRunScreen>
          <FirstRunRoom
            room={room}
            figure={figure(picked ? "happy" : "talk")}
            figureAlt="Alphonso"
            top={hud()}
            chip={picked ? `Now in ${COURSE_NAMES[picked]}` : null}
          />
          {bubble(title, "Pick the language you want to learn.")}
          <div className="grid gap-2.5 px-4 pt-4">
            {COURSE_ORDER.map((c) => (
              <ChoiceRow
                key={c}
                lead={<CourseFlag course={c} />}
                label={COURSE_NAMES[c]}
                selected={picked === c}
                onClick={() => update({ course: c })}
              />
            ))}
          </div>
          <FirstRunFooter label="Continue" onClick={next} disabled={!picked} />
        </FirstRunScreen>
      );
    }

    case "about":
      return (
        <AboutStep
          draft={draft}
          update={update}
          room={room}
          hud={hud()}
          bubble={bubble(
            "Tell me a bit about you.",
            "I'll use your language to explain things later.",
          )}
          onNext={next}
        />
      );

    case "goal": {
      const g = GOAL_CHOICES.find((x) => x.id === draft.goal);
      return (
        <FirstRunScreen>
          <FirstRunRoom
            room={room}
            figure={figure("talk")}
            figureAlt="Alphonso"
            top={hud()}
            chip={g?.mode ?? null}
          />
          {bubble(`Why are you learning ${courseName}?`)}
          <div className="grid grid-cols-2 gap-2.5 px-4 pt-4">
            {GOAL_CHOICES.map((x) => (
              <ChoiceTile
                key={x.id}
                icon={x.icon}
                label={x.label}
                selected={draft.goal === x.id}
                onClick={() => update({ goal: x.id })}
              />
            ))}
          </div>
          <FirstRunFooter label="Continue" onClick={next} disabled={!draft.goal} />
        </FirstRunScreen>
      );
    }

    case "level":
      return (
        <FirstRunScreen>
          <FirstRunRoom
            room={room}
            figure={figure("neutral")}
            figureAlt="Alphonso, listening"
            top={hud()}
          />
          {bubble(`How much ${courseName} do you know?`)}
          <div className="grid gap-2.5 px-4 pt-4">
            {LEVEL_CHOICES.map((x) => (
              <ChoiceRow
                key={x.id}
                lead={<IconBadge name={x.icon} on={draft.level === x.id} />}
                label={x.label}
                sub={x.sub}
                selected={draft.level === x.id}
                onClick={() => update({ level: x.id })}
              />
            ))}
          </div>
          {(draft.level === "some" || draft.level === "confident") && (
            <Hint>
              {mode === "new"
                ? "After you sign in, a 3-minute placement test can find your exact starting point."
                : "At the end, a 3-minute placement test can find your exact starting point."}
            </Hint>
          )}
          <FirstRunFooter label="Continue" onClick={next} disabled={!draft.level} />
        </FirstRunScreen>
      );

    case "time":
      return (
        <FirstRunScreen>
          <FirstRunRoom room={room} figure={figure("talk")} figureAlt="Alphonso" top={hud()} />
          {bubble("How much time a day feels right?", "You can change it any time.")}
          <div className="grid gap-2.5 px-4 pt-4">
            {TIME_CHOICES.map((x) => (
              <ChoiceRow
                key={x.id}
                lead={<IconBadge name="clock" on={draft.dailyMinutes === x.id} />}
                label={`${x.id} minutes`}
                sub={x.sub}
                selected={draft.dailyMinutes === x.id}
                onClick={() => update({ dailyMinutes: x.id })}
              />
            ))}
          </div>
          <FirstRunFooter label="Continue" onClick={next} disabled={!draft.dailyMinutes} />
        </FirstRunScreen>
      );

    case "age":
      return (
        <AgeStep
          room={room}
          hud={hud()}
          bubble={bubble("How old are you?", "So we keep the app right for you.")}
          onChoose={(choice) => {
            if (chooseAge(store, choice) === "blocked") {
              setDraft({});
              setBlocked(true);
              return;
            }
            setDraft(store.readDraft());
            next();
          }}
        />
      );

    case "interests": {
      const chosen = draft.interests ?? [];
      return (
        <FirstRunScreen>
          <FirstRunRoom
            room={room}
            figure={figure("happy")}
            figureAlt="Alphonso, smiling"
            top={hud({
              skip: () => {
                update({ interests: [] });
                next();
              },
            })}
          />
          {bubble("What do you love talking about?", "Pick as many as you like.")}
          <div className="flex flex-wrap gap-2 px-4 pt-4">
            {INTEREST_CHOICES.map((x) => (
              <InterestChip
                key={x.id}
                icon={x.icon}
                label={x.label}
                selected={chosen.includes(x.id)}
                onClick={() =>
                  update({
                    interests: chosen.includes(x.id)
                      ? chosen.filter((i) => i !== x.id)
                      : [...chosen, x.id],
                  })
                }
              />
            ))}
          </div>
          <FirstRunFooter label="Continue" onClick={next} />
        </FirstRunScreen>
      );
    }

    case "taste":
      return <TasteStep course={course} name={name} onBack={back} onDone={next} />;

    case "plan":
      return (
        <PlanStep
          draft={draft}
          course={course}
          name={name}
          onBack={back}
          ctaLabel="Save my plan"
          onSave={async () => {
            if (mode === "complete") await props.onSave?.(draft);
            else next();
          }}
        />
      );

    case "signin":
      return (
        <SignInStep
          draft={draft}
          course={course}
          name={name}
          onBack={back}
          onGoogle={() => props.onGoogle?.()}
          onEmail={() => props.onEmail?.()}
          onHaveAccount={() => props.onHaveAccount?.()}
        />
      );
  }
}

// ---------------------------------------------------------------- about you

function AboutStep({
  draft,
  update,
  room,
  hud,
  bubble,
  onNext,
}: {
  draft: FirstRunDraft;
  update: (p: FirstRunDraft) => void;
  room: string;
  hud: React.ReactNode;
  bubble: React.ReactNode;
  onNext: () => void;
}) {
  const [open, setOpen] = useState<null | "language" | "country">(null);
  useEffect(() => {
    if (draft.nativeLanguage && draft.country) return;
    const s = suggestFromBrowser();
    const patch: FirstRunDraft = {};
    if (!draft.nativeLanguage && s.nativeLanguage) patch.nativeLanguage = s.nativeLanguage as never;
    if (!draft.country && s.country) patch.country = s.country as never;
    if (Object.keys(patch).length) update(patch);
    // Suggest once, on arrival.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const languages = useMemo(
    () =>
      NATIVE_LANGUAGES.map((c) => ({ id: c, label: languageName(c) })).sort((a, b) =>
        a.label.localeCompare(b.label),
      ),
    [],
  );
  const countries = useMemo(
    () =>
      COUNTRIES.map((c) => ({ id: c, label: countryName(c), lead: <CountryFlag code={c} /> })).sort(
        (a, b) => a.label.localeCompare(b.label),
      ),
    [],
  );
  return (
    <FirstRunScreen>
      <FirstRunRoom
        room={room}
        figure={figure("neutral")}
        figureAlt="Alphonso, listening"
        top={hud}
      />
      {bubble}
      <div className="grid gap-2.5 px-4 pt-4">
        <PickerRow
          overline="I speak"
          value={draft.nativeLanguage ? languageName(draft.nativeLanguage) : "Choose a language"}
          lead={<IconBadge name="globe" on={false} />}
          onOpen={() => setOpen("language")}
        />
        <PickerRow
          overline="I'm joining from"
          value={draft.country ? countryName(draft.country) : "Choose a country"}
          lead={
            draft.country ? (
              <CountryFlag code={draft.country} />
            ) : (
              <IconBadge name="pin" on={false} />
            )
          }
          onOpen={() => setOpen("country")}
        />
        <SwitchRow
          label="Show my flag on leaderboards"
          sub="Off unless you turn it on. You can change it in Profile."
          checked={draft.showFlag === true}
          onChange={(v) => update({ showFlag: v })}
        />
      </div>
      <FirstRunFooter
        label="Continue"
        onClick={onNext}
        disabled={!draft.nativeLanguage || !draft.country}
      />
      {open === "language" && (
        <PickerSheet
          title="I speak"
          searchLabel="Search languages"
          items={languages}
          selected={draft.nativeLanguage}
          onPick={(id) => {
            update({ nativeLanguage: id as never });
            setOpen(null);
          }}
          onClose={() => setOpen(null)}
        />
      )}
      {open === "country" && (
        <PickerSheet
          title="I'm joining from"
          searchLabel="Search countries"
          items={countries}
          selected={draft.country}
          onPick={(id) => {
            update({ country: id as never });
            setOpen(null);
          }}
          onClose={() => setOpen(null)}
        />
      )}
    </FirstRunScreen>
  );
}

// ---------------------------------------------------------------- age

function AgeStep({
  room,
  hud,
  bubble,
  onChoose,
}: {
  room: string;
  hud: React.ReactNode;
  bubble: React.ReactNode;
  onChoose: (choice: AgeChoice) => void;
}) {
  // Never pre-picked, and never remembered from an earlier visit: the screen must not suggest an answer.
  const [picked, setPicked] = useState<AgeChoice | null>(null);
  return (
    <FirstRunScreen>
      <FirstRunRoom
        room={room}
        figure={figure("neutral")}
        figureAlt="Alphonso, listening"
        top={hud}
      />
      {bubble}
      <div className="grid grid-cols-3 gap-2.5 px-4 pt-4">
        {AGE_CHOICES.map((c) => (
          <AgeCard
            key={c.id}
            big={c.big}
            small={c.small}
            selected={picked === c.id}
            onClick={() => setPicked(c.id)}
          />
        ))}
      </div>
      <FirstRunFooter
        label="Continue"
        onClick={() => picked && onChoose(picked)}
        disabled={!picked}
      />
    </FirstRunScreen>
  );
}

// ---------------------------------------------------------------- first taste

function TasteStep({
  course,
  name,
  onBack,
  onDone,
}: {
  course: ProfileCourse;
  name: string;
  onBack: () => void;
  onDone: () => void;
}) {
  const items = MINI_LESSONS[course];
  const [i, setI] = useState(0);
  const [picked, setPicked] = useState<number | null>(null);
  const [checked, setChecked] = useState(false);
  const q = items[i];
  const right = picked === q.answer;
  const praise = course === "es" ? "¡Muy bien" : course === "fr" ? "Très bien" : "Well done";
  return (
    <FirstRunScreen>
      <FirstRunRoom
        room={roomSrc(roomForAnswers({ course }))}
        figure={figure(checked ? (right ? "happy" : "hmm") : picked === null ? "talk" : "neutral")}
        figureAlt="Alphonso"
        top={<FirstRunHud step={0} total={0} onBack={onBack} showCounter={false} />}
      />
      <FirstRunBubble
        title={q.prompt}
        sub={`First taste · ${i + 1} of ${items.length}`}
        onPlay={
          canSpeak() && q.say
            ? () => speak(q.say!, course === "en" ? "en-US" : course === "fr" ? "fr-FR" : "es-MX")
            : undefined
        }
        playLabel="Hear it"
      />
      <div className="grid gap-2 px-4 pt-4">
        {q.choices.map((choice, n) => (
          <LessonAnswer
            key={choice}
            index={n}
            label={choice}
            checked={checked}
            isPicked={picked === n}
            isRight={n === q.answer}
            disabled={checked}
            onClick={() => setPicked(n)}
          />
        ))}
      </div>
      {!checked ? (
        <FirstRunFooter label="Check" onClick={() => setChecked(true)} disabled={picked === null} />
      ) : (
        <div className="mt-auto">
          <VerdictSheet
            correct={right}
            title={right ? (name ? `${praise}, ${name}!` : `${praise}!`) : "Not quite"}
            correctAnswer={q.choices[q.answer]}
            explanation={q.why}
            continueLabel="Next"
            onContinue={() => {
              if (i + 1 < items.length) {
                setI(i + 1);
                setPicked(null);
                setChecked(false);
              } else onDone();
            }}
          />
        </div>
      )}
    </FirstRunScreen>
  );
}

// ---------------------------------------------------------------- plan

function formatDay(iso: string): string {
  return new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
  });
}

function usePlan(draft: FirstRunDraft, course: ProfileCourse): FirstRunPlan | null {
  const [plan, setPlan] = useState<FirstRunPlan | null>(null);
  useEffect(() => {
    let live = true;
    // The course content is large; it loads only when the plan is drawn.
    void import("../../data/courses").then(({ getCourse }) => {
      if (!live) return;
      setPlan(
        planFor({
          units: getCourse(course).curriculum,
          level: draft.level,
          dailyMinutes: draft.dailyMinutes,
          now: new Date(),
        }),
      );
    });
    return () => {
      live = false;
    };
  }, [course, draft.level, draft.dailyMinutes]);
  return plan;
}

const NODE_SPOTS = [
  "left-[6%] top-[10%]",
  "left-1/2 top-[48%] -translate-x-1/2",
  "right-[6%] top-[10%]",
];

function PlanStep({
  draft,
  course,
  name,
  onBack,
  ctaLabel,
  onSave,
}: {
  draft: FirstRunDraft;
  course: ProfileCourse;
  name: string;
  onBack: () => void;
  ctaLabel: string;
  onSave: () => Promise<void> | void;
}) {
  const plan = usePlan(draft, course);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const title = `${name ? `${name}, here's` : "Here's"} your ${COURSE_NAMES[course]} plan!`;
  return (
    <FirstRunScreen>
      <div className="flex items-center px-4 pt-4">
        <button
          type="button"
          onClick={onBack}
          aria-label="Back"
          className="grid size-11 place-items-center rounded-full bg-ds-card text-ds-brand shadow-[var(--ds-shadow-resting)]"
        >
          <FirstRunIcon name="back" className="size-5" />
        </button>
      </div>
      <div className="pt-12">
        <FirstRunBubble title={title} onPlay={canSpeak() ? () => say(title) : undefined} />
      </div>
      <div
        data-plan-path=""
        className="relative mx-4 mt-4 h-[224px] overflow-hidden rounded-[var(--ds-radius-bubble)] border-2 border-ds-line bg-ds-card"
      >
        <svg
          aria-hidden="true"
          viewBox="0 0 268 172"
          preserveAspectRatio="none"
          className="absolute inset-0 size-full"
        >
          <path
            d="M44 52 C 110 52, 100 120, 134 120 S 200 52, 226 52"
            fill="none"
            stroke="var(--c-action)"
            strokeWidth={4}
            strokeDasharray="2 9"
            strokeLinecap="round"
          />
        </svg>
        {plan ? (
          <ol aria-label="Your first units">
            {plan.nodes.map((n, k) => (
              <li
                key={n.title}
                className={`absolute grid w-[92px] justify-items-center gap-1 text-center ds-type-caption text-ds-brand ${NODE_SPOTS[k]}`}
              >
                <span
                  aria-hidden="true"
                  className={`size-[72px] rounded-full bg-cover bg-center ${
                    k === 0
                      ? "shadow-[0_0_0_3px_var(--c-card),0_0_0_6px_var(--c-brand)]"
                      : k === 1
                        ? "shadow-[0_0_0_3px_var(--c-card),0_0_0_6px_var(--c-action)]"
                        : "shadow-[0_0_0_3px_var(--c-card),0_0_0_6px_var(--c-line)] grayscale-[0.6]"
                  }`}
                  style={{ backgroundImage: `url(${n.room})` }}
                />
                <span>
                  {k + 1} · {n.title}
                </span>
              </li>
            ))}
          </ol>
        ) : (
          <p
            role="status"
            className="absolute inset-0 grid place-items-center ds-type-footnote text-ds-ink-soft"
          >
            Drawing your path…
          </p>
        )}
      </div>
      {plan && (
        <div className="mx-4 mt-3 flex items-center gap-3 rounded-[var(--ds-radius-control)] bg-ds-hero px-4 py-3 text-ds-on-hero">
          <FirstRunIcon name="cal" className="size-6 shrink-0 text-ds-action" />
          <div>
            <p className="ds-type-headline font-extrabold">
              {plan.goalUnitTitle} by {formatDay(plan.goalDate)}
            </p>
            <p className="ds-type-caption font-semibold text-ds-on-hero-soft">
              {draft.dailyMinutes ?? 10} minutes a day
            </p>
          </div>
        </div>
      )}
      <ul aria-label="Your team" className="mx-4 mt-3 grid grid-cols-2 gap-2.5">
        <TeamMate face={expressionSrc("happy")} name="Alphonso" job="Daily lessons" />
        <TeamMate face="/firstrun/hector-happy.webp" name="Hector" job="Real conversations" pro />
      </ul>
      {error && (
        <p role="alert" className="mx-4 mt-3 ds-type-footnote text-ds-wrong-ink">
          {error}
        </p>
      )}
      <FirstRunFooter
        label={busy ? "Saving…" : ctaLabel}
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          setError(null);
          try {
            await onSave();
          } catch (e) {
            setError(e instanceof Error ? e.message : "Couldn't save. Try again.");
          } finally {
            setBusy(false);
          }
        }}
      />
    </FirstRunScreen>
  );
}

function TeamMate({
  face,
  name,
  job,
  pro = false,
}: {
  face: string;
  name: string;
  job: string;
  pro?: boolean;
}) {
  return (
    <li className="flex items-center gap-2.5 rounded-[var(--ds-radius-control)] border-2 border-ds-line bg-ds-card px-3 py-2">
      <span
        aria-hidden="true"
        className="size-11 shrink-0 rounded-full bg-ds-sunk bg-[length:175%] bg-[center_16%] bg-no-repeat"
        style={{ backgroundImage: `url(${face})` }}
      />
      <span className="min-w-0">
        <span className="block ds-type-footnote font-extrabold text-ds-brand">
          {name}
          {pro && (
            <span className="ml-1.5 rounded-[5px] bg-ds-action px-1 align-[2px] ds-type-overline text-ds-on-action">
              PRO
            </span>
          )}
        </span>
        <span className="block ds-type-caption font-semibold text-ds-ink-soft">{job}</span>
      </span>
    </li>
  );
}

// ---------------------------------------------------------------- sign in

export function planSummary(draft: FirstRunDraft, course: ProfileCourse): string[] {
  const goal = GOAL_CHOICES.find((g) => g.id === draft.goal)?.label.toLowerCase();
  const level = LEVEL_CHOICES.find((l) => l.id === draft.level)?.label;
  const lines = [
    [`${COURSE_NAMES[course]}${goal ? ` for ${goal}` : ""}`, level].filter(Boolean).join(" · "),
    `${draft.dailyMinutes ?? 10} minutes a day`,
  ];
  const interests = (draft.interests ?? [])
    .map((i) => INTEREST_CHOICES.find((c) => c.id === i)?.label.toLowerCase())
    .filter((x): x is string => Boolean(x));
  if (interests.length) {
    const words = listInWords(interests);
    lines.push(words.charAt(0).toUpperCase() + words.slice(1));
  }
  return lines;
}

function SignInStep({
  draft,
  course,
  name,
  onBack,
  onGoogle,
  onEmail,
  onHaveAccount,
}: {
  draft: FirstRunDraft;
  course: ProfileCourse;
  name: string;
  onBack: () => void;
  onGoogle: () => void;
  onEmail: () => void;
  onHaveAccount: () => void;
}) {
  const lines = planSummary(draft, course);
  const icons: FirstRunIconName[] = ["target", "clock", "food"];
  const title = name ? `Let's save your plan, ${name}.` : "Let's save your plan.";
  return (
    <FirstRunScreen>
      <FirstRunRoom
        room={roomSrc(roomForAnswers({ course }))}
        figure={figure("talk")}
        figureAlt="Alphonso"
        top={<FirstRunHud step={0} total={0} onBack={onBack} showCounter={false} />}
      />
      <FirstRunBubble
        title={title}
        sub="So it follows you to any device."
        onPlay={canSpeak() ? () => say(title) : undefined}
      />
      <section
        aria-label="Your plan"
        className="mx-4 mt-4 grid gap-1.5 rounded-[var(--ds-radius-bubble)] border-2 border-dashed border-ds-action bg-ds-card px-3.5 py-3"
      >
        <p className="ds-type-overline text-ds-action-text">Your plan</p>
        {lines.map((l, k) => (
          <p key={l} className="flex items-center gap-2 ds-type-footnote font-bold text-ds-brand">
            <FirstRunIcon
              name={icons[k] ?? "food"}
              className="size-[18px] shrink-0 text-ds-action-text"
            />
            {l}
          </p>
        ))}
      </section>
      <div className="grid gap-2.5 px-4 pt-4">
        <button type="button" onClick={onGoogle} className={edgeButtonClass("secondary")}>
          <img src="/brand/google-g.svg" alt="" width={20} height={20} className="size-5" />
          Continue with Google
        </button>
        <button type="button" onClick={onEmail} className={edgeButtonClass("secondary")}>
          <FirstRunIcon name="mail" className="size-5" />
          Continue with email
        </button>
        <button type="button" onClick={onHaveAccount} className={edgeButtonClass("tertiary")}>
          I already have an account
        </button>
      </div>
      <p className="px-6 pb-6 pt-1 text-center ds-type-caption font-semibold text-ds-ink-soft">
        By continuing you agree to the{" "}
        <a href="/terms" className="text-ds-brand underline">
          Terms
        </a>{" "}
        and{" "}
        <a href="/privacy" className="text-ds-brand underline">
          Privacy Policy
        </a>
        .
      </p>
    </FirstRunScreen>
  );
}
