import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState, type FormEvent } from "react";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/signin")({ component: SignIn });

/**
 * Admin sign-in.
 *
 * The admin app runs on its own origin, so its Supabase session lives in
 * that origin's storage and is separate from the learner app's by
 * construction -- there is no cookie to name and nothing to configure.
 * (This repo authenticates API calls with a Bearer token from the
 * Authorization header, not a cookie; see auth-middleware.ts.)
 *
 * Signing in here only proves the account exists. Whether it is on the
 * allowlist is decided server-side on the next call, by requireAdmin.
 * Which is why offering Google alongside a password costs nothing in
 * authorization terms: it changes how someone proves who they are, not
 * what they are allowed to do.
 */
function SignIn() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // The OAuth callback lands HERE rather than on `/`, deliberately. The
  // client exchanges the PKCE `code` from the URL on load
  // (detectSessionInUrl defaults to true), and `/`'s loader calls
  // adminWhoAmI immediately -- landing there would race the exchange and
  // bounce a valid admin straight back to this page. This route has no
  // loader guard, so it can wait for the session and then move on.
  useEffect(() => {
    let cancelled = false;
    supabase.auth.getSession().then(({ data }) => {
      if (!cancelled && data.session) navigate({ to: "/" });
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session) navigate({ to: "/" });
    });
    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
  }, [navigate]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setNotice(null);
    const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
    setBusy(false);
    // One message for every failure. Distinguishing "no such account"
    // from "wrong password" turns this form into an account-existence
    // oracle, and this is the login page of an admin tool.
    if (signInError) setError("Sign-in failed.");
    else navigate({ to: "/" });
  }

  async function signInWithGoogle() {
    setBusy(true);
    setError(null);
    setNotice(null);
    const { error: oauthError } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${window.location.origin}/signin` },
    });
    // On success the browser leaves for Google, so nothing after this
    // runs. Only a failure to *start* the flow returns here.
    if (oauthError) {
      setBusy(false);
      // Named rather than generic: the overwhelmingly likely cause is
      // that this origin is missing from Supabase's allowed redirect
      // URLs, and "sign-in failed" would send someone hunting through
      // their password instead of the dashboard.
      setError("Couldn't start Google sign-in. Check this origin is an allowed redirect URL.");
    }
  }

  async function resetPassword() {
    if (!email) {
      setError("Enter your email first, then request a reset.");
      return;
    }
    setBusy(true);
    setError(null);
    // Reset lands on the LEARNER app, which already owns the
    // reset-password route and its email template. Building a second one
    // here would be a second flow to keep correct for one operator.
    const { error: resetError } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: "https://learn.alphonsoecosystem.app/reset-password",
    });
    setBusy(false);
    if (resetError) setError("Couldn't send the reset email.");
    else setNotice("Reset email sent. Set a new password, then sign in here.");
  }

  return (
    <main className="mx-auto max-w-sm p-6">
      <h1 className="font-display text-xl font-semibold">Alphonso Admin</h1>

      <button
        type="button"
        onClick={signInWithGoogle}
        disabled={busy}
        className="mt-6 w-full rounded border border-hairline px-3 py-2 disabled:opacity-60"
      >
        Continue with Google
      </button>

      <div className="mt-4 flex items-center gap-3 text-xs text-ink-soft">
        <span className="h-px flex-1 bg-hairline" />
        or
        <span className="h-px flex-1 bg-hairline" />
      </div>

      <form onSubmit={submit} className="mt-4 space-y-3">
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="Email"
          required
          autoComplete="username"
          className="w-full rounded border border-hairline px-3 py-2"
        />
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Password"
          required
          autoComplete="current-password"
          className="w-full rounded border border-hairline px-3 py-2"
        />
        <button
          type="submit"
          disabled={busy}
          className="w-full rounded bg-moss px-3 py-2 text-surface disabled:opacity-60"
        >
          {busy ? "Signing in…" : "Sign in"}
        </button>
      </form>

      <button
        type="button"
        onClick={resetPassword}
        disabled={busy}
        className="mt-3 text-sm text-moss underline disabled:opacity-60"
      >
        Forgot your password?
      </button>

      {error ? <p className="mt-3 text-sm text-ember">{error}</p> : null}
      {notice ? <p className="mt-3 text-sm text-ink-soft">{notice}</p> : null}
    </main>
  );
}
