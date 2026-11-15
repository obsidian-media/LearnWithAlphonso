import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import {
  isLongEnoughNewPassword,
  MIN_NEW_PASSWORD_LENGTH,
  TOO_SHORT_MESSAGE,
} from "@/lib/password-policy";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { TextField } from "../components/TextField";
import { FirstRunBubble, FirstRunRoom, FirstRunScreen } from "../components/firstrun/FirstRunParts";
import { edgeButtonClass } from "../components/lesson/LessonParts";
import { roomSrc } from "../lib/first-run";
import { expressionSrc } from "../lib/lesson-stage";

export const Route = createFileRoute("/reset-password")({
  component: ResetPasswordPage,
  head: () => ({
    meta: [
      { title: "Set a new password — Alphonso" },
      {
        name: "description",
        content: "Choose a new password and get back into your Alphonso account.",
      },
      { property: "og:title", content: "Set a new password — Alphonso" },
      { property: "og:description", content: "Recover access to your English learning progress." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

function ResetPasswordPage() {
  const navigate = useNavigate();
  const [ready, setReady] = useState(false);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY" || event === "SIGNED_IN") setReady(true);
    });
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) setReady(true);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (password !== confirm) {
      setError("Both passwords must match.");
      return;
    }
    if (!isLongEnoughNewPassword(password)) {
      setError(TOO_SHORT_MESSAGE);
      return;
    }
    setBusy(true);
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      setDone(true);
      setTimeout(() => navigate({ to: "/learn", replace: true }), 1200);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update your password");
    } finally {
      setBusy(false);
    }
  }

  return (
    <FirstRunScreen>
      <FirstRunRoom
        room={roomSrc("room-light")}
        figure={expressionSrc("talk")}
        figureAlt="Alphonso"
        top={
          <Link
            to="/auth"
            aria-label="Back to sign in"
            className="grid size-11 place-items-center rounded-full bg-ds-card text-ds-brand shadow-[var(--ds-shadow-resting)]"
          >
            <span aria-hidden="true" className="text-lg">
              ←
            </span>
          </Link>
        }
      />
      <FirstRunBubble
        title="Set a new password"
        sub={
          ready
            ? "Choose something you'll remember. At least 10 characters."
            : "Open this page from the link in your reset email to continue."
        }
      />
      <div className="px-4 pb-10 pt-4">
        {done ? (
          <p
            role="status"
            className="rounded-[22px] border-2 border-ds-right bg-ds-right-tint px-4 py-3 ds-type-footnote text-ds-right-ink"
          >
            Password updated. Taking you to your lessons…
          </p>
        ) : (
          <form onSubmit={submit} className="space-y-3">
            <TextField
              type="password"
              required
              minLength={MIN_NEW_PASSWORD_LENGTH}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="New password"
              disabled={!ready}
              className="disabled:opacity-50"
            />
            <TextField
              type="password"
              required
              minLength={MIN_NEW_PASSWORD_LENGTH}
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              placeholder="Confirm new password"
              disabled={!ready}
              className="disabled:opacity-50"
            />
            {error && (
              <p
                role="alert"
                className="rounded-[14px] bg-ds-wrong-tint px-3 py-2 ds-type-caption text-ds-wrong-ink"
              >
                {error}
              </p>
            )}
            <button
              type="submit"
              disabled={busy || !ready}
              className={`w-full ${edgeButtonClass("primary")}`}
            >
              {busy ? "Saving…" : "Update password"}
            </button>
          </form>
        )}
      </div>
    </FirstRunScreen>
  );
}
