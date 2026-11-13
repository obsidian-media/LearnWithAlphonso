import { useState, type FormEvent } from "react";
import { Button } from "../ui/Button";

export type UserHit = { id: string; email: string; displayName: string | null; createdAt: string };

/** Find a learner by exact email or id, or by the start of their display name. */
export function UsersSearchView({
  results,
  error,
  busy,
  searched,
  onSearch,
}: {
  results: UserHit[];
  error: string | null;
  busy: boolean;
  searched: boolean;
  onSearch: (q: string) => void;
}) {
  const [q, setQ] = useState("");
  function submit(event: FormEvent) {
    event.preventDefault();
    if (q.trim().length >= 2) onSearch(q.trim());
  }
  return (
    <section>
      <h1 className="font-display text-2xl font-semibold text-ds-ink">Users</h1>
      <p className="ds-type-footnote mt-1 text-ds-ink-soft">
        Search by exact email, user id, or the start of a display name (2 characters or more).
      </p>
      <form onSubmit={submit} className="mt-4 flex flex-col gap-3 sm:flex-row">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          aria-label="Search learners"
          placeholder="email, id or name"
          className="min-h-11 flex-1 rounded-xl border border-ds-line bg-ds-sunk px-3 py-2"
        />
        <Button type="submit" disabled={q.trim().length < 2 || busy} className="!py-2">
          {busy ? "Searching…" : "Search"}
        </Button>
      </form>
      {error ? (
        <p role="alert" className="mt-3 text-sm text-ember">
          {error}
        </p>
      ) : null}
      {searched && !error && results.length === 0 ? (
        <p className="mt-6 text-ds-ink-soft">No learners found.</p>
      ) : null}
      <ul className="mt-5 divide-y divide-ds-line rounded-2xl border border-ds-line bg-ds-card">
        {results.map((hit) => (
          <li key={hit.id}>
            <a
              href={`/users/${hit.id}`}
              className="flex flex-col gap-0.5 px-4 py-3 hover:bg-ds-sunk sm:flex-row sm:items-center sm:justify-between"
            >
              <span className="font-medium text-ds-ink">{hit.displayName ?? "(no name)"}</span>
              <span className="text-sm text-ds-ink-soft">{hit.email}</span>
              <span className="text-xs text-ds-ink-soft">
                joined {new Date(hit.createdAt).toLocaleDateString()}
              </span>
            </a>
          </li>
        ))}
      </ul>
    </section>
  );
}
