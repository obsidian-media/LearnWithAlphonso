import { useQuery } from "@tanstack/react-query";
import { getWeeklyChallenges } from "../lib/challenges.functions";

export function WeeklyChallengesCard() {
  const { data: challenges, isLoading } = useQuery({
    queryKey: ["weeklyChallenges"],
    queryFn: () => getWeeklyChallenges(),
  });

  if (isLoading || !challenges || challenges.length === 0) return null;

  return (
    <div className="rounded-2xl border border-hairline bg-parchment p-4">
      <p className="font-display text-sm font-semibold text-ink">This week's challenges</p>
      <div className="mt-3 space-y-2.5">
        {challenges.map((c) => (
          <div key={c.templateId}>
            <div className="flex items-center justify-between text-xs">
              <span className={c.completed ? "text-moss line-through" : "text-ink"}>{c.title}</span>
              <span className="tnum text-ink-soft">
                {Math.min(c.progress, c.threshold)}/{c.threshold}
              </span>
            </div>
            <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-hairline">
              <div
                className="h-full rounded-full bg-moss"
                style={{ width: `${Math.min(100, (c.progress / c.threshold) * 100)}%` }}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
