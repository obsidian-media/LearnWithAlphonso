import type { Course } from "@/data/courses";
import { PRO_WELCOME_COPY, welcomeOpenersFor } from "@/lib/paywall-copy";
import { Confetti } from "../lesson/LessonCelebration";
import { edgeButtonClass } from "../lesson/LessonParts";
import { HECTOR_HAPPY_SRC, WELCOME_ROOM_SRC } from "./PaywallParts";

/**
 * After buying (BACKLOG 0.0-bk): Hector smiling in his room, three easy openers in the learner's course so the first
 * call starts at once, and "Call Hector". Confetti in the robe's colours; a still scatter under Reduce Motion.
 */
export function ProWelcome({
  name,
  course,
  onCall,
  reduceMotion,
}: {
  name: string | null;
  course: Course;
  onCall: () => void;
  reduceMotion: boolean;
}) {
  return (
    <section
      className="ds-light relative flex min-h-dvh flex-col overflow-hidden bg-ds-surface font-[family-name:var(--ds-font-body)] text-ds-ink"
      data-pro-welcome=""
    >
      <div aria-hidden="true" className="absolute inset-x-0 top-0 h-[560px]">
        <img src={WELCOME_ROOM_SRC} alt="" className="size-full object-cover object-[center_30%]" />
        <div className="absolute inset-0 bg-[linear-gradient(180deg,transparent_30%,var(--c-surface)_60%)]" />
      </div>
      <img
        src={HECTOR_HAPPY_SRC}
        alt="Hector, smiling in his room"
        className="relative z-[1] mx-auto mt-[72px] w-[75%] max-w-[320px]"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 z-[2] h-[380px]"
      >
        <Confetti reduce={reduceMotion} seed={11} />
      </div>
      <div className="relative z-[3] mt-5 flex flex-1 flex-col gap-2.5 px-[18px] pb-[max(env(safe-area-inset-bottom),20px)] text-center">
        <p className="ds-type-overline m-0 tracking-[0.14em] text-ds-action-text">
          {PRO_WELCOME_COPY.eyebrow}
        </p>
        <h1 className="ds-type-question m-0 text-ds-ink">
          {PRO_WELCOME_COPY.greeting(name)}
          <br />
          {PRO_WELCOME_COPY.ready}
        </h1>
        <p className="ds-type-footnote m-0 text-ds-ink-soft">{PRO_WELCOME_COPY.body}</p>
        <div className="grid gap-1.5 rounded-[var(--ds-radius-control)] border-2 border-ds-line bg-ds-card p-2.5 text-left">
          <h2
            id="pro-welcome-openers"
            className="ds-type-overline m-0 tracking-[0.06em] text-ds-brand"
          >
            {PRO_WELCOME_COPY.openersTitle}
          </h2>
          <ul aria-labelledby="pro-welcome-openers" className="m-0 grid list-none gap-1.5 p-0">
            {welcomeOpenersFor(course).map((line) => (
              <li
                key={line}
                className="ds-type-footnote rounded-[10px] bg-ds-choice-tint px-2.5 py-1.5 font-bold text-ds-ink"
              >
                {line}
              </li>
            ))}
          </ul>
        </div>
        <button type="button" onClick={onCall} className={`${edgeButtonClass("primary")} mt-auto`}>
          <svg
            viewBox="0 0 24 24"
            width="18"
            height="18"
            fill="currentColor"
            aria-hidden="true"
            className="size-[18px]"
          >
            <path d="M6.6 10.8a15 15 0 0 0 6.6 6.6l2.2-2.2a1 1 0 0 1 1-.25 11.4 11.4 0 0 0 3.6.6 1 1 0 0 1 1 1V20a1 1 0 0 1-1 1A17 17 0 0 1 3 4a1 1 0 0 1 1-1h3.5a1 1 0 0 1 1 1c0 1.25.2 2.45.6 3.6a1 1 0 0 1-.25 1z" />
          </svg>
          {PRO_WELCOME_COPY.call}
        </button>
      </div>
    </section>
  );
}
