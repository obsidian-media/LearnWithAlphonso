import type { ReactElement } from "react";

/**
 * The first run's line icons, drawn as in the approved mock-up (03-first-run-mockup). They take the current text
 * colour, so a token class sets the colour. The design system's own 22 icons (DsIcon) cover the rest.
 */
const P: Record<string, ReactElement> = {
  back: <path d="M15 5l-7 7 7 7" strokeWidth={3} />,
  plane: <path d="M3 13l18-7-6 15-3-6-9-2z" />,
  brief: (
    <>
      <rect x="3.5" y="7" width="17" height="12" rx="2.5" />
      <path d="M9 7V5.5A1.5 1.5 0 0 1 10.5 4h3A1.5 1.5 0 0 1 15 5.5V7M3.5 12h17" />
    </>
  ),
  cap: (
    <>
      <path d="M2 9l10-5 10 5-10 5L2 9z" />
      <path d="M6 11v5c2 2 10 2 12 0v-5" />
    </>
  ),
  home: (
    <>
      <path d="M4 11l8-7 8 7v9H4v-9z" />
      <path d="M10 20v-5h4v5" />
    </>
  ),
  medal: (
    <>
      <circle cx="12" cy="15" r="5" />
      <path d="M8 3l2.5 7M16 3l-2.5 7" />
    </>
  ),
  smile: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M8.5 14c1.8 2 5.2 2 7 0M9 9.5h.01M15 9.5h.01" />
    </>
  ),
  seed: (
    <>
      <path d="M12 20v-8" />
      <path d="M12 12c0-4 3-6 7-6 0 4-3 6-7 6z" />
    </>
  ),
  sprout: (
    <>
      <path d="M12 20V9" />
      <path d="M12 9c0-3 2-5 6-5 0 3-2 5-6 5zM12 12c0-3-2-5-6-5 0 3 2 5 6 5zM7 20h10" />
    </>
  ),
  tree: (
    <>
      <path d="M12 3c4 0 6 3 6 6a5 5 0 0 1-3 4.6V14H9v-.4A5 5 0 0 1 6 9c0-3 2-6 6-6z" />
      <path d="M12 14v7" />
    </>
  ),
  clock: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.5V12l3 2" />
    </>
  ),
  food: <path d="M7 3v8M5 3v5a2 2 0 0 0 4 0V3M7 11v10M17 21V3c-2 1-3 4-3 7h3" />,
  ball: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.5l4 3-1.5 4.5h-5L8 10.5z" />
    </>
  ),
  music: (
    <>
      <path d="M9 18V6l10-2v12" />
      <circle cx="6.5" cy="18" r="2.5" />
      <circle cx="16.5" cy="16" r="2.5" />
    </>
  ),
  film: (
    <>
      <rect x="3.5" y="5" width="17" height="14" rx="2" />
      <path d="M8 5v14M16 5v14M3.5 9.5H8M3.5 14.5H8M16 9.5h4.5M16 14.5h4.5" />
    </>
  ),
  chip: (
    <>
      <rect x="6" y="6" width="12" height="12" rx="2" />
      <path d="M9 3v3M15 3v3M9 18v3M15 18v3M3 9h3M3 15h3M18 9h3M18 15h3" />
    </>
  ),
  leaf: (
    <>
      <path d="M5 19c0-8 5-14 15-14 0 10-6 15-14 15" />
      <path d="M5 19l7-7" />
    </>
  ),
  brush: (
    <>
      <path d="M14 4l6 6-8 8-6-6z" />
      <path d="M6 12c-2 0-3 1.5-3 3.5 0 1.5-1 2.5-1 2.5s3.5 1 5.5-1c1.2-1.2 1-2.5.5-3" />
    </>
  ),
  people: (
    <>
      <circle cx="9" cy="8" r="3.2" />
      <circle cx="17" cy="9" r="2.5" />
      <path d="M3 19c.5-3.5 3-5.5 6-5.5s5.5 2 6 5.5M15 14c3 0 5 1.6 5.5 4.5" />
    </>
  ),
  globe: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M3.5 12h17M12 3.5c2.5 2.5 3.5 5.5 3.5 8.5s-1 6-3.5 8.5c-2.5-2.5-3.5-5.5-3.5-8.5s1-6 3.5-8.5z" />
    </>
  ),
  pin: (
    <>
      <path d="M12 21s-6.5-6-6.5-11a6.5 6.5 0 0 1 13 0c0 5-6.5 11-6.5 11z" />
      <circle cx="12" cy="10" r="2.4" />
    </>
  ),
  target: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <circle cx="12" cy="12" r="4.5" />
      <circle cx="12" cy="12" r="1" fill="currentColor" />
    </>
  ),
  cal: (
    <>
      <rect x="3.5" y="5" width="17" height="15" rx="2.5" />
      <path d="M3.5 10h17M8 3v4M16 3v4" />
    </>
  ),
  chat: <path d="M4 5h16v11H9l-5 4V5z" />,
  brain: (
    <path d="M9 4a3 3 0 0 0-3 3 3 3 0 0 0-2 5 3 3 0 0 0 2 5 3 3 0 0 0 6 1V5a2 2 0 0 0-3-1zM15 4a3 3 0 0 1 3 3 3 3 0 0 1 2 5 3 3 0 0 1-2 5 3 3 0 0 1-6 1" />
  ),
  heartc: (
    <path d="M12 20s-7-4.3-8.8-8.6C1.9 8.2 4 4.8 7.3 4.8c2 0 3.2 1.1 3.7 2h2c.5-.9 1.7-2 3.7-2 3.3 0 5.4 3.4 4.1 6.6C19 15.7 12 20 12 20z" />
  ),
  mail: (
    <>
      <rect x="3" y="5.5" width="18" height="13" rx="2.5" />
      <path d="M3.5 7l8.5 6 8.5-6" />
    </>
  ),
  pod: (
    <>
      <circle cx="12" cy="11" r="3" />
      <path d="M12 14v7M7.5 15.5a6.5 6.5 0 1 1 9 0M5 18.5a10 10 0 1 1 14 0" />
    </>
  ),
  share: (
    <>
      <circle cx="6" cy="12" r="2.5" />
      <circle cx="18" cy="6" r="2.5" />
      <circle cx="18" cy="18" r="2.5" />
      <path d="M8.2 11l7.6-4M8.2 13l7.6 4" />
    </>
  ),
  store: (
    <>
      <path d="M4 9l1.5-5h13L20 9" />
      <path d="M4 9h16v2a3 3 0 0 1-5.3 2 3 3 0 0 1-5.4 0A3 3 0 0 1 4 11z" />
      <path d="M5.5 13.5V20h13v-6.5" />
    </>
  ),
  search: (
    <>
      <circle cx="11" cy="11" r="6.5" />
      <path d="M20 20l-4-4" />
    </>
  ),
  user: (
    <>
      <circle cx="12" cy="8.5" r="3.8" />
      <path d="M4.5 20c.8-4 3.8-6 7.5-6s6.7 2 7.5 6" />
    </>
  ),
};

export type FirstRunIconName = keyof typeof P;

export function FirstRunIcon({ name, className }: { name: FirstRunIconName; className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      className={className}
    >
      {P[name]}
    </svg>
  );
}
