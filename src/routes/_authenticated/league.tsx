import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { MobileFrame } from "../../components/AppShell";
import { SegmentedControl } from "../../components/SegmentedControl";
import { LeagueTierBadge } from "../../components/LeagueTierBadge";
import { LEAGUE_TIER_META, LEAGUE_TIERS, type LeagueTier } from "../../data/achievements";
import { useProgress } from "../../lib/progress";
import { getLeaderboard } from "../../lib/leaderboard.functions";

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

  const { data, isLoading } = useQuery({
    queryKey: ["leaderboard", scope, period],
    queryFn: () => getLeaderboard({ data: { scope, period } }),
  });

  const meta = LEAGUE_TIER_META[tier];
  const idx = LEAGUE_TIERS.indexOf(tier);
  const nextTier: LeagueTier | null = LEAGUE_TIERS[idx + 1] ?? null;

  return (
    <MobileFrame>
      <div className="px-6 pb-10 pt-6">
        <p className="mb-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-ember">
          Your league
        </p>
        <div className="flex items-center gap-4 rounded-3xl border border-hairline bg-parchment p-4">
          <LeagueTierBadge tier={tier} size="lg" />
          <div className="flex-1">
            <h1 className="font-display text-[22px] font-semibold text-ink">{meta.label}</h1>
            <p className="text-xs text-ink-soft/80">{meta.sub}</p>
          </div>
          {nextTier && (
            <div className="text-right">
              <p className="text-[10px] uppercase tracking-[0.14em] text-ink-soft/60">Next</p>
              <p className="text-xs font-semibold text-ink">{LEAGUE_TIER_META[nextTier].label}</p>
            </div>
          )}
        </div>

        <div className="mt-6 flex flex-wrap items-center gap-2">
          <SegmentedControl
            ariaLabel="Scope"
            value={scope}
            onChange={setScope}
            options={[
              { value: "global", label: "Global" },
              { value: "friends", label: "Friends" },
              { value: "country", label: "Country" },
            ]}
          />
          <SegmentedControl
            ariaLabel="Period"
            value={period}
            onChange={setPeriod}
            options={[
              { value: "weekly", label: "Weekly" },
              { value: "all-time", label: "All-time" },
            ]}
          />
        </div>

        <div className="mt-5">
          {isLoading && <p className="py-8 text-center text-xs text-ink-soft">Loading…</p>}
          {!isLoading && (data?.length ?? 0) === 0 && (
            <div className="rounded-2xl border border-hairline bg-parchment p-6 text-center">
              <p className="text-sm font-semibold text-ink">Nothing here yet</p>
              <p className="mt-1 text-xs text-ink-soft">
                {scope === "friends"
                  ? "Add friends to compete side by side."
                  : scope === "country"
                    ? "Set your country on your profile to see this board."
                    : "Finish a lesson to appear on the board."}
              </p>
            </div>
          )}
          <ol className="divide-y divide-hairline overflow-hidden rounded-2xl border border-hairline bg-surface">
            {(data ?? []).map((row, i) => (
              <li
                key={row.user_id}
                className={`flex items-center gap-3 px-4 py-3 ${row.isYou ? "bg-ember/10" : ""}`}
              >
                <span
                  className={`tnum grid size-7 place-items-center rounded-full text-[11px] font-semibold ${
                    i === 0
                      ? "bg-amber-300 text-ink"
                      : i === 1
                        ? "bg-neutral-300 text-ink"
                        : i === 2
                          ? "bg-orange-300 text-ink"
                          : "bg-parchment text-ink-soft"
                  }`}
                >
                  {i + 1}
                </span>
                <span
                  className="grid size-9 place-items-center rounded-full text-xs font-semibold text-surface"
                  style={{
                    backgroundColor: `hsl(${(row.avatar_seed.charCodeAt(0) * 37) % 360} 40% 45%)`,
                  }}
                >
                  {row.display_name.slice(0, 1).toUpperCase()}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-ink">
                    {row.display_name}
                    {row.isYou && (
                      <span className="ml-1.5 rounded-full bg-ember px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-surface">
                        You
                      </span>
                    )}
                  </p>
                  {row.country && (
                    <p className="text-[10px] uppercase tracking-wider text-ink-soft/60">
                      {row.country}
                    </p>
                  )}
                </div>
                <span className="tnum text-sm font-semibold text-ink">{row.xp} XP</span>
              </li>
            ))}
          </ol>
        </div>
      </div>
    </MobileFrame>
  );
}
