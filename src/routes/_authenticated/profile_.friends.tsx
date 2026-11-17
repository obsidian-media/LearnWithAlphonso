import { createFileRoute } from "@tanstack/react-router";
import { ProfileAvatar } from "@/components/ds/ProfileAvatar";
import {
  BackPill,
  DsButton,
  DsCard,
  DsLinkButton,
  DsRow,
  GlassTitle,
  Icon,
  Overline,
} from "@/components/ds/Blocks";
import { DsScreen } from "@/components/ds/DsScreen";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { AskBuddyButton, BuddyCard } from "../../components/BuddyCard";
import { SocialSafetyMenu } from "../../components/SocialSafetyMenu";
import { ToastBanner } from "../../components/ToastBanner";
import { useToast } from "../../lib/use-toast";
import {
  getFriendActivity,
  getFreezeGiftState,
  getFriends,
  getMyFriendCode,
  getUnreadFreezeGifts,
  getUnreadNudges,
  giftStreakFreeze,
  markFreezeGiftsRead,
  markNudgesRead,
  removeFriend,
  sendNudge,
  type FriendEntry,
} from "../../lib/friends.functions";
import { activityCopy, activityIcon, activityName } from "../../lib/friend-activity";
import {
  freezeReceivedToast,
  giftButtonState,
  giftAriaLabel,
  giftFreezeMessage,
} from "../../lib/freeze-gift";
import { getMyProfile } from "../../lib/leaderboard.functions";
import {
  canNudge,
  loadNudgeCooldowns,
  nudgeSenderName,
  nudgeToastMessage,
  recordNudge,
  type NudgeCooldowns,
} from "../../lib/nudge";
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

