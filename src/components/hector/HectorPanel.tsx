import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { COURSES, type Course } from "../../data/course-meta";
import { fetchTutorMemory } from "../../lib/call-recap-api";
import type { HectorChip } from "../../lib/hector-chips";
import { goalLines } from "../../lib/tutor-memory-view";
import { useProgress } from "../../lib/progress";
import { DsCard } from "../ds/Blocks";
import { PanelHeading, StatsCard } from "../shell/PanelCards";

const FOCUS =
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ds-choice";
const SHOWN = 3;

/**
 * Hector's right panel on a desktop: the stats, the scenario (what this conversation is set up for and the starters
 * Hector offers), and what Hector remembers. It reads the same things the phone reads: the chips the page generated
 * from the greeting's context, and /api/tutor-memory (the "What Hector remembers" screen).
 */
export function HectorPanel({
  course,
  chips,
  disabled,
  onPick,
}: {
  course: Course;
  chips: readonly HectorChip[];
  /** True while Hector is answering or the mic is busy, as for the chips under the greeting. */
  disabled: boolean;
  onPick: (chip: HectorChip) => void;
}) {
  const level = useProgress((s) => s.cefrLevel);
  const meta = COURSES.find((c) => c.id === course);
  return (
    <div className="grid content-start gap-3.5" data-hector-panel="">
      <StatsCard />
      <DsCard data-panel-card="scenario" aria-label="Scenario" role="group">
        <PanelHeading>Scenario</PanelHeading>
        <p className="ds-type-footnote font-bold text-ds-ink">
          <span aria-hidden="true">{meta?.flag} </span>
          {meta?.label ?? "Your course"} · Level {level}
        </p>
        {chips.length > 0 ? (
          <div role="group" aria-label="Start a scenario" className="flex flex-wrap gap-1.5">
            {chips.map((chip) => (
              <button
                key={chip.id}
                type="button"
                disabled={disabled}
                onClick={() => onPick(chip)}
                className={`rounded-full border-[1.5px] border-ds-line bg-ds-card px-3 py-1.5 text-left ds-type-footnote font-bold text-ds-ink hover:bg-ds-sunk disabled:opacity-60 ${FOCUS}`}
              >
                {chip.label}
              </button>
            ))}
          </div>
        ) : (
          <p className="ds-type-footnote text-ds-ink-soft">
            Say or type anything. Hector follows you.
          </p>
        )}
      </DsCard>
      <RemembersCard course={course} />
    </div>
  );
}

function RemembersCard({ course }: { course: Course }) {
  const memory = useQuery({ queryKey: ["tutor-memory"], queryFn: fetchTutorMemory, retry: false });
  const m = memory.data;
  const lines: string[] = [];
  if (m?.status === "ok") {
    for (const g of goalLines(m.data.goals)) lines.push(g.title);
    for (const x of m.data.mistakes.filter((x) => x.course === course).slice(0, SHOWN)) {
      lines.push(`Practising: ${x.label}`);
    }
  }
  const phrases = m?.status === "ok" ? m.data.phrases.filter((p) => p.course === course) : [];
  return (
    <DsCard data-panel-card="remembers" aria-label="What Hector remembers" role="group">
      <div className="flex items-baseline justify-between gap-2">
        <PanelHeading>What Hector remembers</PanelHeading>
        <Link to="/profile/memory" className={`ds-type-footnote font-bold text-ds-choice ${FOCUS}`}>
          Manage
        </Link>
      </div>
      {memory.isPending ? (
        <p className="ds-type-footnote text-ds-ink-soft">Loading the notes...</p>
      ) : m?.status === "not-pro" ? (
        <p className="ds-type-footnote text-ds-ink-soft">
          Hector keeps notes between calls with Pro: your goals, what you are working on and the
          phrases you saved.
        </p>
      ) : m?.status !== "ok" ? (
        <p className="ds-type-footnote text-ds-ink-soft">The notes could not load just now.</p>
      ) : lines.length === 0 && phrases.length === 0 ? (
        <p className="ds-type-footnote text-ds-ink-soft">
          Nothing yet. Notes appear after your first call.
        </p>
      ) : (
        <>
          <ul className="grid gap-1.5">
            {lines.map((line) => (
              <li key={line} className="ds-type-footnote text-ds-ink">
                {line}
              </li>
            ))}
          </ul>
          {phrases.length > 0 ? (
            <div className="grid gap-1.5">
              <p className="ds-type-caption font-bold uppercase text-ds-ink-soft">Saved phrases</p>
              <div className="flex flex-wrap gap-1.5">
                {phrases.slice(0, SHOWN).map((p) => (
                  <span
                    key={p.id}
                    className="rounded-full bg-ds-sunk px-2.5 py-1 ds-type-footnote font-bold text-ds-ink"
                  >
                    {p.text}
                  </span>
                ))}
              </div>
            </div>
          ) : null}
        </>
      )}
    </DsCard>
  );
}
