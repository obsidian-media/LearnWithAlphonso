import { createFileRoute, redirect } from "@tanstack/react-router";
import { useState } from "react";
import { adminWhoAmI } from "@/lib/admin.functions";
import { staffSearchUsers } from "@/lib/staff-users.functions";
import { classifyStaffError } from "@/lib/staff-route-errors";
import { ForbiddenCard } from "@/components/staff/ForbiddenCard";
import { UsersSearchView, type UserHit } from "@/components/staff/UsersSearchView";

export const Route = createFileRoute("/users")({
  // No server-side render for this page: who is signed in lives in the browser (a server render has no session), so the
  // identity check in the loader runs there, never on the server. Otherwise every full load looked signed out.
  ssr: false,
  loader: async () => {
    try {
      const me = await adminWhoAmI();
      return { allowed: me.scopes.includes("users.read") };
    } catch {
      throw redirect({ to: "/signin" });
    }
  },
  component: Users,
});

function Users() {
  const { allowed } = Route.useLoaderData();
  const [results, setResults] = useState<UserHit[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [searched, setSearched] = useState(false);

  if (!allowed) {
    return <ForbiddenCard title="Users" scope="users.read" />;
  }

  async function search(q: string) {
    setBusy(true);
    setError(null);
    try {
      setResults(await staffSearchUsers({ data: { q } }));
      setSearched(true);
    } catch (e) {
      setResults([]);
      setError(
        classifyStaffError(e) === "forbidden" || e instanceof Error
          ? (e as Error).message
          : "Search failed.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto max-w-5xl p-4 sm:p-6">
      <UsersSearchView
        results={results}
        error={error}
        busy={busy}
        searched={searched}
        onSearch={search}
      />
    </main>
  );
}
