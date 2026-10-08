import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useOptionalAiConsent } from "../lib/ai-consent-context";
import type { SavedWordInput } from "../lib/saved-word";
import {
  SavedWordError,
  saveErrorFor,
  saveWord,
  type SavedWordErrorKind,
  type SavedWordResult,
} from "../lib/saved-word-client";

/**
 * Tap-to-save for the web (docs/superpowers/specs/2026-10-05-save-any-word-design.md,
 * phase 4). `SaveWordProvider` owns the one confirmation dialog; `TappableText`
 * (separate file) turns words into buttons that open it. A tree with no provider
 * renders plain text, so a screen opts in by wrapping itself.
 */
type OpenSave = (request: SavedWordInput, returnFocusTo?: HTMLElement | null) => void;

const SaveWordContext = createContext<OpenSave | null>(null);

/** The open function, or null when there is no provider (so text stays plain). */
export function useSaveWord(): OpenSave | null {
  return useContext(SaveWordContext);
}

type Open = { id: number; request: SavedWordInput; returnFocusTo: HTMLElement | null };

export function SaveWordProvider({
  children,
  save = saveWord,
}: {
  children: ReactNode;
  save?: (input: SavedWordInput) => Promise<SavedWordResult>;
}) {
  const [open, setOpen] = useState<Open | null>(null);
  const nextId = useRef(0);
  const openRef = useRef<Open | null>(null);
  openRef.current = open;

  const openSave = useCallback<OpenSave>((request, returnFocusTo = null) => {
    nextId.current += 1;
    setOpen({ id: nextId.current, request, returnFocusTo });
  }, []);

  const close = useCallback(() => {
    openRef.current?.returnFocusTo?.focus();
    setOpen(null);
  }, []);

  const value = useMemo(() => openSave, [openSave]);
  return (
    <SaveWordContext.Provider value={value}>
      {children}
      {/* Keyed by id: each tap starts from the confirmation, never from the last result. */}
      {open && <SaveWordDialog key={open.id} request={open.request} save={save} onClose={close} />}
    </SaveWordContext.Provider>
  );
}

type Phase =
  | { kind: "confirm" }
  | { kind: "saving" }
  | { kind: "saved"; result: SavedWordResult }
  | { kind: "error"; error: SavedWordErrorKind };

/** Failures a second attempt could fix; a full list or a spent quota will not. */
const RETRYABLE: SavedWordErrorKind[] = ["unavailable", "offline"];

