import { createFileRoute, useNavigate, useParams, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { LessonFrame } from "../../components/AppShell";
import { StarIcon } from "../../components/icons";
import { acceptFriendInvite, getFriendInvitePreview } from "../../lib/friends.functions";

export const Route = createFileRoute("/_authenticated/invite/$code")({
  component: InvitePage,
  head: () => ({
    meta: [
      { title: "Friend invite — Alphonso" },
      { name: "description", content: "Accept a friend invite on Alphonso." },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

function InvitePage() {
  const { code } = useParams({ from: "/_authenticated/invite/$code" });
  const navigate = useNavigate();
  const loadPreview = useServerFn(getFriendInvitePreview);
  const accept = useServerFn(acceptFriendInvite);
  const [inviterName, setInviterName] = useState<string | null>(null);
  // "load-error": the invite could not be looked up (not the same as "not-found"); "error": adding failed.
  const [state, setState] = useState<
    "loading" | "confirm" | "self" | "not-found" | "blocked" | "done" | "error" | "load-error"
  >("loading");
  const [attempt, setAttempt] = useState(0);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    setState("loading");
    loadPreview({ data: { code } })
      .then((preview) => {
        if (!alive) return;
        if (!preview) {
          setState("not-found");
          return;
        }
        if (preview.isSelf) {
          setState("self");
          return;
        }
        setInviterName(preview.displayName ?? "This learner");
        setState("confirm");
      })
      .catch(() => {
        if (alive) setState("load-error");
      });
    return () => {
      alive = false;
    };
  }, [code, loadPreview, attempt]);

  async function confirmAccept() {
    if (busy) return;
    setBusy(true);
    try {
      const res = await accept({ data: { code } });
      if (res.ok) setState("done");
      // The database's own refusals get their own words; anything else is a failure worth retrying.
      else if (res.message === "invalid-code") setState("not-found");
      else if (res.message === "cannot invite yourself") setState("self");
      else if (res.message === "blocked") setState("blocked");
      else setState("error");
    } catch {
      setState("error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <LessonFrame>
      <div className="flex flex-1 flex-col items-center justify-center px-7 text-center">
        {state === "loading" && <p className="text-sm text-ds-ink-soft">Loading invite…</p>}

        {state === "load-error" && (
          <div role="alert" className="flex w-full flex-col items-center">
            <h1 className="font-display text-lg font-semibold text-ds-ink">
              Couldn't load this invite
            </h1>
            <p className="mt-2 text-sm text-ds-ink-soft/80">
              Check your connection and try again.
            </p>
            <button
              type="button"
              onClick={() => setAttempt((n) => n + 1)}
              className="mt-6 w-full max-w-[280px] rounded-full bg-ds-ink px-6 py-3.5 text-sm font-semibold text-ds-card"
            >
              Try again
            </button>
          </div>
        )}

        {state === "blocked" && (
          <>
            <h1 className="font-display text-lg font-semibold text-ds-ink">
              You can't add this friend
            </h1>
            <Link
              to="/profile/friends"
              className="mt-6 w-full max-w-[280px] rounded-full bg-ds-ink px-6 py-3.5 text-sm font-semibold text-ds-card"
            >
              Back to friends
            </Link>
          </>
        )}

        {state === "self" && (
          <>
            <h1 className="font-display text-lg font-semibold text-ds-ink">
              That's your own invite link
            </h1>
            <p className="mt-2 text-sm text-ds-ink-soft/80">
              Share it with a friend instead — they'll become friends with you when they open it.
            </p>
            <Link
              to="/profile/friends"
              className="mt-6 w-full max-w-[280px] rounded-full bg-ds-ink px-6 py-3.5 text-sm font-semibold text-ds-card"
            >
              Back to friends
            </Link>
          </>
        )}

        {state === "not-found" && (
          <>
            <h1 className="font-display text-lg font-semibold text-ds-ink">Invite not found</h1>
            <p className="mt-2 text-sm text-ds-ink-soft/80">
              This invite link doesn't look right. Ask your friend for a fresh one.
            </p>
            <Link
              to="/learn"
              className="mt-6 w-full max-w-[280px] rounded-full bg-ds-ink px-6 py-3.5 text-sm font-semibold text-ds-card"
            >
              Back to learning
            </Link>
          </>
        )}

        {state === "confirm" && (
          <>
            <div className="grid size-16 place-items-center rounded-full bg-ds-brand text-ds-card hard-shadow">
              <StarIcon className="size-8" />
            </div>
            <h1 className="mt-6 font-display text-lg font-semibold text-ds-ink">
              Add {inviterName} as a friend?
            </h1>
            <p className="mt-2 text-sm text-ds-ink-soft/80">
              You'll be able to see each other's streak and weekly progress.
            </p>
            <button
              type="button"
              onClick={() => void confirmAccept()}
              disabled={busy}
              aria-busy={busy}
              className="mt-6 w-full max-w-[280px] rounded-full bg-ds-ink px-6 py-3.5 text-sm font-semibold text-ds-card transition hover:opacity-90 disabled:opacity-60"
            >
              {busy ? "Adding…" : "Add friend"}
            </button>
          </>
        )}

        {state === "done" && (
          <>
            <div className="grid size-16 place-items-center rounded-full bg-ds-brand text-ds-card hard-shadow">
              <StarIcon className="size-8" />
            </div>
            <h1 className="mt-6 font-display text-lg font-semibold text-ds-ink">You're friends!</h1>
            <button
              type="button"
              onClick={() => navigate({ to: "/profile/friends" })}
              className="mt-6 w-full max-w-[280px] rounded-full bg-ds-ink px-6 py-3.5 text-sm font-semibold text-ds-card"
            >
              See your friends
            </button>
          </>
        )}

        {state === "error" && (
          <div role="alert" className="flex w-full flex-col items-center">
            <h1 className="font-display text-lg font-semibold text-ds-ink">Something went wrong</h1>
            <p className="mt-2 text-sm text-ds-ink-soft/80">
              We couldn't add your friend. Check your connection and try again.
            </p>
            <button
              type="button"
              onClick={() => void confirmAccept()}
              disabled={busy}
              className="mt-6 w-full max-w-[280px] rounded-full bg-ds-ink px-6 py-3.5 text-sm font-semibold text-ds-card disabled:opacity-60"
            >
              {busy ? "Adding…" : "Try again"}
            </button>
            <Link to="/profile/friends" className="mt-3 text-sm font-semibold text-ds-ink underline">
              Back to friends
            </Link>
          </div>
        )}
      </div>
    </LessonFrame>
  );
}
