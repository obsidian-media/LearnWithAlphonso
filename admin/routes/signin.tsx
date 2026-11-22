import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { supabaseAuthApi, type SupabaseAuthLike } from "@/components/console/auth/authApi";
import { SignInScreen } from "@/components/console/auth/SignInScreen";

export const Route = createFileRoute("/signin")({
  // `?mfa=required`: the server refused this admin's session for lacking a second factor (requireStaff).
  validateSearch: (search: Record<string, unknown>): { mfa?: "required" } =>
    search.mfa === "required" ? { mfa: "required" } : {},
  component: SignIn,
});

/**
 * Admin sign-in. The admin app runs on its own origin, so its Supabase session lives in that origin's storage and is
 * separate from the learner app's. Signing in only proves the account exists: whether it is on the allowlist, and
 * whether it has passed a second factor, is decided on the server by requireStaff. This page is pre-auth, so the root
 * frame never wraps it in the menu (see ConsoleFrame).
 */
function SignIn() {
  const navigate = useNavigate();
  const { mfa } = Route.useSearch();
  // The origin is read when Google is pressed, never during a server render.
  const api = useMemo(
    () =>
      supabaseAuthApi(supabase.auth as unknown as SupabaseAuthLike, () => window.location.origin),
    [],
  );
  return (
    <SignInScreen
      api={api}
      mfaRequired={mfa === "required"}
      onDone={() => void navigate({ to: "/" })}
    />
  );
}
