import { COMPACT_MIN, WIDE_MIN } from "@/lib/use-viewport-tier";

/**
 * The desktop shell's column arithmetic (AppShell.tsx DesktopFrame), written down so a test can sweep every width from
 * 768 to 1600 and prove the page never needs more room than the window has. The numbers are the Tailwind classes in
 * AppShell.tsx; desktop-layout.test.ts reads that file and fails if the two drift apart.
 *
 *   frame      centred, never wider than 1400.
 *   rail       248 labelled (1280+), else 84.
 *   padding    16 each side, 32 each side from 1280 (`px-4 xl:px-8`).
 *   main       shrinkable: it takes what the rail, padding, gap and panel leave, up to its cap (720 beside a panel at
 *              1280+, 880 beside a panel below that, 760 with no panel). It must NOT be a fixed width: a fixed 720
 *              beside a 336 panel and a 248 rail needs 1392px, which overflowed a 1280 window.
 *   gap        24 between main and panel.
 *   panel      336 from 1280, 280 from 1024, never shrunk.
 */
export const FRAME_MAX = 1400;
const RAIL_WIDE = 248;
const RAIL_NARROW = 84;
const PANEL_WIDE = 336;
const PANEL_COMPACT = 280;
const GAP = 24;

export type DesktopColumns = {
  rail: number;
  padding: number;
  main: number;
  gap: number;
  panel: number;
  /** How far the content reaches past the window; 0 when it fits. */
  overflow: number;
};

/** The widths at one window width (768 and up), with the panel when the route has one. */
export function desktopColumnsAt(
  width: number,
  opts: { withPanel?: boolean; mainShrinks?: boolean } = {},
): DesktopColumns {
  const { withPanel = true, mainShrinks = true } = opts;
  const wide = width >= WIDE_MIN;
  const hasPanel = withPanel && width >= COMPACT_MIN;
  const frame = Math.min(width, FRAME_MAX);
  const rail = wide ? RAIL_WIDE : RAIL_NARROW;
  const padding = wide ? 64 : 32;
  const panel = hasPanel ? (wide ? PANEL_WIDE : PANEL_COMPACT) : 0;
  const gap = hasPanel ? GAP : 0;
  const room = frame - rail - padding - gap - panel;
  const cap = !(width >= COMPACT_MIN) ? 760 : !hasPanel ? 880 : wide ? 720 : Infinity;
  // A main column that cannot shrink keeps its cap whatever room is left.
  const main = mainShrinks ? Math.max(0, Math.min(cap, room)) : Math.min(cap, 720);
  const used = rail + padding + main + gap + panel;
  return { rail, padding, main, gap, panel, overflow: Math.max(0, used - width) };
}
