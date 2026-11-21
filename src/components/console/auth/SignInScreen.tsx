import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { Button } from "../../ui/Button";
import type { AuthApi, NextStep } from "./authApi";
import { CODE_LENGTH, CodeBoxes } from "./CodeBoxes";

type Step = Exclude<NextStep, { kind: "home" } | { kind: "error" }> | { kind: "credentials" };

const FIELD =
  "mt-1.5 min-h-11 w-full rounded-xl border border-ds-line bg-ds-surface px-3 py-2.5 text-base text-ds-ink focus:outline-2 focus:outline-offset-1 focus:outline-ds-choice";
const LABEL = "mt-3.5 block text-xs font-bold text-ds-ink-soft first:mt-0";
const LINK =
  "min-h-11 text-sm font-semibold text-ds-choice underline disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-ds-choice";

/**
 * The operator console's pre-auth sign-in. Step 1 is email + password (or Google, or a reset email); step 2 is the
 * authenticator code, or first-time enrolment when the server sent the person here with `?mfa=required`. Signing in
 * here only proves the account exists: whether it is staff, and whether it holds a second factor, is decided on the
 * server by requireStaff on the next call. Every failure to sign in says the same thing, so this page cannot be used
 * to find out whether an account exists. The inputs start empty (the mock's prefill was sample text).
 */
