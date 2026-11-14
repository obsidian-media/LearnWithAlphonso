import { Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { LEARNER_PROFILE_KEY, parseLearnerProfile } from "@/lib/learner-profile";
import { MobileFrame } from "@/components/AppShell";
import { GoalCard } from "@/components/GoalCard";
import { COURSES } from "@/data/courses";
import { saveGoal } from "@/lib/learning-goal-client";
import { usePath } from "@/lib/learning-path-client";
import {
  switchableTypes,
  PATH_TYPE_INFO,
  type LearningPath,
  type PathType,
  type RecoveryOption,
  type RoadStop,
} from "@/lib/path-plan";
import { useProgress } from "@/lib/progress";
import { BackLink, ItemLink, ItemRow, MixBar, TYPE_STYLE, TypeBadge, shortDate } from "./PathParts";

/**
 * The learning path screens (mock: mocks-r8 Feature 2, layout A "the road", with B's week view and "Why this mix" as
 * secondary screens). Every word comes from /api/learning-path; the screens only lay it out.
 */
const CARD = "rounded-[18px] border-2 border-ds-line bg-ds-card";

function Frame({
  title,
  sub,
  back,
  children,
}: {
  title: string;
  sub?: string;
  back: "/learn" | "/path";
  children: React.ReactNode;
}) {
  return (
    <MobileFrame>
      <div className="ds-light relative z-10 min-h-dvh bg-ds-surface px-4 pb-24 pt-2">
        <div className="mb-3 flex items-center gap-1">
          <BackLink to={back} label={back === "/learn" ? "Back to Learn" : "Back to my path"} />
          <div>
            <h1 className="font-display text-xl font-extrabold text-ds-ink">{title}</h1>
            {sub ? <p className="text-xs font-semibold text-ds-ink-soft">{sub}</p> : null}
          </div>
        </div>
        {children}
      </div>
    </MobileFrame>
  );
}

function usePathScreen() {
  const course = useProgress((s) => s.course);
  return { course, ...usePath(course) };
}

function Gate({
  s,
  back,
  title,
  children,
}: {
  s: ReturnType<typeof usePathScreen>;
  back: "/learn" | "/path";
  title: string;
  children: (p: LearningPath) => React.ReactNode;
}) {
  const { state, reload } = s;
  if (state.kind === "ready") return <>{children(state.path)}</>;
  return (
    <Frame title={title} back={back}>
      {state.kind === "loading" && <p className="text-sm text-ds-ink-soft">Loading your path…</p>}
      {state.kind === "error" && (
        <div>
          <p role="alert" className="text-sm font-medium text-ds-wrong-ink">
            {state.offline
              ? "You are offline. Connect to load your path."
              : "Couldn't load your path."}
          </p>
          <button
            type="button"
            onClick={() => void reload()}
            className="mt-2 min-h-11 rounded-full border border-ds-line px-4 text-xs font-medium text-ds-ink"
          >
            Try again
          </button>
        </div>
      )}
      {state.kind === "none" && (
        <div className={`${CARD} p-4`}>
          <p className="text-sm text-ds-ink-soft">You have no path yet.</p>
          <Link
            to="/path/build"
            className="mt-3 inline-flex min-h-11 items-center rounded-full bg-ds-ink px-5 text-sm font-semibold text-ds-card"
          >
            Build my path
          </Link>
        </div>
      )}
    </Frame>
  );
}

const subtitle = (p: LearningPath) =>
  `${p.dailyMinutes} min a day · by ${shortDate(p.progress.targetDate)}`;

// ---------------------------------------------------------------- the road (A2) + behind (A4)

function RecoveryCard({ path, s }: { path: LearningPath; s: ReturnType<typeof usePathScreen> }) {
  const [picked, setPicked] = useState<RecoveryOption["id"] | null>(null);
  const course = s.course;
  const options = path.recovery;
  const chosen = options.find((o) => o.id === (picked ?? options.find((x) => x.suggested)?.id));
  if (options.length === 0) return null;
  async function apply() {
    if (!chosen) return;
    if (chosen.id === "lessons_first") await s.change({ action: "lessons_first" });
    else if (chosen.id === "add_minutes" && chosen.dailyMinutes)
      await s.change({ action: "set_daily_minutes", dailyMinutes: chosen.dailyMinutes });
    else if (chosen.id === "move_date" && chosen.date) {
      await saveGoal(course, path.progress.targetLevel, chosen.date).catch(() => undefined);
      await s.reload();
    }
  }
  return (
    <section aria-label="Catching up" className="mb-3 grid gap-2">
      <div className="rounded-[18px] border-2 border-ds-xp-edge bg-ds-xp-tint p-3">
        <b className="font-display text-base font-extrabold text-ds-ink">{path.statusLine}</b>
        <p className="text-sm text-ds-ink-soft">{path.statusDetail}</p>
      </div>
      <fieldset className="grid gap-2">
        <legend className="sr-only">Pick a way forward</legend>
        {options.map((o) => {
          const on = o.id === chosen?.id;
          return (
            // The label's text (title and detail) is nested two elements deep, beyond the rule's default depth.
            // eslint-disable-next-line jsx-a11y/label-has-associated-control
            <label
              key={o.id}
              className={`flex min-h-14 cursor-pointer items-start gap-3 rounded-2xl border-2 p-3 ${on ? "border-ds-brand bg-ds-choice-tint" : "border-ds-line bg-ds-card"}`}
            >
              <input
                type="radio"
                name="recovery"
                className="mt-1 size-4"
                checked={on}
                onChange={() => setPicked(o.id)}
              />
              <span>
                <b className="block text-sm font-extrabold text-ds-ink">
                  {o.title}
                  {o.suggested ? (
                    <span className="ml-2 rounded-md bg-ds-right-tint px-1.5 py-0.5 ds-type-overline text-ds-right-ink">
                      Suggested
                    </span>
                  ) : null}
                </b>
                <small className="text-xs text-ds-ink-soft">{o.detail}</small>
              </span>
            </label>
          );
        })}
      </fieldset>
      {chosen?.mix ? (
        <div className={`${CARD} p-3`}>
          <p className="mb-2 ds-type-overline text-ds-ink-soft">The new week under this option</p>
          <MixBar mix={chosen.mix} label="Your new week" />
        </div>
      ) : null}
      {s.failed ? (
        <p role="alert" className="text-sm font-medium text-ds-wrong-ink">
          {s.failed}
        </p>
      ) : null}
      <button
        type="button"
        disabled={s.busy}
        onClick={() => void apply()}
        className="min-h-12 w-full rounded-full bg-ds-ink text-sm font-extrabold text-ds-card disabled:opacity-50"
      >
        Update my path
      </button>
    </section>
  );
}

function Stop({ stop }: { stop: RoadStop }) {
  const done = stop.state === "done";
  const cur = stop.state === "current";
  const isGoal = stop.kind === "goal";
  const body = (
    <div
      className={`rounded-2xl border-2 px-3 py-2 ${isGoal ? "border-ds-brand bg-ds-brand text-ds-card" : done ? "border-ds-right-edge bg-ds-right-tint" : cur ? "border-ds-brand bg-ds-choice-tint" : "border-ds-line bg-ds-card"}`}
    >
      {stop.type && !isGoal ? (
        <span className={`block ds-type-overline ${TYPE_STYLE[stop.type].text}`}>
          {PATH_TYPE_INFO[stop.type].noun}
          {stop.note ? ` · ${stop.note}` : ""}
        </span>
      ) : null}
      <b className={`block text-sm font-extrabold ${isGoal ? "" : "text-ds-ink"}`}>{stop.title}</b>
      <small className={`block text-xs ${isGoal ? "text-ds-on-hero-soft" : "text-ds-ink-soft"}`}>
        {stop.subtitle}
        {stop.estDate ? ` · est. ${shortDate(stop.estDate)}` : ""}
      </small>
    </div>
  );
  return (
    <li className="relative mb-2.5 pl-12" aria-current={cur ? "step" : undefined}>
      <span aria-hidden="true" className="absolute left-0 top-0.5">
        {done ? (
          <span className="grid size-10 place-items-center rounded-full bg-ds-right text-base font-extrabold text-ds-on-right">
            ✓
          </span>
        ) : isGoal ? (
          <span className="grid size-10 place-items-center rounded-full bg-ds-brand text-base text-ds-card">
            ⚑
          </span>
        ) : stop.type ? (
          <span className={cur ? "rounded-full ring-4 ring-ds-xp-tint" : ""}>
            <TypeBadge type={stop.type} />
          </span>
        ) : null}
      </span>
      <span className="sr-only">{done ? "Done. " : cur ? "Next up. " : ""}</span>
      {stop.ref && !done ? (
        <ItemLink item={{ ref: stop.ref, type: stop.type ?? "lesson" }}>{body}</ItemLink>
      ) : (
        body
      )}
    </li>
  );
}

export function RoadScreen() {
  const s = usePathScreen();
  return (
    <Gate s={s} back="/learn" title="My path">
      {(p) => (
        <Frame title={`My path to ${p.progress.targetLevel}`} sub={subtitle(p)} back="/learn">
          {p.trimmed ? (
            <div className="mb-3 flex items-center gap-3 rounded-2xl border-2 border-ds-xp-edge bg-ds-xp-tint p-3">
              <p className="flex-1 text-sm text-ds-ink">
                Lessons first until {p.trimUntil ? shortDate(p.trimUntil) : "you resume"}.
              </p>
              <button
                type="button"
                disabled={s.busy}
                onClick={() => void s.change({ action: "resume" })}
                className="min-h-11 rounded-full border border-ds-line bg-ds-card px-4 text-xs font-bold text-ds-ink"
              >
                Resume my mix
              </button>
            </div>
          ) : null}
          {p.status === "behind" ? <RecoveryCard path={p} s={s} /> : null}
          <ol aria-label="Your road" className="relative mt-1">
            <span
              aria-hidden="true"
              className="absolute bottom-6 left-5 top-4 w-1 -translate-x-1/2 rounded bg-ds-line"
            />
            {p.road.map((stop, i) => (
              <Stop key={`${stop.kind}-${stop.title}-${i}`} stop={stop} />
            ))}
          </ol>
          <nav aria-label="More about my path" className="mt-4 grid gap-2">
            <Link
              to="/path/week"
              className={`${CARD} flex min-h-12 items-center justify-between px-4 text-sm font-extrabold text-ds-ink`}
            >
              This week <span aria-hidden="true">›</span>
            </Link>
            <Link
              to="/path/why"
              className={`${CARD} flex min-h-12 items-center justify-between px-4 text-sm font-extrabold text-ds-ink`}
            >
              Why this mix? <span aria-hidden="true">›</span>
            </Link>
            <Link
              to="/path/build"
              className={`${CARD} flex min-h-12 items-center justify-between px-4 text-sm font-extrabold text-ds-ink`}
            >
              Change my path <span aria-hidden="true">›</span>
            </Link>
          </nav>
        </Frame>
      )}
    </Gate>
  );
}

// ---------------------------------------------------------------- week (B2)

export function WeekScreen() {
  const s = usePathScreen();
  return (
    <Gate s={s} back="/path" title="My week">
      {(p) => (
        <Frame
          title="My week"
          sub={`${p.dailyMinutes} min a day · ${p.week.filter((d) => d.state !== "rest").length} days · ${p.weekMinutes} min`}
          back="/path"
        >
          <div className={`${CARD} mb-3 p-3`}>
            <p className="mb-2 ds-type-overline text-ds-ink-soft">This week&apos;s mix</p>
            <MixBar mix={p.mix} label="This week's mix" />
            <p className="mt-2 text-xs text-ds-ink-soft">
              {p.weekDoneMinutes} of {p.weekMinutes} minutes done so far.
            </p>
          </div>
          <ul className="grid gap-2">
            {p.week.map((d) => {
              const tone =
                d.state === "done"
                  ? "border-ds-right-edge bg-ds-right-tint"
                  : d.state === "today"
                    ? "border-ds-brand bg-ds-choice-tint"
                    : "border-ds-line bg-ds-card";
              const word =
                d.state === "rest"
                  ? "Rest day"
                  : d.state === "missed"
                    ? "Missed"
                    : `${d.minutes} min`;
              return (
                <li
                  key={d.day}
                  className={`flex min-h-12 items-center gap-3 rounded-2xl border-2 px-3 py-1.5 ${tone}`}
                  aria-current={d.state === "today" ? "date" : undefined}
                >
                  <b className="w-10 font-display text-sm font-extrabold text-ds-ink">{d.label}</b>
                  <span className="flex flex-1 flex-wrap gap-1">
                    {d.items.map((i, k) => (
                      <TypeBadge key={`${i.type}-${i.id}-${k}`} type={i.type} small />
                    ))}
                    <span className="sr-only">
                      {d.items.map((i) => PATH_TYPE_INFO[i.type].noun).join(", ")}
                    </span>
                  </span>
                  <span className="text-xs font-extrabold text-ds-ink-soft">{word}</span>
                </li>
              );
            })}
          </ul>
          <Link
            to="/path/why"
            className="mt-3 inline-flex min-h-11 items-center text-sm font-bold text-ds-choice"
          >
            Why this mix? ›
          </Link>
        </Frame>
      )}
    </Gate>
  );
}

// ---------------------------------------------------------------- why (B3)

export function WhyScreen() {
  const s = usePathScreen();
  return (
    <Gate s={s} back="/path" title="Why this mix?">
      {(p) => (
        <Frame title="Why this mix?" back="/path">
          <p className={`${CARD} mb-3 bg-ds-choice-tint p-3 text-sm text-ds-ink`}>
            Lessons are the backbone because you want to finish {p.goalLabel}. The rest follows what
            you told me and how you are doing.
          </p>
          <ul className="grid gap-2">
            {p.why.map((w, i) => (
              <li
                key={`${w.headline}-${i}`}
                className="flex items-center gap-3 rounded-2xl border-2 border-ds-line bg-ds-card px-3 py-2"
              >
                <TypeBadge type={w.type} small />
                <span className="min-w-0">
                  <b className="block text-sm font-extrabold text-ds-ink">{w.headline}</b>
                  <small className="block text-xs text-ds-ink-soft">{w.detail}</small>
                </span>
              </li>
            ))}
          </ul>
          <p className="mt-3 rounded-2xl border-2 border-dashed border-ds-line p-3 text-xs text-ds-ink-soft">
            Change the minutes or turn a type off in Build my path. Your skill scores update the
            plan as you practise.
          </p>
        </Frame>
      )}
    </Gate>
  );
}

// ---------------------------------------------------------------- build my path (A0)

const HOW: Record<Exclude<PathType, "lesson">, string> = {
  podcast: "Listen and answer a short quiz",
  talk: "Needs the microphone",
  campaign: "Story scenes that run over several days",
  video: "Short captioned videos from Alphonso",
};

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function BuildScreen() {
  const s = usePathScreen();
  const course = s.course;
  const label = COURSES.find((c) => c.id === course)?.label ?? "";
  const path = s.state.kind === "ready" ? s.state.path : null;
  const off = path?.off ?? [];
  // The first-run purpose, kept on the account; without it the chips simply leave the purpose out.
  const [purpose, setPurpose] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    void import("@/integrations/supabase/client")
      .then(({ supabase }) => supabase.auth.getUser())
      .then(({ data }) => {
        const goal = parseLearnerProfile(data.user?.user_metadata?.[LEARNER_PROFILE_KEY]).goal;
        if (alive) setPurpose(goal ?? null);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);
  function toggle(type: Exclude<PathType, "lesson">) {
    const next = off.includes(type) ? off.filter((t) => t !== type) : [...off, type];
    void s.change({ action: "set_off", off: next as Exclude<PathType, "lesson">[] });
  }
  return (
    <Frame title="Build my path" sub={label} back="/learn">
      <GoalCard course={course} purposeId={purpose} onChanged={() => void s.reload()} />
      {path ? (
        <section aria-label="How I like to learn" className="mt-4 grid gap-2">
          <div className={`${CARD} p-3`}>
            <p className="ds-type-overline text-ds-ink-soft">Your plan</p>
            <p className="font-display text-xl font-extrabold text-ds-ink">
              {path.progress.requiredPerWeek} lessons a week
            </p>
            <p className="text-xs text-ds-ink-soft">
              {path.dailyMinutes} minutes a day, {path.restDay < 0 ? 7 : 6} days. The rest of each
              day is filled with the mix below.
            </p>
            <div className="mt-2">
              <MixBar mix={path.mix} label="Your weekly mix" />
            </div>
          </div>
          <h2 className="mt-1 ds-type-overline text-ds-ink-soft">Rest day</h2>
          <div
            role="radiogroup"
            aria-label="Rest day"
            className={`${CARD} flex flex-wrap gap-2 p-3`}
          >
            {[
              ...WEEKDAYS.map((d, i) => ({ label: d, value: i })),
              { label: "No rest day", value: -1 },
            ].map((o) => {
              const on = (path.restDay ?? 0) === o.value;
              return (
                <button
                  key={o.label}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  disabled={s.busy}
                  onClick={() =>
                    void s.change({
                      action: "set_rest_day",
                      restDay: o.value < 0 ? "none" : o.value,
                    })
                  }
                  className={`min-h-11 rounded-full px-4 text-sm font-bold ${
                    on ? "bg-ds-action text-ds-on-action" : "bg-ds-sunk text-ds-ink"
                  }`}
                >
                  {o.label}
                </button>
              );
            })}
          </div>
          <h2 className="mt-1 ds-type-overline text-ds-ink-soft">How I like to learn</h2>
          <div className="flex min-h-14 items-center gap-3 rounded-2xl border-2 border-ds-line bg-ds-card px-3 py-2 opacity-70">
            <TypeBadge type="lesson" />
            <span className="flex-1">
              <b className="block text-sm font-extrabold text-ds-ink">Lessons</b>
              <small className="text-xs text-ds-ink-soft">Always on, the backbone</small>
            </span>
            <span className="text-xs font-bold text-ds-ink-soft">Always on</span>
          </div>
          {switchableTypes(path).map((t) => {
            const on = !off.includes(t);
            const why = path.why.find((w) => w.type === t && w.source !== "planner");
            return (
              <label
                key={t}
                className="flex min-h-14 cursor-pointer items-center gap-3 rounded-2xl border-2 border-ds-line bg-ds-card px-3 py-2"
              >
                <TypeBadge type={t} />
                <span className="flex-1">
                  <b className="block text-sm font-extrabold text-ds-ink">
                    {PATH_TYPE_INFO[t].label}
                  </b>
                  <small className="text-xs text-ds-ink-soft">
                    {on && why ? why.detail : HOW[t as Exclude<PathType, "lesson">]}
                  </small>
                </span>
                <input
                  type="checkbox"
                  role="switch"
                  aria-label={`${PATH_TYPE_INFO[t].label} in my path`}
                  checked={on}
                  disabled={s.busy}
                  onChange={() => toggle(t as Exclude<PathType, "lesson">)}
                  className="size-6"
                />
              </label>
            );
          })}
          {s.failed ? (
            <p role="alert" className="text-sm font-medium text-ds-wrong-ink">
              {s.failed}
            </p>
          ) : null}
          <Link
            to="/path"
            className="mt-1 inline-flex min-h-12 w-full items-center justify-center rounded-full bg-ds-ink text-sm font-extrabold text-ds-card"
          >
            Open my path
          </Link>
        </section>
      ) : s.state.kind === "none" ? (
        <p className="mt-3 text-sm text-ds-ink-soft">
          Save a goal above and your plan appears here.
        </p>
      ) : null}
    </Frame>
  );
}

export { ItemRow };
