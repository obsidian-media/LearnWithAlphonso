import { createFileRoute, redirect } from "@tanstack/react-router";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useTheme } from "../lib/theme";

type OAuthDetails = {
  client?: { name?: string } | null;
  redirect_url?: string;
  redirect_to?: string;
};

type OAuthApi = {
  getAuthorizationDetails: (
    id: string,
  ) => Promise<{ data: OAuthDetails | null; error: Error | null }>;
  approveAuthorization: (id: string) => Promise<{ data: OAuthDetails | null; error: Error | null }>;
  denyAuthorization: (id: string) => Promise<{ data: OAuthDetails | null; error: Error | null }>;
};

function oauthApi(): OAuthApi {
  return (supabase.auth as unknown as { oauth: OAuthApi }).oauth;
}

export const Route = createFileRoute("/.lovable/oauth/consent")({
  ssr: false,
  validateSearch: (s: Record<string, unknown>) => ({
    authorization_id: typeof s.authorization_id === "string" ? s.authorization_id : "",
  }),
  beforeLoad: async ({ search, location }) => {
    if (!search.authorization_id) throw new Error("Missing authorization_id");
    const { data } = await supabase.auth.getSession();
    const next = location.pathname + location.searchStr;
    if (!data.session) throw redirect({ to: "/auth", search: { next } });
  },
  loader: async ({ location }) => {
    const authorizationId = new URLSearchParams(location.search).get("authorization_id")!;
    const { data, error } = await oauthApi().getAuthorizationDetails(authorizationId);
    if (error) throw error;
    const immediate = data?.redirect_url ?? data?.redirect_to;
    if (immediate && !data?.client) throw redirect({ href: immediate });
    return data;
  },
  component: Consent,
  errorComponent: ({ error }) => (
    <main className="grain min-h-dvh bg-surface px-6 py-16 text-ink">
      <p className="mx-auto max-w-[430px] text-sm text-ink-soft">
        Could not load this authorization request: {String((error as Error)?.message ?? error)}
      </p>
    </main>
  ),
});

function Consent() {
  const isStudioInk = useTheme((s) => s.theme === "studio-ink");
  const details = Route.useLoaderData();
  const { authorization_id } = Route.useSearch();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const clientName = details?.client?.name ?? "this app";

  async function decide(approve: boolean) {
    setBusy(true);
    setError(null);
    const api = oauthApi();
    const { data, error } = approve
      ? await api.approveAuthorization(authorization_id)
      : await api.denyAuthorization(authorization_id);
    if (error) {
      setBusy(false);
      setError(error.message);
      return;
    }
    const target = data?.redirect_url ?? data?.redirect_to;
    if (!target) {
      setBusy(false);
      setError("No redirect returned by the authorization server.");
      return;
    }
    window.location.href = target;
  }

  return (
    <main className="grain min-h-dvh bg-surface text-ink">
      <div className="mx-auto flex min-h-dvh max-w-[430px] flex-col justify-center px-6 py-12">
        <div className="mb-4 grid size-11 place-items-center rounded-xl bg-moss text-surface">
          <span className="font-display text-lg font-semibold">A</span>
        </div>
        <h1 className="font-display text-[26px] font-semibold leading-tight text-ink">
          Connect {clientName} to your account
        </h1>
        <p className="mt-2 text-sm text-ink-soft/80">
          {clientName} will be able to read your learning progress, review queue, lesson catalogue
          and leaderboard rankings as you.
        </p>
        {error && (
          <p
            role="alert"
            className={
              isStudioInk
                ? "mt-4 border-l-[3px] border-l-rose-400 py-2 pl-4 text-sm text-rose-500"
                : "mt-4 rounded-2xl border border-rose-300 bg-rose-50 px-4 py-3 text-sm"
            }
          >
            {error}
          </p>
        )}
        <div className="mt-8 space-y-2.5">
          <button
            disabled={busy}
            onClick={() => decide(true)}
            className="w-full rounded-full bg-ink px-4 py-3.5 text-sm font-semibold text-surface disabled:opacity-40"
          >
            Approve
          </button>
          <button
            disabled={busy}
            onClick={() => decide(false)}
            className="w-full rounded-full border border-hairline bg-surface px-4 py-3.5 text-sm font-semibold text-ink disabled:opacity-40"
          >
            Deny
          </button>
        </div>
      </div>
    </main>
  );
}
