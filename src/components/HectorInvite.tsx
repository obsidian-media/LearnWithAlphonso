import { useState } from "react";
import { PAYWALL_COPY, WEB_PAYWALL_COPY } from "@/lib/paywall-copy";
import { useProStatus } from "@/lib/use-pro-status";
import { WebPaywall } from "./WebPaywall";

const COPY = {
  practice_hector_card: {
    title: PAYWALL_COPY.practiceCardTitle,
    subtitle: PAYWALL_COPY.practiceCardSubtitle,
  },
  practice_end_prompt: {
    title: WEB_PAYWALL_COPY.continueWithHector,
    subtitle: WEB_PAYWALL_COPY.continueWithHectorSubtitle,
  },
} as const;

/**
 * Practice's invitation to Hector (the iPhone's practiceCard), and the end-of-conversation "Continue with Hector"
 * prompt. Shown only to a learner confirmed not to have Pro: hidden for Pro, while loading, and when Pro cannot be
 * checked. Tapping it opens the paywall in place, attributed to where it was opened.
 */
export function HectorInvite({ source }: { source: keyof typeof COPY }) {
  const pro = useProStatus();
  const [open, setOpen] = useState(false);
  if (pro.state !== "free") return null;
  const copy = COPY[source];
  return (
    <div className="space-y-3">
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-expanded={open}
        className="flex w-full items-start gap-3 rounded-2xl border border-ember/30 bg-ember/5 p-4 text-left"
      >
        <span aria-hidden="true" className="text-xl leading-none">
          ✨
        </span>
        <span className="min-w-0 flex-1">
          <span className="block font-display text-base font-semibold text-ink">{copy.title}</span>
          <span className="mt-0.5 block text-xs text-ink-soft/80">{copy.subtitle}</span>
        </span>
      </button>
      {open && <WebPaywall source={source} />}
    </div>
  );
}
