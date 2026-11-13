/**
 * The small "AI" label every AI-written text carries (the first shared one: round 8 mock, "AI · Persian"). Pass the
 * language when the text is in a language the learner chose, so it reads "AI · Persian". The words are real text, so a
 * screen reader says "AI-written, Persian" rather than a bare dot.
 */
export function AiLabel({ language, className = "" }: { language?: string; className?: string }) {
  return (
    <span
      data-ai-label=""
      className={`inline-flex shrink-0 items-center gap-1 rounded-lg border border-ds-line bg-ds-choice-tint px-1.5 py-0.5 ds-type-overline text-ds-brand ${className}`}
    >
      <span aria-hidden="true" className="size-1.5 rounded-full bg-ds-choice" />
      <span aria-hidden="true">{language ? `AI · ${language}` : "AI"}</span>
      <span className="sr-only">{language ? `AI-written, ${language}` : "AI-written"}</span>
    </span>
  );
}
