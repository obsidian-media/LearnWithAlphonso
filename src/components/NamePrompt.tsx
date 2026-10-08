import { useEffect, useId, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { TextField } from "./TextField";
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
  const { data: status } = useQuery({
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
  const inputRef = useRef<HTMLInputElement | null>(null);
  const titleId = useId();
  const noteId = useId();
  const messageId = useId();

  const open = Boolean(status?.needsPrompt) && !closed;
  const value = edited ?? status?.prefill ?? "";

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

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

  async function skip() {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const result = await skipName();
      if (result.ok) await finish();
      else setError(SOCIAL_COPY.nameSaveFailed);
    } catch {
      setError(socialReasonMessage(null));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-ink/40 px-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={noteId}
        className="w-full max-w-[400px] rounded-3xl border border-hairline bg-surface p-6 text-ink shadow-xl"
      >
        <h2 id={titleId} className="font-display text-2xl font-semibold leading-tight">
          {COPY.title}
        </h2>
        <p id={noteId} className="mt-2 text-sm text-ink-soft">
          {COPY.publicNote}
        </p>
        <form onSubmit={save} className="mt-5 space-y-3">
          <label htmlFor={`${titleId}-name`} className="sr-only">
            {COPY.fieldLabel}
          </label>
          <TextField
            id={`${titleId}-name`}
            ref={inputRef}
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
          />
          {message && (
            <p
              id={messageId}
              role={isProblem ? "alert" : "status"}
              className={isProblem ? "text-sm text-ember" : "text-sm text-ink-soft"}
            >
              {message}
            </p>
          )}
          <button
            type="submit"
            disabled={!canSave}
            className="w-full rounded-full bg-ember px-4 py-3 text-sm font-semibold text-ink-on-ember transition hover:opacity-90 disabled:opacity-50"
          >
            {COPY.save}
          </button>
          <button
            type="button"
            onClick={skip}
            disabled={busy}
            className="w-full rounded-full border border-hairline px-4 py-3 text-sm font-medium text-ink transition hover:bg-parchment disabled:opacity-50"
          >
            {COPY.skip}
          </button>
          <p className="text-center text-xs text-ink-soft/80">{skipNote(status.displayName)}</p>
        </form>
      </div>
    </div>
  );
}
