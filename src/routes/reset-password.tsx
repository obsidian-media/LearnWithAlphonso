import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useTheme } from "../lib/theme";
import { TextField } from "../components/TextField";

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
  const isStudioInk = useTheme((s) => s.theme === "studio-ink");
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
    <div className="grain min-h-dvh bg-surface text-ink">
      <div className="mx-auto flex min-h-dvh max-w-[430px] flex-col px-6 pb-10 pt-10">
        <Link to="/auth" className="mb-8 inline-flex items-center gap-2 text-ink-soft/70">
          <span className="text-lg">←</span>
          <span className="text-sm">Back to sign in</span>
        </Link>
        <h1 className="font-display text-[30px] font-semibold leading-tight text-ink">
          Set a new password
        </h1>
        <p className="mt-1.5 text-sm text-ink-soft/80">
          {ready
            ? "Choose something you'll remember. At least 6 characters."
            : "Open this page from the link in your reset email to continue."}
        </p>

        {done ? (
          <p
            className={
              isStudioInk
                ? "mt-8 border-l-[3px] border-l-moss py-2 pl-4 text-sm text-ink"
                : "mt-8 rounded-2xl border border-hairline bg-parchment px-4 py-3 text-sm text-ink"
            }
          >
            Password updated. Taking you to your lessons…
          </p>
        ) : (
          <form onSubmit={submit} className="mt-8 space-y-3">
            <TextField
              type="password"
              required
              minLength={6}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="New password"
              disabled={!ready}
              className="disabled:opacity-50"
            />
            <TextField
              type="password"
              required
              minLength={6}
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              placeholder="Confirm new password"
              disabled={!ready}
              className="disabled:opacity-50"
            />
            {error && (
              <p
                className={
                  isStudioInk
                    ? "border-l-[3px] border-l-rose-400 py-1 pl-3 text-xs text-rose-500"
                    : "rounded-xl bg-rose-50 px-3 py-2 text-xs text-rose-700"
                }
              >
                {error}
              </p>
            )}
            <button
              type="submit"
              disabled={busy || !ready}
              className="w-full rounded-full bg-ember px-4 py-3 text-sm font-semibold text-surface transition hover:opacity-90 disabled:opacity-50"
            >
              {busy ? "Saving…" : "Update password"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
