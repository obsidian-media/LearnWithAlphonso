import { useQuery } from "@tanstack/react-query";
import { getWeeklyChallenges } from "../lib/challenges.functions";

export function WeeklyChallengesCard() {
  const {
    data: challenges,
    isLoading,
    isError,
    refetch,
  } = useQuery({
    queryKey: ["weeklyChallenges"],
    queryFn: () => getWeeklyChallenges(),
    retry: false,
  });

  // A failed read says so, with a retry, instead of hiding the challenges as if there were none this week.
  if (isError)
    return (
      <div role="alert" className="card-lift rounded-3xl bg-tile-sky-bg p-4">
        <p className="font-display text-sm font-semibold text-ds-ink">This week's challenges</p>
        <p className="mt-2 text-xs text-ds-ink-soft">Couldn't load this week's challenges.</p>
        <button
          type="button"
          onClick={() => void refetch()}
          className="mt-2 min-h-11 rounded-full px-3 text-xs font-semibold text-ds-ink underline"
        >
          Try again
        </button>
      </div>
    );
  if (isLoading || !challenges || challenges.length === 0) return null;

  return (
    <div className="card-lift rounded-3xl bg-tile-sky-bg p-4">
      <p className="font-display text-sm font-semibold text-ds-ink">This week's challenges</p>
      <div className="mt-3 space-y-2.5">
        {challenges.map((c) => (
          <div key={c.templateId}>
            <div className="flex items-center justify-between text-xs">
              <span className={c.completed ? "text-ds-brand line-through" : "text-ds-ink"}>
                {c.title}
              </span>
              <span className="tnum text-ds-ink-soft">
                {Math.min(c.progress, c.threshold)}/{c.threshold}
              </span>
            </div>
            <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-ds-line">
              <div
                className="h-full rounded-full bg-ds-brand"
                style={{ width: `${Math.min(100, (c.progress / c.threshold) * 100)}%` }}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
