import { useEffect, useId, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Modal } from "./Modal";
import { DsButton, DsField } from "./ds/Blocks";
import {
  checkDisplayName,
  confirmName,
  getNameStatus,
  skipName,
} from "../lib/name-onboarding.functions";
import {
  NAME_ONBOARDING_COPY as COPY,
  localNameProblem,
  normalizeName,
  skipNote,
} from "../lib/name-onboarding";
import { setNamePromptBlocking, useNamePromptHeld } from "../lib/name-prompt-gate";
import { SOCIAL_COPY, socialReasonMessage } from "../lib/social-reason-copy";

type Check =
  | { state: "checking" }
  | { state: "ok" }
  | { state: "problem"; code: string }
  | { state: "unverified" };

/**
 * The one-time "What should other learners call you?" prompt on the web: same gate (name_confirmed_at NULL),
 * filter and words as iOS. Mounted in the signed-in layout, so it covers placement for a new sign-up and appears
 * once for learners whose old name failed the filter. A status that cannot be read (or an empty one: no profile
 * row) shows nothing this visit.
 */
export function NamePrompt() {
  const qc = useQueryClient();
  const { data: status, isLoading } = useQuery({
    queryKey: ["name-status"],
    queryFn: () => getNameStatus(),
    staleTime: Infinity,
    retry: false,
  });
  const [edited, setEdited] = useState<string | null>(null);
  const [check, setCheck] = useState<Check>({ state: "checking" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [closed, setClosed] = useState(false);
  const titleId = useId();
  const noteId = useId();
  const messageId = useId();

  // Held back while a first-run screen is up; it asks once the learner leaves it.
  const held = useNamePromptHeld();
  const open = Boolean(status?.needsPrompt) && !closed && !held;
  const value = edited ?? status?.prefill ?? "";

  // Tell the AI consent sheet to wait while this prompt is, or is about to be, showing.
  const blocking = open || isLoading;
  useEffect(() => {
    setNamePromptBlocking(blocking);
    return () => setNamePromptBlocking(false);
  }, [blocking]);

  // Live check, debounced. The cleanup marks an older request stale, so its late answer is dropped.
  useEffect(() => {
    if (!open) return;
    const local = localNameProblem(value);
    if (local) {
      setCheck({ state: "problem", code: local });
      return;
    }
    setCheck({ state: "checking" });
    let stale = false;
    const timer = setTimeout(async () => {
      try {
        const result = await checkDisplayName({ data: { name: normalizeName(value) } });
        if (stale) return;
        if (result.problem) setCheck({ state: "problem", code: result.problem });
        else setCheck(result.unverified ? { state: "unverified" } : { state: "ok" });
      } catch {
        if (!stale) setCheck({ state: "unverified" });
      }
    }, 400);
    return () => {
      stale = true;
      clearTimeout(timer);
    };
  }, [value, open]);

  if (!open || !status) return null;

  const canSave = !busy && (check.state === "ok" || check.state === "unverified");
  const message =
    error ??
    (check.state === "problem"
      ? socialReasonMessage(check.code)
      : check.state === "checking"
        ? COPY.checking
        : check.state === "ok"
          ? COPY.looksGood
          : null);
  const isProblem = Boolean(error) || check.state === "problem";

  async function finish() {
    setClosed(true);
    await qc.invalidateQueries({ queryKey: ["me"] });
    await qc.invalidateQueries({ queryKey: ["name-status"] });
  }

  async function save(e?: React.FormEvent) {
    e?.preventDefault();
    if (!canSave) return;
    setBusy(true);
    setError(null);
    try {
      const result = await confirmName({ data: { name: normalizeName(value) } });
      if (result.ok) await finish();
      else if (result.error === "server-error") setError(SOCIAL_COPY.nameSaveFailed);
      else setCheck({ state: "problem", code: result.error });
    } catch {
      setError(socialReasonMessage(null));
    } finally {
      setBusy(false);
    }
  }

  /**
   * Skip never traps the learner: if the server could not record it, the prompt still closes. Nothing was
   * stamped, so it asks again on the next visit.
   */
  async function skip() {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const result = await skipName();
      if (result.ok) await finish();
      else setClosed(true);
    } catch {
      setClosed(true);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      labelledBy={titleId}
      describedBy={noteId}
      className="relative grid w-full max-w-[430px] gap-3 rounded-t-[28px] bg-ds-surface px-5 pb-6 pt-5 text-ds-ink shadow-[var(--ds-shadow-sheet)] outline-none sm:rounded-[28px]"
    >
      <img
        src="/mascots/alphonso-happy.png"
        alt=""
        height={120}
        decoding="async"
        draggable={false}
        className="mx-auto h-[120px] w-auto"
      />
      <h2 id={titleId} className="ds-type-display">
        {COPY.title}
      </h2>
      <p id={noteId} className="ds-type-body text-ds-ink-soft">
        {COPY.publicNote}
      </p>
      <form onSubmit={save} className="grid gap-3">
        <label htmlFor={`${titleId}-name`} className="sr-only">
          {COPY.fieldLabel}
        </label>
        <DsField
          id={`${titleId}-name`}
          type="text"
          autoComplete="nickname"
          value={value}
          onChange={(e) => {
            setEdited(e.target.value);
            setError(null);
          }}
          aria-invalid={isProblem}
          aria-describedby={message ? messageId : undefined}
          maxLength={80}
          className={
            isProblem
              ? "border-ds-wrong"
              : check.state === "ok" && value
                ? "border-ds-right bg-ds-card"
                : ""
          }
        />
        {message && (
          <p
            id={messageId}
            role={isProblem ? "alert" : "status"}
            className={`ds-type-footnote font-bold ${
              isProblem
                ? "text-ds-wrong-ink"
                : check.state === "ok"
                  ? "text-ds-right-ink"
                  : "text-ds-ink-soft"
            }`}
          >
            {message}
          </p>
        )}
        <DsButton type="submit" full disabled={!canSave}>
          {COPY.save}
        </DsButton>
        <DsButton full variant="secondary" onClick={skip} disabled={busy}>
          {COPY.skip}
        </DsButton>
        <p className="ds-type-caption text-center text-ds-ink-soft">
          {skipNote(status.displayName)}
        </p>
      </form>
    </Modal>
  );
}
