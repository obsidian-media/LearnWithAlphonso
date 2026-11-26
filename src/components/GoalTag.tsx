import type { Goal } from "../lib/learner-profile";

/** The small grey pill "For your <goal> goal" with the goal's icon (owner pick C1). Never a link: the goal is changed in Profile or Build my path. */
const ICONS: Record<Goal, string> = {
  travel: "M2 16l9-3 3-9 2 1-1 8 6 2v2l-7-1-1 3-2 1-1-4-8-1z",
  work: "M3 7h18v13H3zM9 7V5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2M3 13h18",
  school: "M2 9l10-5 10 5-10 5zM6 11v5c0 1.5 3 3 6 3s6-1.5 6-3v-5",
  family: "M3 11l9-7 9 7v9H3zM9 20v-6h6v6",
  exam: "M5 3h14v18H5zM9 8h6M9 12h6M9 16h3",
  fun: "M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1-5.4-2.9-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z",
};

export function GoalTag({ goal, className = "" }: { goal: Goal; className?: string }) {
  return (
    <span
      data-testid="goal-tag"
      className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full bg-ds-sunk px-2 py-0.5 ds-type-caption font-bold text-ds-ink-soft ${className}`}
    >
      <svg
        width="13"
        height="13"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d={ICONS[goal]} />
      </svg>
      For your {goal} goal
    </span>
  );
}
