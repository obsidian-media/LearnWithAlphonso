import { useCallback, useEffect, useRef, useState } from "react";
import { track } from "../lib/analytics";
import { authHeaders } from "@/lib/auth-headers";
import {
  PAYWALL_COPY,
  PRO_PAYWALL_COPY,
  WEB_PAYWALL_COPY,
  type PaywallSource,
} from "@/lib/paywall-copy";
import {
  PAYWALL_TEXT_ROLE,
  orderPlans,
  planPriceLine,
  planTrialLine,
  whenLine,
  yearlySavingPercent,
  type PaywallPlan,
} from "@/lib/paywall-plans";
import { useProgress } from "@/lib/progress";
import { useCardName } from "@/lib/use-card-name";
import { GetHelpLink } from "./help/HelpEntry";
import { edgeButtonClass } from "./lesson/LessonParts";
import { FOCUSABLE } from "./Modal";
import {
  CloseButton,
  ExampleCall,
  FreeRow,
  PaywallFacts,
  PaywallHeadline,
  PaywallRoomTop,
  PlanPicker,
  ProCardBanner,
  WhenRow,
} from "./paywall/PaywallParts";

type State =
  | { kind: "loading" }
  | { kind: "failed" }
  | { kind: "not-configured" }
  | { kind: "loaded"; plans: PaywallPlan[] };

/**
 * The website's Alphonso Pro paywall (visual round 6, BACKLOG 0.0-bk): Hector in his room with the learner's Pro card
 * pinned in the corner, a labelled example call and three facts; then the card leads the plans. Every price, the
 * currency, the trial and its length, and the saving come from /api/pro-offering (RevenueCat Web Billing) for this
 * learner; this file holds none. Not on sale on this deployment yet: a calm "Coming soon" and no price. Unreadable:
 * the iPhone's load error and a retry. The button goes to RevenueCat's hosted checkout (Stripe).
 */
export function WebPaywall({ source, onClose }: { source: PaywallSource; onClose?: () => void }) {
  const [state, setState] = useState<State>({ kind: "loading" });
  const course = useProgress((s) => s.course);
  const name = useCardName();

  const load = useCallback(async () => {
    setState({ kind: "loading" });
    try {
      const res = await fetch(`/api/pro-offering?source=${encodeURIComponent(source)}`, {
        headers: await authHeaders(),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { reason?: string };
        return setState({ kind: body.reason === "not-configured" ? "not-configured" : "failed" });
      }
      const body = (await res.json()) as { plans?: PaywallPlan[] };
      const plans = orderPlans(body.plans ?? []);
      setState(plans.length ? { kind: "loaded", plans } : { kind: "failed" });
    } catch {
      setState({ kind: "failed" });
    }
  }, [source]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    void track("paywall_viewed", { source });
  }, [source]);

  return (
    <section
      aria-label={PAYWALL_COPY.fallbackTitle}
      className="ds-light relative bg-ds-surface font-[family-name:var(--ds-font-body)] text-ds-ink"
      data-paywall=""
    >
      <PaywallRoomTop name={name} close={onClose && <CloseButton onClose={onClose} />} />
      <div className="relative z-[2] -mt-[22px] flex flex-col gap-2.5 px-4 pb-6">
        <PaywallHeadline />
        <ExampleCall course={course} />
        <PaywallFacts />
      </div>

      <div
        className="flex flex-col gap-2.5 px-4 pb-[max(env(safe-area-inset-bottom),24px)] pt-4"
        data-paywall-plans=""
      >
        <ProCardBanner name={name} />
        <FreeRow />
        {state.kind === "loading" && (
          <p role="status" className="ds-type-footnote py-6 text-center text-ds-ink-soft">
            …
          </p>
        )}
        {state.kind === "failed" && (
          <div className="grid gap-3 py-2">
            <p role="alert" className="ds-type-footnote m-0 text-center text-ds-ink-soft">
              {PAYWALL_COPY.loadFailed}
            </p>
            <button
              type="button"
              onClick={() => void load()}
              className={edgeButtonClass("secondary")}
            >
              {PAYWALL_COPY.tryAgain}
            </button>
            <GetHelpLink className="mx-auto" />
          </div>
        )}
        {state.kind === "not-configured" && <ComingSoon />}
        {state.kind === "loaded" && <Plans plans={state.plans} source={source} />}
      </div>
    </section>
  );
}

function ComingSoon() {
  return (
    <div
      role="status"
      className="grid gap-1 rounded-[var(--ds-radius-control)] border-2 border-dashed border-ds-line bg-ds-card px-4 py-5 text-center"
      data-coming-soon=""
    >
      <p className="ds-type-headline m-0 font-extrabold text-ds-ink">
        {PRO_PAYWALL_COPY.comingSoonTitle}
      </p>
      <p className="ds-type-footnote m-0 text-ds-ink-soft">{PRO_PAYWALL_COPY.comingSoonBody}</p>
    </div>
  );
}

