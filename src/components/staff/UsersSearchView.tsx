import { formatDateTime, formatDay } from "../../lib/staff-dates";
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
      <form onSubmit={submit} className="mt-4 flex items-center gap-3">
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
              className="grid grid-cols-[1fr_auto] items-center gap-x-4 gap-y-0.5 px-4 py-3 hover:bg-ds-sunk sm:grid-cols-[1.1fr_1.4fr_auto]"
            >
              <span className="order-1 font-bold text-ds-ink">
                {hit.displayName ?? "(no name)"}
              </span>
              <span className="order-3 col-span-2 text-sm text-ds-ink-soft sm:order-2 sm:col-span-1">
                {hit.email}
              </span>
              <span className="order-2 justify-self-end text-xs font-bold text-ds-ink-soft sm:order-3">
                joined {formatDay(hit.createdAt)}
              </span>
            </a>
          </li>
        ))}
      </ul>
    </section>
  );
}
