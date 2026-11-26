import { createFileRoute } from "@tanstack/react-router";
import { MobileFrame } from "../../components/AppShell";
import { AiConsentGate } from "../../components/AiConsentGate";
import { RehearsePage } from "../../components/rehearsal/RehearsePage";
import { useProgress } from "../../lib/progress";

export const Route = createFileRoute("/_authenticated/rehearse")({
  component: RehearseRoute,
  head: () => ({
    meta: [
      { title: "Rehearse a real conversation — Alphonso" },
      {
        name: "description",
        content: "Practise a real upcoming conversation with Alphonso in three short stages.",
      },
    ],
  }),
});

function RehearseRoute() {
  const course = useProgress((s) => s.course);
  return (
    <MobileFrame>
      <AiConsentGate backTo="/learn">
        {/* Keyed by course: switching course shows that course's rehearsal. */}
        <RehearsePage key={course} course={course} />
      </AiConsentGate>
    </MobileFrame>
  );
}
