import { createFileRoute } from "@tanstack/react-router";
import { HelpChat } from "@/components/help/HelpChat";
import { LessonFrame } from "@/components/AppShell";
import { useAiConsent } from "@/lib/ai-consent-context";

export const Route = createFileRoute("/_authenticated/help")({
  component: HelpPage,
  head: () => ({
    meta: [
      { title: "Help — Alphonso" },
      { name: "description", content: "Ask a question or talk to a person." },
      { name: "robots", content: "noindex" },
    ],
  }),
});

function HelpPage() {
  const consent = useAiConsent();
  return (
    <LessonFrame>
      <HelpChat aiDeclined={consent.status === "denied"} />
    </LessonFrame>
  );
}