function SaveWordDialog({
  request,
  save,
  onClose,
}: {
  request: SavedWordInput;
  save: (input: SavedWordInput) => Promise<SavedWordResult>;
  onClose: () => void;
}) {
  const [phase, setPhase] = useState<Phase>({ kind: "confirm" });
  const mounted = useRef(true);
  const dialogRef = useRef<HTMLDivElement>(null);

  // Move focus to the button that moves the flow on whenever the phase changes
  // (Save, then Done or Try again), so a keyboard user never has to hunt for it.
  useEffect(() => {
    dialogRef.current?.querySelector<HTMLElement>("[data-initial-focus]")?.focus();
  }, [phase.kind]);

  useEffect(() => {
    mounted.current = true;
    const onKey = (event: KeyboardEvent) => {
      // A modal opened on top of this dialog (the AI consent sheet) handles its own keys.
      if (event.defaultPrevented) return;
      if (event.key === "Escape") onClose();
      // aria-modal hides the page from screen readers, so focus must not leave the dialog.
      if (event.key === "Tab" && dialogRef.current) {
        const items = Array.from(
          dialogRef.current.querySelectorAll<HTMLElement>("button:not([disabled])"),
        );
        if (items.length === 0) {
          event.preventDefault();
          return;
        }
        const first = items[0];
        const last = items[items.length - 1];
        const active = document.activeElement;
        if (!dialogRef.current.contains(active)) {
          event.preventDefault();
          first.focus();
        } else if (event.shiftKey && active === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && active === last) {
          event.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener("keydown", onKey);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
      mounted.current = false;
      document.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  const consent = useOptionalAiConsent();
  const run = useCallback(async () => {
    // Saving a word sends it and its sentence to the AI, so ask for the account's consent first. With no provider
    // the injected `save` decides (tests, and any page outside the signed-in app).
    if (consent?.status === "unknown") {
      // The setting could not be read: retry the read and say so, rather than asking for a choice that may already exist.
      void consent.refresh();
      setPhase({ kind: "error", error: "unavailable" });
      return;
    }
    if (consent && !consent.granted) {
      const ok = await consent.requestConsent();
      if (!ok) return;
    }
    // A second press cannot send a second request: the button is disabled while this one is out.
    setPhase({ kind: "saving" });
    try {
      const result = await save(request);
      if (mounted.current) setPhase({ kind: "saved", result });
    } catch (error) {
      const kind = error instanceof SavedWordError ? error.kind : "unavailable";
      // Consent was withdrawn elsewhere: the next attempt asks again.
      if (kind === "aiConsentRequired") consent?.markWithdrawn();
      if (mounted.current) setPhase({ kind: "error", error: kind });
    }
  }, [request, save, consent]);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center px-4 pb-6 sm:items-center">
      {/* The backdrop is a sibling, not an ancestor, so the dialog needs no stopPropagation;
          Escape and the Cancel/Done buttons are the keyboard ways out. */}
      <div role="presentation" className="absolute inset-0 bg-ink/40" onClick={onClose} />
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="save-word-title"
        className="relative w-full max-w-[420px] rounded-3xl border border-hairline bg-surface p-6"
      >
        <h2 id="save-word-title" className="font-display text-lg font-semibold text-ink">
          {phase.kind === "saved"
            ? phase.result.alreadySaved
              ? "Already saved"
              : "Saved"
            : "Save this word?"}
        </h2>
        <p className="mt-3 text-2xl font-semibold text-ink">{request.word}</p>
        <p className="mt-1 text-sm italic text-ink-soft">{request.sentence}</p>

        {phase.kind === "saved" ? (
          <>
            <p className="mt-4 text-sm text-ink">{phase.result.explanation}</p>
            <p className="mt-2 text-xs text-ink-soft/80">
              {phase.result.alreadySaved
                ? "It's already in your reviews."
                : "It will come up in your reviews tomorrow."}
            </p>
            <button type="button" data-initial-focus onClick={onClose} className={PRIMARY}>
              Done
            </button>
          </>
        ) : (
          <>
            <p className="mt-4 text-xs text-ink-soft/80">
              Saving sends this word and its sentence to an AI service to write the meaning. The
              word then comes up in your reviews.
            </p>
            {phase.kind === "error" && (
              <p role="alert" className="mt-3 text-sm font-medium text-rose-600">
                {saveErrorFor(phase.error)}
              </p>
            )}
            {phase.kind === "error" && !RETRYABLE.includes(phase.error) ? null : (
              <button
                type="button"
                data-initial-focus
                disabled={phase.kind === "saving"}
                onClick={run}
                className={PRIMARY}
              >
                {phase.kind === "saving"
                  ? "Saving…"
                  : phase.kind === "error"
                    ? "Try again"
                    : "Save word"}
              </button>
            )}
            <button
              type="button"
              data-initial-focus={
                phase.kind === "error" && !RETRYABLE.includes(phase.error) ? "" : undefined
              }
              onClick={onClose}
              className="mt-2 w-full rounded-full px-4 py-2.5 text-sm font-medium text-ink-soft hover:text-ink"
            >
              Cancel
            </button>
          </>
        )}
      </div>
    </div>
  );
}

const PRIMARY =
  "mt-5 w-full rounded-full bg-ink px-4 py-3 text-sm font-semibold text-surface transition hover:opacity-90 disabled:opacity-60";

const HINT_KEY = "lingua.saved-word-hint-count.v1";
const HINT_MAX_SHOWS = 3;

/**
 * "Tap a word to save it." Under explanations it is shown only the first few
 * times (a permanent line under every explanation across a ten-question lesson
 * would be noise); on screens that are all about the text (chat, transcripts)
 * `always` keeps it. Without a provider there is nothing to tap, so no hint.
 */
export function SaveWordHint({ always = false }: { always?: boolean }) {
  const available = useSaveWord() !== null;
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (always) {
      setVisible(true);
      return;
    }
    let count = 0;
    try {
      count = Number.parseInt(window.localStorage.getItem(HINT_KEY) ?? "0", 10) || 0;
    } catch {
      // Storage blocked: show it rather than guess the learner has seen it.
    }
    if (count >= HINT_MAX_SHOWS) return;
    setVisible(true);
    try {
      window.localStorage.setItem(HINT_KEY, String(count + 1));
    } catch {
      // Not persisting is fine; it just may show again next time.
    }
  }, [always]);

  if (!available && !always) return null;
  if (!visible) return null;
  return (
    <p className="mt-1 text-xs text-ink-soft/70">
      {always ? "Tap any word to save it." : "Tap a word to save it."}
    </p>
  );
}
