import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect } from "react";
import { MobileFrame } from "../../components/AppShell";
import { PracticeHub, type StartTarget } from "../../components/practice/PracticeHub";
import { useProgress } from "../../lib/progress";
import { useAvatarPreference } from "../../lib/avatar/preference";
import { fetchPracticeHub } from "../../lib/practice-api";

export const Route = createFileRoute("/_authenticated/converse")({
  component: ConversePage,
  head: () => ({
    meta: [
      { title: "Practice — Alphonso" },
      {
        name: "description",
        content: "Voice roleplay with an AI tutor: scenes, campaigns and stars for every call.",
      },
      { property: "og:title", content: "Practice — Alphonso" },
      {
        property: "og:description",
        content: "Practice real conversations with an AI tutor.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

/** The Practice hub: the learner's stars, today's pick and their campaign, loaded per course from /api/practice. */
function ConversePage() {
  const course = useProgress((s) => s.course);
  const callByDefault = useAvatarPreference((s) => s.enabled);
  const hydrate = useAvatarPreference((s) => s.hydrate);
  useEffect(() => hydrate(), [hydrate]);
  const navigate = useNavigate();
  // Always fresh on arrival: a call that just ended changes the stars and "Continue".
  const hub = useQuery({
    queryKey: ["practice-hub", course],
    queryFn: () => fetchPracticeHub(course),
    staleTime: 0,
    refetchOnMount: "always",
  });
  const start = (t: StartTarget) => {
    if (t.kind === "scenario") {
      void navigate({
        to: "/converse/$scenarioId",
        params: { scenarioId: t.scenarioId },
        search: { mode: t.mode },
      });
    } else {
      void navigate({
        to: "/campaign/$campaignId",
        params: { campaignId: t.campaignId },
        search: { scene: t.sceneIndex, mode: t.mode },
      });
    }
  };
  return (
    <MobileFrame>
      <PracticeHub
        course={course}
        data={hub.data ?? null}
        initialMode={callByDefault ? "call" : "chat"}
        onStart={start}
      />
    </MobileFrame>
  );
}
