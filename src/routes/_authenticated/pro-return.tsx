import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { LessonFrame } from "../../components/AppShell";
import { PAYWALL_COPY, WEB_PAYWALL_COPY } from "../../lib/paywall-copy";
import { authHeaders, currentUserId } from "../../lib/auth-headers";
import { markJustPaid } from "../../lib/use-pro-status";
import { useProgress } from "../../lib/progress";
import { usePrefersReducedMotion } from "../../lib/use-prefers-reduced-motion";
import { ProWelcome } from "../../components/paywall/ProWelcome";
import { useCardName } from "../../lib/use-card-name";

export const Route = createFileRoute("/_authenticated/pro-return")({
  component: ProReturnPage,
  head: () => ({ meta: [{ title: "Alphonso Pro — Alphonso" }] }),
});

const POLL_MS = 2_000;
const GIVE_UP_MS = 30_000;

async function isPro(): Promise<boolean> {
  try {
    const res = await fetch("/api/pro-status", { headers: await authHeaders() });
    if (!res.ok) return false;
    return ((await res.json()) as { pro?: boolean }).pro === true;
  } catch {
    return false;
  }
}

/**
 * Where RevenueCat's checkout sends the learner after paying. RevenueCat can take a moment to activate Pro, so this
 * re-checks every 2 s for up to 30 s and then shows the welcome (Hector in his room, three openers, Call Hector). If Pro is still not active it says the payment was
 * received and offers a retry: never "failed", and never the paywall again (they have just paid).
 */
function ProReturnPage() {
  const navigate = useNavigate();
  const [waiting, setWaiting] = useState(true);
  const [active, setActive] = useState(false);
  const runRef = useRef(0);
  const course = useProgress((s) => s.course);
  const name = useCardName();
  const reduceMotion = usePrefersReducedMotion();

  const poll = useCallback(async () => {
    const run = ++runRef.current;
    setWaiting(true);
    const started = Date.now();
    while (runRef.current === run) {
      if (await isPro()) {
        setActive(true);
        return;
      }
      if (Date.now() - started >= GIVE_UP_MS) break;
      await new Promise((r) => setTimeout(r, POLL_MS));
    }
    if (runRef.current === run) setWaiting(false);
  }, []);

  useEffect(() => {
    void currentUserId().then(markJustPaid);
    void poll();
    return () => {
      runRef.current += 1;
    };
  }, [poll]);

  if (active) {
    return (
      <LessonFrame>
        <ProWelcome
          name={name}
          course={course}
          reduceMotion={reduceMotion}
          onCall={() => void navigate({ to: "/hector" })}
        />
      </LessonFrame>
    );
  }

  return (
    <LessonFrame>
      <div className="space-y-4 px-6 pt-12">
        <p className="ds-type-overline tracking-[0.18em] text-ds-action-text">
          {PAYWALL_COPY.fallbackTitle}
        </p>
        <p role="status" className="font-display text-2xl font-semibold text-ds-ink">
          {WEB_PAYWALL_COPY.activating}
        </p>
        {!waiting && (
          <button
            type="button"
            onClick={() => void poll()}
            className="rounded-full border border-ds-line px-4 py-2 text-sm font-semibold text-ds-ink"
          >
            {PAYWALL_COPY.tryAgain}
          </button>
        )}
      </div>
    </LessonFrame>
  );
}
