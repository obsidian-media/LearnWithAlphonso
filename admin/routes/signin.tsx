import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
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
 */
function SignIn() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
    setBusy(false);
    // One message for every failure. Distinguishing "no such account"
    // from "wrong password" turns this form into an account-existence
    // oracle, and this is the login page of an admin tool.
    if (signInError) setError("Sign-in failed.");
    else navigate({ to: "/" });
  }

  return (
    <main className="mx-auto max-w-sm p-6">
      <h1 className="font-display text-xl font-semibold">Alphonso Admin</h1>
      <form onSubmit={submit} className="mt-6 space-y-3">
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
        {error ? <p className="text-sm text-ember">{error}</p> : null}
      </form>
    </main>
  );
}