export function SignInScreen({
  api,
  mfaRequired,
  onDone,
}: {
  api: AuthApi;
  mfaRequired: boolean;
  /** Go to the console home. */
  onDone: () => void;
}) {
  const [step, setStep] = useState<Step>({ kind: "credentials" });
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // After any sign-in: an admin with an authenticator enters its code first; one the server refused for lacking a
  // second factor is offered enrolment; everyone else goes straight home.
  // Held in refs so the session subscription below is made once per `api`, not again on every render.
  const latest = useRef({ mfaRequired, onDone });
  latest.current = { mfaRequired, onDone };
  const continueAfterSignIn = useRef(async () => {});
  continueAfterSignIn.current = async () => {
    const next = await api.nextStep(latest.current.mfaRequired);
    if (next.kind === "home") return latest.current.onDone();
    if (next.kind === "error") return setError("Could not start authenticator setup.");
    setCode("");
    setStep(next);
  };

  // The OAuth callback lands on this page, so it waits for the session and moves on from here.
  useEffect(() => api.onSession(() => void continueAfterSignIn.current()), [api]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setNotice(null);
    const { failed } = await api.signInWithPassword(email, password);
    setBusy(false);
    // One message for every failure: telling "no such account" from "wrong password" would make this form an
    // account-existence oracle, and this is the login page of an admin tool.
    if (failed) setError("Sign-in failed.");
    else await continueAfterSignIn.current();
  }

  async function google() {
    setBusy(true);
    setError(null);
    setNotice(null);
    const { failed } = await api.signInWithGoogle();
    // On success the browser leaves for Google. Only a failure to START the flow returns here, and the likely cause
    // is this origin missing from the allowed redirect URLs, so it is named rather than "sign-in failed".
    if (failed) {
      setBusy(false);
      setError("Couldn't start Google sign-in. Check this origin is an allowed redirect URL.");
    }
  }

  async function forgot() {
    if (!email) {
      setError("Enter your email first, then request a reset.");
      return;
    }
    setBusy(true);
    setError(null);
    setNotice(null);
    const { failed } = await api.resetPassword(email);
    setBusy(false);
    if (failed) setError("Couldn't send the reset email.");
    else setNotice("Reset email sent. Set a new password, then sign in here.");
  }

  async function verify(event: FormEvent) {
    event.preventDefault();
    if (step.kind === "credentials") return;
    if (!/^\d{6}$/.test(code)) {
      setError("Enter all 6 digits.");
      return;
    }
    setBusy(true);
    setError(null);
    const { failed } = await api.verifyCode(step.factorId, code);
    setBusy(false);
    if (failed) setError("That code did not work. Try the current one.");
    else onDone();
  }

  function back() {
    setStep({ kind: "credentials" });
    setCode("");
    setPassword("");
    setError(null);
    setNotice(null);
  }

  return (
    <main
      data-signin=""
      className="grid min-h-dvh place-items-center bg-ds-surface bg-[radial-gradient(60%_50%_at_50%_0%,color-mix(in_srgb,var(--color-ds-action-tint)_50%,var(--color-ds-surface)),var(--color-ds-surface))] px-4 py-6"
    >
      <div className="w-full max-w-[380px]">
        <div className="mb-5 flex flex-col items-center gap-3 text-center">
          <img
            src="/icon-512.png"
            alt=""
            width={60}
            height={60}
            className="h-15 w-15 rounded-2xl"
          />
          <h1 className="font-display text-xl font-extrabold text-ds-ink">Alphonso Console</h1>
          <p className="text-xs font-semibold text-ds-ink-soft">Private staff sign-in</p>
        </div>

        <div className="rounded-2xl border border-ds-line bg-ds-card p-5 shadow-sm">
          {step.kind === "credentials" ? (
            <>
              <Button variant="secondary" onClick={() => void google()} disabled={busy} fullWidth>
                Sign in with Google
              </Button>
              <div className="my-4 flex items-center gap-3 text-xs text-ds-ink-soft">
                <span className="h-px flex-1 bg-ds-line" />
                or
                <span className="h-px flex-1 bg-ds-line" />
              </div>
              <form onSubmit={(e) => void submit(e)}>
                <label htmlFor="signin-email" className={LABEL}>
                  Work email
                </label>
                <input
                  id="signin-email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  autoComplete="username"
                  className={FIELD}
                />
                <label htmlFor="signin-password" className={LABEL}>
                  Password
                </label>
                <input
                  id="signin-password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  autoComplete="current-password"
                  className={FIELD}
                />
                <Button type="submit" disabled={busy} fullWidth className="mt-4">
                  {busy ? "Signing in…" : "Continue"}
                </Button>
              </form>
              <div className="mt-3 text-center">
                <button
                  type="button"
                  onClick={() => void forgot()}
                  disabled={busy}
                  className={LINK}
                >
                  Forgot your password?
                </button>
              </div>
            </>
          ) : (
            <form onSubmit={(e) => void verify(e)}>
              <p className="mb-3 rounded-xl bg-ds-choice-tint px-3 py-2.5 text-sm font-semibold text-ds-ink-soft">
                Two-step verification is required for the console.
              </p>
              {step.kind === "enroll" ? <Enrol step={step} /> : null}
              <p id="signin-code-label" className="mb-3 text-xs font-bold text-ds-ink-soft">
                Enter the {CODE_LENGTH}-digit code from your authenticator
              </p>
              <CodeBoxes value={code} onChange={setCode} disabled={busy} focusOnMount />
              <Button type="submit" disabled={busy} fullWidth className="mt-4">
                {busy ? "Checking…" : "Verify and sign in"}
              </Button>
              <div className="mt-3 text-center">
                <button type="button" onClick={back} disabled={busy} className={LINK}>
                  Back
                </button>
              </div>
            </form>
          )}

          <Live>
            {error ? <p className="mt-3 text-sm text-ds-wrong-ink">{error}</p> : null}
            {notice ? <p className="mt-3 text-sm text-ds-ink-soft">{notice}</p> : null}
          </Live>
        </div>

        <p className="mt-5 text-center text-xs font-semibold text-ds-ink-faint">
          This page is not indexed. Access is limited to approved staff.
        </p>
      </div>
    </main>
  );
}

function Live({ children }: { children: ReactNode }) {
  return (
    <div role="status" aria-live="polite">
      {children}
    </div>
  );
}

function Enrol({ step }: { step: Extract<Step, { kind: "enroll" }> }) {
  return (
    <div className="mb-4 space-y-2 text-sm text-ds-ink">
      <p>Add this account to an authenticator app: scan the code, or enter the key by hand.</p>
      {step.qr ? (
        // A QR code must be dark on light to scan, so its plate stays white in Royal Night too.
        <img
          src={step.qr}
          alt="Authenticator setup QR code"
          className="mx-auto h-40 w-40 rounded-xl bg-white p-2"
        />
      ) : null}
      <p
        data-enrol-secret=""
        className="break-all rounded-xl border border-ds-line bg-ds-surface p-2 font-mono text-xs"
      >
        {step.secret}
      </p>
    </div>
  );
}
