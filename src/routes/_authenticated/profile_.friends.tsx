import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { MobileFrame } from "../../components/AppShell";
import { SocialSafetyMenu } from "../../components/SocialSafetyMenu";
import { getFriends, removeFriend, type FriendEntry } from "../../lib/friends.functions";
import { getMyProfile } from "../../lib/leaderboard.functions";
import { useTheme } from "../../lib/theme";

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
  const isStudioInk = useTheme((s) => s.theme === "studio-ink");
  const queryClient = useQueryClient();
  const { data: profile } = useQuery({ queryKey: ["me"], queryFn: () => getMyProfile() });
  const { data: friends, isLoading } = useQuery({
    queryKey: ["friends"],
    queryFn: () => getFriends(),
  });
  const [copied, setCopied] = useState(false);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [confirmingId, setConfirmingId] = useState<string | null>(null);

  async function confirmRemove(friendId: string) {
    setRemovingId(friendId);
    try {
      await removeFriend({ data: { friendId } });
      queryClient.setQueryData<FriendEntry[]>(["friends"], (prev) =>
        (prev ?? []).filter((f) => f.userId !== friendId),
      );
    } finally {
      setRemovingId(null);
      setConfirmingId(null);
    }
  }

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
          <Link
            to="/duels"
            className="ml-auto text-xs font-medium text-moss underline underline-offset-4"
          >
            Duels →
          </Link>
        </div>

        <div
          className={
            isStudioInk
              ? "mt-6 border-b border-hairline pb-5"
              : "mt-6 rounded-2xl border border-hairline bg-parchment p-4"
          }
        >
          <p className="font-display text-base font-semibold text-ink">Invite a friend</p>
          <p className="mt-1 text-xs text-ink-soft/80">
            Share your link — when they open it, you're automatically friends.
          </p>
          {isStudioInk ? (
            <button
              type="button"
              onClick={copyInvite}
              disabled={!inviteLink}
              className="mt-3 text-sm font-semibold text-moss underline underline-offset-4 disabled:opacity-50"
            >
              {copied ? "Link copied!" : "Copy invite link →"}
            </button>
          ) : (
            <button
              type="button"
              onClick={copyInvite}
              disabled={!inviteLink}
              className="mt-3 w-full rounded-full bg-ink px-4 py-2.5 text-sm font-semibold text-surface transition hover:opacity-90 disabled:opacity-50"
            >
              {copied ? "Link copied!" : "Copy invite link"}
            </button>
          )}
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
          <div
            className={
              isStudioInk
                ? "mt-3 border-y border-hairline py-4 text-center"
                : "mt-3 rounded-2xl border border-hairline bg-surface p-4 text-center"
            }
          >
            <p className="text-sm text-ink-soft">
              No friends yet. Share your invite link to get started.
            </p>
          </div>
        ) : (
          <div className={isStudioInk ? "mt-3 divide-y divide-hairline" : "mt-3 space-y-2"}>
            {friends.map((f) => (
              <div
                key={f.userId}
                className={
                  isStudioInk
                    ? "flex items-center gap-3 py-3.5"
                    : "flex items-center gap-3 rounded-2xl border border-hairline bg-surface p-3.5"
                }
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
                {confirmingId === f.userId ? (
                  <div className="flex shrink-0 items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setConfirmingId(null)}
                      disabled={removingId === f.userId}
                      className="text-xs font-medium text-ink-soft underline underline-offset-4 disabled:opacity-50"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={() => confirmRemove(f.userId)}
                      disabled={removingId === f.userId}
                      className="text-xs font-semibold text-rose-500 underline underline-offset-4 disabled:opacity-50"
                    >
                      {removingId === f.userId ? "Removing…" : "Confirm"}
                    </button>
                  </div>
                ) : (
                  <>
                    <div className="shrink-0 text-right">
                      <p className="tnum text-sm font-semibold text-ink">{f.weekXp}</p>
                      <p className="text-[10px] text-ink-soft/70">XP this week</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setConfirmingId(f.userId)}
                      aria-label={`Remove ${f.displayName}`}
                      className="shrink-0 text-ink-soft/50 hover:text-rose-500"
                    >
                      ✕
                    </button>
                    <SocialSafetyMenu
                      userId={f.userId}
                      displayName={f.displayName}
                      onBlocked={() =>
                        queryClient.setQueryData<FriendEntry[]>(["friends"], (prev) =>
                          (prev ?? []).filter((x) => x.userId !== f.userId),
                        )
                      }
                    />
                  </>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </MobileFrame>
  );
}
