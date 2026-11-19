import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import {
  allEndings,
  branchMap,
  branchMapCaption,
  branchMapSummary,
  chooseOption,
  mergeEnding,
  nodeKind,
  sceneProgress,
  storyStars,
  type BranchMap,
  type StoryEnding,
  type StoryNode,
} from "../lib/branching";
import type { FinishBranchingResult } from "../lib/stories.functions";
import type { BranchingStory } from "../lib/stories";
import { levelLabel } from "../lib/stories";
import { DsButton, DsCard, DsPill, Icon } from "./ds/Blocks";
import { ReadAlongPassage } from "./ReadAlongPassage";
import { SaveWordHint, SaveWordProvider } from "./SaveWord";

type Props = {
  story: BranchingStory;
  /** Sends the chosen option indices; the server decides the ending and the credit. */
  finish: (path: number[]) => Promise<FinishBranchingResult>;
  /** Invalidate the library once a path is finished. */
  onFinished?: () => void;
};

/** The Royal hero gradient, the stand-in for scene art that is missing or fails to load. */
const ART_FALLBACK = "bg-[linear-gradient(160deg,var(--c-hero-a),var(--c-hero-b))]";

/**
 * Scene art that fills its (positioned) parent, degrading to the hero gradient when there is no art or it fails to
 * load: never a broken-image icon and never a blank area.
 */
function SceneArt({ url }: { url: string | null }) {
  const [broken, setBroken] = useState(false);
  if (!url || broken) {
    return (
      <div
        data-scene-placeholder=""
        aria-hidden="true"
        className={`absolute inset-0 ${ART_FALLBACK}`}
      />
    );
  }
  return (
    <img
      src={url}
      alt=""
      draggable={false}
      decoding="async"
      onError={() => setBroken(true)}
      className="absolute inset-0 size-full object-cover"
    />
  );
}

export function BranchingStoryReader(props: Props) {
  return (
    <SaveWordProvider>
      <BranchingBody {...props} />
    </SaveWordProvider>
  );
}

const READER_FADE =
  "bg-[linear-gradient(180deg,color-mix(in_srgb,var(--c-hero-b)_10%,transparent)_20%,color-mix(in_srgb,var(--c-hero-b)_5%,transparent)_40%,color-mix(in_srgb,var(--c-hero-b)_72%,transparent)_66%,color-mix(in_srgb,var(--c-hero-b)_97%,transparent)_86%)]";
const TOP_SCRIM =
  "bg-[linear-gradient(180deg,color-mix(in_srgb,var(--c-hero-b)_50%,transparent),transparent)]";

/**
 * Recolours the shared read-along card for the dark panel without touching ReadAlongPassage: the card goes
 * transparent, text white, saveable words get a dotted underline, the active sentence a light wash.
 */
const PASSAGE_ON_DARK = [
  "[&_[data-story-text]]:!border-transparent [&_[data-story-text]]:!bg-transparent [&_[data-story-text]]:!p-0",
  "[&_[data-segment]]:!px-0 [&_[data-segment]]:!leading-[1.55] [&_[data-segment]]:!text-ds-on-hero",
  "[&_[data-segment][aria-current]]:!bg-ds-on-hero/15 [&_[data-segment][aria-current]]:!ring-ds-on-hero/50",
  "[&_[data-save-word]]:underline [&_[data-save-word]]:decoration-dotted [&_[data-save-word]]:decoration-2 [&_[data-save-word]]:decoration-ds-on-hero/55 [&_[data-save-word]]:underline-offset-4",
  "[&_.text-ds-ink-soft]:!text-ds-on-hero/75",
].join(" ");