/** localStorage, or null where it is blocked (a private window): the cooldown then lasts for the visit only. */
function safeStorage(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

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
  const { data: me } = useQuery({ queryKey: ["me"], queryFn: () => getMyProfile() });
  const myId = me?.id ?? null;
  const { data: activity } = useQuery({
    queryKey: ["friendActivity"],
    queryFn: () => getFriendActivity(),
    retry: false,
  });
  // Unread nudges are checked whenever the page opens or the tab comes back into focus, as the apps do on foreground.
  const { data: unread } = useQuery({
    queryKey: ["unreadNudges"],
    queryFn: () => getUnreadNudges(),
    retry: false,
  });
  // Freezes friends have gifted (read, like nudges, when the page opens) and what this learner can still give today.
  const { data: unreadGifts } = useQuery({
    queryKey: ["unreadFreezeGifts"],
    queryFn: () => getUnreadFreezeGifts(),
    retry: false,
  });
  const { data: giftState } = useQuery({
    queryKey: ["freezeGiftState"],
    queryFn: () => getFreezeGiftState(),
    retry: false,
  });
  const [toast, showToast] = useToast();
  const [givingId, setGivingId] = useState<string | null>(null);
  const shownGiftIds = useRef(new Set<string>());
  const [cooldowns, setCooldowns] = useState<NudgeCooldowns>({});
  const [nudgingId, setNudgingId] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const shownNudgeIds = useRef(new Set<string>());
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
      dropActivityFrom(friendId);
    } finally {
      setRemovingId(null);
      setConfirmingId(null);
    }
  }

  useEffect(() => {
    if (!myId) return;
    setCooldowns(loadNudgeCooldowns(myId, safeStorage()));
  }, [myId]);

  // Show the toast for nudges not yet shown, then mark them read so the next visit starts clean.
  useEffect(() => {
    if (!unread || !friends) return;
    const fresh = unread.filter((n) => !shownNudgeIds.current.has(n.id));
    if (fresh.length === 0) return;
    for (const n of fresh) shownNudgeIds.current.add(n.id);
    showToast(nudgeToastMessage(fresh.map((n) => nudgeSenderName(n.senderId, friends))));
    void markNudgesRead({ data: { ids: fresh.map((n) => n.id) } });
  }, [unread, friends, showToast]);

  // The same for received freezes: a toast for each gift not yet shown, then marked read.
  useEffect(() => {
    if (!unreadGifts || !friends) return;
    const fresh = unreadGifts.filter((g) => !shownGiftIds.current.has(g.id));
    if (fresh.length === 0) return;
    for (const g of fresh) shownGiftIds.current.add(g.id);
    showToast(freezeReceivedToast(fresh.map((g) => nudgeSenderName(g.senderId, friends))));
    void markFreezeGiftsRead({ data: { ids: fresh.map((g) => g.id) } });
  }, [unreadGifts, friends, showToast]);

  async function gift(friend: FriendEntry) {
    if (givingId) return;
    setGivingId(friend.userId);
    try {
      const result = await giftStreakFreeze({ data: { recipientId: friend.userId } });
      showToast(giftFreezeMessage(result, friend.displayName));
    } catch {
      showToast(
        giftFreezeMessage({ ok: false, reason: "error", freezes: null }, friend.displayName),
      );
    } finally {
      setGivingId(null);
      // The database's answer is the truth: re-read the balance and today's gifts rather than guessing.
      void queryClient.invalidateQueries({ queryKey: ["freezeGiftState"] });
    }
  }

  async function nudge(friend: FriendEntry) {
    if (!myId || nudgingId) return;
    const at = Date.now();
    setNow(at);
    setNudgingId(friend.userId);
    try {
      const result = await sendNudge({ data: { recipientId: friend.userId } });
      if (result.ok) {
        setCooldowns(recordNudge(myId, friend.userId, at, safeStorage()));
        showToast(`Nudge sent to ${friend.displayName}.`);
      } else {
        showToast(`Couldn't nudge ${friend.displayName}. Try again.`);
      }
    } catch {
      showToast(`Couldn't nudge ${friend.displayName}. Try again.`);
    } finally {
      setNudgingId(null);
    }
  }

  function dropActivityFrom(userId: string) {
    queryClient.setQueryData<NonNullable<typeof activity>>(["friendActivity"], (prev) =>
      (prev ?? []).filter((e) => e.userId !== userId),
    );
  }

  const inviteLink = friendCode ? `${window.location.origin}/invite/${friendCode}` : null;

  async function copyInvite() {
    if (!inviteLink) return;
    await navigator.clipboard.writeText(inviteLink);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  const giftedToday = new Set(giftState?.giftedTodayTo ?? []);
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

      <Overline>Your friends</Overline>

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
            <DsRow key={f.userId} first={i === 0} className="min-h-16 flex-wrap">
              <ProfileAvatar seed={f.avatarSeed} name={f.displayName} className="size-11" />
              <div className="min-w-0 flex-1">
                <p className="ds-type-headline truncate text-ds-ink">{f.displayName}</p>
                <p className="ds-type-caption text-ds-ink-soft">🔥 {f.streak}-day streak</p>
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
                  <DsButton
                    small
                    variant="secondary"
                    onClick={() => void nudge(f)}
                    disabled={!myId || nudgingId !== null || !canNudge(cooldowns[f.userId], now)}
                    aria-label={`Nudge ${f.displayName}`}
                    className="!min-w-11 shrink-0 !px-2.5"
                  >
                    <Icon name="waving_hand" size={22} />
                  </DsButton>
                  <DsButton
                    small
                    variant="secondary"
                    onClick={() => void gift(f)}
                    disabled={
                      givingId !== null ||
                      giftButtonState(giftState?.freezes, giftedToday, f.userId) !== "send"
                    }
                    aria-label={giftAriaLabel(
                      f.displayName,
                      giftButtonState(giftState?.freezes, giftedToday, f.userId),
                    )}
                    className="!min-w-11 shrink-0 !px-2.5"
                  >
                    <Icon name="snowflake" size={22} />
                  </DsButton>
                  <SocialSafetyMenu
                    userId={f.userId}
                    displayName={f.displayName}
                    onRemove={() => setConfirmingId(f.userId)}
                    blockTitle={
                      myBuddy.data?.buddyId === f.userId
                        ? buddyBlockConfirm(f.displayName)
                        : undefined
                    }
                    onBlocked={() => {
                      queryClient.setQueryData<FriendEntry[]>(["friends"], (prev) =>
                        (prev ?? []).filter((x) => x.userId !== f.userId),
                      );
                      dropActivityFrom(f.userId);
                      void queryClient.invalidateQueries({ queryKey: ["myBuddy"] });
                    }}
                  />
                </>
              )}
              {/* The study-buddy ask sits on its own quiet line under the name, so the row above stays one line. */}
              <div className="basis-full pl-[54px] empty:hidden">
                <AskBuddyButton friendId={f.userId} />
              </div>
            </DsRow>
          ))}
        </DsCard>
      )}

      {activity && activity.length > 0 && (
        <>
          <Overline>Activity</Overline>
          <DsCard>
            <ul className="grid gap-1">
              {activity.map((event) => (
                <li key={event.id} className="flex items-center gap-3 py-1">
                  <Icon name={activityIcon(event.eventType)} size={40} />
                  <p className="ds-type-body min-w-0 flex-1 text-ds-ink">
                    {activityCopy(event, activityName(event.userId, myId, friends ?? []))}
                  </p>
                </li>
              ))}
            </ul>
          </DsCard>
        </>
      )}
      <ToastBanner message={toast} />
    </DsScreen>
  );
}
