import { useQuery } from "@tanstack/react-query";
import { DsCard } from "@/components/ds/Blocks";
import { authHeaders } from "@/lib/auth-headers";
import {
  AI_USAGE_COPY,
  parseAiUsage,
  type AiUsageState,
  type AiUsageView,
} from "@/lib/ai-usage-view";

/** One read of /api/ai-usage. Any failure is `null`: the section then draws nothing (fail-safe to hidden). */
export async function fetchAiUsage(): Promise<AiUsageView | null> {
  try {
    const resp = await fetch("/api/ai-usage", { headers: await authHeaders() });
    if (!resp.ok) return null;
    return parseAiUsage(await resp.json());
  } catch {
    return null;
  }
}

const FILL: Record<AiUsageState, string> = {
  ok: "bg-ds-choice",
  warn: "bg-ds-xp",
  capped: "bg-ds-flame",
};

/** Settings > AI practice this month. Usage as a percent and a word, never a price. Renders nothing when unknown. */
export function AiUsageSetting() {
  const { data } = useQuery({
    queryKey: ["ai-usage"],
    queryFn: fetchAiUsage,
    staleTime: 60_000,
    retry: false,
  });
  if (!data) return null;
  return (
    <section aria-labelledby="ai-usage-heading">
      <DsCard>
        <div className="flex items-baseline justify-between gap-3">
          <h3 id="ai-usage-heading" className="ds-type-headline text-ds-ink">
            {AI_USAGE_COPY.title}
          </h3>
          <span className="ds-type-caption shrink-0 text-ds-ink">{data.label}</span>
        </div>
        <div
          role="meter"
          aria-labelledby="ai-usage-heading"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={data.percent}
          aria-valuetext={data.valueText}
          className="h-3 w-full overflow-hidden rounded-full bg-ds-sunk"
        >
          <div
            className={`h-full rounded-full transition-[width] duration-[var(--ds-duration-select)] motion-reduce:transition-none ${FILL[data.state]}`}
            style={{ width: `${data.percent}%` }}
          />
        </div>
        <p className="ds-type-footnote text-ds-ink">
          {[
            data.message,
            data.state === "ok" ? null : AI_USAGE_COPY.stillWorks,
            `${data.resetLine}.`,
          ]
            .filter(Boolean)
            .join(" ")}
        </p>
        <p className="ds-type-footnote text-ds-ink-soft">{AI_USAGE_COPY.explain}</p>
      </DsCard>
    </section>
  );
}
