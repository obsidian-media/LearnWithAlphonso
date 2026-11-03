import { Link } from "@tanstack/react-router";
import { useState } from "react";
import { useProStatus } from "@/lib/use-pro-status";
import { WebPaywall } from "./WebPaywall";

const BUTTON =
  "inline-flex min-h-11 w-full items-center justify-center rounded-2xl border-2 border-moss bg-surface px-6 py-3 font-display text-base font-bold text-moss transition-transform duration-100 active:translate-y-0.5 motion-reduce:transition-none";

/**
 * "Practise with Hector" on the lesson-complete screen, as on iPhone: Hector for a Pro learner, otherwise the paywall
 * in place, attributed to lesson_complete. Hidden while Pro is loading or cannot be checked, so nobody is shown a
 * paywall they may not need.
 */
export function PractiseWithHector() {
  const pro = useProStatus();
  const [open, setOpen] = useState(false);
  if (pro.state === "pro") {
    return (
      <Link to="/hector" className={BUTTON}>
        Practise with Hector
      </Link>
    );
  }
  if (pro.state !== "free") return null;
  return (
    <div className="w-full space-y-3">
      <button type="button" onClick={() => setOpen(true)} aria-expanded={open} className={BUTTON}>
        Practise with Hector
      </button>
      {open && <WebPaywall source="lesson_complete" />}
    </div>
  );
}
