import type { PanelPlan } from "./panel-config";
import { DailyGoalCard, HectorCta, LeagueSnippet, NowPlayingCard, StatsCard } from "./PanelCards";

/**
 * The standard right panel (Learn, Library, Practice, League). Loaded on demand by MobileFrame, so a phone never
 * downloads it. Which cards show comes from the route's plan (panel-config.ts).
 */
export default function DesktopPanel({ plan }: { plan: PanelPlan }) {
  return (
    <div className="grid content-start gap-3.5">
      {plan.stats ? <StatsCard /> : null}
      {plan.nowPlaying ? <NowPlayingCard /> : null}
      {plan.goal ? <DailyGoalCard /> : null}
      {plan.league ? <LeagueSnippet /> : null}
      {plan.hector ? <HectorCta /> : null}
    </div>
  );
}
