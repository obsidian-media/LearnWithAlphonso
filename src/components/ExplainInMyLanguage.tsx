import { useCallback, useEffect, useRef, useState } from "react";
import { useOptionalAiConsent } from "../lib/ai-consent-context";
import {
  explainLanguageName,
  explainOffer,
  splitDirectionRuns,
  type ExplainRequest,
} from "../lib/explain";
import {
  ExplainError,
  explainErrorCopy,
  requestExplanation,
  type Explanation,
  type ExplainErrorKind,
} from "../lib/explain-client";
import { useExplainSettings } from "../lib/explain-settings";
import { expressionSrc } from "../lib/lesson-stage";
import { AiLabel } from "./AiLabel";
import { AiMessageReport } from "./AiMessageReport";

type Phase =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "shown"; result: Explanation }
  | { kind: "error"; error: ExplainErrorKind };

const CHIP =
  "inline-flex min-h-9 items-center gap-1.5 rounded-[var(--ds-radius-key)] border-2 border-b-4 border-ds-brand bg-ds-choice-tint px-3 py-1.5 ds-type-footnote font-extrabold text-ds-brand disabled:opacity-70";

/** The explanation text, right to left for Persian and Arabic, with quoted course-language phrases kept left to right. */
function ExplanationText({ result, className = "" }: { result: Explanation; className?: string }) {
  return (
    <p
      dir={result.direction}
      lang={result.language}
      data-explain-text=""
      className={`explain-text text-start ds-type-body font-semibold text-ds-ink ${className}`}
    >
      {result.direction === "rtl"
        ? splitDirectionRuns(result.explanation).map((run, i) =>
            run.ltr ? (
              <bdi key={i} dir="ltr" lang="en" className="font-extrabold text-ds-brand">
                {run.text}
              </bdi>
            ) : (
              run.text
            ),
          )
        : result.explanation}
    </p>
  );
}

/**
 * "Explain in <language>" (round 8, feature 1): one quiet chip that fetches a short WHY in the learner's own
 * language, only when tapped (or straight away when they chose "Always show"). Nothing renders when the learner
 * chose target language only, has no native language, or it equals the course's. The explanation is always labelled
 * as AI and can be reported.
 *
 *  - kind "wrong-answer": a bordered card under the verdict, Alphonso at its head.
 *  - kind "word": a tinted "IN <LANGUAGE>" block on the word card.
 *  - kind "message": "Say that in <language>", the translation set right under the bubble.
 */
