import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { AfterSignIn } from "../../components/firstrun/AfterSignIn";
import { FirstRunFlow } from "../../components/firstrun/FirstRunFlow";
import { FirstRunScreen } from "../../components/firstrun/FirstRunParts";
import { browserFirstRunStore, cleanAnswers, type FirstRunDraft } from "../../lib/first-run";
import {
  LEARNER_PROFILE_KEY,
  needsCompleteProfile,
  parseLearnerProfile,
  type LearnerProfile,
} from "../../lib/learner-profile";
import { saveLearnerProfile } from "../../lib/learner-profile.functions";
import { getMyProfile } from "../../lib/leaderboard.functions";
import { holdNamePrompt } from "../../lib/name-prompt-gate";
import { isLearnerHandle } from "../../lib/name-onboarding";
import { useProgress } from "../../lib/progress";
import { afterFirstRunPath } from "./hello";

export const Route = createFileRoute("/_authenticated/complete-profile")({
  component: CompleteProfile,
  validateSearch: (s: Record<string, unknown>): { edit?: true } =>
    s.edit === true || s.edit === "1" || s.edit === 1 ? { edit: true } : {},
  head: () => ({ meta: [{ title: "Complete your profile — Alphonso" }] }),
});

type Loaded = { profile: LearnerProfile; prefill: FirstRunDraft; avatarSeed: string };

/**
 * "Complete your profile": the first run once more for learners who signed up before it existed (or from Profile,
 * to change the answers), skipping the course and sign-in. Not now ends it for good.
 */
function CompleteProfile() {
  const navigate = useNavigate();
  const { edit } = Route.useSearch();
  const store = useMemo(() => browserFirstRunStore(), []);
  const course = useProgress((s) => s.course);
  const placementTaken = useProgress((s) => Boolean(s.placementTakenAt));
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [phase, setPhase] = useState<"questions" | "after">("questions");
  const [saved, setSaved] = useState<FirstRunDraft>({});

  useEffect(() => holdNamePrompt(), []);

  useEffect(() => {
    let live = true;
    void (async () => {
      const [{ data }, me] = await Promise.all([
        supabase.auth.getUser(),
        getMyProfile().catch(() => null),
      ]);
      const profile = parseLearnerProfile(data.user?.user_metadata?.[LEARNER_PROFILE_KEY]);
      if (!edit && !needsCompleteProfile(profile)) {
        navigate({ to: "/learn", replace: true });
        return;
      }
      const publicName =
        me?.display_name && !isLearnerHandle(me.display_name)
          ? me.display_name.split(" ")[0]
          : undefined;
      const prefill: FirstRunDraft = {
        ...profile,
        name: profile.name ?? publicName,
        country: profile.country ?? (me?.country as FirstRunDraft["country"]) ?? undefined,
        // A country already on the leaderboard was the learner's own choice: keep it on.
        showFlag: profile.showFlag || Boolean(me?.country),
      };
      delete (prefill as LearnerProfile).completedAt;
      delete (prefill as LearnerProfile).dismissedAt;
      if (live) setLoaded({ profile, prefill, avatarSeed: me?.avatar_seed ?? "a" });
    })();
    return () => {
      live = false;
    };
  }, [edit, navigate]);

  if (!loaded) return <FirstRunScreen>{null}</FirstRunScreen>;

  if (phase === "after") {
    return (
      <AfterSignIn
        name={saved.name ?? ""}
        course={course}
        interests={saved.interests ?? []}
        avatarSeed={loaded.avatarSeed}
        onFinish={(target) =>
          navigate({
            to:
              edit && target === "lesson"
                ? "/profile"
                : afterFirstRunPath(target, saved.level, placementTaken),
            replace: true,
          })
        }
      />
    );
  }

  return (
    <FirstRunFlow
      mode="complete"
      store={store}
      course={course}
      prefill={loaded.prefill}
      onExit={async () => {
        if (!edit)
          await saveLearnerProfile({ data: { patch: {}, mark: "dismissed" } }).catch(() => {});
        navigate({ to: edit ? "/profile" : "/learn", replace: true });
      }}
      onUnder13Ok={async () => {
        await supabase.auth.signOut();
        navigate({ to: "/", replace: true });
      }}
      onSave={async (draft) => {
        const patch = cleanAnswers({ ...draft, course }) ?? {};
        await saveLearnerProfile({ data: { patch, mark: "completed" } });
        store.clearDraft();
        setSaved(draft);
        setPhase("after");
      }}
    />
  );
}
