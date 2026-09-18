import { motion, AnimatePresence } from "framer-motion";
import { useEffect, useRef } from "react";
import { HeartIcon } from "./icons";
import { useCountdown } from "../hooks/use-countdown";
import { useTheme } from "../lib/theme";

export function HeartsModal({
  open,
  refillAt,
  onClose,
}: {
  open: boolean;
  refillAt: number | null;
  onClose: () => void;
}) {
  const isStudioInk = useTheme((s) => s.theme === "studio-ink");
  const countdown = useCountdown(refillAt);
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);
  const previouslyFocused = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return;
    previouslyFocused.current = document.activeElement as HTMLElement | null;
    closeButtonRef.current?.focus();

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        onClose();
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      previouslyFocused.current?.focus();
    };
  }, [open, onClose]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          role="dialog"
          aria-modal="true"
          aria-labelledby="hearts-modal-title"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-end justify-center bg-ink/40 px-4 pb-6 sm:items-center"
          onClick={onClose}
        >
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 16 }}
            className={
              isStudioInk
                ? "w-full max-w-[380px] border-t border-hairline bg-surface p-6 pt-7 text-center"
                : "w-full max-w-[380px] rounded-3xl border border-hairline bg-surface p-6 text-center"
            }
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mx-auto mb-4 grid size-14 place-items-center rounded-full bg-rose-50 text-rose-500">
              <HeartIcon className="size-7" />
            </div>
            <h2 id="hearts-modal-title" className="font-display text-lg font-semibold text-ink">
              Out of hearts
            </h2>
            <p className="mt-1.5 text-sm text-ink-soft/80">
              You've used all your hearts for now.{" "}
              {countdown
                ? `They refill automatically in ${countdown}.`
                : "They'll refill again shortly."}
            </p>
            <button
              type="button"
              ref={closeButtonRef}
              onClick={onClose}
              className="mt-5 w-full rounded-full bg-ink px-4 py-3 text-sm font-semibold text-surface transition hover:opacity-90"
            >
              Got it
            </button>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
