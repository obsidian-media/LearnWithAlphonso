import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { MobileFrame } from "../../components/AppShell";
import { getFriends } from "../../lib/friends.functions";
import { getMyProfile } from "../../lib/leaderboard.functions";

export const Route = createFileRoute("/_authenticated/profile_/friends")({
  component: FriendsPage,
  head: () => ({
    meta: [
      { title: "Friends — Alphonso" },
      { name: "description", content: "See how your friends are doing, or invite one to join." },
      { property: "og:title", content: "Friends — Alphonso" },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

function FriendsPage() {
  const { data: profile } = useQuery({ queryKey: ["me"], queryFn: () => getMyProfile() });
  const { data: friends, isLoading } = useQuery({
    queryKey: ["friends"],
    queryFn: () => getFriends(),
  });
  const [copied, setCopied] = useState(false);

  const inviteLink = profile ? `${window.location.origin}/invite/${profile.id}` : null;

  async function copyInvite() {
    if (!inviteLink) return;
    await navigator.clipboard.writeText(inviteLink);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <MobileFrame>
      <div className="px-6 pb-12 pt-6">
        <div className="flex items-center gap-3">
          <Link
            to="/profile"
            aria-label="Back to profile"
            className="grid size-8 place-items-center rounded-full text-ink-soft/70 hover:bg-parchment"
          >
            ←
          </Link>
          <h1 className="font-display text-[22px] font-semibold text-ink">Friends</h1>
        </div>

        <div className="mt-6 rounded-2xl border border-hairline bg-parchment p-4">
          <p className="font-display text-base font-semibold text-ink">Invite a friend</p>
          <p className="mt-1 text-xs text-ink-soft/80">
            Share your link — when they open it, you're automatically friends.
          </p>
          <button
            type="button"
            onClick={copyInvite}
            disabled={!inviteLink}
            className="mt-3 w-full rounded-full bg-ink px-4 py-2.5 text-sm font-semibold text-surface transition hover:opacity-90 disabled:opacity-50"
          >
            {copied ? "Link copied!" : "Copy invite link"}
          </button>
          <span role="status" aria-live="polite" className="sr-only">
            {copied ? "Link copied to clipboard" : ""}
          </span>
        </div>

        <h2 className="mt-8 font-display text-[18px] font-semibold text-ink">
          {friends && friends.length > 0
            ? `${friends.length} friend${friends.length === 1 ? "" : "s"}`
            : "Your friends"}
        </h2>

        {isLoading ? (
          <p className="mt-3 text-sm text-ink-soft">Loading…</p>
        ) : !friends || friends.length === 0 ? (
          <div className="mt-3 rounded-2xl border border-hairline bg-surface p-4 text-center">
            <p className="text-sm text-ink-soft">
              No friends yet. Share your invite link to get started.
            </p>
          </div>
        ) : (
          <div className="mt-3 space-y-2">
            {friends.map((f) => (
              <div
                key={f.userId}
                className="flex items-center gap-3 rounded-2xl border border-hairline bg-surface p-3.5"
              >
                <span
                  className="grid size-10 shrink-0 place-items-center rounded-full text-sm font-semibold text-surface"
                  style={{
                    backgroundColor: `hsl(${(f.avatarSeed.charCodeAt(0) * 37) % 360} 40% 45%)`,
                  }}
                >
                  {f.displayName.slice(0, 1).toUpperCase()}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-display text-sm font-semibold text-ink">
                    {f.displayName}
                  </p>
                  <p className="text-xs text-ink-soft/80">🔥 {f.streak}-day streak</p>
                </div>
                <div className="shrink-0 text-right">
                  <p className="tnum text-sm font-semibold text-ink">{f.weekXp}</p>
                  <p className="text-[10px] text-ink-soft/70">XP this week</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </MobileFrame>
  );
}
