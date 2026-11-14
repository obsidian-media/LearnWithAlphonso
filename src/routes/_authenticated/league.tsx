import { flagEmoji, flagLabel } from "../../lib/country-flag";
import { createFileRoute } from "@tanstack/react-router";
import { ProfileAvatar } from "@/components/ds/ProfileAvatar";
import {
  BackPill,
  DsCard,
  DsHero,
  DsLinkButton,
  DsPill,
  DsScreen,
  DsSegmented,
  HeroKicker,
  PoseCard,
  RankBadge,
} from "@/components/ds/Blocks";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { LeagueTierBadge } from "../../components/LeagueTierBadge";
import { SocialSafetyMenu } from "../../components/SocialSafetyMenu";
import { LEAGUE_TIER_META, LEAGUE_TIERS, type LeagueTier } from "../../data/achievements";
import { useProgress } from "../../lib/progress";
import { getLeaderboard } from "../../lib/leaderboard.functions";
import { getProfileOverview } from "../../lib/profile.functions";
import { bigNumbers } from "../../lib/profile-overview";
import { tierTitle } from "../../lib/social-presentation";

export const Route = createFileRoute("/_authenticated/league")({
  component: LeaguePage,
  head: () => ({
    meta: [
      { title: "League — Alphonso" },
      {
        name: "description",
        content: "Compete on weekly and all-time leaderboards with learners worldwide.",
      },
      { property: "og:title", content: "League — Alphonso" },
      { property: "og:description", content: "Weekly leagues, friends, and country leaderboards." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

function LeaguePage() {
  const [scope, setScope] = useState<"global" | "friends" | "country">("global");
  const [period, setPeriod] = useState<"weekly" | "all-time">("weekly");
  const tier = useProgress((s) => s.leagueTier);
  const course = useProgress((s) => s.course);

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["leaderboard", scope, period],
    queryFn: () => getLeaderboard({ data: { scope, period } }),
  });
  // The learner's own XP this week from their activity, whatever board is showing; nothing when it cannot load.
  const overview = useQuery({
    queryKey: ["profile-overview", course],
    queryFn: () => getProfileOverview({ data: { course } }),
    staleTime: 60_000,
    retry: false,
  });
  const weekXp = overview.data ? bigNumbers(overview.data).xpThisWeek : null;

  const meta = LEAGUE_TIER_META[tier];
  const idx = LEAGUE_TIERS.indexOf(tier);
  const nextTier: LeagueTier | null = LEAGUE_TIERS[idx + 1] ?? null;

  return (
    <DsScreen scene="profile">
      <BackPill
        to="/profile"
        label="Back to profile"
        trailing={
          <span className="flex items-center gap-2">
            <DsLinkButton to="/teams">Teams</DsLinkButton>
            <DsLinkButton to="/season">Season</DsLinkButton>
          </span>
        }
      >
        Profile
      </BackPill>

      <DsHero aria-label="Your league">
        <div className="flex items-center gap-3">
          <LeagueTierBadge tier={tier} size="lg" />
          <div className="min-w-0 flex-1">
            <HeroKicker>Your league</HeroKicker>
            <h1 className="ds-type-title">{tierTitle(meta.label)}</h1>
            <p className="ds-type-caption text-ds-on-hero-soft">{meta.sub}</p>
          </div>
          {weekXp !== null && (
            <div className="text-right">
              <p className="tnum ds-type-display">{weekXp.toLocaleString()}</p>
              <p className="ds-type-caption text-ds-on-hero-soft">XP this week</p>
            </div>
          )}
        </div>
        {nextTier && (
          <p className="ds-type-caption text-ds-on-hero-kick">
            <span className="uppercase tracking-wider">Next</span>{" "}
            <span className="font-extrabold">{LEAGUE_TIER_META[nextTier].label}</span>
          </p>
        )}
      </DsHero>

      <DsSegmented
        ariaLabel="Scope"
        value={scope}
        onChange={setScope}
        options={[
          { value: "global", label: "Global" },
          { value: "friends", label: "Friends" },
          { value: "country", label: "Country" },
        ]}
      />
      <DsSegmented
        ariaLabel="Period"
        value={period}
        onChange={setPeriod}
        options={[
          { value: "weekly", label: "Weekly" },
          { value: "all-time", label: "All-time" },
        ]}
      />

      {isLoading && (
        <DsCard>
          <p className="ds-type-footnote text-center text-ds-ink-soft">Loading…</p>
        </DsCard>
      )}
      {!isLoading && (data?.length ?? 0) === 0 && (
        <PoseCard
          src="/mascots/alphonso-waving.png"
          title="Nothing here yet"
          body={
            scope === "friends"
              ? "Add friends to compete side by side."
              : scope === "country"
                ? "Set your country on your profile to see this board."
                : "Finish a lesson to appear on the board."
          }
        />
      )}
      {(data?.length ?? 0) > 0 && (
        <DsCard className="gap-0 p-1.5">
          <ol>
            {(data ?? []).map((row, i) => (
              <li
                key={row.user_id}
                className={`flex items-center gap-2.5 rounded-[16px] px-2.5 py-2.5 ${
                  row.isYou ? "bg-ds-choice-tint" : ""
                }`}
              >
                <RankBadge rank={i + 1} />
                <ProfileAvatar seed={row.avatar_seed} name={row.display_name} className="size-10" />
                <div className="min-w-0 flex-1">
                  <p className="ds-type-headline flex flex-wrap items-center gap-x-1.5 text-ds-ink">
                    {flagEmoji(row.country) && (
                      <span
                        role="img"
                        aria-label={flagLabel(row.country) ?? undefined}
                        data-leaderboard-flag={row.country}
                      >
                        {flagEmoji(row.country)}
                      </span>
                    )}
                    <span className="truncate">{row.display_name}</span>
                    {row.isYou && <DsPill tone="xp">You</DsPill>}
                  </p>
                  {/* A code that draws no flag (malformed) still shows as text; a valid one is the flag above. */}
                  {row.country && !flagEmoji(row.country) && (
                    <p className="ds-type-caption uppercase tracking-wider text-ds-ink-soft">
                      {row.country}
                    </p>
                  )}
                </div>
                <span className="tnum ds-type-headline text-ds-ink">{row.xp} XP</span>
                {!row.isYou && (
                  <SocialSafetyMenu
                    userId={row.user_id}
                    displayName={row.display_name}
                    onBlocked={() => refetch()}
                  />
                )}
              </li>
            ))}
          </ol>
        </DsCard>
      )}
    </DsScreen>
  );
}
