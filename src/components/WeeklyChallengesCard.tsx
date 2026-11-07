import { useQuery } from "@tanstack/react-query";
import { getWeeklyChallenges } from "../lib/challenges.functions";

export function WeeklyChallengesCard() {
  const { data: challenges, isLoading } = useQuery({
    queryKey: ["weeklyChallenges"],
    queryFn: () => getWeeklyChallenges(),
  });

  if (isLoading || !challenges || challenges.length === 0) return null;

  return (
    <div className="card-lift rounded-3xl bg-tile-sky-bg p-4">
      <p className="font-display text-sm font-semibold text-ds-ink">This week's challenges</p>
      <div className="mt-3 space-y-2.5">
        {challenges.map((c) => (
          <div key={c.templateId}>
            <div className="flex items-center justify-between text-xs">
              <span className={c.completed ? "text-ds-brand line-through" : "text-ds-ink"}>{c.title}</span>
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
