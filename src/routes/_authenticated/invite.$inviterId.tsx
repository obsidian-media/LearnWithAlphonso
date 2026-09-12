import { createFileRoute, useNavigate, useParams, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { LessonFrame } from "../../components/AppShell";
import { StarIcon } from "../../components/icons";
import { acceptFriendInvite, getInviterProfile } from "../../lib/friends.functions";
import { getMyProfile } from "../../lib/leaderboard.functions";

export const Route = createFileRoute("/_authenticated/invite/$inviterId")({
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
  const { inviterId } = useParams({ from: "/_authenticated/invite/$inviterId" });
  const navigate = useNavigate();
  const loadInviter = useServerFn(getInviterProfile);
  const accept = useServerFn(acceptFriendInvite);
  const [inviterName, setInviterName] = useState<string | null>(null);
  const [state, setState] = useState<
    "loading" | "confirm" | "self" | "not-found" | "done" | "error"
  >("loading");

  useEffect(() => {
    let alive = true;
    void Promise.all([loadInviter({ data: { inviterId } }), getMyProfile()]).then(
      ([inviter, me]) => {
        if (!alive) return;
        if (me?.id === inviterId) {
          setState("self");
          return;
        }
        if (!inviter) {
          setState("not-found");
          return;
        }
        setInviterName(inviter.displayName ?? "This learner");
        setState("confirm");
      },
    );
    return () => {
      alive = false;
    };
  }, [inviterId, loadInviter]);

  async function confirmAccept() {
    const res = await accept({ data: { inviterId } }).catch(() => ({
      ok: false,
      message: "network error",
    }));
    setState(res.ok ? "done" : "error");
  }

  return (
    <LessonFrame>
      <div className="flex flex-1 flex-col items-center justify-center px-7 text-center">
        {state === "loading" && <p className="text-sm text-ink-soft">Loading invite…</p>}

        {state === "self" && (
          <>
            <h1 className="font-display text-lg font-semibold text-ink">
              That's your own invite link
            </h1>
            <p className="mt-2 text-sm text-ink-soft/80">
              Share it with a friend instead — they'll become friends with you when they open it.
            </p>
            <Link
              to="/profile/friends"
              className="mt-6 w-full max-w-[280px] rounded-full bg-ink px-6 py-3.5 text-sm font-semibold text-surface"
            >
              Back to friends
            </Link>
          </>
        )}

        {state === "not-found" && (
          <>
            <h1 className="font-display text-lg font-semibold text-ink">Invite not found</h1>
            <p className="mt-2 text-sm text-ink-soft/80">
              This invite link doesn't look right. Ask your friend for a fresh one.
            </p>
            <Link
              to="/learn"
              className="mt-6 w-full max-w-[280px] rounded-full bg-ink px-6 py-3.5 text-sm font-semibold text-surface"
            >
              Back to learning
            </Link>
          </>
        )}

        {state === "confirm" && (
          <>
            <div className="grid size-16 place-items-center rounded-full bg-moss text-surface hard-shadow">
              <StarIcon className="size-8" />
            </div>
            <h1 className="mt-6 font-display text-lg font-semibold text-ink">
              Add {inviterName} as a friend?
            </h1>
            <p className="mt-2 text-sm text-ink-soft/80">
              You'll be able to see each other's streak and weekly progress.
            </p>
            <button
              type="button"
              onClick={confirmAccept}
              className="mt-6 w-full max-w-[280px] rounded-full bg-ink px-6 py-3.5 text-sm font-semibold text-surface transition hover:opacity-90"
            >
              Add friend
            </button>
          </>
        )}

        {state === "done" && (
          <>
            <div className="grid size-16 place-items-center rounded-full bg-moss text-surface hard-shadow">
              <StarIcon className="size-8" />
            </div>
            <h1 className="mt-6 font-display text-lg font-semibold text-ink">You're friends!</h1>
            <button
              type="button"
              onClick={() => navigate({ to: "/profile/friends" })}
              className="mt-6 w-full max-w-[280px] rounded-full bg-ink px-6 py-3.5 text-sm font-semibold text-surface"
            >
              See your friends
            </button>
          </>
        )}

        {state === "error" && (
          <>
            <h1 className="font-display text-lg font-semibold text-ink">Something went wrong</h1>
            <p className="mt-2 text-sm text-ink-soft/80">Please try opening the link again.</p>
          </>
        )}
      </div>
    </LessonFrame>
  );
}
