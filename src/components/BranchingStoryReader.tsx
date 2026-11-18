import { useEffect, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { AVATAR_BASE_PATH } from "@/lib/avatar/layers";
import {
  allEndings,
  chooseOption,
  nodeKind,
  storyStars,
  type StoryEnding,
  type StoryNode,
} from "../lib/branching";
import type { FinishBranchingResult } from "../lib/stories.functions";
import type { BranchingStory } from "../lib/stories";
import { levelLabel } from "../lib/stories";
import { DsButton, DsCard, DsPill, Icon, Overline } from "./ds/Blocks";
import { ReadAlongPassage } from "./ReadAlongPassage";
import { SaveWordHint, SaveWordProvider } from "./SaveWord";

type Props = {
  story: BranchingStory;
  /** Sends the chosen option indices; the server decides the ending and the credit. */
  finish: (path: number[]) => Promise<FinishBranchingResult>;
  /** Invalidate the library once a path is finished. */
  onFinished?: () => void;
};

/** The scene illustration, degrading to a themed placeholder when there is no art (or it fails to load). */
function SceneIllustration({ node }: { node: StoryNode }) {
  const [broken, setBroken] = useState(false);
  const url = node.artUrl ?? null;
  if (!url || broken) {
    return (
      <div
        data-scene-placeholder=""
        aria-hidden="true"
        className="flex aspect-[16/9] w-full items-center justify-center rounded-[20px] bg-ds-sunk"
      >
        <Icon name="compass" size={56} />
      </div>
    );
  }
  return (
    <img
      src={url}
      alt=""
      draggable={false}
      decoding="async"
      onError={() => setBroken(true)}
      className="aspect-[16/9] w-full rounded-[20px] object-cover"
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

function BranchingBody({ story, finish, onFinished }: Props) {
  const reduce = useReducedMotion() ?? false;
  const { graph } = story;
  const [path, setPath] = useState<number[]>([]);
  const [nodeId, setNodeId] = useState(graph.start);
  const [result, setResult] = useState<FinishBranchingResult | null>(null);
  const [failed, setFailed] = useState(false);

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
    setPath([]);
    setNodeId(graph.start);
  };

  const pick = (optionIndex: number) => {
    const goto = chooseOption(graph, nodeId, optionIndex);
    if (!goto) return;
    setPath((p) => [...p, optionIndex]);
    setNodeId(goto);
  };

  const advance = () => {
    if (node?.next) setNodeId(node.next);
  };

  const enter = reduce
    ? {}
    : {
        initial: { opacity: 0, y: 12 },
        animate: { opacity: 1, y: 0 },
        exit: { opacity: 0, y: -12 },
      };

  return (
    <div className="grid gap-3">
      <AnimatePresence mode="wait" initial={false}>
        <motion.div key={nodeId} {...enter} transition={{ duration: 0.28 }} className="grid gap-3">
          {node ? <SceneIllustration node={node} /> : null}

          {node && node.segments.length > 0 ? (
            <ReadAlongPassage
              key={nodeId}
              segments={node.segments}
              course={story.course}
              header={
                <>
                  <span className="ds-type-caption text-ds-ink-soft">
                    {levelLabel(story.level)}
                  </span>
                  <SaveWordHint />
                </>
              }
            />
          ) : null}

          {kind === "link" ? <DsButton onClick={advance}>Continue</DsButton> : null}

          {kind === "choice" && node?.choice ? (
            <DsCard data-story-choice="">
              <div className="flex items-center gap-3">
                <img
                  src={`${AVATAR_BASE_PATH}/base.webp`}
                  alt=""
                  aria-hidden="true"
                  width={56}
                  height={56}
                  draggable={false}
                  decoding="async"
                  className="size-14 shrink-0 rounded-full bg-ds-sunk object-contain"
                />
                <p className="ds-type-question-small text-ds-brand">{node.choice.prompt}</p>
              </div>
              <div role="group" aria-label={node.choice.prompt} className="grid gap-2">
                {node.choice.options.map((option, i) => (
                  <motion.button
                    key={option.goto}
                    type="button"
                    whileTap={reduce ? undefined : { scale: 0.97 }}
                    onClick={() => pick(i)}
                    className="rounded-[16px] border-2 border-b-4 border-ds-line bg-ds-card px-4 py-3.5 text-left ds-type-answer text-ds-brand transition-colors hover:border-ds-choice hover:bg-ds-choice-tint"
                  >
                    {option.label}
                  </motion.button>
                ))}
              </div>
            </DsCard>
          ) : null}

          {kind === "ending" && node?.ending ? (
            <EndingScreen
              ending={node.ending}
              endingsTotal={endingsTotal}
              result={result}
              failed={failed}
              reachedGood={
                result
                  ? allEndings(graph).some(
                      (e) => e.quality === "good" && result.endingsFound.includes(e.id),
                    )
                  : node.ending.quality === "good"
              }
              onRetry={restart}
            />
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
  ending,
  endingsTotal,
  result,
  failed,
  reachedGood,
  onRetry,
}: {
  ending: StoryEnding;
  endingsTotal: number;
  result: FinishBranchingResult | null;
  failed: boolean;
  reachedGood: boolean;
  onRetry: () => void;
}) {
  const found = result?.endingsFound.length ?? 1;
  const total = result?.endingsTotal || endingsTotal || 1;
  const stars = storyStars({ endingsFound: found, endingsTotal: total, reachedGood });

  return (
    <DsCard data-story-ending="">
      <Overline>Your ending</Overline>
      <p className="ds-type-display text-ds-ink">{ending.title}</p>
      <div aria-label={`${stars} of 3 stars`} className="flex gap-1">
        {[0, 1, 2].map((i) => (
          <span key={i} className={i < stars ? "opacity-100" : "opacity-30"}>
            <Icon name="star" size={28} />
          </span>
        ))}
      </div>
      <p className="ds-type-body text-ds-ink">{ending.wrap}</p>
      <p data-endings-found="" className="ds-type-caption text-ds-ink-soft">
        Endings found: {found} of {total}
      </p>
      {result?.credited ? (
        <DsPill tone="xp">This counts toward your reading practice</DsPill>
      ) : null}
      {failed ? (
        <p role="alert" className="ds-type-footnote text-ds-ink-soft">
          We couldn&apos;t save your path. Check your connection — your reading still counts once it
          saves.
        </p>
      ) : null}
      <div className="flex flex-wrap items-center gap-2">
        <DsButton onClick={onRetry}>Try another path</DsButton>
        <DsButton variant="secondary" onClick={onRetry}>
          Read it again
        </DsButton>
      </div>
    </DsCard>
  );
}
