import { motion, AnimatePresence } from "framer-motion";
import { useEffect, useRef, useState } from "react";
import { DsButton, Icon } from "@/components/ds/Blocks";
import { useCountdown } from "../hooks/use-countdown";
import { XP_HEART_COST } from "../lib/hearts";

export function HeartsModal({
  open,
  refillAt,
  xp,
  buyError,
  onClose,
  onRefillDue,
  onBuyWithXp,
  onPracticeInstead,
}: {
  open: boolean;
  refillAt: number | null;
  /** Current course XP, so the "buy with XP" option only shows when affordable. */
  xp?: number;
  /** Message to show if the last purchase attempt failed (e.g. "Not enough XP"). */
  buyError?: string | null;
  onClose: () => void;
  /** Fired once when the countdown reaches zero while the modal is mounted. */
  onRefillDue?: () => void;
  /** Fired when the user chooses to spend XP for an immediate heart. */
  onBuyWithXp?: () => void;
  /** Always offered when provided, so out-of-hearts is never a dead end. */
  onPracticeInstead?: () => void;
}) {
  const countdown = useCountdown(refillAt);
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);
  const buyButtonRef = useRef<HTMLButtonElement | null>(null);
  const practiceButtonRef = useRef<HTMLButtonElement | null>(null);
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
        return;
      }
      // Focus trap: this dialog isn't in a portal, so without this, Tab
      // could escape into the bottom-tab nav behind the (still visible)
      // backdrop.
      if (e.key === "Tab") {
        const focusables = [
          buyButtonRef.current,
          practiceButtonRef.current,
          closeButtonRef.current,
        ].filter((el): el is HTMLButtonElement => el !== null);
        if (focusables.length === 0) return;
        const first = focusables[0];
        const last = focusables[focusables.length - 1];
        const active = document.activeElement;
        const atEdge = e.shiftKey ? active === first : active === last;
        if (atEdge || !focusables.includes(active as HTMLButtonElement)) {
          e.preventDefault();
          (e.shiftKey ? last : first).focus();
        }
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

  // Re-enable the buy button once the attempt resolves either way: xp
  // changing means it succeeded (cost was deducted), buyError appearing
  // means it failed.
  useEffect(() => {
    setBuying(false);
  }, [xp, buyError]);

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
          className="fixed inset-0 z-50 flex items-end justify-center bg-ds-ink/45"
          onClick={onClose}
        >
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 24 }}
            className="relative mt-24 grid w-full max-w-[430px] justify-items-center gap-2.5 rounded-t-[28px] bg-ds-surface px-4 pb-8 pt-6 text-center shadow-[var(--ds-shadow-sheet)]"
            onClick={(e) => e.stopPropagation()}
          >
            <img
              src="/figures/alphonso-hearts-calm.webp"
              alt=""
              height={130}
              decoding="async"
              draggable={false}
              className="-mt-24 h-[130px] w-auto"
            />
            <h2 id="hearts-modal-title" className="ds-type-display text-ds-ink">
              Out of hearts
            </h2>
            <p className="ds-type-body text-ds-ink-soft">
              You've used all your hearts for now.{" "}
              {countdown ? (
                <>
                  Your next heart comes back in{" "}
                  <b className="tnum text-ds-heart-text">{countdown}</b>.
                </>
              ) : (
                "A heart will come back shortly."
              )}
            </p>
            <div className="flex items-center gap-2" aria-hidden="true">
              <Icon name="red_heart" size={52} />
              <span className="ds-type-numeral-x-l tnum text-ds-heart-text">0</span>
            </div>
            <div className="grid w-full gap-2.5">
              {canBuyWithXp && (
                <DsButton full ref={buyButtonRef} onClick={handleBuy} disabled={buying}>
                  Use {XP_HEART_COST} XP for a heart
                </DsButton>
              )}
              {buyError && (
                <p role="alert" className="ds-type-caption text-ds-wrong-ink">
                  {buyError}
                </p>
              )}
              {onPracticeInstead && (
                <DsButton
                  full
                  variant="secondary"
                  ref={practiceButtonRef}
                  onClick={onPracticeInstead}
                >
                  Review instead
                </DsButton>
              )}
              <DsButton
                full
                variant={canBuyWithXp || onPracticeInstead ? "secondary" : "primary"}
                ref={closeButtonRef}
                onClick={onClose}
              >
                Got it
              </DsButton>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
