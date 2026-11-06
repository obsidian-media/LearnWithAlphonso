import type { ReactNode } from "react";

/**
 * The lesson's frame: the app column on the palette's surface, always in the light values (`.ds-light`), because
 * each room is a lit painting and a dark interface around it would fight it (owner decision, round 6). Night rooms
 * are a later round.
 */
export function LessonScreen({ children }: { children: ReactNode }) {
  return (
    <div
      data-lesson-screen=""
      className="ds-light min-h-dvh bg-ds-sunk font-[family-name:var(--ds-font-body)] text-ds-ink"
    >
      <main
        id="main-content"
        className="mx-auto flex min-h-dvh max-w-[430px] flex-col bg-ds-surface"
      >
        {children}
      </main>
    </div>
  );
}
