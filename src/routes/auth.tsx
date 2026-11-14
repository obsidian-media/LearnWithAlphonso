import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { track } from "../lib/analytics";
import { TurnstileWidget } from "@/components/TurnstileWidget";
import { captchaOptions, turnstileSiteKey } from "@/lib/turnstile";
import {
  isLongEnoughNewPassword,
  MIN_NEW_PASSWORD_LENGTH,
  TOO_SHORT_MESSAGE,
} from "@/lib/password-policy";
import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { TextField } from "../components/TextField";
import { safeNextPath } from "../lib/safe-next-path";
import { browserFirstRunStore } from "../lib/first-run";
import { Under13Stop } from "../components/firstrun/Under13Stop";
import { FirstRunBubble, FirstRunRoom, FirstRunScreen } from "../components/firstrun/FirstRunParts";
import { isAccountSuspendedError, useAccountStatus } from "../lib/account-suspended";
import { roomSrc } from "../lib/first-run";
import { expressionSrc } from "../lib/lesson-stage";
import { edgeButtonClass } from "../components/lesson/LessonParts";

export const Route = createFileRoute("/auth")({
  component: AuthPage,
  validateSearch: (s: Record<string, unknown>): { next?: string; mode?: "signup" } => ({
    ...(safeNextPath(s.next) ? { next: safeNextPath(s.next) } : {}),
    // The first run's "Continue with email" opens straight on Create your account.
    ...(s.mode === "signup" ? { mode: "signup" as const } : {}),
  }),
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
  const navigate = useNavigate();
  const { next, mode: startMode } = Route.useSearch();
  // A device that answered Under 13 in the first run cannot make an account here either (BACKLOG 0.0-bd).
  const [firstRun] = useState(() => browserFirstRunStore());
  const blocked = firstRun.isBlocked();
  // `fallback` lets signup default somewhere other than /learn (see the
  // signup branch below) while every other caller keeps today's
  // behavior. An explicit `next` always wins over either default -- a
  // deep link (e.g. an invite) shouldn't get hijacked into onboarding.
  const afterAuth = useCallback(
    (fallback: string = "/learn") => {
      // Re-vetted at the sink, not only in validateSearch.
      const safe = safeNextPath(next);
      if (safe) window.location.href = safe;
      else navigate({ to: fallback, replace: true });
    },
    [next, navigate],
  );
  const [mode, setMode] = useState<"signin" | "signup" | "forgot" | "verify">(
    startMode === "signup" ? "signup" : "signin",
  );
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  // The first run's name, if they gave one; the field says it is the public display name, and they can change it.
  const [displayName, setDisplayName] = useState(() => firstRun.readDraft().name ?? "");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  // Turnstile, only when a site key is configured (src/lib/turnstile.ts). Each token is single-use, so every request
  // that spends one bumps captchaReset for a fresh widget.
  const captchaSiteKey = turnstileSiteKey();
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const [captchaReset, setCaptchaReset] = useState(0);
  const needsCaptcha = Boolean(captchaSiteKey) && mode !== "verify";
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
      if (mode === "verify") {
        // The confirmation email carries a 6-digit code, not a link (scripts/auth-email-template.ts).
        const token = code.replace(/\D/g, "");
        if (token.length !== 6) {
          setError("Enter the 6-digit code from the email.");
          return;
        }
        const { error } = await supabase.auth.verifyOtp({ email, token, type: "signup" });
        if (error) throw error;
        void track("sign_in_completed", { method: "email" });
        afterAuth("/placement");
      } else if (mode === "forgot") {
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: window.location.origin + "/reset-password",
          ...captchaOptions(captchaToken),
        });
        if (error) throw error;
        setNotice(
          "If an account exists for that address, we've sent a link to reset your password. Check your inbox.",
        );
      } else if (mode === "signup") {
        if (!isLongEnoughNewPassword(password)) {
          setError(TOO_SHORT_MESSAGE);
          return;
        }
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
            // Never derive a public name from the email. An empty field means the account gets a
            // Learner-XXXX handle and the one-time name prompt asks after sign-in.
            data: displayName.trim() ? { display_name: displayName.trim() } : {},
            ...captchaOptions(captchaToken),
          },
        });
        if (error) throw error;
        if (data.session) {
          void track("sign_in_completed", { method: "email" });
          afterAuth("/placement");
        } else {
          setCode("");
          setMode("verify");
        }
      } else {
        const { error } = await supabase.auth.signInWithPassword({
          email,
          password,
          ...(captchaToken ? { options: captchaOptions(captchaToken) } : {}),
        });
        if (error) throw error;
        void track("sign_in_completed", { method: "email" });
        afterAuth();
      }
    } catch (err) {
      // A banned account's sign-in gets its own plain screen, not the raw error text.
      if (isAccountSuspendedError(err)) useAccountStatus.getState().setSuspended();
      else setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setBusy(false);
      if (captchaSiteKey && mode !== "verify") setCaptchaReset((n) => n + 1);
    }
  }

  async function resendCode() {
    setError(null);
    setNotice(null);
    setBusy(true);
    try {
      const { error } = await supabase.auth.resend({
        type: "signup",
        email,
        options: {
          emailRedirectTo: window.location.origin + (next ?? "/placement"),
          ...captchaOptions(captchaToken),
        },
      });
      if (error) throw error;
      setNotice("We sent a new code. It can take a minute to arrive.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't send a new code");
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

  if (blocked) return <Under13Stop onOk={() => navigate({ to: "/" })} />;

  return (
    <FirstRunScreen>
      <FirstRunRoom
        room={roomSrc("room-light")}
        figure={expressionSrc("talk")}
        figureAlt="Alphonso"
        top={
          <Link
            to="/"
            aria-label="Back"
            className="grid size-11 place-items-center rounded-full bg-ds-card text-ds-brand shadow-[var(--ds-shadow-resting)]"
          >
            <span aria-hidden="true" className="text-lg">
              ←
            </span>
          </Link>
        }
      />
      <FirstRunBubble
        title={
          mode === "verify"
            ? "Check your email"
            : mode === "signup"
              ? "Create your account"
              : mode === "forgot"
                ? "Reset your password"
                : "Welcome back"
        }
        sub={
          mode === "verify"
            ? `We sent a 6-digit code to ${email}. Enter it below to finish creating your account.`
            : mode === "signup"
              ? "Save your streak and pick up on any device."
              : mode === "forgot"
                ? "Enter your email and we'll send you a link to set a new password."
                : "Sign in to continue where you left off."
        }
      />
      <div className="px-4 pb-10 pt-4">
        <div className="space-y-3">
          {mode !== "verify" && (
            <>
              <button
                type="button"
                onClick={google}
                disabled={busy}
                className="flex w-full items-center justify-center gap-2.5 rounded-full border border-ds-line bg-ds-card px-4 py-3 text-sm font-medium text-ds-ink transition hover:bg-ds-sunk disabled:opacity-50"
              >
                <img src="/brand/google-g.svg" alt="" width={20} height={20} className="size-5" />
                Continue with Google
              </button>

              <div className="relative py-2 text-center">
                <div className="absolute inset-x-0 top-1/2 -z-10 h-px bg-ds-line" />
                <span className="bg-ds-surface px-3 ds-type-overline text-ds-ink-soft">or</span>
              </div>
            </>
          )}

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
            {mode === "verify" && (
              <div>
                <label htmlFor="auth-code" className="sr-only">
                  6-digit code
                </label>
                <TextField
                  id="auth-code"
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  required
                  maxLength={12}
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  placeholder="6-digit code"
                />
              </div>
            )}
            {mode !== "verify" && (
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
            )}
            {mode !== "forgot" && mode !== "verify" && (
              <div>
                <label htmlFor="auth-password" className="sr-only">
                  Password
                </label>
                <TextField
                  id="auth-password"
                  type="password"
                  required
                  minLength={mode === "signup" ? MIN_NEW_PASSWORD_LENGTH : undefined}
                  autoComplete={mode === "signup" ? "new-password" : "current-password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Password"
                />
              </div>
            )}
            {error && (
              <p className={"rounded-xl bg-rose-50 px-3 py-2 text-xs text-rose-700"}>{error}</p>
            )}
            {notice && (
              <p
                className={
                  "rounded-xl border border-ds-line bg-ds-sunk px-3 py-2 text-xs leading-relaxed text-ds-ink"
                }
              >
                {notice}
              </p>
            )}
            {needsCaptcha && captchaSiteKey ? (
              <TurnstileWidget
                siteKey={captchaSiteKey}
                onToken={setCaptchaToken}
                resetKey={captchaReset}
              />
            ) : null}
            <button
              type="submit"
              disabled={busy || (needsCaptcha && !captchaToken)}
              className={`w-full ${edgeButtonClass("primary")}`}
            >
              {busy
                ? "Please wait…"
                : mode === "verify"
                  ? "Confirm"
                  : mode === "signup"
                    ? "Create account"
                    : mode === "forgot"
                      ? "Send reset link"
                      : "Sign in"}
            </button>
          </form>

          {mode === "verify" && (
            <button
              type="button"
              onClick={resendCode}
              disabled={busy}
              className="w-full text-center text-xs text-ds-ink-soft hover:text-ds-ink disabled:opacity-50"
            >
              Send a new code
            </button>
          )}

          {mode === "signin" && (
            <button
              type="button"
              onClick={() => {
                setMode("forgot");
                setError(null);
                setNotice(null);
              }}
              className="w-full text-center text-xs text-ds-ink-soft hover:text-ds-ink"
            >
              Forgot your password?
            </button>
          )}

          <button
            type="button"
            onClick={() => {
              setMode(mode === "verify" ? "signup" : mode === "signin" ? "signup" : "signin");
              setError(null);
              setNotice(null);
            }}
            className="w-full py-2 text-center text-xs text-ds-ink-soft hover:text-ds-ink"
          >
            {mode === "verify"
              ? "Use a different email"
              : mode === "signup"
                ? "Have an account? Sign in"
                : mode === "forgot"
                  ? "Back to sign in"
                  : "New here? Create an account"}
          </button>

          <p className="pt-2 text-center ds-type-caption text-ds-ink-soft">
            By continuing, you agree to the{" "}
            <Link to="/terms" className="underline hover:text-ds-ink">
              Terms of Use
            </Link>{" "}
            and acknowledge the{" "}
            <Link to="/privacy" className="underline hover:text-ds-ink">
              Privacy Policy
            </Link>
            . See also our{" "}
            <Link to="/cookies" className="underline hover:text-ds-ink">
              Cookie Policy
            </Link>
            .
          </p>
        </div>
      </div>
    </FirstRunScreen>
  );
}
