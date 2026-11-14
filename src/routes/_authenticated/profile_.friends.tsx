import { createFileRoute } from "@tanstack/react-router";
import { ProfileAvatar } from "@/components/ds/ProfileAvatar";
import {
  BackPill,
  DsButton,
  DsCard,
  DsLinkButton,
  DsRow,
  DsScreen,
  GlassTitle,
  Icon,
  Overline,
} from "@/components/ds/Blocks";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { AskBuddyButton, BuddyCard } from "../../components/BuddyCard";
import { SocialSafetyMenu } from "../../components/SocialSafetyMenu";
import {
  getFriends,
  getMyFriendCode,
  removeFriend,
  type FriendEntry,
} from "../../lib/friends.functions";
import { buddyBlockConfirm } from "../../lib/buddy";
import { getMyBuddy } from "../../lib/buddy.functions";

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
  const queryClient = useQueryClient();
  // Same cache entry as BuddyCard: blocking the current buddy from their friend row gets the buddy wording.
  const myBuddy = useQuery({ queryKey: ["myBuddy"], queryFn: () => getMyBuddy(), retry: false });
  const { data: friendCode } = useQuery({
    queryKey: ["myFriendCode"],
    queryFn: () => getMyFriendCode(),
  });
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

  const inviteLink = friendCode ? `${window.location.origin}/invite/${friendCode}` : null;

  async function copyInvite() {
    if (!inviteLink) return;
    await navigator.clipboard.writeText(inviteLink);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  const count = friends?.length ?? 0;
  const countLine = count > 0 ? `${count} friend${count === 1 ? "" : "s"}` : null;

  return (
    <DsScreen scene="practice">
      <BackPill
        to="/profile"
        label="Back to profile"
        trailing={<DsLinkButton to="/duels">Duels</DsLinkButton>}
      >
        Profile
      </BackPill>
      <GlassTitle title="Friends" sub={countLine} />

      <DsCard>
        <div className="flex items-center gap-3">
          <Icon name="handshake" size={52} />
          <div className="min-w-0 flex-1">
            <p className="ds-type-headline text-ds-ink">Invite a friend</p>
            <p className="ds-type-footnote text-ds-ink-soft">
              Share your link. When they open it and tap Add friend, you're friends.
            </p>
          </div>
        </div>
        <DsButton full onClick={copyInvite} disabled={!inviteLink}>
          {copied ? "Link copied!" : "Copy invite link"}
        </DsButton>
        <span role="status" aria-live="polite" className="sr-only">
          {copied ? "Link copied to clipboard" : ""}
        </span>
      </DsCard>

      <BuddyCard />

      <Overline>{countLine ?? "Your friends"}</Overline>

      {isLoading ? (
        <DsCard>
          <p className="ds-type-footnote text-ds-ink-soft">Loading…</p>
        </DsCard>
      ) : !friends || friends.length === 0 ? (
        <DsCard className="text-center">
          <p className="ds-type-footnote text-ds-ink-soft">
            No friends yet. Share your invite link to get started.
          </p>
        </DsCard>
      ) : (
        <DsCard flush>
          {friends.map((f, i) => (
            <DsRow key={f.userId} first={i === 0} className="min-h-16">
              <ProfileAvatar seed={f.avatarSeed} name={f.displayName} className="size-11" />
              <div className="min-w-0 flex-1">
                <p className="ds-type-headline truncate text-ds-ink">{f.displayName}</p>
                <p className="ds-type-caption text-ds-ink-soft">🔥 {f.streak}-day streak</p>
                <AskBuddyButton friendId={f.userId} />
              </div>
              {confirmingId === f.userId ? (
                <div className="flex shrink-0 items-center gap-1.5">
                  <DsButton
                    small
                    variant="secondary"
                    onClick={() => setConfirmingId(null)}
                    disabled={removingId === f.userId}
                  >
                    Cancel
                  </DsButton>
                  <DsButton
                    small
                    variant="danger"
                    onClick={() => confirmRemove(f.userId)}
                    disabled={removingId === f.userId}
                  >
                    {removingId === f.userId ? "Removing…" : "Confirm"}
                  </DsButton>
                </div>
              ) : (
                <>
                  <div className="shrink-0 text-right">
                    <p className="tnum ds-type-headline text-ds-ink">{f.weekXp}</p>
                    <p className="ds-type-caption text-ds-ink-soft">XP this week</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setConfirmingId(f.userId)}
                    aria-label={`Remove ${f.displayName}`}
                    className="grid size-9 shrink-0 place-items-center rounded-full text-ds-ink-faint hover:bg-ds-wrong-tint hover:text-ds-wrong-ink focus-visible:outline-2 focus-visible:outline-ds-choice"
                  >
                    ✕
                  </button>
                  <SocialSafetyMenu
                    userId={f.userId}
                    displayName={f.displayName}
                    blockTitle={
                      myBuddy.data?.buddyId === f.userId
                        ? buddyBlockConfirm(f.displayName)
                        : undefined
                    }
                    onBlocked={() => {
                      queryClient.setQueryData<FriendEntry[]>(["friends"], (prev) =>
                        (prev ?? []).filter((x) => x.userId !== f.userId),
                      );
                      void queryClient.invalidateQueries({ queryKey: ["myBuddy"] });
                    }}
                  />
                </>
              )}
            </DsRow>
          ))}
        </DsCard>
      )}
    </DsScreen>
  );
}
