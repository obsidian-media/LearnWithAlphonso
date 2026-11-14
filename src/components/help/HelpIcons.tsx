import type { ReactNode } from "react";

/**
 * The small line icons the Help chat draws (the round 12 mock's set): current-colour strokes, decorative. Sized by the
 * caller's class. They are not in the design system's 22 icons, so they live here, with no colour of their own.
 */
const PATHS = {
  life: (
    <>
      <circle cx="12" cy="12" r="9" />
      <circle cx="12" cy="12" r="3.6" />
      <path d="M5.6 5.6l3.9 3.9M14.5 14.5l3.9 3.9M18.4 5.6l-3.9 3.9M9.5 14.5l-3.9 3.9" />
    </>
  ),
  send: <path d="M12 19V5M5.5 11.5L12 5l6.5 6.5" />,
  person: (
    <>
      <circle cx="12" cy="8" r="3.6" />
      <path d="M5 20c.8-4 3.5-5.8 7-5.8s6.2 1.8 7 5.8" />
    </>
  ),
  team: (
    <>
      <circle cx="9" cy="9" r="3.2" />
      <path d="M3.5 19c.7-3.4 2.8-5 5.5-5s4.8 1.6 5.5 5" />
      <path d="M16 6.2a3.2 3.2 0 010 6M18 14.2c1.6.7 2.6 2.3 3 4.8" />
    </>
  ),
  hourglass: <path d="M7 3h10M7 21h10M8 3c0 5 8 5 8 9s-8 4-8 9M16 3c0 5-8 5-8 9" />,
  check: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M8 12.5l2.8 2.8L16 9.5" />
    </>
  ),
  offline: (
    <path d="M3 3l18 18M8.5 8.6A9 9 0 003 12.5M12 7a9 9 0 019 5.5M10 17.2a4 4 0 014-.6M12 21h.01" />
  ),
  lock: (
    <>
      <rect x="5" y="10.5" width="14" height="10" rx="2.5" />
      <path d="M8 10.5V8a4 4 0 018 0v2.5" />
    </>
  ),
  arrow: <path d="M5 12h14M13 6l6 6-6 6" />,
  info: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 11v5M12 7.6h.01" />
    </>
  ),
  retry: <path d="M20 11a8 8 0 10-2.3 5.7M20 4v7h-7" />,
  back: <path d="M15 4l-8 8 8 8" />,
  forward: <path d="M9 4l8 8-8 8" />,
} satisfies Record<string, ReactNode>;

export type HelpIconName = keyof typeof PATHS;

export function HelpIcon({ name, className }: { name: HelpIconName; className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.4"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      className={className ?? "size-5"}
    >
      {PATHS[name]}
    </svg>
  );
}
