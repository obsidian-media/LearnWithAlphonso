/**
 * What the sign-in screen needs from the auth provider, so the screen can be tested without a network. The real
 * adapter is `supabaseAuthApi`; the route hands it the browser client.
 */
export type NextStep =
  | { kind: "home" }
  | { kind: "verify"; factorId: string }
  | { kind: "enroll"; factorId: string; secret: string; uri: string; qr: string | null }
  | { kind: "error" };

export type AuthApi = {
  signInWithPassword: (email: string, password: string) => Promise<{ failed: boolean }>;
  signInWithGoogle: () => Promise<{ failed: boolean }>;
  resetPassword: (email: string) => Promise<{ failed: boolean }>;
  /** Where to go after ANY sign-in: home (already AAL2, or no second factor asked), the code step, or enrolment. */
  nextStep: (mfaRequired: boolean) => Promise<NextStep>;
  verifyCode: (factorId: string, code: string) => Promise<{ failed: boolean }>;
  /** Calls back when a session exists (page load after the OAuth redirect, or a sign-in). Returns the unsubscribe. */
  onSession: (callback: () => void) => () => void;
};

/** The slice of the Supabase auth client this uses (so tests can fake it without the SDK). */
export type SupabaseAuthLike = {
  getSession: () => Promise<{ data: { session: unknown } }>;
  onAuthStateChange: (cb: (event: string, session: unknown) => void) => {
    data: { subscription: { unsubscribe: () => void } };
  };
  signInWithPassword: (c: { email: string; password: string }) => Promise<{ error: unknown }>;
  signInWithOAuth: (c: {
    provider: "google";
    options: { redirectTo: string };
  }) => Promise<{ error: unknown }>;
  resetPasswordForEmail: (email: string, o: { redirectTo: string }) => Promise<{ error: unknown }>;
  mfa: {
    getAuthenticatorAssuranceLevel: () => Promise<{
      data: { currentLevel?: string | null } | null;
    }>;
    listFactors: () => Promise<{
      data: { totp: { id: string; status: string }[] } | null;
    }>;
    enroll: (c: { factorType: "totp" }) => Promise<{
      data: { id: string; totp: { secret: string; uri: string; qr_code?: string } } | null;
      error: unknown;
    }>;
    challengeAndVerify: (c: { factorId: string; code: string }) => Promise<{ error: unknown }>;
  };
};

// Reset lands on the LEARNER app, which already owns the reset-password route and its email template.
const RESET_REDIRECT = "https://learn.alphonsoecosystem.app/reset-password";

export function supabaseAuthApi(auth: SupabaseAuthLike, origin: () => string): AuthApi {
  return {
    async signInWithPassword(email, password) {
      const { error } = await auth.signInWithPassword({ email, password });
      return { failed: !!error };
    },
    async signInWithGoogle() {
      // The OAuth callback lands HERE (not on `/`): the client exchanges the PKCE code on load, and `/` would race it.
      const { error } = await auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo: `${origin()}/signin` },
      });
      return { failed: !!error };
    },
    async resetPassword(email) {
      const { error } = await auth.resetPasswordForEmail(email, { redirectTo: RESET_REDIRECT });
      return { failed: !!error };
    },
    async nextStep(mfaRequired) {
      const { data: level } = await auth.mfa.getAuthenticatorAssuranceLevel();
      if (level?.currentLevel === "aal2") return { kind: "home" };
      const { data: factors } = await auth.mfa.listFactors();
      const verified = factors?.totp.find((f) => f.status === "verified");
      if (verified) return { kind: "verify", factorId: verified.id };
      if (mfaRequired) {
        const { data, error } = await auth.mfa.enroll({ factorType: "totp" });
        if (error || !data) return { kind: "error" };
        return {
          kind: "enroll",
          factorId: data.id,
          secret: data.totp.secret,
          uri: data.totp.uri,
          // Only an inline image is shown; anything else falls back to the key.
          qr: data.totp.qr_code?.startsWith("data:image/") ? data.totp.qr_code : null,
        };
      }
      return { kind: "home" };
    },
    async verifyCode(factorId, code) {
      const { error } = await auth.mfa.challengeAndVerify({ factorId, code });
      return { failed: !!error };
    },
    onSession(callback) {
      let cancelled = false;
      void auth.getSession().then(({ data }) => {
        if (!cancelled && data.session) callback();
      });
      // MFA_CHALLENGE_VERIFIED is handled by the verify step itself.
      const { data: sub } = auth.onAuthStateChange((event, session) => {
        if (session && event === "SIGNED_IN") callback();
      });
      return () => {
        cancelled = true;
        sub.subscription.unsubscribe();
      };
    },
  };
}
