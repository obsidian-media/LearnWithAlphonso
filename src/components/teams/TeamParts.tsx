import { DsButton, DsCard, Overline, RankBadge } from "@/components/ds/Blocks";
import { RefreshError } from "@/components/ds/RefreshError";
import type { TeamLeaderboardEntry } from "@/lib/teams.functions";
import { TeamNameReportMenu } from "../SocialSafetyMenu";

/**
 * "This week's top teams": ranked rows; the learner's own team is tinted. Draws nothing while empty and settled. A
 * failed read says so, with a retry, instead of vanishing like an empty board; a failed refresh of rows already shown
 * keeps them, with a one-line notice. Every team but one the learner owns has a "Report team name" menu, as on iOS
 * and Android.
 */
export function TopTeams({
  loading,
  failed = false,
  onRetry,
  rows,
  myTeamId,
  ownedTeamId = null,
}: {
  loading: boolean;
  /** The read failed: show an error with Try again (`onRetry`) rather than nothing. */
  failed?: boolean;
  onRetry?: () => void;
  rows: TeamLeaderboardEntry[];
  myTeamId: string | null;
  /** The team the learner owns, if any: its name cannot be reported by its own creator, so it gets no menu. */
  ownedTeamId?: string | null;
}) {
  if (!loading && !failed && rows.length === 0) return null;
  return (
    <>
      <Overline>This week's top teams</Overline>
      {failed && !loading && rows.length === 0 ? (
        <DsCard role="alert">
          <p className="ds-type-footnote text-ds-ink-soft">Couldn't load the top teams.</p>
          {onRetry && (
            <DsButton small variant="secondary" onClick={onRetry}>
              Try again
            </DsButton>
          )}
        </DsCard>
      ) : loading ? (
        <DsCard>
          <p className="ds-type-footnote text-ds-ink-soft">Loading…</p>
        </DsCard>
      ) : (
        <>
          {failed && onRetry && <RefreshError what="the top teams" onRetry={onRetry} />}
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
                {t.teamId !== ownedTeamId && (
                  <TeamNameReportMenu teamId={t.teamId} teamName={t.name} />
                )}
              </div>
            ))}
          </DsCard>
        </>
      )}
    </>
  );
}
