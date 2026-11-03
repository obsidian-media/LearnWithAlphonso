import { useCallback, useEffect, useState } from "react";
import { authHeaders } from "@/lib/auth-headers";
import {
  PAYWALL_COPY,
  paywallDisclosure,
  paywallPriceLine,
  paywallTrialLine,
  type BillingPeriod,
  type PaywallSource,
} from "@/lib/paywall-copy";

type Offer = {
  /** Null when there is no price for this learner's country: checkout shows it in their currency. */
  price: string | null;
  period: BillingPeriod;
  trialDays: number | null;
  purchaseUrl: string;
};
type State = { kind: "loading" } | { kind: "failed" } | { kind: "loaded"; offer: Offer };

/**
 * The website's Alphonso Pro paywall. The price and trial come from /api/pro-offering (RevenueCat); when that fails
 * it shows the iPhone's load error and a retry, and no price at all. The button sends the learner to RevenueCat's
 * hosted checkout (Stripe), which shows the final price; no card form lives on this site.
 */
export function WebPaywall({ source }: { source: PaywallSource }) {
  const [state, setState] = useState<State>({ kind: "loading" });

  const load = useCallback(async () => {
    setState({ kind: "loading" });
    try {
      const res = await fetch(`/api/pro-offering?source=${encodeURIComponent(source)}`, {
        headers: await authHeaders(),
      });
      if (!res.ok) return setState({ kind: "failed" });
      setState({ kind: "loaded", offer: (await res.json()) as Offer });
    } catch {
      setState({ kind: "failed" });
    }
  }, [source]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <section
      aria-label={PAYWALL_COPY.fallbackTitle}
      className="rounded-2xl border border-hairline bg-surface p-5"
    >
      <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-ember">
        {PAYWALL_COPY.fallbackTitle}
      </p>
      <h2 className="mt-1 font-display text-2xl font-semibold text-ink">
        {PAYWALL_COPY.mascotMessage}
      </h2>
      <p className="mt-2 text-sm text-ink-soft/80">{PAYWALL_COPY.featureBlurb}</p>

      {state.kind === "loading" && (
        <p role="status" className="mt-5 text-sm text-ink-soft/70">
          …
        </p>
      )}

      {state.kind === "failed" && (
        <div className="mt-5 space-y-3">
          <p role="alert" className="text-sm text-ink-soft">
            {PAYWALL_COPY.loadFailed}
          </p>
          <button
            type="button"
            onClick={() => void load()}
            className="w-full rounded-full border border-hairline px-4 py-3 text-sm font-semibold text-ink"
          >
            {PAYWALL_COPY.tryAgain}
          </button>
        </div>
      )}

      {state.kind === "loaded" && <Loaded offer={state.offer} />}
    </section>
  );
}

function Loaded({ offer }: { offer: Offer }) {
  const trialLine = paywallTrialLine(offer.price, offer.period, offer.trialDays);
  return (
    <div className="mt-5 space-y-3">
      <p className="font-display text-[22px] font-bold text-ink">
        {paywallPriceLine(offer.price, offer.period)}
      </p>
      {trialLine && <p className="text-[22px] font-semibold text-ink">{trialLine}</p>}
      <button
        type="button"
        onClick={() => window.location.assign(offer.purchaseUrl)}
        className="w-full rounded-full bg-ember px-4 py-3 text-sm font-semibold text-ink-on-ember transition hover:opacity-90"
      >
        {trialLine ? PAYWALL_COPY.startFreeTrial : PAYWALL_COPY.subscribe}
      </button>
      <p className="text-xs leading-relaxed text-ink-soft/70">
        {paywallDisclosure(offer.price, offer.period, offer.trialDays)}
      </p>
    </div>
  );
}
