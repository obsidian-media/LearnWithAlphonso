import { useEffect, useRef, useState, type FormEvent } from "react";
import { formatDay } from "../../../lib/staff-dates";
import type { UserAction } from "../../../lib/staff-actions";
import type { LearnerFacts } from "../../../lib/staff-user-facts.server";
import type { ActionInput } from "../../staff/ActionDialog";
import { Button } from "../../ui/Button";
import { LearnerPane } from "./LearnerPane";
import type { UserHit, UsersApi } from "./usersApi";

export type UsersMe = { displayName: string | null; role: string; scopes: readonly string[] };

const MIN_QUERY = 2;

type Detail =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; facts: LearnerFacts };

const messageOf = (e: unknown, fallback: string) =>
  e instanceof Error && e.message ? e.message : fallback;

/**
 * Users: SEARCH ONLY. There is no list of all learners, no filter tabs, no bulk actions and no export (owner ruling,
 * 2026-11-21): a person looks one learner up by exact email or id, or by the start of a name, and opens them. Opening
 * one is a per-learner read that is recorded (user.view) on the server before any fact comes back. The plan (Pro or
 * Free) is a live read of that one learner, shown only in the detail pane.
 */
export function UsersScreen({
  me,
  api,
  selectedId,
  onSelect,
}: {
  me: UsersMe;
  api: UsersApi;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
}) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<UserHit[]>([]);
  const [searched, setSearched] = useState(false);
  const [searchBusy, setSearchBusy] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const searchSeq = useRef(0);

  const [detail, setDetail] = useState<Detail>({ status: "idle" });
  const [dialog, setDialog] = useState<UserAction | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const detailSeq = useRef(0);

  async function search(event: FormEvent) {
    event.preventDefault();
    const text = q.trim();
    if (text.length < MIN_QUERY) return;
    const mine = ++searchSeq.current;
    setSearchBusy(true);
    setSearchError(null);
    try {
      const rows = await api.search(text);
      if (mine !== searchSeq.current) return;
      setResults(rows);
      setSearched(true);
    } catch (e) {
      if (mine !== searchSeq.current) return;
      setResults([]);
      setSearched(false);
      setSearchError(messageOf(e, "Search failed."));
    } finally {
      if (mine === searchSeq.current) setSearchBusy(false);
    }
  }

  async function open(id: string) {
    const mine = ++detailSeq.current;
    setDetail((d) => (d.status === "ready" && d.facts.id === id ? d : { status: "loading" }));
    try {
      const facts = await api.getUser(id);
      if (mine === detailSeq.current) setDetail({ status: "ready", facts });
    } catch (e) {
      if (mine === detailSeq.current)
        setDetail({ status: "error", message: messageOf(e, "Could not open that learner.") });
    }
  }

  // The open learner follows the address (?u=), so a link to one learner lands on the same screen.
  useEffect(() => {
    setDialog(null);
    setError(null);
    if (selectedId === null) {
      // (a notice such as "Deleted." stays on screen after the learner closes)
      detailSeq.current += 1;
      setDetail({ status: "idle" });
      return;
    }
    setNotice(null);
    void open(selectedId);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reload only when the chosen learner changes
  }, [selectedId]);

  async function run(action: () => Promise<unknown>, done: string, after?: "reload" | "closed") {
    setBusy(true);
    setError(null);
    try {
      const result = await action();
      const partial = (result as { partial?: string[] } | undefined)?.partial ?? [];
      setNotice(
        partial.length > 0
          ? `${done} These steps need follow-up (see the action record): ${partial.join(", ")}.`
          : done,
      );
      setDialog(null);
      if (after === "closed") {
        const id = selectedId;
        setResults((rows) => rows.filter((r) => r.id !== id));
        onSelect(null);
      } else if (selectedId) {
        await open(selectedId);
      }
    } catch (e) {
      setError(messageOf(e, "That did not work."));
    } finally {
      setBusy(false);
    }
  }

  function submit(input: ActionInput) {
    if (detail.status !== "ready") return undefined;
    const id = detail.facts.id;
    const { reason, confirmEmail, days } = input;
    switch (dialog) {
      case "gift":
        return run(() => api.grantPro(id, days, reason), `Gave Pro for ${days} days.`);
      case "revoke_gift":
        return run(() => api.revokePro(id, reason), "Ended the gifted Pro.");
      case "block":
        return run(() => api.block(id, reason), "Blocked.");
      case "unblock":
        return run(() => api.unblock(id, reason), "Block lifted.");
      case "ban":
        return run(() => api.ban(id, reason, confirmEmail), "Banned.");
      case "unban":
        return run(() => api.unban(id, reason), "Ban lifted.");
      case "delete":
        return run(() => api.deleteUser(id, reason, confirmEmail), "Deleted.", "closed");
      default:
        return undefined;
    }
  }

  const open_ = selectedId !== null;
  return (
    <main className="mx-auto flex max-w-[84rem] flex-col p-4 sm:p-6">
      <div>
        <h1 className="font-display text-2xl font-semibold text-ds-ink">Users</h1>
        <p className="mt-1 text-sm text-ds-ink-soft">
          Look up one learner by exact email, user id, or the start of a name. There is no list of
          everyone.
        </p>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-[24rem_minmax(0,1fr)] lg:items-start">
        <section
          aria-label="Find a learner"
          className={`flex-col gap-3 ${open_ ? "hidden lg:flex" : "flex"}`}
        >
          <form onSubmit={search} className="flex items-center gap-2">
            <input
              type="search"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              aria-label="Search learners"
              placeholder="email, id or name"
              autoComplete="off"
              className="min-h-11 min-w-0 flex-1 rounded-xl border border-ds-line bg-ds-card px-3 text-sm text-ds-ink"
            />
            <Button
              type="submit"
              disabled={q.trim().length < MIN_QUERY || searchBusy}
              className="!py-2"
            >
              {searchBusy ? "Searching…" : "Search"}
            </Button>
          </form>
          {searchError ? (
            <p role="alert" className="text-sm font-semibold text-ds-wrong-ink">
              {searchError}
            </p>
          ) : null}
          {searched && !searchError && results.length === 0 ? (
            <p className="text-sm font-semibold text-ds-ink-faint">No learners found.</p>
          ) : null}
          {results.length > 0 ? (
            <ul className="divide-y divide-ds-line overflow-hidden rounded-2xl border border-ds-line bg-ds-card">
              {results.map((hit) => (
                <li key={hit.id}>
                  <button
                    type="button"
                    onClick={() => onSelect(hit.id)}
                    aria-current={hit.id === selectedId ? "true" : undefined}
                    className={`grid w-full gap-0.5 px-4 py-3 text-left hover:bg-ds-sunk ${
                      hit.id === selectedId ? "bg-ds-sunk" : ""
                    }`}
                  >
                    <span className="font-bold text-ds-ink">{hit.displayName ?? "(no name)"}</span>
                    <span className="break-all text-sm text-ds-ink-soft">{hit.email}</span>
                    <span className="text-xs font-bold text-ds-ink-soft">
                      Joined {formatDay(hit.createdAt)}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
        </section>

        <section
          aria-label="Learner"
          className={`min-w-0 rounded-2xl border border-ds-line bg-ds-card p-4 ${
            open_ ? "block" : "hidden lg:block"
          }`}
        >
          {detail.status === "idle" ? (
            <p className="p-6 text-center text-sm font-semibold text-ds-ink-faint">
              Search for a learner and open them to see their account.
            </p>
          ) : null}
          {detail.status === "loading" ? (
            <p role="status" className="p-6 text-center text-sm font-semibold text-ds-ink-faint">
              Opening…
            </p>
          ) : null}
          {detail.status === "error" ? (
            <div className="grid gap-3 p-2">
              <p role="alert" className="text-sm font-semibold text-ds-wrong-ink">
                {detail.message}
              </p>
              <div>
                <button
                  type="button"
                  onClick={() => onSelect(null)}
                  className="min-h-11 rounded-xl border border-ds-line px-3 text-sm font-bold text-ds-ink"
                >
                  Close
                </button>
              </div>
            </div>
          ) : null}
          {detail.status === "ready" ? (
            <LearnerPane
              facts={detail.facts}
              scopes={me.scopes}
              busy={busy}
              error={error}
              notice={notice}
              dialog={dialog}
              onClose={() => onSelect(null)}
              onAction={(action) => {
                setError(null);
                setDialog(action);
              }}
              onCancelDialog={() => setDialog(null)}
              onSubmitDialog={submit}
              onAddNote={(body) =>
                void run(() => api.addNote(detail.facts.id, body), "Note added.")
              }
            />
          ) : null}
          {detail.status === "idle" && notice ? (
            <p role="status" className="px-6 pb-2 text-center text-sm font-semibold text-ds-ink">
              {notice}
            </p>
          ) : null}
        </section>
      </div>
    </main>
  );
}
