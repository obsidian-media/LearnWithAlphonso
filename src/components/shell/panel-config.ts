/**
 * What the desktop right panel holds on each route (>= 1024px). One table, so changing a route's panel is one line.
 *
 * Learn, Library and Practice share the standard panel (Library adds Now playing while an episode is loaded). League
 * is the league itself, so its panel leaves out the league snippet. Hector brings its own panel (the scenario and
 * what Hector remembers; see HectorPanel) through MobileFrame's `panel` prop.
 */
export type PanelPlan = {
  stats: boolean;
  goal: boolean;
  league: boolean;
  hector: boolean;
  /** The episode that is loaded, with play and pause. Shown only while one is. */
  nowPlaying: boolean;
};

export const STANDARD_PANEL: PanelPlan = {
  stats: true,
  goal: true,
  league: true,
  hector: true,
  nowPlaying: false,
};

const LIBRARY_PANEL: PanelPlan = { ...STANDARD_PANEL, nowPlaying: true };
const LEAGUE_PANEL: PanelPlan = { ...STANDARD_PANEL, league: false };

/**
 * PROFILE: a wide single column with no panel. The owner has not decided this; it is the coordinator's default.
 * To give Profile (and its sub-pages) the standard panel instead, set this to STANDARD_PANEL.
 */
export const PROFILE_PANEL: PanelPlan | null = null;

/** The panel for a path, or null for none. Order matters: the first prefix that matches wins. */
export function panelPlanFor(pathname: string): PanelPlan | null {
  if (pathname.startsWith("/profile")) return PROFILE_PANEL;
  if (pathname.startsWith("/league")) return LEAGUE_PANEL;
  if (pathname.startsWith("/listen")) return LIBRARY_PANEL;
  return STANDARD_PANEL;
}
