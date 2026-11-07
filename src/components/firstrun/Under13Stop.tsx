import { expressionSrc } from "../../lib/lesson-stage";
import { FirstRunFooter, FirstRunRoom, FirstRunScreen } from "./FirstRunParts";

/**
 * The kind stop for a learner who said they are under 13 (the owner-approved wording). No account, nothing stored
 * but the device's own note that keeps this screen up, and nothing sent. There is no way back into the questions.
 */
export function Under13Stop({ onOk }: { onOk: () => void }) {
  return (
    <FirstRunScreen>
      <FirstRunRoom
        room="/avatar/scenes/room-light.webp"
        figure={expressionSrc("neutral")}
        figureAlt="Alphonso"
        size="tall"
      />
      <section
        data-under-13=""
        className="grid flex-1 content-center justify-items-center gap-2.5 px-6 pt-4 text-center"
      >
        <h1 className="ds-type-display text-ds-brand">Thanks for wanting to learn with me!</h1>
        <p className="ds-type-body font-semibold text-ds-ink-soft">
          Learn With Alphonso is for learners aged 13 and over, so we can't make an account for you
          yet. Come back when you're 13. I'll be here!
        </p>
      </section>
      <FirstRunFooter label="OK" onClick={onOk} />
    </FirstRunScreen>
  );
}