function Plans({ plans, source }: { plans: PaywallPlan[]; source: PaywallSource }) {
  const [selected, setSelected] = useState(0);
  const plan = plans[selected] ?? plans[0];
  const trialLine = planTrialLine(plan.trialDays);
  const when = whenLine(plan.trialDays, new Date());
  return (
    <>
      <PlanPicker
        plans={plans}
        selected={selected}
        onSelect={setSelected}
        saving={yearlySavingPercent(plans)}
      />
      <div className="grid gap-px text-center" aria-live="polite">
        <p className={`${PAYWALL_TEXT_ROLE.price} m-0 font-extrabold! text-ds-ink`}>
          {planPriceLine(plan, trialLine !== null)}
        </p>
        {trialLine && (
          <p className={`${PAYWALL_TEXT_ROLE.trial} m-0 text-ds-ink-soft`}>{trialLine}</p>
        )}
      </div>
      <WhenRow lead={when.lead} rest={when.rest} />
      <button
        type="button"
        onClick={() => {
          void track("purchase_started", { source });
          window.location.assign(plan.purchaseUrl);
        }}
        className={edgeButtonClass("primary")}
      >
        {trialLine ? PAYWALL_COPY.startFreeTrial : PAYWALL_COPY.subscribe}
      </button>
      <SmallPrint />
    </>
  );
}

/** Renewal terms, Restore (re-checks this account), Terms and Privacy. */
function SmallPrint() {
  const [note, setNote] = useState<string | null>(null);
  const busy = useRef(false);
  const restore = async () => {
    if (busy.current) return;
    busy.current = true;
    setNote(null);
    try {
      const res = await fetch("/api/pro-status", { headers: await authHeaders() });
      const body = (await res.json().catch(() => ({}))) as { pro?: boolean };
      if (res.ok && body.pro === true) return window.location.assign("/hector");
      setNote(res.ok ? PRO_PAYWALL_COPY.restoreNone : WEB_PAYWALL_COPY.checkFailed);
    } catch {
      setNote(WEB_PAYWALL_COPY.checkFailed);
    } finally {
      busy.current = false;
    }
  };
  const link =
    "underline decoration-ds-line underline-offset-2 hover:text-ds-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ds-choice";
  return (
    <div className="ds-type-footnote grid gap-1.5 text-center text-ds-ink-soft">
      <p className="m-0">{PRO_PAYWALL_COPY.renewal}</p>
      <p className="m-0 flex flex-wrap items-center justify-center gap-x-1.5">
        <button type="button" onClick={() => void restore()} className={`min-h-6 ${link}`}>
          {PRO_PAYWALL_COPY.restore}
        </button>
        <span aria-hidden="true">·</span>
        <a href="/terms" className={`inline-flex min-h-6 items-center ${link}`}>
          {PRO_PAYWALL_COPY.terms}
        </a>
        <span aria-hidden="true">·</span>
        <a href="/privacy" className={`inline-flex min-h-6 items-center ${link}`}>
          {PRO_PAYWALL_COPY.privacy}
        </a>
      </p>
      {note && (
        <div role="status" className="grid justify-items-center gap-2 text-ds-ink">
          <p className="m-0">{note}</p>
          {note === WEB_PAYWALL_COPY.checkFailed && <GetHelpLink />}
        </div>
      )}
    </div>
  );
}

/**
 * The paywall over the page, for the entry points that open it from a card or a button (Practice's Hector card, the
 * end-of-Practice prompt, lesson complete): a modal with Close and Escape, Tab kept inside, the page behind locked
 * from scrolling, focus moved in and given back on close.
 */
export function WebPaywallSheet({
  source,
  onClose,
}: {
  source: PaywallSource;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    ref.current?.querySelector<HTMLElement>("[data-paywall-close]")?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") return closeRef.current();
      const sheet = ref.current;
      if (e.key !== "Tab" || !sheet) return;
      // Tab stays in the sheet: only what Tab can reach (the unpicked plan is tabIndex -1, as a radio group).
      const items = [...sheet.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(
        (el) => el.tabIndex >= 0,
      );
      if (!items.length) return;
      const at = items.indexOf(document.activeElement as HTMLElement);
      const next = e.shiftKey
        ? at <= 0
          ? items.length - 1
          : at - 1
        : at === -1 || at === items.length - 1
          ? 0
          : at + 1;
      e.preventDefault();
      items[next].focus();
    };
    document.addEventListener("keydown", onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = overflow;
      opener?.focus?.();
    };
  }, []);
  return (
    <div
      ref={ref}
      role="dialog"
      aria-modal="true"
      aria-label={PAYWALL_COPY.fallbackTitle}
      className="ds-light fixed inset-0 z-40 overflow-y-auto bg-ds-surface"
    >
      <div className="mx-auto max-w-[430px]">
        <WebPaywall source={source} onClose={onClose} />
      </div>
    </div>
  );
}
