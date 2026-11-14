import { DsCard, Overline, RankBadge } from "@/components/ds/Blocks";
import type { TeamLeaderboardEntry } from "@/lib/teams.functions";

/** "This week's top teams": ranked rows; the learner's own team is tinted. Draws nothing while empty and settled. */
export function TopTeams({
  loading,
  rows,
  myTeamId,
}: {
  loading: boolean;
  rows: TeamLeaderboardEntry[];
  myTeamId: string | null;
}) {
  if (!loading && rows.length === 0) return null;
  return (
    <>
      <Overline>This week's top teams</Overline>
      {loading ? (
        <DsCard>
          <p className="ds-type-footnote text-ds-ink-soft">Loading…</p>
        </DsCard>
      ) : (
        <DsCard className="gap-0 p-1.5">
          {rows.map((t, i) => (
            <div
              key={t.teamId}
              className={`flex items-center gap-2.5 rounded-[14px] px-2.5 py-2.5 ${
                t.teamId === myTeamId ? "bg-ds-choice-tint" : ""
              }`}
            >
              <RankBadge rank={i + 1} />
              <div className="min-w-0 flex-1">
                <p className="ds-type-headline truncate text-ds-ink">{t.name}</p>
                <p className="tnum ds-type-caption text-ds-ink-soft">{t.weeklyXp} XP this week</p>
              </div>
            </div>
          ))}
        </DsCard>
      )}
    </>
  );
}
