import { motion, AnimatePresence } from "framer-motion";
import { useEffect, useRef, useState } from "react";
import { HeartIcon } from "./icons";
import { useCountdown } from "../hooks/use-countdown";
import { XP_HEART_COST } from "../lib/hearts";

export function HeartsModal({
  open,
  refillAt,
  xp,
  onClose,
  onRefillDue,
  onBuyWithXp,
}: {
  open: boolean;
  refillAt: number | null;
  /** Current course XP, so the "buy with XP" option only shows when affordable. */
  xp?: number;
  onClose: () => void;
  /** Fired once when the countdown reaches zero while the modal is mounted. */
  onRefillDue?: () => void;
  /** Fired when the user chooses to spend XP for an immediate heart. */
  onBuyWithXp?: () => void;
}) {
  const countdown = useCountdown(refillAt);
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);
  const previouslyFocused = useRef<HTMLElement | null>(null);
  const [buying, setBuying] = useState(false);

  useEffect(() => {
    if (!open) return;
    previouslyFocused.current = document.activeElement as HTMLElement | null;
    closeButtonRef.current?.focus();
    setBuying(false);

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

  // The countdown hook returns null both when there's nothing to wait for
  // and once time is up -- fire onRefillDue only on the actual transition
  // from "counting down" to "done", not on initial mount.
  const wasCounting = useRef(false);
  useEffect(() => {
    if (!open || !refillAt) {
      wasCounting.current = false;
      return;
    }
    if (countdown !== null) {
      wasCounting.current = true;
    } else if (wasCounting.current) {
      wasCounting.current = false;
      onRefillDue?.();
    }
  }, [open, refillAt, countdown, onRefillDue]);

  const canBuyWithXp = onBuyWithXp !== undefined && xp !== undefined && xp >= XP_HEART_COST;

  function handleBuy() {
    if (buying) return;
    setBuying(true);
    onBuyWithXp?.();
  }

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
            className="w-full max-w-[380px] rounded-3xl border border-hairline bg-surface p-6 text-center"
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
            {canBuyWithXp && (
              <button
                type="button"
                onClick={handleBuy}
                disabled={buying}
                className="mt-5 w-full rounded-full border border-moss bg-moss/10 px-4 py-3 text-sm font-semibold text-moss transition hover:bg-moss/15 disabled:opacity-60"
              >
                Use {XP_HEART_COST} XP for a heart
              </button>
            )}
            <button
              type="button"
              ref={closeButtonRef}
              onClick={onClose}
              className={`w-full rounded-full bg-ink px-4 py-3 text-sm font-semibold text-surface transition hover:opacity-90 ${canBuyWithXp ? "mt-2.5" : "mt-5"}`}
            >
              Got it
            </button>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