function BackChevron() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      aria-hidden="true"
      fill="none"
      className="text-ds-on-hero"
    >
      <path
        d="M15 5l-7 7 7 7"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function BranchingBody({ story, finish, onFinished }: Props) {
  const reduce = useReducedMotion() ?? false;
  const { graph } = story;
  const [path, setPath] = useState<number[]>([]);
  const [visited, setVisited] = useState<string[]>([graph.start]);
  const [nodeId, setNodeId] = useState(graph.start);
  const [result, setResult] = useState<FinishBranchingResult | null>(null);
  const [failed, setFailed] = useState(false);
  const [celebrating, setCelebrating] = useState(false);

  const node = graph.map[nodeId];
  const kind = nodeKind(node);
  const endingsTotal = allEndings(graph).length;

  // On reaching an ending, record the path once; the server decides the ending and the credit.
  useEffect(() => {
    if (kind !== "ending") return;
    let live = true;
    setFailed(false);
    void (async () => {
      try {
        const r = await finish(path);
        if (!live) return;
        setResult(r);
        onFinished?.();
      } catch {
        if (live) setFailed(true);
      }
    })();
    return () => {
      live = false;
    };
    // The path is fixed once an ending is shown; only entering an ending submits.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nodeId]);

  const restart = () => {
    setResult(null);
    setFailed(false);
    setCelebrating(false);
    setPath([]);
    setVisited([graph.start]);
    setNodeId(graph.start);
  };

  const goTo = (id: string) => {
    setVisited((v) => [...v, id]);
    setNodeId(id);
  };

  const pick = (optionIndex: number) => {
    const goto = chooseOption(graph, nodeId, optionIndex);
    if (!goto) return;
    setPath((p) => [...p, optionIndex]);
    goTo(goto);
  };

  const advance = () => {
    if (node?.next) goTo(node.next);
  };

  const enter = reduce
    ? {}
    : {
        initial: { opacity: 0, y: 12 },
        animate: { opacity: 1, y: 0 },
        exit: { opacity: 0, y: -12 },
      };

  if (kind === "ending" && node?.ending && celebrating) {
    return (
      <AnimatePresence mode="wait" initial={false}>
        <motion.div key={nodeId} {...enter} transition={{ duration: 0.28 }}>
          <EndingScreen
            node={node}
            ending={node.ending}
            graphEndings={allEndings(graph)}
            endingsTotal={endingsTotal}
            result={result}
            failed={failed}
            reduce={reduce}
            map={(found, current) => branchMap(graph, path, found, current)}
            onRetry={restart}
          />
        </motion.div>
      </AnimatePresence>
    );
  }

  const progress = sceneProgress(graph, visited.length, nodeId);

  return (
    <div
      data-story-reader=""
      className="relative isolate flex min-h-dvh flex-col overflow-hidden bg-ds-hero-b text-ds-on-hero"
    >
      {/* Scene art and the dark fade, behind everything. */}
      <AnimatePresence initial={false}>
        <motion.div
          key={`art-${nodeId}`}
          initial={reduce ? undefined : { opacity: 0 }}
          animate={reduce ? undefined : { opacity: 1 }}
          exit={reduce ? undefined : { opacity: 0 }}
          transition={{ duration: 0.28 }}
          aria-hidden="true"
          className="absolute inset-0 -z-10"
        >
          <SceneArt url={node?.artUrl ?? null} />
          <div className={`absolute inset-0 ${READER_FADE}`} />
        </motion.div>
      </AnimatePresence>

      <div className={`px-3 pb-6 pt-[max(0.5rem,env(safe-area-inset-top))] ${TOP_SCRIM}`}>
        <div className="flex items-center gap-2 rounded-[14px] bg-ds-on-hero/10 pr-3 backdrop-blur-sm">
          <Link
            to="/stories"
            aria-label="Back to stories"
            className="flex size-11 shrink-0 items-center justify-center"
          >
            <span className="flex size-[30px] items-center justify-center rounded-[9px] bg-ds-on-hero/16">
              <BackChevron />
            </span>
          </Link>
          <h1 className="min-w-0 flex-1 truncate ds-type-footnote !font-[family-name:var(--ds-font-display)] !font-extrabold text-ds-on-hero">
            {story.title}
          </h1>
          <div aria-hidden="true" className="flex shrink-0 items-center gap-1">
            {Array.from({ length: progress.total }, (_, i) => (
              <span
                key={i}
                className={`h-1 w-[11px] rounded-full ${i < progress.current ? "bg-ds-xp" : "bg-ds-on-hero/40"}`}
              />
            ))}
          </div>
        </div>
      </div>

      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={nodeId}
          {...enter}
          transition={{ duration: 0.28 }}
          className="mt-auto grid max-h-[68dvh] gap-3 overflow-y-auto px-4 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-4"
        >
          <p className="ds-type-overline !tracking-[0.1em] text-ds-on-hero-kick">
            Scene {visited.length}
          </p>

          {node && node.segments.length > 0 ? (
            <div className={PASSAGE_ON_DARK}>
              <ReadAlongPassage
                key={nodeId}
                segments={node.segments}
                course={story.course}
                storyId={story.id}
                header={
                  <>
                    <span className="ds-type-caption text-ds-ink-soft">
                      {levelLabel(story.level)}
                    </span>
                    <SaveWordHint />
                  </>
                }
              />
            </div>
          ) : null}

          {kind === "link" ? <DsButton onClick={advance}>Continue</DsButton> : null}

          {kind === "ending" ? (
            <DsButton onClick={() => setCelebrating(true)}>See your ending</DsButton>
          ) : null}

          {kind === "choice" && node?.choice ? (
            <div data-story-choice="" className="grid gap-2.5">
              <p className="ds-type-footnote text-center text-ds-on-hero/85">
                {node.choice.prompt}
              </p>
              <div role="group" aria-label={node.choice.prompt} className="grid gap-2.5">
                {node.choice.options.map((option, i) => (
                  <motion.button
                    key={option.goto}
                    type="button"
                    whileTap={reduce ? undefined : { scale: 0.97 }}
                    onClick={() => pick(i)}
                    className="min-h-11 w-full rounded-[18px] border-[1.5px] border-ds-on-hero/90 bg-ds-on-hero/93 px-4 py-[13px] text-center ds-type-footnote !font-extrabold !leading-[1.3] text-ds-hero shadow-[0_10px_22px_-10px_color-mix(in_srgb,var(--c-hero-b)_50%,transparent)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ds-on-hero"
                  >
                    {option.label}
                  </motion.button>
                ))}
              </div>
            </div>
          ) : null}

          {kind === "invalid" ? (
            <DsCard role="alert">
              <p className="ds-type-footnote text-ds-ink-soft">
                This part of the story isn&apos;t ready yet.
              </p>
              <DsButton small onClick={restart}>
                Start over
              </DsButton>
            </DsCard>
          ) : null}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}

function EndingScreen({
  node,
  ending,
  graphEndings,
  endingsTotal,
  result,
  failed,
  reduce,
  map,
  onRetry,
}: {
  node: StoryNode;
  ending: StoryEnding;
  graphEndings: StoryEnding[];
  endingsTotal: number;
  result: FinishBranchingResult | null;
  failed: boolean;
  reduce: boolean;
  map: (found: string[], current: string) => BranchMap;
  onRetry: () => void;
}) {
  const currentId = result?.endingId ?? ending.id;
  const foundIds = mergeEnding(result?.endingsFound ?? [], currentId);
  const found = result?.endingsFound.length ?? 1;
  const total = result?.endingsTotal || endingsTotal || 1;
  const reachedGood = result
    ? graphEndings.some((e) => e.quality === "good" && result.endingsFound.includes(e.id))
    : ending.quality === "good";
  const stars = storyStars({ endingsFound: found, endingsTotal: total, reachedGood });
  const treeMap = map(foundIds, currentId);

  return (
    <div
      data-story-ending=""
      className="relative flex min-h-dvh flex-col bg-ds-surface text-ds-ink"
    >
      <div className="relative h-[calc(214px+env(safe-area-inset-top))] w-full shrink-0 overflow-hidden sm:h-[260px]">
        <SceneArt url={node.artUrl ?? null} />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -bottom-5 left-1/2 size-[200px] -translate-x-1/2 bg-[radial-gradient(circle,color-mix(in_srgb,var(--c-on-hero-kick)_50%,transparent),transparent_62%)]"
        />
        <div
          aria-hidden="true"
          className="absolute inset-0 bg-[linear-gradient(180deg,color-mix(in_srgb,var(--c-hero-b)_5%,transparent)_30%,var(--c-surface))]"
        />
        <Link
          to="/stories"
          aria-label="Back to stories"
          className="absolute left-1 top-[max(0.25rem,env(safe-area-inset-top))] flex size-11 items-center justify-center"
        >
          <span className="flex size-[30px] items-center justify-center rounded-[9px] bg-ds-hero-b/50">
            <BackChevron />
          </span>
        </Link>
      </div>

      <div className="relative -mt-[50px] grid justify-items-center gap-2 px-4 pb-[max(1.5rem,env(safe-area-inset-bottom))] text-center">
        <p className="ds-type-overline !tracking-[0.12em] text-ds-action-text">Your ending</p>
        <h1 className="ds-type-question !leading-[1.04] text-ds-ink">{ending.title}</h1>
        <div role="img" aria-label={`${stars} of 3 stars`} className="flex gap-1">
          {[0, 1, 2].map((i) => (
            <motion.span
              key={i}
              data-star={i < stars ? "earned" : "empty"}
              initial={reduce || i >= stars ? false : { scale: 0.4, rotate: -12, opacity: 0 }}
              animate={{ scale: 1, rotate: 0, opacity: i < stars ? 1 : 0.3 }}
              transition={{ duration: 0.5, delay: i * 0.12 }}
              className="drop-shadow-[0_3px_4px_color-mix(in_srgb,var(--c-xp-edge)_45%,transparent)]"
            >
              <Icon name="star" size={30} />
            </motion.span>
          ))}
        </div>
        <p className="max-w-[30ch] ds-type-footnote !font-medium text-ds-ink">{ending.wrap}</p>

        <BranchMapCard map={treeMap} />

        {result?.credited ? (
          <DsPill tone="xp">This counts toward your reading practice</DsPill>
        ) : null}
        {failed ? (
          <p role="alert" className="ds-type-footnote text-ds-ink-soft">
            We couldn&apos;t save your path. Check your connection — your reading still counts once
            it saves.
          </p>
        ) : null}

        <div className="mt-1 flex w-full gap-2.5">
          <button
            type="button"
            onClick={onRetry}
            className="min-h-11 flex-1 rounded-[15px] bg-ds-action px-3 py-2.5 ds-type-footnote !font-extrabold text-ds-on-action shadow-[0_4px_0_var(--c-action-edge)]"
          >
            Try another path
          </button>
          <button
            type="button"
            onClick={onRetry}
            className="min-h-11 flex-1 rounded-[15px] border-2 border-ds-line bg-ds-card px-3 py-2.5 ds-type-footnote !font-extrabold text-ds-brand"
          >
            Read it again
          </button>
        </div>
      </div>
    </div>
  );
}

const MAP_W = 300;
const MAP_H = 116;
const X0 = 16;
const X_SPAN = 154;
const Y0 = 12;
const Y_SPAN = 92;
const MAX_LABEL = 22;

const px = (x: number) => X0 + x * X_SPAN;
const py = (y: number) => Y0 + y * Y_SPAN;
const clip = (s: string) => (s.length > MAX_LABEL ? `${s.slice(0, MAX_LABEL - 1)}…` : s);

/** The tree of paths: gold = the path just taken, green = endings found before, dashed grey = still hidden. */
function BranchMapCard({ map }: { map: BranchMap }) {
  const byId = new Map(map.nodes.map((n) => [n.id, n]));
  const edgeLook = (style: BranchMap["edges"][number]["style"]) =>
    style === "taken"
      ? { stroke: "var(--c-xp)", width: 3, dash: undefined }
      : style === "found"
        ? { stroke: "var(--c-right)", width: 3, dash: undefined }
        : style === "locked"
          ? { stroke: "var(--c-line)", width: 2.5, dash: "3 4" }
          : { stroke: "var(--c-line)", width: 3, dash: undefined };

  return (
    <div
      data-branch-map=""
      role="group"
      aria-label={branchMapSummary(map)}
      className="grid w-full gap-1.5 rounded-[16px] border-2 border-ds-line bg-ds-card px-3 py-[11px] text-left"
    >
      <div className="flex items-center justify-between gap-2">
        <p className="ds-type-caption !font-[family-name:var(--ds-font-display)] !font-extrabold text-ds-ink">
          The paths you&apos;ve found
        </p>
        <span
          role="img"
          aria-label={`Endings found: ${map.endingsFound} of ${map.endingsTotal}`}
          className="rounded-full bg-ds-xp-tint px-2 py-0.5 ds-type-caption !font-extrabold text-ds-xp-text"
        >
          {map.endingsFound} / {map.endingsTotal}
        </span>
      </div>
      <svg
        viewBox={`0 0 ${MAP_W} ${MAP_H}`}
        width="100%"
        aria-hidden="true"
        focusable="false"
        className="h-auto"
      >
        {map.edges.map((e) => {
          const a = byId.get(e.from)!;
          const b = byId.get(e.to)!;
          const look = edgeLook(e.style);
          return (
            <line
              key={`${e.from}-${e.to}`}
              x1={px(a.x)}
              y1={py(a.y)}
              x2={px(b.x)}
              y2={py(b.y)}
              style={{ stroke: look.stroke }}
              strokeWidth={look.width}
              strokeDasharray={look.dash}
              strokeLinecap="round"
            />
          );
        })}
        {map.nodes.map((n) => (
          <MapNode key={n.id} n={n} />
        ))}
      </svg>
      <p className="ds-type-caption text-center !font-semibold text-ds-ink-soft">
        {branchMapCaption(map)}
      </p>
    </div>
  );
}

function MapNode({ n }: { n: BranchMap["nodes"][number] }) {
  const cx = px(n.x);
  const cy = py(n.y);
  if (n.kind === "start") {
    return <circle cx={cx} cy={cy} r={9} style={{ fill: "var(--c-brand)" }} />;
  }
  if (n.kind === "branch") {
    return n.onPath ? (
      <circle cx={cx} cy={cy} r={7} style={{ fill: "var(--c-xp)" }} />
    ) : (
      <circle
        cx={cx}
        cy={cy}
        r={7}
        style={{ fill: "var(--c-sunk)", stroke: "var(--c-line)" }}
        strokeWidth={2}
      />
    );
  }
  const state = n.ending?.state ?? "locked";
  const check = `M${cx - 4} ${cy} l3 3 l5 -6`;
  return (
    <g>
      {state === "current" ? (
        <>
          <circle cx={cx} cy={cy} r={9} style={{ fill: "var(--c-xp)" }} />
          <path
            d={check}
            fill="none"
            style={{ stroke: "var(--c-ink)" }}
            strokeWidth={2.2}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </>
      ) : state === "found" ? (
        <>
          <circle cx={cx} cy={cy} r={9} style={{ fill: "var(--c-right)" }} />
          <path
            d={check}
            fill="none"
            style={{ stroke: "var(--c-on-hero)" }}
            strokeWidth={2.2}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </>
      ) : (
        <>
          <circle
            cx={cx}
            cy={cy}
            r={8}
            style={{ fill: "var(--c-sunk)", stroke: "var(--c-line)" }}
            strokeWidth={2}
          />
          <text
            x={cx}
            y={cy + 3.2}
            textAnchor="middle"
            fontSize={9}
            fontWeight={800}
            style={{ fill: "var(--c-ink-faint)", fontFamily: "var(--ds-font-body)" }}
          >
            ?
          </text>
        </>
      )}
      <text
        x={cx + 16}
        y={cy + 3}
        fontSize={8.5}
        fontWeight={700}
        style={{
          fill: state === "locked" ? "var(--c-ink-faint)" : "var(--c-ink)",
          fontFamily: "var(--ds-font-body)",
        }}
      >
        {state === "locked" ? "Hidden ending" : clip(n.ending?.title ?? "")}
      </text>
    </g>
  );
}
