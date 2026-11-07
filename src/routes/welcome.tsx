import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { FirstRunFlow } from "../components/firstrun/FirstRunFlow";
import { browserFirstRunStore } from "../lib/first-run";

/** Where a signed-up learner continues after the account exists: their answers are saved there. */
export const AFTER_SIGN_IN = "/hello";

export const Route = createFileRoute("/welcome")({
  // Answers live in this browser until sign-in; there is nothing to render on the server.
  ssr: false,
  component: Welcome,
  head: () => ({
    meta: [
      { title: "Get started — Alphonso" },
      {
        name: "description",
        content:
          "Tell Alphonso a little about you, try two questions, and get your own plan for English, French or Spanish.",
      },
    ],
  }),
});

function Welcome() {
  const navigate = useNavigate();
  const store = useMemo(() => browserFirstRunStore(), []);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) navigate({ to: "/learn", replace: true });
    });
  }, [navigate]);

  async function google() {
    // Same as the sign-in page's Google button; the sign-in page then sends the learner on to save their answers.
    await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/auth?next=${encodeURIComponent(AFTER_SIGN_IN)}`,
      },
    });
  }

  return (
    <FirstRunFlow
      mode="new"
      store={store}
      onExit={() => navigate({ to: "/" })}
      onUnder13Ok={() => navigate({ to: "/" })}
      onGoogle={() => void google()}
      onEmail={() => navigate({ to: "/auth", search: { next: AFTER_SIGN_IN, mode: "signup" } })}
      onHaveAccount={() => navigate({ to: "/auth", search: { next: AFTER_SIGN_IN } })}
    />
  );
}
