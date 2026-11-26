import { createFileRoute, notFound } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { AiConsentGate } from "../../components/AiConsentGate";
import { SaveWordProvider } from "../../components/SaveWord";
import { localizeScenario } from "../../data/scenarios";
import { useProgress } from "../../lib/progress";
import { practiceModeSearch, type PracticeModeSearch } from "@/lib/practice-session";
import { ConverseChatPage } from "@/components/practice/ConverseCall";

export const Route = createFileRoute("/_authenticated/converse_/$scenarioId")({
  component: ConverseChatPageWithSave,
  // ?mode=call|chat from the pre-call sheet; without it the learner's own setting decides.
  validateSearch: (search: Record<string, unknown>): PracticeModeSearch =>
    practiceModeSearch(search),
  // Imported here so the scenario catalog stays out of the entry chunk the landing page loads.
  loader: async ({ params }) => {
    const { getScenario } = await import("../../data/scenarios");
    const scenario = getScenario(params.scenarioId);
    if (!scenario) throw notFound();
    return { scenario };
  },
  head: ({ loaderData }) => ({
    meta: [
      { title: `${loaderData?.scenario.title.en ?? "Chat"} — Alphonso` },
      {
        name: "description",
        content: `Roleplay ${loaderData?.scenario.title.en.toLowerCase() ?? "a scene"} with an AI English tutor.`,
      },
      { property: "og:title", content: `${loaderData?.scenario.title.en ?? "Chat"} — Alphonso` },
      { property: "og:description", content: "Practice real English out loud with an AI tutor." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

/** Tapping a word in this page's text opens the save dialog (phase 4 of save-any-word). */
function ConverseChatPageWithSave() {
  const { scenario: raw } = Route.useLoaderData();
  const course = useProgress((s) => s.course);
  const scenario = useMemo(() => localizeScenario(raw, course), [raw, course]);
  const { mode } = Route.useSearch();
  // "Try again" on the result screen starts a fresh call: a new mount, a new call id, the opener again.
  const [attempt, setAttempt] = useState(0);
  return (
    <SaveWordProvider>
      {/* Keyed by course, so switching course mid-chat starts a fresh
          conversation in the new language instead of mixing two. */}
      <AiConsentGate backTo="/converse">
        <ConverseChatPage
          key={`${raw.id}:${course}:${attempt}`}
          scenario={scenario}
          course={course}
          mode={mode}
          onRetry={() => setAttempt((a) => a + 1)}
        />
      </AiConsentGate>
    </SaveWordProvider>
  );
}
