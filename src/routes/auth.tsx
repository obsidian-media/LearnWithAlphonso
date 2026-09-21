import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { motion } from "framer-motion";
import { supabase } from "@/integrations/supabase/client";
import { useTheme } from "../lib/theme";
import { TextField } from "../components/TextField";

export const Route = createFileRoute("/auth")({
  component: AuthPage,
  validateSearch: (s: Record<string, unknown>): { next?: string } =>
    typeof s.next === "string" && s.next.startsWith("/") && !s.next.startsWith("//")
      ? { next: s.next }
      : {},
  head: () => ({
    meta: [
      { title: "Sign in — Alphonso" },
      {
        name: "description",
        content: "Sign in to sync your English learning progress across devices.",
      },
      { property: "og:title", content: "Sign in — Alphonso" },
      {
        property: "og:description",
        content: "Save your streak, XP, and league rank to your account.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

function AuthPage() {
  const isStudioInk = useTheme((s) => s.theme === "studio-ink");
  const navigate = useNavigate();
  const { next } = Route.useSearch();
  // `fallback` lets signup default somewhere other than /learn (see the
  // signup branch below) while every other caller keeps today's
  // behavior. An explicit `next` always wins over either default -- a
  // deep link (e.g. an invite) shouldn't get hijacked into onboarding.
  const afterAuth = useCallback(
    (fallback: string = "/learn") => {
      if (next) window.location.href = next;
      else navigate({ to: fallback, replace: true });
    },
    [next, navigate],
  );
  const [mode, setMode] = useState<"signin" | "signup" | "forgot">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) afterAuth();
    });
  }, [afterAuth]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setNotice(null);
    setBusy(true);
    try {
      if (mode === "forgot") {
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: window.location.origin + "/reset-password",
        });
        if (error) throw error;
        setNotice(
          "If an account exists for that address, we've sent a link to reset your password. Check your inbox.",
        );
      } else if (mode === "signup") {
        // New signups land on the placement test first instead of a cold
        // /learn -- V4 pkg 3's onboarding call: not a hard gate (the
        // placement route's own exit button still lets them bail straight
        // to /learn), just a better default first screen than starting
        // blind at A1. An explicit `next` (e.g. an invite link) still wins.
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: window.location.origin + (next ?? "/placement"),
            data: { display_name: displayName || email.split("@")[0] },
          },
        });
        if (error) throw error;
        if (data.session) {
          afterAuth("/placement");
        } else {
          setNotice(
            "Almost there — check your email and click the confirmation link to activate your account.",
          );
        }
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        afterAuth();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  async function google() {
    setError(null);
    setBusy(true);
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo:
            window.location.origin + "/auth" + (next ? `?next=${encodeURIComponent(next)}` : ""),
        },
      });
      if (error) {
        setError(error.message);
        setBusy(false);
      }
      // On success the browser is redirected to Google, then back to
      // `redirectTo` — nothing left to do here.
    } catch (err) {
      setError(err instanceof Error ? err.message : "Google sign-in failed");
      setBusy(false);
    }
  }

  return (
    <div className="grain min-h-dvh bg-surface text-ink">
      <main
        id="main-content"
        className="mx-auto flex min-h-dvh max-w-[430px] flex-col px-6 pb-10 pt-10"
      >
        <Link to="/" className="mb-8 inline-flex items-center gap-2 text-ink-soft/70">
          <span className="text-lg">←</span>
          <span className="text-sm">Back</span>
        </Link>
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
        >
          <div className="mb-2 grid size-11 place-items-center rounded-xl bg-moss text-surface">
            <span className="font-display text-lg font-semibold">A</span>
          </div>
          <h1 className="font-display text-[30px] font-semibold leading-tight text-ink">
            {mode === "signup"
              ? "Create your account"
              : mode === "forgot"
                ? "Reset your password"
                : "Welcome back"}
          </h1>
          <p className="mt-1.5 text-sm text-ink-soft/80">
            {mode === "signup"
              ? "Save your streak and pick up on any device."
              : mode === "forgot"
                ? "Enter your email and we'll send you a link to set a new password."
                : "Sign in to continue where you left off."}
          </p>
        </motion.div>

        <div className="mt-8 space-y-3">
          <button
            type="button"
            onClick={google}
            disabled={busy}
            className="flex w-full items-center justify-center gap-2.5 rounded-full border border-hairline bg-surface px-4 py-3 text-sm font-medium text-ink transition hover:bg-parchment disabled:opacity-50"
          >
            <svg viewBox="0 0 24 24" className="size-4" aria-hidden>
              <path
                d="M21.35 11.1H12v3.2h5.35c-.23 1.5-1.68 4.4-5.35 4.4a5.7 5.7 0 1 1 0-11.4c1.79 0 2.99.77 3.68 1.43l2.5-2.4A9 9 0 1 0 12 21c5.2 0 8.7-3.65 8.7-8.8 0-.6-.07-1.05-.15-1.55z"
                fill="#4285F4"
              />
            </svg>
            Continue with Google
          </button>

          <div className="relative py-2 text-center">
            <div className="absolute inset-x-0 top-1/2 -z-10 h-px bg-hairline" />
            <span className="bg-surface px-3 text-[11px] uppercase tracking-[0.16em] text-ink-soft/60">
              or
            </span>
          </div>

          <form onSubmit={submit} className="space-y-3">
            {mode === "signup" && (
              <div>
                <label htmlFor="auth-display-name" className="sr-only">
                  Display name
                </label>
                <TextField
                  id="auth-display-name"
                  type="text"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder="Display name"
                  maxLength={40}
                />
              </div>
            )}
            <div>
              <label htmlFor="auth-email" className="sr-only">
                Email
              </label>
              <TextField
                id="auth-email"
                type="email"
                required
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="Email"
              />
            </div>
            {mode !== "forgot" && (
              <div>
                <label htmlFor="auth-password" className="sr-only">
                  Password
                </label>
                <TextField
                  id="auth-password"
                  type="password"
                  required
                  minLength={6}
                  autoComplete={mode === "signup" ? "new-password" : "current-password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Password"
                />
              </div>
            )}
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
            {notice && (
              <p
                className={
                  isStudioInk
                    ? "border-l-[3px] border-l-hairline py-1 pl-3 text-xs leading-relaxed text-ink-soft"
                    : "rounded-xl border border-hairline bg-parchment px-3 py-2 text-xs leading-relaxed text-ink"
                }
              >
                {notice}
              </p>
            )}
            <button
              type="submit"
              disabled={busy}
              className="w-full rounded-full bg-ember px-4 py-3 text-sm font-semibold text-surface transition hover:opacity-90 disabled:opacity-50"
            >
              {busy
                ? "Please wait…"
                : mode === "signup"
                  ? "Create account"
                  : mode === "forgot"
                    ? "Send reset link"
                    : "Sign in"}
            </button>
          </form>

          {mode === "signin" && (
            <button
              type="button"
              onClick={() => {
                setMode("forgot");
                setError(null);
                setNotice(null);
              }}
              className="w-full text-center text-xs text-ink-soft/70 hover:text-ink"
            >
              Forgot your password?
            </button>
          )}

          <button
            type="button"
            onClick={() => {
              setMode(mode === "signup" ? "signin" : mode === "forgot" ? "signin" : "signup");
              setError(null);
              setNotice(null);
            }}
            className="w-full py-2 text-center text-xs text-ink-soft/70 hover:text-ink"
          >
            {mode === "signup"
              ? "Have an account? Sign in"
              : mode === "forgot"
                ? "Back to sign in"
                : "New here? Create an account"}
          </button>

          <p className="pt-2 text-center text-[11px] leading-relaxed text-ink-soft/60">
            By continuing you agree to our{" "}
            <Link to="/terms" className="underline hover:text-ink">
              Terms
            </Link>
            ,{" "}
            <Link to="/privacy" className="underline hover:text-ink">
              Privacy Policy
            </Link>{" "}
            and{" "}
            <Link to="/cookies" className="underline hover:text-ink">
              Cookie Policy
            </Link>
            .
          </p>
        </div>
      </main>
    </div>
  );
}