export function ExplainInMyLanguage({
  request,
  surface,
  className = "",
  fetchExplanation = requestExplanation,
}: {
  /** The item. null when there is nothing to explain (a skipped question). `surface` is added here. */
  request: ExplainRequest | null;
  /** Where the report goes, and which allowance is spent ("hector" = Hector's own Pro allowance). */
  surface?: "hector";
  className?: string;
  fetchExplanation?: typeof requestExplanation;
}) {
  const settings = useExplainSettings();
  const consent = useOptionalAiConsent();
  const [phase, setPhase] = useState<Phase>({ kind: "idle" });
  const mounted = useRef(true);
  const requestKey = request ? JSON.stringify(request) : "";
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  // A different item (the next question) starts again from the chip.
  useEffect(() => {
    setPhase({ kind: "idle" });
  }, [requestKey]);

  const offer =
    settings && request
      ? explainOffer({
          mode: settings.mode,
          nativeLanguage: settings.nativeLanguage,
          course: request.course,
        })
      : "hidden";

  const run = useCallback(async () => {
    if (!request) return;
    // An explanation sends the item to the AI service, so the account's consent comes first.
    if (consent?.status === "unknown") {
      void consent.refresh();
      setPhase({ kind: "error", error: "unavailable" });
      return;
    }
    if (consent && !consent.granted) {
      const ok = await consent.requestConsent();
      if (!ok) return;
    }
    setPhase({ kind: "loading" });
    try {
      const result = await fetchExplanation({ ...request, ...(surface ? { surface } : {}) });
      if (mounted.current) setPhase({ kind: "shown", result });
    } catch (e) {
      const kind = e instanceof ExplainError ? e.kind : "unavailable";
      if (kind === "aiConsentRequired") consent?.markWithdrawn();
      if (mounted.current) setPhase({ kind: "error", error: kind });
    }
  }, [request, surface, consent, fetchExplanation]);

  // "Always show": ask as soon as the item is on screen, once.
  const autoRan = useRef("");
  useEffect(() => {
    if (offer === "auto" && phase.kind === "idle" && autoRan.current !== requestKey) {
      autoRan.current = requestKey;
      void run();
    }
  }, [offer, phase.kind, requestKey, run]);

  if (!request || !settings || offer === "hidden") return null;
  const native = settings.nativeLanguage!;
  const languageName = explainLanguageName(native);
  const isMessage = request.kind === "message";
  const label = isMessage ? `Say that in ${languageName}` : `Explain in ${languageName}`;

  if (phase.kind === "shown") {
    const { result } = phase;
    const hide = () => setPhase({ kind: "idle" });
    const report = (
      <AiMessageReport
        message={result.explanation}
        surface="explain"
        course={request.course}
        label="Not clear?"
      />
    );
    if (request.kind === "wrong-answer") {
      return (
        <section
          aria-label={`Alphonso explains, in ${languageName}`}
          className={`rounded-[18px] border-2 border-ds-brand bg-ds-card px-3.5 py-3 ${className}`}
        >
          <div className="mb-2 flex items-center gap-2">
            <span
              aria-hidden="true"
              className="size-[30px] shrink-0 rounded-full bg-ds-choice-tint bg-[length:190%] bg-[center_24%] bg-no-repeat"
              style={{ backgroundImage: `url(${expressionSrc("talk")})` }}
            />
            <b className="ds-type-footnote font-extrabold text-ds-ink">Alphonso explains</b>
            <AiLabel language={languageName} className="ms-auto" />
          </div>
          <ExplanationText result={result} />
          <div className="mt-2.5 flex items-center justify-between ds-type-caption text-ds-ink-soft">
            {report}
            <button type="button" onClick={hide} className="font-bold text-ds-choice underline">
              Show in English
            </button>
          </div>
        </section>
      );
    }
    if (request.kind === "word") {
      return (
        <section
          aria-label={`In ${languageName}`}
          className={`rounded-[14px] bg-ds-choice-tint px-3 py-2.5 ${className}`}
        >
          <div className="mb-1 flex items-center gap-2">
            <b className="ds-type-overline text-ds-brand">IN {languageName.toUpperCase()}</b>
            <AiLabel className="ms-auto" />
          </div>
          <ExplanationText result={result} className="text-ds-brand" />
          <div className="mt-1.5 flex items-center justify-between ds-type-caption text-ds-ink-soft">
            {report}
            <button type="button" onClick={hide} className="font-bold text-ds-choice underline">
              Hide
            </button>
          </div>
        </section>
      );
    }
    return (
      <section
        aria-label={`In ${languageName}`}
        className={`mt-1 max-w-[88%] rounded-[var(--ds-radius-control)] bg-ds-choice-tint px-3 py-2 ${className}`}
      >
        <ExplanationText result={result} />
        <div className="mt-1 flex items-center gap-2 ds-type-caption text-ds-ink-soft">
          <AiLabel language={languageName} />
          {report}
          <button
            type="button"
            onClick={hide}
            className="ms-auto font-bold text-ds-choice underline"
          >
            Hide
          </button>
        </div>
      </section>
    );
  }

  return (
    <div className={`flex flex-col items-start gap-1.5 ${className}`}>
      <button
        type="button"
        data-explain-chip=""
        disabled={phase.kind === "loading"}
        aria-busy={phase.kind === "loading"}
        onClick={() => void run()}
        className={CHIP}
      >
        {!isMessage && (
          <span
            aria-hidden="true"
            className="size-[22px] shrink-0 rounded-full bg-ds-card bg-[length:190%] bg-[center_24%] bg-no-repeat"
            style={{ backgroundImage: `url(${expressionSrc("hmm")})` }}
          />
        )}
        {phase.kind === "loading" ? "Explaining…" : label}
      </button>
      {phase.kind === "error" && (
        <p role="alert" className="ds-type-caption font-semibold text-ds-wrong-ink">
          {explainErrorCopy(phase.error)}
        </p>
      )}
    </div>
  );
}
