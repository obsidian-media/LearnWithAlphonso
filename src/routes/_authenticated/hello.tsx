import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { AfterSignIn, type FinishTarget } from "../../components/firstrun/AfterSignIn";
import { FirstRunFooter, FirstRunScreen } from "../../components/firstrun/FirstRunParts";
import { answersToSend, browserFirstRunStore } from "../../lib/first-run";
import { saveLearnerProfile } from "../../lib/learner-profile.functions";
import type { LearnerProfilePatch } from "../../lib/learner-profile";
import { getMyProfile } from "../../lib/leaderboard.functions";
import { holdNamePrompt } from "../../lib/name-prompt-gate";
import { useProgress } from "../../lib/progress";

export const Route = createFileRoute("/_authenticated/hello")({
  component: Hello,
  head: () => ({ meta: [{ title: "Welcome — Alphonso" }] }),
});

type State =
  | { kind: "saving" }
  | { kind: "failed" }
  | { kind: "ready"; answers: LearnerProfilePatch; avatarSeed: string };

/** Where a learner goes after the first run: the placement test for "some" and "confident", else Learn. */
export function afterFirstRunPath(
  target: FinishTarget,
  level: LearnerProfilePatch["level"],
  placementTaken: boolean,
): "/hector" | "/placement" | "/learn" {
  if (target === "hector") return "/hector";
  if ((level === "some" || level === "confident") && !placementTaken) return "/placement";
  return "/learn";
}

/**
 * Right after sign-in from the first run: the answers kept in this browser are saved to the account (once), then
 * the profile picture, how you heard about us, and Meet Hector.
 */
function Hello() {
  const navigate = useNavigate();
  const store = useMemo(() => browserFirstRunStore(), []);
  const setCourse = useProgress((s) => s.setCourse);
  const placementTaken = useProgress((s) => Boolean(s.placementTakenAt));
  const [state, setState] = useState<State>({ kind: "saving" });

  useEffect(() => holdNamePrompt(), []);

  async function save() {
    const answers = answersToSend(store);
    if (!answers) {
      // Signed in without a first run on this device (or on another one): Learn decides what comes next.
      navigate({ to: "/learn", replace: true });
      return;
    }
    setState({ kind: "saving" });
    try {
      await saveLearnerProfile({ data: { patch: answers, mark: "completed" } });
      store.clearDraft();
      if (answers.course) setCourse(answers.course);
      const me = await getMyProfile().catch(() => null);
      setState({ kind: "ready", answers, avatarSeed: me?.avatar_seed ?? "a" });
    } catch {
      setState({ kind: "failed" });
    }
  }

  // Once, on arrival (a ref, so React's development double-run cannot save twice or race the cleared draft).
  const started = useRef(false);
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    void save();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (state.kind !== "ready") {
    return (
      <FirstRunScreen>
        <div className="grid flex-1 content-center justify-items-center gap-2 px-6 text-center">
          <h1 className="ds-type-title text-ds-brand">
            {state.kind === "saving" ? "Saving your plan…" : "Your plan didn't save"}
          </h1>
          {state.kind === "failed" && (
            <p className="ds-type-body text-ds-ink-soft">
              Your answers are still on this device. Check your connection and try again.
            </p>
          )}
        </div>
        {state.kind === "failed" && (
          <FirstRunFooter label="Try again" onClick={() => void save()} />
        )}
      </FirstRunScreen>
    );
  }

  const { answers } = state;
  return (
    <AfterSignIn
      name={answers.name ?? ""}
      course={answers.course ?? "en"}
      interests={answers.interests ?? []}
      avatarSeed={state.avatarSeed}
      onFinish={(target) =>
        navigate({ to: afterFirstRunPath(target, answers.level, placementTaken), replace: true })
      }
    />
  );
}
