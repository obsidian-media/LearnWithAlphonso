import { useState } from "react";
import { PAYWALL_COPY, WEB_PAYWALL_COPY } from "@/lib/paywall-copy";
import { useProStatus } from "@/lib/use-pro-status";
import { WebPaywallSheet } from "./WebPaywall";

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
 * checked. Tapping it opens the paywall over the page (Close or Escape returns), attributed to where it was opened.
 */
export function HectorInvite({
  source,
  look = "plain",
}: {
  source: keyof typeof COPY;
  /** "hub": the Practice hub's navy card with Hector's face (round 6). Same rules either way. */
  look?: "plain" | "hub";
}) {
  const pro = useProStatus();
  const [open, setOpen] = useState(false);
  if (pro.state !== "free") return null;
  const copy = COPY[source];
  if (look === "hub") {
    return (
      <div className="space-y-3">
        <button
          type="button"
          data-hector-card=""
          onClick={() => setOpen(true)}
          aria-expanded={open}
          className="flex w-full items-center gap-2.5 rounded-[20px] bg-ds-hero px-3 py-2.5 text-left text-ds-on-hero shadow-[inset_0_0_0_1px_color-mix(in_srgb,var(--c-action)_35%,transparent)]"
        >
          <span
            aria-hidden="true"
            className="size-12 shrink-0 overflow-hidden rounded-full bg-ds-sunk shadow-[0_0_0_2px_var(--c-action)]"
          >
            <img
              src="/firstrun/hector-happy.webp"
              alt=""
              draggable={false}
              className="size-full origin-top scale-[1.75] object-cover object-top"
            />
          </span>
          <span className="min-w-0 flex-1">
            <span className="flex items-center gap-1.5 ds-type-headline font-extrabold">
              {copy.title}
              <span className="rounded-[5px] bg-ds-action px-1.5 ds-type-overline text-ds-on-action">
                Pro
              </span>
            </span>
            <span className="mt-0.5 block ds-type-caption font-semibold text-ds-on-hero-soft">
              {copy.subtitle}
            </span>
          </span>
        </button>
        {open && <WebPaywallSheet source={source} onClose={() => setOpen(false)} />}
      </div>
    );
  }
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
      {open && <WebPaywallSheet source={source} onClose={() => setOpen(false)} />}
    </div>
  );
}
