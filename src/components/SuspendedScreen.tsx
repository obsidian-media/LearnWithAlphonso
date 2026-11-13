import { supabase } from "@/integrations/supabase/client";
import { SUSPENDED_BODY, SUSPENDED_TITLE, useAccountStatus } from "../lib/account-suspended";
import { SUPPORT_EMAIL } from "../lib/legal-required-phrases";

/** Shown instead of the app for a suspended (banned) account, and after a banned sign-in. */
export function SuspendedScreen() {
  const clear = useAccountStatus((s) => s.clear);

  async function signOut() {
    try {
      await supabase.auth.signOut();
    } finally {
      clear();
    }
  }

  const [before] = SUSPENDED_BODY(SUPPORT_EMAIL).split(SUPPORT_EMAIL);

  return (
    <main className="flex min-h-screen items-center justify-center bg-ds-bg px-4">
      <div className="max-w-sm text-center">
        <h1 className="ds-type-title text-ds-ink">{SUSPENDED_TITLE}</h1>
        <p className="ds-type-body mt-3 text-ds-ink-soft">
          {before}
          <a className="underline" href={`mailto:${SUPPORT_EMAIL}`}>
            {SUPPORT_EMAIL}
          </a>
          .
        </p>
        <button
          onClick={signOut}
          className="mt-6 rounded-full bg-ds-ink px-5 py-2.5 text-sm font-semibold text-ds-card"
        >
          Sign out
        </button>
      </div>
    </main>
  );
}
